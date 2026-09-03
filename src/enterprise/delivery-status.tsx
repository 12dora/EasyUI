"use client";

import type { ReactNode } from "react";
import { Badge, type BadgeTone } from "../primitives/badge";
import { formatEnterpriseTimestamp, type EnterpriseTimestampFormatter } from "./format-timestamp";

/**
 * Outbox delivery lifecycle shared by every host that sends through EasyAuth notify.
 *
 * `sent` means the channel (DingTalk) accepted the message — the strongest
 * guarantee available. `delivered` is an explicit receipt and still says
 * nothing about whether a human read it; the labels must never imply it does.
 */
export type EnterpriseDeliveryStatus =
  | "queued"
  | "accepted"
  | "sent"
  | "delivered"
  | "failed"
  | "superseded";

export interface EnterpriseDeliveryStatusValue {
  status: EnterpriseDeliveryStatus;
  acceptedAt?: string | null;
  sentAt?: string | null;
  deliveredAt?: string | null;
  lastError?: string | null;
  providerMessageId?: string | null;
  recipientCount?: number | null;
  lastReconciledAt?: string | null;
}

export interface EnterpriseDeliveryStatusLabels {
  title: string;
  statusLabels: Record<EnterpriseDeliveryStatus, string>;
  /** Plain-words meaning of each status — especially "delivered is not read". */
  statusExplanations: Record<EnterpriseDeliveryStatus, string>;
  acceptedAt: string;
  sentAt: string;
  deliveredAt: string;
  lastReconciledAt: string;
  providerMessageId: string;
  recipientCount: string;
  lastError: string;
  /** Shown when a `sent` message has had no delivery receipt for too long. */
  unconfirmedHint: string;
  notAvailable: string;
}

const STATUS_TONE: Record<EnterpriseDeliveryStatus, BadgeTone> = {
  queued: "faint",
  accepted: "neutral",
  sent: "amber",
  delivered: "evergreen",
  failed: "signal",
  superseded: "faint",
};

/** EasyAuth reconciles for 24h; past that a `sent` message will never be confirmed. */
export const ENTERPRISE_DELIVERY_UNCONFIRMED_AFTER_MS = 24 * 60 * 60 * 1000;

export function EnterpriseDeliveryStatusBadge({
  status,
  labels,
  testId = "delivery-status-badge",
}: {
  status: EnterpriseDeliveryStatus;
  labels: EnterpriseDeliveryStatusLabels;
  testId?: string;
}) {
  return (
    <span data-test-id={testId} data-status={status}>
      <Badge tone={STATUS_TONE[status]} uppercase={false}>
        {labels.statusLabels[status]}
      </Badge>
    </span>
  );
}

/**
 * Returns true when a message was accepted by the channel but never confirmed
 * within the reconciliation window — the one case where "已发送" alone would
 * quietly overstate what is known.
 */
export function isEnterpriseDeliveryUnconfirmed(
  value: EnterpriseDeliveryStatusValue,
  now: number | Date = Date.now(),
  afterMs: number = ENTERPRISE_DELIVERY_UNCONFIRMED_AFTER_MS,
): boolean {
  if (value.status !== "sent" || !value.sentAt) return false;
  const sent = new Date(value.sentAt).getTime();
  if (Number.isNaN(sent)) return false;
  return (typeof now === "number" ? now : now.getTime()) - sent > afterMs;
}

export function EnterpriseDeliveryStatusDetail({
  value,
  labels,
  locale,
  formatTimestamp,
  timeZone,
  now,
  unconfirmedAfterMs = ENTERPRISE_DELIVERY_UNCONFIRMED_AFTER_MS,
  testId = "delivery-status-detail",
}: {
  value: EnterpriseDeliveryStatusValue;
  labels: EnterpriseDeliveryStatusLabels;
  locale: string;
  formatTimestamp?: EnterpriseTimestampFormatter;
  timeZone?: string;
  /** Injectable clock so the >24h hint is testable. */
  now?: number | Date;
  unconfirmedAfterMs?: number;
  testId?: string;
}) {
  const at = (raw?: string | null) =>
    raw ? formatEnterpriseTimestamp(raw, { locale, empty: labels.notAvailable, formatTimestamp, timeZone }) : labels.notAvailable;
  const unconfirmed = isEnterpriseDeliveryUnconfirmed(value, now ?? Date.now(), unconfirmedAfterMs);
  return (
    <div className="space-y-3 rounded-md border border-hairline bg-paper p-4" data-test-id={testId}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-ink">{labels.title}</p>
        <EnterpriseDeliveryStatusBadge status={value.status} labels={labels} />
      </header>
      <p className="text-[12px] leading-5 text-ink-soft" data-test-id="delivery-status-explanation">
        {labels.statusExplanations[value.status]}
      </p>
      {unconfirmed ? (
        <p className="text-[12px] leading-5 text-[rgb(var(--amber))]" data-test-id="delivery-status-unconfirmed">
          {labels.unconfirmedHint}
        </p>
      ) : null}
      <dl className="grid gap-x-6 gap-y-1 text-[12px] sm:grid-cols-2">
        <DeliveryFact label={labels.acceptedAt} value={at(value.acceptedAt)} testId="delivery-status-accepted-at" />
        <DeliveryFact label={labels.sentAt} value={at(value.sentAt)} testId="delivery-status-sent-at" />
        <DeliveryFact label={labels.deliveredAt} value={at(value.deliveredAt)} testId="delivery-status-delivered-at" />
        <DeliveryFact label={labels.lastReconciledAt} value={at(value.lastReconciledAt)} testId="delivery-status-reconciled-at" />
        <DeliveryFact
          label={labels.recipientCount}
          value={value.recipientCount === null || value.recipientCount === undefined ? labels.notAvailable : String(value.recipientCount)}
          testId="delivery-status-recipient-count"
        />
        <DeliveryFact
          label={labels.providerMessageId}
          value={value.providerMessageId || labels.notAvailable}
          testId="delivery-status-message-id"
        />
      </dl>
      {value.lastError ? (
        <p className="break-all text-[12px] leading-5 text-[rgb(var(--signal))]" data-test-id="delivery-status-error">
          {labels.lastError}: {value.lastError}
        </p>
      ) : null}
    </div>
  );
}

function DeliveryFact({ label, value, testId }: { label: ReactNode; value: ReactNode; testId: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-hairline-soft py-1">
      <dt className="text-ink-faint">{label}</dt>
      <dd className="min-w-0 break-all text-right font-mono text-ink" data-test-id={testId}>{value}</dd>
    </div>
  );
}
