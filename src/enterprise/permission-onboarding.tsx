"use client";

import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { Button } from "../primitives/button";
import { UserAvatar } from "../primitives/avatar";

/**
 * 无业务权限引导页。
 *
 * 登录成功但一项功能都用不了的账号,看到的应该是「怎么拿到权限」,而不是一个
 * 空工作台或设置页上的「没有访问此页面的权限」。所以整页替掉外壳:头像 + 姓名
 * 坐实「你是谁、确实登进来了」,一句话说清下一步,再给申请入口、复查与退出。
 *
 * 申请通常在新标签的 EasyAuth 门户完成:回到本标签即重新拉 `/auth/me`(由宿主的
 * `onRecheck` 执行),批下来就自动放行。本组件只在无权限态挂载,拿到权限即卸载。
 *
 * 退出由宿主接到 `performEnterpriseLogout`;本组件只调用 `onLogout`。
 */

/** 回到前台的复查节流:同一次切标签会同时触发 focus 与 visibilitychange。 */
export const PERMISSION_ONBOARDING_RECHECK_THROTTLE_MS = 10_000;

const REQUEST_LINK_CLASS =
  "inline-flex h-11 items-center justify-center rounded-[2px] border border-ink bg-ink px-6 text-[14px] font-medium tracking-wide text-paper transition-all hover:bg-ink/90";

function noop() {}

function permissionRequestHref(raw: string | null): string | null {
  const url = raw?.trim() ?? "";
  if (url.startsWith("https://") || url.startsWith("http://") || url.startsWith("/")) return url;
  return null;
}

export interface EnterprisePermissionOnboardingIdentity {
  displayName: string;
  secondaryLabel?: string | null;
  avatarUrl?: string | null;
}

export interface EnterprisePermissionOnboardingLabels {
  title: string;
  body: string;
  requestAccess: string;
  recheck: string;
  logout: string;
}

export interface EnterprisePermissionOnboardingProps {
  identity: EnterprisePermissionOnboardingIdentity;
  permissionRequestUrl: string | null;
  onRecheck: () => Promise<void> | void;
  onLogout: () => void;
  /** Default true: re-run `onRecheck` on window focus / visibilitychange, throttled ~10s. */
  recheckOnFocus?: boolean;
  labels: EnterprisePermissionOnboardingLabels;
}

type RecheckBusy = { rechecking: boolean; loggingOut: boolean };

export function EnterprisePermissionOnboarding({
  identity,
  permissionRequestUrl,
  onRecheck,
  onLogout,
  recheckOnFocus = true,
  labels,
}: EnterprisePermissionOnboardingProps) {
  const [loggingOut, setLoggingOut] = useState(false);
  const [rechecking, setRechecking] = useState(false);
  const lastRecheckAtRef = useRef(0);
  const busyRef = useRef<RecheckBusy>({ rechecking: false, loggingOut: false });
  useRecheckOnReturn(onRecheck, recheckOnFocus, lastRecheckAtRef, busyRef);

  const requestUrl = permissionRequestHref(permissionRequestUrl);

  const recheck = () => {
    if (busyRef.current.rechecking || busyRef.current.loggingOut) return;
    busyRef.current.rechecking = true;
    setRechecking(true);
    lastRecheckAtRef.current = Date.now();
    void Promise.resolve(onRecheck()).then(noop, noop).finally(() => {
      busyRef.current.rechecking = false;
      setRechecking(false);
    });
  };

  const logout = () => {
    if (busyRef.current.loggingOut) return;
    busyRef.current.loggingOut = true;
    setLoggingOut(true);
    onLogout();
  };

  return (
    <main className="flex min-h-dvh items-center justify-center overflow-y-auto bg-paper px-4 py-16" data-test-id="permission-onboarding">
      <div className="w-full max-w-md text-center">
        <UserBadge identity={identity} />
        <h1 className="mt-8 text-[24px] font-semibold tracking-tight text-ink">{labels.title}</h1>
        <p className="mt-3 text-[13px] leading-6 text-ink-soft">{labels.body}</p>
        <div className="mt-7 flex justify-center gap-2">
          {requestUrl ? (
            <a href={requestUrl} target="_blank" rel="noreferrer noopener" className={REQUEST_LINK_CLASS} data-test-id="permission-onboarding-request">
              {labels.requestAccess}
            </a>
          ) : null}
          <Button size="md" variant="outline" loading={rechecking} onClick={recheck} data-test-id="permission-onboarding-recheck">
            {labels.recheck}
          </Button>
          <Button size="md" variant="ghost" loading={loggingOut} onClick={logout} data-test-id="permission-onboarding-logout">
            {labels.logout}
          </Button>
        </div>
      </div>
    </main>
  );
}

function UserBadge({ identity }: { identity: EnterprisePermissionOnboardingIdentity }) {
  const secondary = identity.secondaryLabel?.trim();
  const showSecondary = Boolean(secondary && secondary !== identity.displayName);
  return (
    <div className="flex flex-col items-center gap-3 text-center" data-test-id="permission-onboarding-user">
      <UserAvatar name={identity.displayName} avatarUrl={identity.avatarUrl} size="lg" data-test-id="permission-onboarding-avatar" />
      <div>
        <p className="text-[15px] font-medium text-ink" data-test-id="permission-onboarding-name">{identity.displayName}</p>
        {showSecondary ? <p className="mt-0.5 text-[12px] text-ink-faint" data-test-id="permission-onboarding-secondary">{secondary}</p> : null}
      </div>
    </div>
  );
}

function useRecheckOnReturn(
  onRecheck: () => Promise<void> | void,
  enabled: boolean,
  lastRecheckAtRef: MutableRefObject<number>,
  busyRef: MutableRefObject<RecheckBusy>,
) {
  // 监听器只挂一次:回调用 ref 承接,免得每次渲染都重建监听并把节流清零。
  const recheckRef = useRef(onRecheck);
  useEffect(() => {
    recheckRef.current = onRecheck;
  });
  useEffect(() => {
    if (!enabled) return;
    const recheck = () => {
      if (document.visibilityState !== "visible") return;
      if (busyRef.current.rechecking || busyRef.current.loggingOut) return;
      const now = Date.now();
      if (now - lastRecheckAtRef.current < PERMISSION_ONBOARDING_RECHECK_THROTTLE_MS) return;
      lastRecheckAtRef.current = now;
      void Promise.resolve(recheckRef.current()).catch(noop);
    };
    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", recheck);
    return () => {
      window.removeEventListener("focus", recheck);
      document.removeEventListener("visibilitychange", recheck);
    };
  }, [busyRef, enabled, lastRecheckAtRef]);
}
