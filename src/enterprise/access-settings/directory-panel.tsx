"use client";

import type { ReactNode } from "react";
import { Button } from "../../primitives/button";
import { InlineNotice } from "../../primitives/inline-notice";
import { EnterpriseDirectorySettingsForm, type EnterpriseDirectorySettingsLabels } from "../directory-settings-form";
import type { EnterpriseTimestampFormatter } from "../format-timestamp";
import { EnterpriseSettingsFormSkeleton } from "../surface-helpers";
import type {
  EnterpriseAccessSettingsAdapter,
  EnterpriseSettingsConfigurationLabels,
  EnterpriseSettingsFeedbackMode,
} from "./types";
import { useDirectorySettings, type DirectorySettings } from "./use-directory-settings";

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
  if (!value) return renderLoadFailure(toastMode, directory, labels);

  return (
    <div data-test-id="directory-settings-section">
      <EnterpriseDirectorySettingsForm
        labels={directoryLabels}
        retryAction={renderRetry(directory, labels.retry)}
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

/**
 * 重试只认「上一次加载失败了」这一件事,不认「手里没有值」:换了适配器或切了语言时
 * 加载会重跑,这一次失败了、卡里却还留着上次读到的值,用户同样需要一个重试。
 * 读成功时这里返回 null——它不是常驻控件。
 */
function renderRetry(directory: DirectorySettings, retryLabel?: string): ReactNode {
  if (!directory.loadFailed) return null;
  return (
    <Button
      variant="outline"
      size="sm"
      loading={directory.busy === "load"}
      data-test-id="directory-settings-retry"
      onClick={directory.reload}
    >
      {retryLabel}
    </Button>
  );
}

/**
 * Toast mode already reported the failure, so the page must not repeat the words —
 * but it must still leave a way back: a placeholder card with the retry, instead of
 * a section that renders nothing at all.
 */
function renderLoadFailure(
  toastMode: boolean,
  directory: DirectorySettings,
  labels: EnterpriseSettingsConfigurationLabels,
): ReactNode {
  const retry = renderRetry(directory, labels.retry);
  if (toastMode) {
    return (
      <div
        className="flex flex-wrap items-center justify-between gap-[var(--ui-gap-md,16px)] rounded-md border border-hairline bg-paper p-4"
        data-test-id="directory-settings-missing"
      >
        <p className="text-[13px] text-ink-faint">—</p>
        {retry}
      </div>
    );
  }
  return (
    <InlineNotice
      tone="error"
      message={directory.result?.message ?? labels.loadFailed}
      action={retry}
      data-test-id="directory-settings-failed"
    />
  );
}
