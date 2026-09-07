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

/**
 * 挂一个隐藏 iframe 跑一次静默复查,拿到同源 message 或超时后把它摘掉。
 *
 * 只认 `event.origin === window.location.origin` 且 type 完全匹配的消息:跨源消息、同源但
 * 类型不对的消息一概忽略(继续等),避免第三方页面伪造出一次「已登出」。
 */
export function runSilentIdentityCheck({ silentAuthorizeUrl, timeoutMs, signal }: { silentAuthorizeUrl: string; timeoutMs: number; signal?: AbortSignal }): Promise<IdentityCheckOutcome> {
  return new Promise((resolve) => {
    const frame = appendCheckFrame(silentAuthorizeUrl);
    let timer = 0;
    const finish = (outcome: IdentityCheckOutcome) => {
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      signal?.removeEventListener("abort", onAbort);
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
        // 已卸载/已停用就不再回调宿主 —— 那时宿主的 setState 早就没人接了。
        if (!aborter.signal.aborted) deliverIdentityCheckOutcome(outcome, latest.current);
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
