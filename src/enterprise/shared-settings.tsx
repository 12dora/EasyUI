"use client";

import type { ReactNode } from "react";
import { Badge, type BadgeTone } from "../primitives/badge";
import { Checkbox } from "../primitives/checkbox";
import { Field, Input } from "../primitives/field";

/**
 * FE-UXA-13: labels shrink-0, values min-w-0 break-all; stack below `sm`.
 * Long EasyAuth base URLs must not force horizontal page overflow.
 */
export function EnterpriseIntegrationFactGrid({ facts, testId }: { facts: readonly { label: ReactNode; value: ReactNode }[]; testId?: string }) {
  return (
    <div
      className="grid min-w-0 gap-x-8 gap-y-2 rounded-md border border-hairline bg-paper p-4 sm:grid-cols-2"
      style={{ maxWidth: "100%" }}
      data-test-id={testId}
    >
      {facts.map((fact, index) => (
        <div
          key={index}
          className="flex min-w-0 flex-col gap-1 text-[13px] sm:flex-row sm:items-center sm:justify-between"
        >
          <span className="shrink-0 text-ink-soft">{fact.label}</span>
          <span
            className="min-w-0 break-all text-left font-medium text-ink sm:text-right"
            style={{ maxWidth: "100%", overflowWrap: "anywhere" }}
          >
            {fact.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export function EnterpriseSecurityMethodRow({ title, description, status, action, children, testId }: { title: ReactNode; description?: ReactNode; status?: ReactNode; action?: ReactNode; children?: ReactNode; testId?: string }) {
  return <div className="py-4" data-test-id={testId}><div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2"><p className="text-[13px] text-ink">{title}</p>{status}</div>{description ? <p className="mt-0.5 text-[12px] text-ink-faint">{description}</p> : null}</div>{action}</div>{children}</div>;
}

/** Write-only credential field. Empty keeps the stored value; explicit clear sends an empty string. */
export function EnterpriseSecretField({ id, label, info, keepHint, clearLabel, configuredHint, value, clear, onValueChange, onClearChange, disabled, testId }: { id: string; label: ReactNode; info?: ReactNode; keepHint?: ReactNode; clearLabel: ReactNode; configuredHint?: string; value: string; clear: boolean; onValueChange: (value: string) => void; onClearChange: (clear: boolean) => void; disabled?: boolean; testId?: string }) {
  return <div className="flex flex-col gap-1" data-test-id={testId}><Field label={label} info={info} hint={keepHint} htmlFor={id}><Input id={id} type="password" autoComplete="new-password" value={value} placeholder={configuredHint} onChange={(event) => onValueChange(event.target.value)} disabled={disabled || clear} className="font-mono"/></Field><Checkbox label={clearLabel} checked={clear} onChange={(event) => onClearChange(event.target.checked)} disabled={disabled} wrapperClassName="min-h-0 text-[12px] text-ink-soft"/></div>;
}

export function EnterpriseDependencyCard({ name, statusLabel, statusTone, statusValue, checkedLabel, checkedTitle, summary, error, testId, statusTestId }: { name: ReactNode; statusLabel: ReactNode; statusTone: BadgeTone; statusValue?: string; checkedLabel: ReactNode; checkedTitle?: string; summary?: ReactNode; error?: ReactNode; testId?: string; statusTestId?: string }) {
  return <article className="flex flex-col gap-2 rounded-md border border-hairline bg-paper p-4" data-test-id={testId}><header className="flex items-start justify-between gap-3"><h3 className="text-[14px] font-semibold text-ink">{name}</h3><span data-test-id={statusTestId} data-status={statusValue}><Badge tone={statusTone}>{statusLabel}</Badge></span></header><p className="text-[12px] text-ink-faint" title={checkedTitle}>{checkedLabel}</p>{summary ? <p className="text-[13px] leading-5 text-ink-soft">{summary}</p> : null}{error ? <p className="break-all text-[12px] leading-5 text-[rgb(var(--signal-ink))]" data-test-id="upstream-health-error">{error}</p> : null}</article>;
}
