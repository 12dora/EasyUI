"use client";

import type { ReactNode } from "react";
import { AsyncStateTransition } from "../../primitives/async-state-transition";
import { Button } from "../../primitives/button";
import { InlineNotice } from "../../primitives/inline-notice";
import { EnterpriseOidcConfigurationForm, type EnterpriseOidcConfigurationValue } from "../integration-configuration-forms";
import { EnterpriseSettingsFormSkeleton } from "../surface-helpers";
import type { SettingsOutcome } from "./helpers";
import { IdentityStatusSummary } from "./identity-status-summary";
import type {
  EnterpriseAccessSettingsAdapter,
  EnterpriseSettingsConfigurationLabels,
  EnterpriseSettingsFeedbackMode,
} from "./types";
import { useIdentitySettings, type IdentitySettings } from "./use-identity-settings";

interface IdentityRenderContext {
  adapter: EnterpriseAccessSettingsAdapter;
  labels: EnterpriseSettingsConfigurationLabels;
  identity: IdentitySettings;
  canManage: boolean;
  toastMode: boolean;
}

/** OIDC settings pane. Inline hosts read outcomes in the form, toast hosts in a toast. */
export function IdentityPanel({
  adapter,
  labels,
  canManage,
  feedbackMode,
}: {
  adapter: EnterpriseAccessSettingsAdapter;
  labels: EnterpriseSettingsConfigurationLabels;
  canManage: boolean;
  feedbackMode: EnterpriseSettingsFeedbackMode;
}) {
  const toastMode = feedbackMode === "toast";
  const identity = useIdentitySettings({ adapter, labels, feedbackMode });
  const context: IdentityRenderContext = { adapter, labels, identity, canManage, toastMode };
  return toastMode ? renderToastIdentity(context) : renderInlineIdentity(context);
}

/**
 * The one OIDC form of this panel. Inline mode paints the last outcome into it;
 * toast mode already told the user and passes `null`.
 */
function renderForm(context: IdentityRenderContext, operationResult: SettingsOutcome | null): ReactNode {
  const { adapter, labels, identity, canManage, toastMode } = context;
  return (
    <EnterpriseOidcConfigurationForm
      labels={labels}
      value={identity.value as EnterpriseOidcConfigurationValue}
      clientSecret={identity.clientSecret}
      disabled={!canManage}
      saving={identity.busy === "save"}
      discovering={identity.busy === "discover"}
      testing={identity.busy === "test"}
      operationResult={operationResult}
      hideAdvancedWhenDisabled={toastMode}
      onChange={identity.patchValue}
      onClientSecretChange={identity.setClientSecret}
      onSave={identity.save}
      onDiscover={adapter.discoverIdentity ? identity.discover : undefined}
      onTest={adapter.testIdentityConnection ? () => void identity.testConnection() : undefined}
    />
  );
}

/** Default/inline: loading text + InlineNotice. */
function renderInlineIdentity(context: IdentityRenderContext): ReactNode {
  const { labels, identity, canManage } = context;
  const { value, busy, result } = identity;
  if (busy === "load" && !value) return <p className="text-[13px] text-ink-soft">{labels.loading}</p>;
  if (!value) return <InlineNotice tone="error" message={result?.message ?? labels.loadFailed} />;
  if (!canManage) return <IdentityStatusSummary value={value} labels={labels} />;
  return renderForm(context, result);
}

/** FE-UXA-10 + FE-FB-01 toast mode: one mounted AsyncStateTransition; permanent refresh; missing as —. */
function renderToastIdentity(context: IdentityRenderContext): ReactNode {
  const { labels, identity, canManage } = context;
  const { value, busy } = identity;
  const asyncState = busy === "load" && !value ? "loading" : !value ? "empty" : "ready";
  let readyBody: ReactNode = null;
  if (value) readyBody = canManage ? renderForm(context, null) : <IdentityStatusSummary value={value} labels={labels} />;

  const missingShell = (
    <div className="rounded-md border border-hairline bg-paper p-4" data-test-id="identity-settings-missing">
      <p className="text-[13px] text-ink-faint">—</p>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" loading={busy === "load"} data-test-id="identity-settings-retry" onClick={identity.reload}>{labels.retry ?? "Retry"}</Button>
      </div>
      <AsyncStateTransition
        state={asyncState}
        minHeight={220}
        data-test-id="identity-settings-async"
        loading={<EnterpriseSettingsFormSkeleton testId="identity-settings-skeleton" />}
        empty={missingShell}
        ready={readyBody}
      />
    </div>
  );
}
