"use client";

import type { ReactNode } from "react";
import { InlineNotice } from "../../primitives/inline-notice";
import { EnterpriseDirectorySettingsForm, type EnterpriseDirectorySettingsLabels } from "../directory-settings-form";
import type { EnterpriseTimestampFormatter } from "../format-timestamp";
import { EnterpriseSettingsFormSkeleton } from "../surface-helpers";
import type { SettingsOutcome } from "./helpers";
import type {
  EnterpriseAccessSettingsAdapter,
  EnterpriseSettingsConfigurationLabels,
  EnterpriseSettingsFeedbackMode,
} from "./types";
import { useDirectorySettings } from "./use-directory-settings";

/**
 * EasyAuth directory settings + last-run report.
 *
 * Separate from the OIDC panel on purpose: sign-in (OIDC) and the user source
 * of truth (directory) are configured, credentialed and failing independently,
 * so one failing load must never blank the other.
 */
export function DirectoryPanel({
  adapter,
  labels,
  directoryLabels,
  canManage,
  feedbackMode,
  locale,
  formatTimestamp,
  timeZone,
}: {
  adapter: EnterpriseAccessSettingsAdapter;
  labels: EnterpriseSettingsConfigurationLabels;
  directoryLabels: EnterpriseDirectorySettingsLabels;
  canManage: boolean;
  feedbackMode: EnterpriseSettingsFeedbackMode;
  locale: string;
  formatTimestamp?: EnterpriseTimestampFormatter;
  timeZone?: string;
}) {
  const toastMode = feedbackMode === "toast";
  const directory = useDirectorySettings({ adapter, labels, directoryLabels, feedbackMode });
  const { value, busy } = directory;

  if (busy === "load" && !value) return renderLoading(toastMode, labels.loading);
  if (!value) return renderLoadFailure(toastMode, directory.result, labels.loadFailed);

  return (
    <div data-test-id="directory-settings-section">
      <EnterpriseDirectorySettingsForm
        labels={directoryLabels}
        value={value}
        credential={directory.credential}
        disabled={!canManage}
        saving={busy === "save"}
        testing={busy === "test"}
        syncing={busy === "sync"}
        operationResult={toastMode ? null : directory.result}
        locale={locale}
        formatTimestamp={formatTimestamp}
        timeZone={timeZone}
        onChange={directory.patchValue}
        onCredentialChange={directory.setCredential}
        onSave={directory.save}
        onTest={adapter.testDirectory ? directory.test : undefined}
        onSync={adapter.syncDirectory ? directory.sync : undefined}
      />
    </div>
  );
}

function renderLoading(toastMode: boolean, loadingLabel: string): ReactNode {
  return toastMode ? (
    <EnterpriseSettingsFormSkeleton testId="directory-settings-skeleton" rows={3} />
  ) : (
    <p className="text-[13px] text-ink-soft" data-test-id="directory-settings-loading">{loadingLabel}</p>
  );
}

/** Toast mode already reported the failure; the page must not repeat it. */
function renderLoadFailure(toastMode: boolean, result: SettingsOutcome | null, loadFailedLabel: string): ReactNode {
  return toastMode ? null : (
    <InlineNotice tone="error" message={result?.message ?? loadFailedLabel} data-test-id="directory-settings-failed" />
  );
}
