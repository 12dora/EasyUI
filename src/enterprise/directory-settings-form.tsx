"use client";

import type { ReactNode } from "react";
import { Badge, type BadgeTone } from "../primitives/badge";
import { Button } from "../primitives/button";
import { Checkbox } from "../primitives/checkbox";
import { Field, Input, Select } from "../primitives/field";
import { FormGrid } from "../primitives/form-grid";
import { InlineNotice } from "../primitives/inline-notice";
import { Section } from "../primitives/section";
import { formatEnterpriseTimestamp, type EnterpriseTimestampFormatter } from "./format-timestamp";
import { EnterpriseSecretField } from "./shared-settings";
import type { EnterpriseWriteOnlySecret } from "./integration-configuration-forms";

/** How the app authenticates against the EasyAuth directory capability. */
export type EnterpriseDirectoryAuthMode = "static_app_token" | "oauth_client_credentials";

/**
 * Outcome of one directory read + projection run.
 *
 * `authoritative` (== complete && !stale) is the only state in which "absent
 * from the snapshot" was allowed to deactivate a local user, so the UI must
 * say — in plain words — whether the last run was allowed to write at all.
 */
export type EnterpriseDirectorySyncStatus =
  | "completed"
  | "not_authoritative"
  | "drift"
  | "failed"
  | "not_configured";

export interface EnterpriseDirectorySyncResult {
  status: EnterpriseDirectorySyncStatus;
  at?: string;
  authoritative: boolean;
  complete: boolean;
  stale: boolean;
  upstreamTotal: number;
  created: number;
  updated: number;
  deactivated: number;
  /** Directory people without an upstream login id — projected, but unable to sign in. */
  unmapped: number;
  summary: string;
  errorDetail?: string | null;
}

export interface EnterpriseDirectorySettingsValue {
  enabled: boolean;
  baseUrl: string;
  appKey: string;
  hasCredential: boolean;
  authMode: EnterpriseDirectoryAuthMode;
  syncIntervalMinutes: number;
  lastSync?: EnterpriseDirectorySyncResult | null;
}

export interface EnterpriseDirectorySettingsLabels {
  title: string;
  description: string;
  save: string;
  enabled: string;
  baseUrl: string;
  appKey: string;
  credential: string;
  credentialHint: string;
  configured: string;
  notConfigured: string;
  clearSecret: string;
  authMode: string;
  authModes: Record<EnterpriseDirectoryAuthMode, string>;
  syncInterval: string;
  connectionTest: string;
  syncNow: string;
  operationSucceeded: string;
  operationFailed: string;
  lastSyncTitle: string;
  lastSyncNever: string;
  lastSyncAt: string;
  statusLabels: Record<EnterpriseDirectorySyncStatus, string>;
  /** Plain-words explanation of what the status means for the local user list. */
  statusExplanations: Record<EnterpriseDirectorySyncStatus, string>;
  trustAuthoritative: string;
  trustNotAuthoritative: string;
  incomplete: string;
  stale: string;
  counts: {
    upstreamTotal: string;
    created: string;
    updated: string;
    deactivated: string;
    unmapped: string;
  };
  unmappedHint: string;
  errorDetail: string;
  notAvailable: string;
}

const STATUS_TONE: Record<EnterpriseDirectorySyncStatus, BadgeTone> = {
  completed: "evergreen",
  not_authoritative: "amber",
  drift: "amber",
  failed: "signal",
  not_configured: "faint",
};

export interface EnterpriseDirectorySettingsFormProps {
  labels: EnterpriseDirectorySettingsLabels;
  value: EnterpriseDirectorySettingsValue;
  credential: EnterpriseWriteOnlySecret;
  disabled?: boolean;
  saving?: boolean;
  testing?: boolean;
  syncing?: boolean;
  operationResult?: { ok: boolean; message: string } | null;
  locale: string;
  formatTimestamp?: EnterpriseTimestampFormatter;
  timeZone?: string;
  onChange: (patch: Partial<EnterpriseDirectorySettingsValue>) => void;
  onCredentialChange: (next: EnterpriseWriteOnlySecret) => void;
  onSave: () => void | Promise<void>;
  onTest?: () => void | Promise<void>;
  onSync?: () => void | Promise<void>;
}

/**
 * EasyAuth directory (user source of truth) settings.
 *
 * The credential is write-only exactly like every other enterprise secret:
 * an empty box keeps the stored value, the clear checkbox sends an explicit
 * empty string. Nothing here is ever echoed back from the server.
 */
export function EnterpriseDirectorySettingsForm({
  labels,
  value,
  credential,
  disabled,
  saving,
  testing,
  syncing,
  operationResult,
  locale,
  formatTimestamp,
  timeZone,
  onChange,
  onCredentialChange,
  onSave,
  onTest,
  onSync,
}: EnterpriseDirectorySettingsFormProps) {
  return (
    <Section
      title={labels.title}
      description={labels.description}
      flush
      actions={
        !disabled ? (
          <>
            {onTest ? (
              <Button variant="outline" size="sm" loading={testing} onClick={() => void onTest()} data-test-id="directory-connection-test">
                {labels.connectionTest}
              </Button>
            ) : null}
            {onSync ? (
              <Button variant="outline" size="sm" loading={syncing} onClick={() => void onSync()} data-test-id="directory-sync-now">
                {labels.syncNow}
              </Button>
            ) : null}
            <Button variant="primary" size="sm" loading={saving} onClick={() => void onSave()} data-test-id="directory-save">
              {labels.save}
            </Button>
          </>
        ) : null
      }
    >
      <div className="space-y-4" data-test-id="directory-settings-form">
        <Checkbox
          label={labels.enabled}
          checked={value.enabled}
          disabled={disabled}
          onChange={(event) => onChange({ enabled: event.target.checked })}
          data-test-id="directory-enabled"
        />
        <FormGrid columns={2}>
          <Field label={labels.baseUrl} htmlFor="enterprise-directory-base-url">
            <Input
              id="enterprise-directory-base-url"
              value={value.baseUrl ?? ""}
              disabled={disabled}
              className="font-mono"
              onChange={(event) => onChange({ baseUrl: event.target.value })}
            />
          </Field>
          <Field label={labels.appKey} htmlFor="enterprise-directory-app-key">
            <Input
              id="enterprise-directory-app-key"
              value={value.appKey ?? ""}
              disabled={disabled}
              className="font-mono"
              onChange={(event) => onChange({ appKey: event.target.value })}
            />
          </Field>
          <EnterpriseSecretField
            id="enterprise-directory-credential"
            label={labels.credential}
            keepHint={labels.credentialHint}
            clearLabel={labels.clearSecret}
            configuredHint={value.hasCredential ? labels.configured : labels.notConfigured}
            value={credential.value}
            clear={credential.clear}
            disabled={disabled}
            onValueChange={(secret) => onCredentialChange({ value: secret, clear: false })}
            onClearChange={(clear) => onCredentialChange({ value: clear ? "" : credential.value, clear })}
            testId="directory-credential"
          />
          <Field label={labels.authMode} htmlFor="enterprise-directory-auth-mode">
            <Select
              id="enterprise-directory-auth-mode"
              value={value.authMode}
              disabled={disabled}
              onChange={(event) => onChange({ authMode: event.target.value as EnterpriseDirectoryAuthMode })}
            >
              <option value="static_app_token">{labels.authModes.static_app_token}</option>
              <option value="oauth_client_credentials">{labels.authModes.oauth_client_credentials}</option>
            </Select>
          </Field>
          <Field label={labels.syncInterval} htmlFor="enterprise-directory-interval">
            <Input
              id="enterprise-directory-interval"
              type="number"
              value={String(value.syncIntervalMinutes ?? 0)}
              disabled={disabled}
              className="font-mono"
              onChange={(event) => onChange({ syncIntervalMinutes: Number.parseInt(event.target.value, 10) || 0 })}
            />
          </Field>
        </FormGrid>
        {operationResult ? (
          <InlineNotice
            tone={operationResult.ok ? "success" : "error"}
            message={operationResult.message}
            data-test-id="directory-operation-result"
          />
        ) : null}
        <EnterpriseDirectorySyncStatusBlock
          labels={labels}
          lastSync={value.lastSync}
          locale={locale}
          formatTimestamp={formatTimestamp}
          timeZone={timeZone}
        />
      </div>
    </Section>
  );
}

/**
 * Last-run report. Deliberately explains the trust state before the numbers:
 * counts from a non-authoritative run describe what was *read*, not what was
 * written, and a reader who misses that will misread "0 deactivated".
 */
export function EnterpriseDirectorySyncStatusBlock({
  labels,
  lastSync,
  locale,
  formatTimestamp,
  timeZone,
}: {
  labels: EnterpriseDirectorySettingsLabels;
  lastSync?: EnterpriseDirectorySyncResult | null;
  locale: string;
  formatTimestamp?: EnterpriseTimestampFormatter;
  timeZone?: string;
}) {
  if (!lastSync) {
    return (
      <div className="rounded-md border border-hairline bg-paper p-4" data-test-id="directory-last-sync-empty">
        <p className="text-[13px] font-medium text-ink">{labels.lastSyncTitle}</p>
        <p className="mt-1 text-[12px] text-ink-faint">{labels.lastSyncNever}</p>
      </div>
    );
  }
  const at = lastSync.at
    ? formatEnterpriseTimestamp(lastSync.at, { locale, empty: labels.notAvailable, formatTimestamp, timeZone })
    : labels.notAvailable;
  return (
    <div className="space-y-3 rounded-md border border-hairline bg-paper p-4" data-test-id="directory-last-sync">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-ink">{labels.lastSyncTitle}</p>
        <span data-test-id="directory-last-sync-status" data-status={lastSync.status}>
          <Badge tone={STATUS_TONE[lastSync.status]} uppercase={false}>
            {labels.statusLabels[lastSync.status]}
          </Badge>
        </span>
      </header>
      <p className="text-[12px] leading-5 text-ink-soft" data-test-id="directory-last-sync-explanation">
        {labels.statusExplanations[lastSync.status]}
      </p>
      <p className="text-[12px] leading-5 text-ink-soft" data-test-id="directory-last-sync-trust">
        {lastSync.authoritative ? labels.trustAuthoritative : labels.trustNotAuthoritative}
      </p>
      {!lastSync.complete ? (
        <p className="text-[12px] leading-5 text-ink-faint" data-test-id="directory-last-sync-incomplete">{labels.incomplete}</p>
      ) : null}
      {lastSync.stale ? (
        <p className="text-[12px] leading-5 text-ink-faint" data-test-id="directory-last-sync-stale">{labels.stale}</p>
      ) : null}
      {lastSync.summary ? (
        <p className="text-[12px] leading-5 text-ink-soft" data-test-id="directory-last-sync-summary">{lastSync.summary}</p>
      ) : null}
      <dl className="grid gap-x-6 gap-y-1 text-[12px] sm:grid-cols-2">
        <Count label={labels.counts.upstreamTotal} value={lastSync.upstreamTotal} testId="directory-count-upstream-total" />
        <Count label={labels.counts.created} value={lastSync.created} testId="directory-count-created" />
        <Count label={labels.counts.updated} value={lastSync.updated} testId="directory-count-updated" />
        <Count label={labels.counts.deactivated} value={lastSync.deactivated} testId="directory-count-deactivated" />
        <Count label={labels.counts.unmapped} value={lastSync.unmapped} testId="directory-count-unmapped" />
        <Count label={labels.lastSyncAt} value={at} testId="directory-last-sync-at" />
      </dl>
      <p className="text-[12px] leading-5 text-ink-faint" data-test-id="directory-unmapped-hint">{labels.unmappedHint}</p>
      {lastSync.errorDetail ? (
        <p className="break-all text-[12px] leading-5 text-[rgb(var(--signal))]" data-test-id="directory-last-sync-error">
          {labels.errorDetail}: {lastSync.errorDetail}
        </p>
      ) : null}
    </div>
  );
}

function Count({ label, value, testId }: { label: ReactNode; value: ReactNode; testId: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-hairline-soft py-1">
      <dt className="text-ink-faint">{label}</dt>
      <dd className="text-right font-mono text-ink" data-test-id={testId}>{value}</dd>
    </div>
  );
}
