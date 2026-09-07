/**
 * 静默身份复查(机制 2)的纯逻辑层 —— 解析、消息归一与调度,均不碰 DOM。
 *
 * 后端契约:`GET {apiBase}/auth/oidc/authorize?silent=1` 带 `prompt=none` 走一圈 Authentik,
 * 回调最终落在宿主前端页 `/login/oidc-silent`,把结果放在 hash 里:
 *
 *   #outcome=authenticated&token=<jwt>&account=<accountId>
 *   #outcome=logged_out&kind=<provider error>
 *   #outcome=error&kind=<flow error kind>
 *
 * DOM / iframe 那一半在 `identity-check-controller.tsx`。
 */

/** postMessage 的 `type` 常量:父窗口只认这一个值(外加同源校验)。 */
export const IDENTITY_CHECK_MESSAGE_TYPE = "easy-enterprise:identity-check";

/** hash / 消息本身不合契约(缺 outcome、authenticated 却没 token/account)。 */
export const IDENTITY_CHECK_MALFORMED_KIND = "malformed";
/** 上游给了 kind 但不是可识别的短标识 —— 不保留不可信原文。 */
export const IDENTITY_CHECK_UNKNOWN_KIND = "unknown";
/** 超时:iframe 在 timeoutMs 内没有回消息。 */
export const IDENTITY_CHECK_TIMEOUT_KIND = "timeout";
/** 复查未启用(`enabled=false`)时 `runCheck()` 的返回,宿主据此走原有 401 UI。 */
export const IDENTITY_CHECK_DISABLED_KIND = "disabled";

/** 一次静默复查的结论。`kind` 永远是归一化后的短标识,不含上游原文。 */
export type IdentityCheckOutcome =
  | { outcome: "authenticated"; token: string; accountId: string }
  | { outcome: "logged_out"; kind: string }
  | { outcome: "error"; kind: string };

/** 子页 → 父窗口的 postMessage 负载。 */
export type IdentityCheckMessage = IdentityCheckOutcome & { type: typeof IDENTITY_CHECK_MESSAGE_TYPE };

export interface IdentityCheckHandlers {
  onAuthenticated(result: { token: string; accountId: string }): void;
  onLoggedOut(result: { kind: string }): void;
  onError?(result: { kind: string }): void;
}

// kind 是上游(Authentik / 宿主后端)给的字符串,可能被写进日志或界面,
// 因此只接受短标识形态,其余一律归一成 unknown —— 与 normalizeEnterpriseOidcError 同口径。
const KIND_PATTERN = /^[a-z0-9][a-z0-9_.:-]{0,63}$/;

function normalizeKind(value: unknown): string {
  if (typeof value !== "string") return IDENTITY_CHECK_UNKNOWN_KIND;
  const kind = value.trim().toLowerCase();
  return KIND_PATTERN.test(kind) ? kind : IDENTITY_CHECK_UNKNOWN_KIND;
}

function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** 把任意来源(hash / postMessage)的原始字段归一成结论;契约违例一律降级为 error,不静默放行。 */
export function normalizeIdentityCheckOutcome(raw: { outcome: unknown; token?: unknown; accountId?: unknown; kind?: unknown }): IdentityCheckOutcome {
  const outcome = trimmed(raw.outcome).toLowerCase();
  if (outcome === "authenticated") {
    const token = trimmed(raw.token);
    const accountId = trimmed(raw.accountId);
    if (!token || !accountId) return { outcome: "error", kind: IDENTITY_CHECK_MALFORMED_KIND };
    return { outcome: "authenticated", token, accountId };
  }
  if (outcome === "logged_out") return { outcome: "logged_out", kind: normalizeKind(raw.kind) };
  if (outcome === "error") return { outcome: "error", kind: normalizeKind(raw.kind) };
  return { outcome: "error", kind: IDENTITY_CHECK_MALFORMED_KIND };
}

/** 解析 `/login/oidc-silent` 的 hash。未知/缺失 outcome → error(malformed);多余参数忽略。 */
export function parseSilentIdentityResult(hash: string): IdentityCheckOutcome {
  const fragment = hash.startsWith("#") ? hash.slice(1) : hash;
  const params = new URLSearchParams(fragment);
  return normalizeIdentityCheckOutcome({
    outcome: params.get("outcome"),
    token: params.get("token"),
    accountId: params.get("account"),
    kind: params.get("kind"),
  });
}

export function buildIdentityCheckMessage(result: IdentityCheckOutcome): IdentityCheckMessage {
  return { type: IDENTITY_CHECK_MESSAGE_TYPE, ...result };
}

/** 读一条 message 事件的 data:type 不对(或不是对象)返回 null,由调用方继续等下一条。 */
export function readIdentityCheckMessage(data: unknown): IdentityCheckOutcome | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  if (record.type !== IDENTITY_CHECK_MESSAGE_TYPE) return null;
  return normalizeIdentityCheckOutcome({ outcome: record.outcome, token: record.token, accountId: record.accountId, kind: record.kind });
}

/** 结论 → 宿主回调。判断权全在宿主:比对 accountId、换 token、跳登录都由回调决定。 */
export function deliverIdentityCheckOutcome(outcome: IdentityCheckOutcome, handlers: IdentityCheckHandlers): void {
  if (outcome.outcome === "authenticated") {
    handlers.onAuthenticated({ token: outcome.token, accountId: outcome.accountId });
    return;
  }
  if (outcome.outcome === "logged_out") {
    handlers.onLoggedOut({ kind: outcome.kind });
    return;
  }
  handlers.onError?.({ kind: outcome.kind });
}

export interface IdentityCheckSchedulerDeps {
  /** 真正跑一次复查(DOM 层注入);约定不抛异常,超时也以 error/timeout 结论返回。 */
  runCheck(): Promise<IdentityCheckOutcome>;
  isVisible(): boolean;
  now(): number;
  /** 注入的定时器:返回取消函数。 */
  schedule(callback: () => void, delayMs: number): () => void;
  /** 可见状态下的轮询间隔。 */
  intervalMs: number;
  /** 两次「切回前台」复查之间的最小间隔。 */
  visibilityThrottleMs: number;
}

export interface IdentityCheckScheduler {
  /** 挂载/启用即查一次,并开始轮询。 */
  start(): void;
  stop(): void;
  /** 命令式复查(401 路径):不受节流限制,但与在途复查合并。 */
  runNow(): Promise<IdentityCheckOutcome>;
  /** 标签页切回前台:距上次「完成」不足 visibilityThrottleMs 就跳过。 */
  handleVisible(): void;
}

/**
 * 触发器 = 启用/挂载 + 切回前台(节流)+ 可见时的定时轮询 + 命令式 runNow,
 * 四者共用同一把「在途」锁:任何时刻最多一次复查在跑,并发触发全部合并到同一个 Promise。
 */
export function createIdentityCheckScheduler(deps: IdentityCheckSchedulerDeps): IdentityCheckScheduler {
  let inFlight: Promise<IdentityCheckOutcome> | null = null;
  let completedAt: number | null = null;
  let cancelTimer: (() => void) | null = null;
  let running = false;

  async function execute(): Promise<IdentityCheckOutcome> {
    try {
      return await deps.runCheck();
    } finally {
      completedAt = deps.now();
      inFlight = null;
    }
  }

  function trigger(): Promise<IdentityCheckOutcome> {
    if (inFlight) return inFlight;
    const pending = execute();
    inFlight = pending;
    return pending;
  }

  function fireAndForget(): void {
    void trigger().catch(() => undefined);
  }

  function arm(): void {
    cancelTimer = deps.schedule(() => {
      cancelTimer = null;
      if (!running) return;
      // 后台标签页不查 —— 隐藏时 iframe 里的重定向链路本来就可能被浏览器降频。
      if (deps.isVisible()) fireAndForget();
      arm();
    }, deps.intervalMs);
  }

  return {
    start() {
      if (running) return;
      running = true;
      fireAndForget();
      arm();
    },
    stop() {
      running = false;
      cancelTimer?.();
      cancelTimer = null;
    },
    runNow() {
      return trigger();
    },
    handleVisible() {
      if (completedAt !== null && deps.now() - completedAt < deps.visibilityThrottleMs) return;
      fireAndForget();
    },
  };
}
