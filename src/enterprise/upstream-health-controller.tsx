"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "../toast";
import { EnterpriseUpstreamHealth, type UpstreamHealthLabels } from "./settings-surfaces";
import type { EnterpriseIntegrationCard } from "./models";
import { relativeTime } from "./relative-time";
import { EnterprisePermissionDeniedPage } from "./surface-helpers";

export interface EnterpriseUpstreamHealthItem { dependency: string; displayName: string; status: string; checkedAt: string | null; summary: string; errorSummary: string; summaryCode?: string; summaryParams?: Record<string, string | number | boolean>; supported?: boolean; }
export interface EnterpriseUpstreamHealthAdapter { load(): Promise<readonly EnterpriseUpstreamHealthItem[]>; runChecks(): Promise<readonly EnterpriseUpstreamHealthItem[]>; }
export interface EnterpriseUpstreamHealthControllerLabels extends UpstreamHealthLabels {
  loadFailed: string; checkSucceeded: string; checkFailed: string; permissionDenied: string;
  /** Page-unavailable detail for toast-mode EmptyState (FE-FB-02). */
  permissionDeniedDetail?: string;
  /** Label for the safe root-navigation fallback when the host omits a route action. */
  permissionDeniedAction?: string;
  checkedAt: (relative: string) => string; checkedAtNever: string;
  status: { healthy: string; warning: string; unhealthy: string; unknown: string };
  dependencyNames: Record<string, string>;
  summaries: { healthy: string; warning: string; unhealthy: string; unknown: string; notChecked: string; notSupported: string };
}

/** Shared polling, race control, formatting and feedback for upstream monitoring. */
export function EnterpriseUpstreamHealthController({
  adapter,
  labels,
  locale,
  canView,
  canManage,
  pollIntervalMs = 30_000,
  testId,
  actionTestId,
  cardsTestId,
  feedbackMode = "inline",
  refreshVariant,
  permissionDeniedActions,
}: {
  adapter: EnterpriseUpstreamHealthAdapter;
  labels: EnterpriseUpstreamHealthControllerLabels;
  locale: string;
  canView: boolean;
  canManage: boolean;
  pollIntervalMs?: number;
  /** Host-chosen emphasis for the header Refresh action (forwarded to the surface). */
  refreshVariant?: "primary" | "secondary";
  testId?: string;
  actionTestId?: string;
  cardsTestId?: string;
  /** Default `inline` preserves main-app dual-channel load path; Customs passes `toast`. */
  feedbackMode?: "inline" | "toast";
  /** Optional route-specific action; omission falls back to safe root navigation. */
  permissionDeniedActions?: ReactNode;
}) {
  const toastMode = feedbackMode === "toast";
  const [state, setState] = useState({ loading: true, checking: false, items: [] as readonly EnterpriseUpstreamHealthItem[], loadFailed: false, now: 0 }); const seq = useRef(0); const checking = useRef(false);
  const refresh = useCallback(async (silent = false) => {
    if (!canView || (silent && checking.current)) return;
    const request = ++seq.current;
    if (!silent) setState((current) => ({ ...current, loading: true }));
    try {
      const items = await adapter.load();
      if (request !== seq.current) return;
      setState((current) => ({ ...current, loading: false, items, loadFailed: false, now: Date.now() }));
    } catch {
      if (request !== seq.current) return;
      if (!silent) toast.error(labels.loadFailed);
      // Keep prior items if any; never invent a healthy empty success after failure.
      setState((current) => ({
        ...current,
        loading: false,
        loadFailed: true,
        items: current.items,
        now: Date.now(),
      }));
    }
  }, [adapter, canView, labels.loadFailed]);
  useEffect(() => { if (!canView) return; const initial = window.setTimeout(() => void refresh(), 0); const timer = window.setInterval(() => void refresh(true), pollIntervalMs); return () => { window.clearTimeout(initial); window.clearInterval(timer); }; }, [canView, pollIntervalMs, refresh]);
  const runChecks = useCallback(async () => { if (!canManage || checking.current) return; checking.current = true; const request = ++seq.current; setState((current) => ({ ...current, checking: true })); try { const items = await adapter.runChecks(); toast.success(labels.checkSucceeded); if (request === seq.current) setState((current) => ({ ...current, checking: false, items, loadFailed: false, now: Date.now() })); } catch { toast.error(labels.checkFailed); if (request === seq.current) setState((current) => ({ ...current, checking: false })); } finally { checking.current = false; } }, [adapter, canManage, labels.checkFailed, labels.checkSucceeded]);
  if (!canView) {
    // FE-FB-02 / DECISIONS ruling 4: page-state EmptyState (title + detail + home), no toast, no redirect.
    // The page header stays outside the gate so the route keeps exactly one H1.
    return (
      <EnterprisePermissionDeniedPage
        title={labels.title}
        description={labels.description}
        testId={testId ?? "upstream-health-page"}
        feedbackMode={feedbackMode}
        message={labels.permissionDenied}
        messageDetail={labels.permissionDeniedDetail}
        actions={permissionDeniedActions}
        defaultActionLabel={labels.permissionDeniedAction}
      />
    );
  }
  const cards: EnterpriseIntegrationCard[] = state.items.map((item) => {
    const status = normalizeStatus(item.status);
    const relative = relativeTime(item.checkedAt, locale, state.now);
    const supported = item.supported !== false;
    return {
      id: item.dependency,
      name: labels.dependencyNames[item.dependency] ?? item.dependency,
      description: localizedSummary(item.summaryCode, supported, labels),
      status: !supported ? "not-configured" : status === "healthy" ? "healthy" : status === "warning" ? "degraded" : status === "unhealthy" ? "offline" : "not-configured",
      statusLabel: !supported ? labels.summaries.notSupported : labels.status[status],
      lastChecked: relative ? labels.checkedAt(relative) : labels.checkedAtNever,
    };
  });
  // FE-FB-01: toast mode keeps Refresh permanently visible (not failure-gated).
  const canRefresh = toastMode ? true : canManage;
  const onRefresh = canManage ? runChecks : () => void refresh();
  return (
    <EnterpriseUpstreamHealth
      labels={labels}
      integrations={cards}
      loading={state.loading || state.checking}
      error={state.loadFailed ? labels.loadFailed : null}
      onRefresh={onRefresh}
      canRefresh={canRefresh}
      testId={testId}
      actionTestId={actionTestId}
      cardsTestId={cardsTestId}
      feedbackMode={feedbackMode}
      refreshVariant={refreshVariant}
    />
  );
}

function normalizeStatus(value: string): keyof EnterpriseUpstreamHealthControllerLabels["status"] { const status = value.toLowerCase(); return status === "healthy" || status === "warning" || status === "unhealthy" ? status : "unknown"; }
function localizedSummary(code: string | undefined, supported: boolean, labels: EnterpriseUpstreamHealthControllerLabels): string { if (!supported || code === "upstream.not_supported") return labels.summaries.notSupported; if (code === "upstream.healthy") return labels.summaries.healthy; if (code === "upstream.warning") return labels.summaries.warning; if (code === "upstream.unhealthy") return labels.summaries.unhealthy; if (code === "upstream.not_checked") return labels.summaries.notChecked; return labels.summaries.unknown; }
