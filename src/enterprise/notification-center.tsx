"use client";

import { Button } from "../primitives/button";
import { InlineNotice } from "../primitives/inline-notice";
import { PageHeader } from "../primitives/page-header";
import { AsyncStateTransition } from "../primitives/async-state-transition";
import type { EnterpriseNotification } from "./models";
import { RelativeTimestamp } from "./relative-time";
import { EnterpriseNotificationListSkeleton } from "./surface-helpers";

export function EnterpriseNotificationCenter({
  title,
  description,
  empty,
  loadFailed,
  retry,
  dismiss,
  items,
  loading,
  error,
  locale,
  onRetry,
  onDismiss,
}: {
  title: string;
  description: string;
  empty: string;
  loadFailed: string;
  retry: string;
  dismiss: string;
  items: readonly EnterpriseNotification[];
  loading: boolean;
  error: boolean;
  /** Drives relative-time wording; hosts that omit it fall back to the runtime locale. */
  locale?: string;
  onRetry: () => void | Promise<void>;
  onDismiss: (id: string) => void | Promise<void>;
}) {
  // FE-UXA-10: reserve list height with row skeletons while the first page loads.
  // Retry stays permanently in the header (not failure-only).
  const showSkeleton = loading && items.length === 0;
  const state = showSkeleton ? "loading" : items.length === 0 ? "empty" : "ready";

  return (
    <section data-test-id="notification-center-page">
      <PageHeader
        title={title}
        subtitle={description}
        actions={
          <Button variant="secondary" size="sm" loading={loading} onClick={() => void onRetry()}>
            {retry}
          </Button>
        }
      />
      {error ? (
        <InlineNotice tone="error" className="mt-5" message={loadFailed} actionLabel={retry} onAction={() => void onRetry()} />
      ) : null}
      <div className="mt-5 divide-y divide-hairline rounded-md border border-hairline bg-paper">
        <AsyncStateTransition
          state={state}
          minHeight={180}
          data-test-id="notification-async-state"
          loading={<EnterpriseNotificationListSkeleton rows={3} />}
          empty={<p className="p-8 text-center text-[13px] text-ink-faint">{empty}</p>}
          ready={
            <>
              {items.map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-ink">{item.title}</p>
                    <p className={`mt-1 text-[12px] ${item.urgent ? "text-[rgb(var(--signal))]" : "text-ink-soft"}`}>{item.detail}</p>
                    <RelativeTimestamp
                      value={item.createdAt}
                      absoluteLabel={item.createdAtLabel}
                      locale={locale}
                      className="mt-1 block text-[11px] text-ink-faint"
                      testId="notification-time"
                    />
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => void onDismiss(item.id)}>
                    {dismiss}
                  </Button>
                </div>
              ))}
            </>
          }
        />
      </div>
    </section>
  );
}
