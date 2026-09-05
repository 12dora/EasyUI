"use client";

import type { ReactNode } from "react";

import { Button } from "./button";

export type AppErrorKind = "notFound" | "resourceUnavailable" | "unexpected" | "forbidden" | "auth";

export interface AppErrorRetry {
  label: ReactNode;
  onRetry: () => void;
  loading?: boolean;
}

interface AppErrorStateProps {
  kind: AppErrorKind;
  title: ReactNode;
  description?: ReactNode;
  requestId?: ReactNode;
  requestIdLabel?: ReactNode;
  actions?: ReactNode;
  retry?: AppErrorRetry;
  className?: string;
  "data-test-id"?: string;
}

/**
 * `toneClass` dresses the badge circle only, and its `text-` half colours the aria-hidden
 * `!` glyph inside it — a mark, not a message. So the tones stay on the fill tokens
 * (`--signal`, `--status-pending`) rather than the text ones (`--signal-ink`,
 * `--status-pending-ink`); the words on this screen are `text-ink` / `text-ink-soft`.
 */
const KIND_META: Record<AppErrorKind, { label: string; mark: string; toneClass: string }> = {
  notFound: {
    label: "404",
    mark: "!",
    toneClass: "border-ink/15 bg-ink/[0.03] text-ink-soft",
  },
  resourceUnavailable: {
    label: "503",
    mark: "!",
    toneClass: "border-[rgb(var(--status-pending))]/30 bg-[rgb(var(--status-pending))]/[0.08] text-[rgb(var(--status-pending))]",
  },
  unexpected: {
    label: "500",
    mark: "!",
    toneClass: "border-[rgb(var(--signal))]/25 bg-[rgb(var(--signal))]/[0.07] text-[rgb(var(--signal))]",
  },
  forbidden: {
    label: "403",
    mark: "!",
    toneClass: "border-[rgb(var(--bond))]/25 bg-[rgb(var(--bond))]/[0.07] text-[rgb(var(--bond))]",
  },
  auth: {
    label: "401",
    mark: "!",
    toneClass: "border-[rgb(var(--amber))]/25 bg-[rgb(var(--amber))]/[0.08] text-[rgb(var(--amber))]",
  },
};

export function AppErrorState({
  kind,
  title,
  description,
  requestId,
  requestIdLabel,
  actions,
  retry,
  className = "",
  "data-test-id": dataTestId = "app-error-state",
}: AppErrorStateProps) {
  const meta = KIND_META[kind];
  return (
    <section
      className={`mx-auto flex min-h-[360px] w-full max-w-3xl flex-col items-center justify-center px-5 py-14 text-center ${className}`}
      data-error-kind={kind}
      data-test-id={dataTestId}
      role={kind === "unexpected" || kind === "resourceUnavailable" ? "alert" : "status"}
      aria-live={kind === "unexpected" || kind === "resourceUnavailable" ? "assertive" : "polite"}
    >
      <div className={`mb-5 flex h-14 w-14 items-center justify-center rounded-full border ${meta.toneClass}`} data-test-id="app-error-icon" aria-hidden="true">
        <span className="font-mono text-[22px] font-semibold leading-none">{meta.mark}</span>
      </div>
      {/* HTTP status stamp ("404", "503"): the one place `tracking` survives — it is a
          purely numeric monospace code, read digit by digit, not a translated label.
          `uppercase` is gone because it never did anything to digits. 12px like the rest. */}
      <div className="mb-2 font-mono text-[12px] font-medium tracking-[0.16em] text-ink-faint">{meta.label}</div>
      <h1 className="max-w-2xl text-[24px] font-semibold leading-tight text-ink sm:text-[28px]">{title}</h1>
      {description && <p className="mt-3 max-w-2xl text-[14px] leading-6 text-ink-soft">{description}</p>}
      {requestId && (
        <p className="mt-4 max-w-full rounded-[4px] border border-[rgb(var(--hairline))] bg-paper-deep px-3 py-2 font-mono text-[12px] text-ink-soft">
          {requestIdLabel ? <span className="mr-2 text-ink-faint">{requestIdLabel}</span> : null}
          <span>{requestId}</span>
        </p>
      )}
      {(retry || actions) && (
        <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
          {retry && (
            <Button type="button" variant="primary" onClick={retry.onRetry} loading={retry.loading}>
              {retry.label}
            </Button>
          )}
          {actions}
        </div>
      )}
    </section>
  );
}
