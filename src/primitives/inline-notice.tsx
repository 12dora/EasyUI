"use client";

import type { ReactNode } from "react";

import { Button } from "./button";

export type InlineNoticeTone = "error" | "warning" | "info" | "success";

interface InlineNoticeProps {
  tone?: InlineNoticeTone;
  title?: ReactNode;
  message: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  action?: ReactNode;
  className?: string;
  "data-test-id"?: string;
}

const TONE_CLASS: Record<InlineNoticeTone, string> = {
  // An inline notice is nothing but words: title + message inherit this colour, so the red
  // one goes `--signal-ink` (6.54:1) while border/tint stay on the `--signal` fill.
  error: "border-[rgb(var(--signal))]/30 bg-[rgb(var(--signal))]/[0.08] text-[rgb(var(--signal-ink))]",
  warning: "border-[rgb(var(--status-pending))]/35 bg-[rgb(var(--status-pending))]/[0.12] text-[rgb(var(--status-pending))]",
  info: "border-[rgb(var(--bond))]/25 bg-[rgb(var(--bond))]/[0.08] text-[rgb(var(--bond))]",
  success: "border-[rgb(var(--evergreen))]/30 bg-[rgb(var(--evergreen))]/[0.08] text-[rgb(var(--evergreen))]",
};

/**
 * Live semantics: tone is not only a colour, it is the announcement contract.
 * `error` interrupts (role=alert / implicit aria-live=assertive) because it
 * blocks the user; every other tone is announced politely (role=status) so it
 * never cuts across what the screen reader is already reading.
 */
const TONE_ROLE: Record<InlineNoticeTone, "alert" | "status"> = {
  error: "alert",
  warning: "status",
  info: "status",
  success: "status",
};

export function InlineNotice({
  tone = "info",
  title,
  message,
  actionLabel,
  onAction,
  action,
  className = "",
  "data-test-id": dataTestId,
}: InlineNoticeProps) {
  return (
    <div role={TONE_ROLE[tone]} className={`rounded-md border px-3 py-2 text-sm ${TONE_CLASS[tone]} ${className}`} data-test-id={dataTestId}>
      {title && <div className="mb-1 font-medium">{title}</div>}
      <div className="flex items-start justify-between gap-3">
        <div>{message}</div>
        {action ?? (actionLabel && onAction && (
          <Button type="button" variant="ghost" size="sm" onClick={onAction}>
            {actionLabel}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function InlineErrorBanner(props: Omit<InlineNoticeProps, "tone">) {
  return <InlineNotice {...props} tone="error" />;
}
