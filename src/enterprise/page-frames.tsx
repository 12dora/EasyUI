"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { PageHeader } from "../primitives/page-header";
import { InlineNotice } from "../primitives/inline-notice";
import { toast } from "../toast";

export interface EnterprisePublicShellProps {
  topbar: ReactNode;
  children: ReactNode;
  footer: ReactNode;
  contentAs?: "main" | "div";
}

/**
 * Shared public-page hierarchy used by login, logged-out and OIDC callback routes.
 * FE-PERF-04: CSS-only shell — no `motion/react` on the public critical path.
 * Reduced-motion for any nested animation is handled by the host / remaining local importers.
 *
 * Viewport-height frame (not `min-h-dvh`): the content region owns the scrollbar
 * so the footer stays pinned to the bottom of the viewport instead of sitting at
 * the bottom of a long document where it scrolls out of view.
 */
export function EnterprisePublicShell({ topbar, children, footer, contentAs = "main" }: EnterprisePublicShellProps) {
  const Content = contentAs;
  return (
    <div className="flex h-dvh flex-col overflow-hidden" data-enterprise-surface="public-shell">
      {topbar}
      <Content className="min-h-0 flex-1 overflow-y-auto">{children}</Content>
      <div className="shrink-0">{footer}</div>
    </div>
  );
}

export function EnterprisePasswordRecoverySurface({
  title,
  forced,
  forcedNotice,
  backAction,
  children,
  feedbackMode = "inline",
}: {
  title: string;
  forced: boolean;
  forcedNotice: string;
  backAction?: ReactNode;
  children: ReactNode;
  /** Default `inline` preserves the main-app warning DOM; Customs passes `toast`. */
  feedbackMode?: "inline" | "toast";
}) {
  const forcedToastPane = forced && feedbackMode === "toast";
  const forcedToastPaneWasActive = useRef(false);
  // FE-FB-04: toast mode announces the false -> true route entry; copy identity changes do not replay it.
  useEffect(() => {
    if (forcedToastPane && !forcedToastPaneWasActive.current) {
      toast.warning(forcedNotice, { id: "forced-password-notice" });
    }
    forcedToastPaneWasActive.current = forcedToastPane;
  }, [forcedNotice, forcedToastPane]);

  if (forced && feedbackMode === "toast") {
    return (
      <div className="flex min-h-[80vh] items-center justify-center px-4 py-16" data-enterprise-surface="forced-password-recovery">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <h1 className="text-[24px] font-semibold tracking-tight text-ink">{title}</h1>
          </div>
          <div className="rounded-lg border border-hairline bg-paper p-6 shadow-sm">{children}</div>
        </div>
      </div>
    );
  }
  if (forced) {
    return (
      <div className="flex min-h-[80vh] items-center justify-center px-4 py-16" data-enterprise-surface="forced-password-recovery">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <h1 className="text-[24px] font-semibold tracking-tight text-ink">{title}</h1>
          </div>
          <InlineNotice tone="warning" className="mb-4" message={forcedNotice} data-test-id="change-password-forced-notice" />
          <div className="rounded-lg border border-hairline bg-paper p-6 shadow-sm">{children}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="max-w-md" data-enterprise-surface="password-settings">
      <PageHeader title={title} actions={backAction} />
      <div className="mt-5 rounded-md border border-hairline bg-paper p-4">{children}</div>
    </div>
  );
}

export interface EnterpriseSettingsPageFrameProps {
  children: ReactNode;
}

/**
 * Settings page wrapper — width and centering only, deliberately headless.
 *
 * It used to paint a product-level "设置 / Settings" `PageHeader` above every
 * feature surface, which stacked two H1s and a divider on every settings route
 * ("设置" over "本地账户"). The page heading now belongs to the innermost
 * surface, which is the only one that knows the leaf label, so this frame
 * renders no heading at all and every settings surface owns exactly one
 * `PageHeader`.
 */
export function EnterpriseSettingsPageFrame({ children }: EnterpriseSettingsPageFrameProps) {
  return (
    <div className="mx-auto max-w-6xl" data-test-id="enterprise-settings-page">
      {children}
    </div>
  );
}
