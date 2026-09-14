"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "../primitives/button";
import { EmptyState } from "../primitives/empty-state";
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
  useRecheckOnReturn(onRecheck, recheckOnFocus);

  const requestUrl = permissionRequestUrl?.trim() || null;

  const recheck = () => {
    if (rechecking || loggingOut) return;
    setRechecking(true);
    void Promise.resolve(onRecheck()).finally(() => setRechecking(false));
  };

  const logout = () => {
    if (loggingOut) return;
    setLoggingOut(true);
    onLogout();
  };

  return (
    <main className="flex min-h-dvh items-center justify-center overflow-y-auto bg-paper px-4 py-16" data-test-id="permission-onboarding">
      <div className="w-full max-w-md">
        <UserBadge identity={identity} />
        <EmptyState
          kind="prerequisite"
          size="page"
          title={labels.title}
          description={labels.body}
          actions={
            <>
              {requestUrl ? (
                <a href={requestUrl} target="_blank" rel="noreferrer noopener" data-test-id="permission-onboarding-request">
                  <Button size="md" variant="primary">{labels.requestAccess}</Button>
                </a>
              ) : null}
              <Button size="md" variant="outline" loading={rechecking} onClick={recheck} data-test-id="permission-onboarding-recheck">
                {labels.recheck}
              </Button>
              <Button size="md" variant="ghost" loading={loggingOut} onClick={logout} data-test-id="permission-onboarding-logout">
                {labels.logout}
              </Button>
            </>
          }
        />
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

function useRecheckOnReturn(onRecheck: () => Promise<void> | void, enabled: boolean) {
  // 监听器只挂一次:回调用 ref 承接,免得每次渲染都重建监听并把节流清零。
  const recheckRef = useRef(onRecheck);
  useEffect(() => {
    recheckRef.current = onRecheck;
  });
  useEffect(() => {
    if (!enabled) return;
    let last = 0;
    const recheck = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - last < PERMISSION_ONBOARDING_RECHECK_THROTTLE_MS) return;
      last = now;
      void recheckRef.current();
    };
    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", recheck);
    return () => {
      window.removeEventListener("focus", recheck);
      document.removeEventListener("visibilitychange", recheck);
    };
  }, [enabled]);
}
