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
 */
export function EnterprisePublicShell({ topbar, children, footer, contentAs = "main" }: EnterprisePublicShellProps) {
  const Content = contentAs;
  return (
    <div className="flex min-h-dvh flex-col" data-enterprise-surface="public-shell">
      {topbar}
      <Content className="flex-1">{children}</Content>
      {footer}
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
  title: string;
  children: ReactNode;
  description?: string;
  backAction?: ReactNode;
}

/** Shared settings page hierarchy: product-level Settings heading, then feature surface. */
export function EnterpriseSettingsPageFrame({ title, description, backAction, children }: EnterpriseSettingsPageFrameProps) {
  return (
    <div className="mx-auto max-w-6xl" data-test-id="enterprise-settings-page">
      <PageHeader title={title} subtitle={description} actions={backAction} />
      {children}
    </div>
  );
}
