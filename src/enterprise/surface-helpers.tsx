"use client";

import type { ReactNode } from "react";
import { EmptyState } from "../primitives/empty-state";
// Re-export for enterprise consumers that only import surface helpers.
export { AsyncStateTransition, type AsyncSurfaceState } from "../primitives/async-state-transition";

const shimmerClass = "animate-shimmer rounded-[3px] bg-ink/[0.06]";

/**
 * Authorization denial as a page state (DECISIONS.md ruling 4 / FE-FB-02).
 * Toast mode and route gates share this surface: no toast, no redirect.
 *
 * Route-specific actions take precedence. If a localized settings route omits
 * one, the shared fallback resolves two levels up to its locale workbench.
 */
export function EnterprisePermissionDeniedState({
  title,
  description,
  actions,
  defaultActionLabel,
  defaultActionHref = "../../app",
  testId = "permission-denied",
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  defaultActionLabel?: ReactNode;
  /** Override when the host's workbench is not two levels above its settings route. */
  defaultActionHref?: string;
  testId?: string;
}) {
  const safeActions = actions ?? (
    <a
      href={defaultActionHref}
      className="inline-flex h-9 items-center justify-center rounded-[2px] border border-ink/15 bg-paper px-4 text-[13px] font-medium text-ink transition-colors hover:bg-paper-deep"
      data-test-id="permission-denied-default-action"
    >
      {defaultActionLabel ?? title}
    </a>
  );
  return (
    <EmptyState
      kind="empty"
      size="page"
      title={title}
      description={description}
      actions={safeActions}
      data-test-id={testId}
    />
  );
}

/** Login-card skeleton: matches `EnterpriseCredentialLoginSurface` min-h-[80vh] (FE-UXA-10). */
export function EnterpriseLoginSurfaceSkeleton({
  testId = "login-surface-skeleton",
}: {
  testId?: string;
}) {
  return (
    <div
      className="flex min-h-[80vh] items-center justify-center px-4 py-16"
      aria-busy="true"
      data-test-id={testId}
    >
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2">
          <div className={`${shimmerClass} h-7 w-32`} />
        </div>
        <div className="space-y-4 rounded-lg border border-hairline bg-paper p-6 shadow-sm">
          <div className={`${shimmerClass} h-11 w-full`} />
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-hairline" />
            <div className={`${shimmerClass} h-2.5 w-20`} />
            <div className="h-px flex-1 bg-hairline" />
          </div>
          <div className="space-y-2">
            <div className={`${shimmerClass} h-3 w-16`} />
            <div className={`${shimmerClass} h-9 w-full`} />
          </div>
          <div className="space-y-2">
            <div className={`${shimmerClass} h-3 w-16`} />
            <div className={`${shimmerClass} h-9 w-full`} />
          </div>
          <div className={`${shimmerClass} h-11 w-full`} />
        </div>
      </div>
    </div>
  );
}

/** Notification list row skeletons (FE-UXA-10). */
export function EnterpriseNotificationListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="min-h-[180px]" aria-busy="true" data-test-id="notification-list-skeleton">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-start justify-between gap-4 border-b border-hairline p-4 last:border-b-0">
          <div className="min-w-0 flex-1 space-y-2">
            <div className={`${shimmerClass} h-3.5 w-2/5 max-w-[200px]`} />
            <div className={`${shimmerClass} h-3 w-4/5 max-w-[320px]`} />
            <div className={`${shimmerClass} h-2.5 w-16`} />
          </div>
          <div className={`${shimmerClass} h-7 w-14 shrink-0`} />
        </div>
      ))}
    </div>
  );
}

/** Two-column settings form skeleton (identity / footer). */
export function EnterpriseSettingsFormSkeleton({
  testId = "settings-form-skeleton",
  rows = 4,
}: {
  testId?: string;
  rows?: number;
}) {
  return (
    <div
      className="min-h-[220px] space-y-4 rounded-md border border-hairline bg-paper p-4"
      aria-busy="true"
      data-test-id={testId}
    >
      <div className="space-y-2">
        <div className={`${shimmerClass} h-4 w-40`} />
        <div className={`${shimmerClass} h-3 w-64 max-w-full`} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="space-y-2">
            <div className={`${shimmerClass} h-3 w-24`} />
            <div className={`${shimmerClass} h-9 w-full`} />
          </div>
        ))}
      </div>
      <div className="flex justify-end">
        <div className={`${shimmerClass} h-9 w-24`} />
      </div>
    </div>
  );
}

/** Authorization workspace card/table skeleton. */
export function EnterpriseAuthorizationWorkspaceSkeleton({
  testId = "authorization-workspace-skeleton",
}: {
  testId?: string;
}) {
  return (
    <div className="min-h-[320px] space-y-4" aria-busy="true" data-test-id={testId}>
      <div className="rounded-md border border-hairline bg-paper p-4">
        <div className={`${shimmerClass} mb-3 h-4 w-36`} />
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="flex items-center justify-between gap-3">
              <div className={`${shimmerClass} h-3 w-20 shrink-0`} />
              <div className={`${shimmerClass} h-3 w-28`} />
            </div>
          ))}
        </div>
      </div>
      <div className="overflow-hidden rounded-md border border-hairline">
        <div className="border-b border-hairline bg-paper-deep/40 px-3 py-2">
          <div className="grid grid-cols-4 gap-3">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className={`${shimmerClass} h-3`} />
            ))}
          </div>
        </div>
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="grid grid-cols-4 gap-3 border-b border-hairline-soft px-3 py-3 last:border-b-0">
            {Array.from({ length: 4 }, (_, col) => (
              <div key={col} className={`${shimmerClass} h-3.5`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// Async loading↔ready crossfades use KIT-A `AsyncStateTransition`
// (`../primitives/async-state-transition`) — do not reintroduce a local motion path.
