"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  buildIdentityCheckMessage,
  createIdentityCheckScheduler,
  deliverIdentityCheckOutcome,
  parseSilentIdentityResult,
  readIdentityCheckMessage,
  IDENTITY_CHECK_DISABLED_KIND,
  IDENTITY_CHECK_TIMEOUT_KIND,
  type IdentityCheckHandlers,
  type IdentityCheckOutcome,
  type IdentityCheckScheduler,
} from "./identity-check";

/** 隐藏 iframe 的 data-test-id;宿主不要依赖它,只给测试用。 */
export const IDENTITY_CHECK_FRAME_TEST_ID = "enterprise-identity-check-frame";
/** 复查被中止(宿主卸载 / 关闭复查)时的 kind。 */
export const IDENTITY_CHECK_ABORTED_KIND = "aborted";

export interface EnterpriseOidcSilentCompleteLabels {
  /** 用户直接打开 `/login/oidc-silent`(不在 iframe 里)时的一行说明。 */
  standalone: string;
  /** 返回链接文案;宿主给了 renderBackLink 才渲染。 */
  back?: string;
}

/**
 * 宿主页 `/login/oidc-silent` 的客户端组件:解析 hash → 有父窗口就同源 postMessage → 抹掉 hash。
 *
 * 被直接(顶层)打开时不做任何跳转,只渲染一行说明 + 可选返回链接 —— 否则会和授权端点互相
 * 重定向成死循环。
 */
export function EnterpriseOidcSilentCompleteController({ labels, renderBackLink }: { labels: EnterpriseOidcSilentCompleteLabels; renderBackLink?: (label: string) => ReactNode }) {
  const [standalone, setStandalone] = useState(false);
  const handled = useRef(false);
  useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    const result = parseSilentIdentityResult(window.location.hash);
    const framed = window.parent !== window;
    if (framed) window.parent.postMessage(buildIdentityCheckMessage(result), window.location.origin);
    // token 绝不能留在地址栏(历史、Referer、崩溃报告都会带走它),所以两种情形都先抹 hash。
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    setStandalone(!framed);
  }, []);
  if (!standalone) return <span data-test-id="oidc-silent-page" hidden aria-hidden="true" />;
  return (
    <main className="flex min-h-[40vh] items-center justify-center px-4 py-16" data-test-id="oidc-silent-page">
      <div className="w-full max-w-sm text-center">
        <p className="text-[13px] leading-5 text-ink-soft" data-test-id="oidc-silent-standalone">{labels.standalone}</p>
        {renderBackLink && labels.back ? <div className="mt-4">{renderBackLink(labels.back)}</div> : null}
      </div>
    </main>
  );
}

function appendCheckFrame(src: string): HTMLIFrameElement {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.setAttribute("tabindex", "-1");
  frame.setAttribute("data-test-id", IDENTITY_CHECK_FRAME_TEST_ID);
  // 零尺寸而非 display:none —— 后者在部分浏览器里不保证发起导航。
  frame.style.cssText = "position:absolute;left:-10000px;top:0;width:0;height:0;border:0;";
  frame.src = src;
  document.body.appendChild(frame);
  return frame;
}

/** 在飞的静默复查:登出时要能一次掐光(见 abortEnterpriseIdentityChecks)。 */
const activeIdentityChecks = new Set<() => void>();
/** 登出闩:一旦登出过,本次页面加载内不再起新的静默复查。 */
let identityChecksAborted = false;

/**
 * 中止当前所有在飞的静默复查,并闩住后续的复查。
 *
 * 登出必须先调它:一次在飞的复查会在本地会话被清掉之后回来,把新 token 写回宿主 —— 于是
 * 「刚退出就又登录着」。结论按 `aborted` 结算,iframe 立即摘掉。
 *
 * 光掐在飞的那一次不够:登出还要等 `revoke()`(最多 3 s),这期间宿主的 401 拦截器或轮询
 * 会起一次**新的**复查,它不在刚才遍历过的集合里,照样能在清会话之后写回新 token。所以这把
 * 闩一直保持到下一次整页加载(那时是全新的模块实例)—— 也不能指望宿主卸载 hook:登出常常是
 * `router.replace`,布局根本不卸载。
 */
export function abortEnterpriseIdentityChecks(): void {
  identityChecksAborted = true;
  for (const abort of [...activeIdentityChecks]) abort();
}

/** 只给测试用:正常页面加载天然是新的模块实例,宿主不需要、也不该自己解这把闩。 */
export function resetEnterpriseIdentityCheckAbort(): void {
  identityChecksAborted = false;
}

function isAbortedIdentityOutcome(outcome: IdentityCheckOutcome): boolean {
  return outcome.outcome === "error" && outcome.kind === IDENTITY_CHECK_ABORTED_KIND;
}

/**
 * 挂一个隐藏 iframe 跑一次静默复查,拿到同源 message 或超时后把它摘掉。
 *
 * 只认 `event.origin === window.location.origin` 且 type 完全匹配的消息:跨源消息、同源但
 * 类型不对的消息一概忽略(继续等),避免第三方页面伪造出一次「已登出」。
 */
export function runSilentIdentityCheck({ silentAuthorizeUrl, timeoutMs, signal }: { silentAuthorizeUrl: string; timeoutMs: number; signal?: AbortSignal }): Promise<IdentityCheckOutcome> {
  // 登出闩上之后连 iframe 都不挂:挂了就有机会在会话清掉之后带回一个新 token。
  if (identityChecksAborted) return Promise.resolve<IdentityCheckOutcome>({ outcome: "error", kind: IDENTITY_CHECK_ABORTED_KIND });
  return new Promise((resolve) => {
    const frame = appendCheckFrame(silentAuthorizeUrl);
    let timer = 0;
    const finish = (outcome: IdentityCheckOutcome) => {
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      signal?.removeEventListener("abort", onAbort);
      activeIdentityChecks.delete(onAbort);
      frame.remove();
      resolve(outcome);
    };
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      const outcome = readIdentityCheckMessage(event.data);
      if (outcome) finish(outcome);
    }
    function onAbort() {
      finish({ outcome: "error", kind: IDENTITY_CHECK_ABORTED_KIND });
    }
    timer = window.setTimeout(() => finish({ outcome: "error", kind: IDENTITY_CHECK_TIMEOUT_KIND }), timeoutMs);
    window.addEventListener("message", onMessage);
    signal?.addEventListener("abort", onAbort);
    activeIdentityChecks.add(onAbort);
    if (signal?.aborted) onAbort();
  });
}

export interface EnterpriseIdentityCheckOptions extends IdentityCheckHandlers {
  /** 只有经 Authentik 建立的会话才复查;本地口令 / 本地管理员会话传 false。 */
  enabled: boolean;
  /** 绝对 URL:`apiUrl(status.silentAuthorizePath)`(即 `{apiBase}/auth/oidc/authorize?silent=1`)。 */
  silentAuthorizeUrl: string;
  /** 当前登录用户的本地账号 id。它一变(宿主换了身份)就重新起一轮复查基线。 */
  currentAccountId?: string | null;
  timeoutMs?: number;
  now?(): number;
  visibilityThrottleMs?: number;
  intervalMs?: number;
}

export interface EnterpriseIdentityCheckHandle {
  /** 命令式复查:宿主拿到 401 时先跑它,再决定是不是弹「会话过期」。 */
  runCheck(): Promise<IdentityCheckOutcome>;
}

/**
 * 静默身份复查钩子。放在宿主的当前用户 Provider 里,一个应用只挂一次。
 *
 * 结论只往回调里送,不替宿主做任何决定:`authenticated` 由宿主比对 accountId 决定换 token
 * 还是刷新页面;`logged_out` 由宿主清会话跳登录页。
 */
export function useEnterpriseIdentityCheck(options: EnterpriseIdentityCheckOptions): EnterpriseIdentityCheckHandle {
  const { enabled, silentAuthorizeUrl, currentAccountId = null, timeoutMs = 15_000, visibilityThrottleMs = 60_000, intervalMs = 300_000 } = options;
  // 回调 / now 每次渲染都是新引用,用 latest ref 取,免得重建调度器把轮询重置掉。
  const latest = useRef(options);
  useEffect(() => { latest.current = options; });
  const schedulerRef = useRef<IdentityCheckScheduler | null>(null);
  useEffect(() => {
    if (!enabled) return undefined;
    const aborter = new AbortController();
    const scheduler = createIdentityCheckScheduler({
      intervalMs,
      visibilityThrottleMs,
      now: () => (latest.current.now ?? Date.now)(),
      isVisible: () => document.visibilityState !== "hidden",
      schedule: (callback, delayMs) => {
        const handle = window.setTimeout(callback, delayMs);
        return () => window.clearTimeout(handle);
      },
      async runCheck() {
        const outcome = await runSilentIdentityCheck({ silentAuthorizeUrl, timeoutMs, signal: aborter.signal });
        // 已卸载/已停用就不再回调宿主 —— 那时宿主的 setState 早就没人接了。登出掐掉的那一次
        // 同样不回调:宿主的 onError 往往是一句「会话检查失败」的提示,登出途中弹它纯属噪音。
        if (!aborter.signal.aborted && !isAbortedIdentityOutcome(outcome)) deliverIdentityCheckOutcome(outcome, latest.current);
        return outcome;
      },
    });
    schedulerRef.current = scheduler;
    const onVisibilityChange = () => { if (document.visibilityState === "visible") scheduler.handleVisible(); };
    document.addEventListener("visibilitychange", onVisibilityChange);
    scheduler.start();
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      scheduler.stop();
      aborter.abort();
      if (schedulerRef.current === scheduler) schedulerRef.current = null;
    };
  }, [currentAccountId, enabled, intervalMs, silentAuthorizeUrl, timeoutMs, visibilityThrottleMs]);
  const runCheck = useCallback((): Promise<IdentityCheckOutcome> => {
    const scheduler = schedulerRef.current;
    // 没启用就如实回一个 disabled,宿主照旧走它原来的 401 处理,不假装「一切正常」。
    if (!scheduler) return Promise.resolve<IdentityCheckOutcome>({ outcome: "error", kind: IDENTITY_CHECK_DISABLED_KIND });
    return scheduler.runNow();
  }, []);
  return useMemo(() => ({ runCheck }), [runCheck]);
}
