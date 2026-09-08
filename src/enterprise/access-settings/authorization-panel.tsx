"use client";

import type { ReactNode } from "react";
import { AsyncStateTransition } from "../../primitives/async-state-transition";
import { Button } from "../../primitives/button";
import { InlineNotice } from "../../primitives/inline-notice";
import { EnterpriseAuthorizationWorkspace } from "../authorization-workspace";
import type { EnterpriseTimestampFormatter } from "../format-timestamp";
import {
  EnterpriseEasyAuthConfigurationForm,
  type EnterpriseEasyAuthConfigurationValue,
} from "../integration-configuration-forms";
import { EnterpriseSettingsFormSkeleton } from "../surface-helpers";
import type {
  EnterpriseAccessSettingsAdapter,
  EnterpriseAccessSettingsLabels,
  EnterpriseSettingsFeedbackMode,
} from "./types";
import { useEasyAuthSettings, type EasyAuthSettings } from "./use-easyauth-settings";

interface EasyAuthRenderContext {
  adapter: EnterpriseAccessSettingsAdapter;
  labels: EnterpriseAccessSettingsLabels["configuration"];
  easyAuth: EasyAuthSettings;
  canManage: boolean;
}

/** Permissions pane: the EasyAuth connection form above the authorization workspace. */
export function AuthorizationPanel({
  adapter,
  labels,
  locale,
  canManage,
  feedbackMode,
  formatTimestamp,
  timeZone,
}: {
  adapter: EnterpriseAccessSettingsAdapter;
  labels: EnterpriseAccessSettingsLabels;
  locale: string;
  canManage: boolean;
  feedbackMode: EnterpriseSettingsFeedbackMode;
  formatTimestamp?: EnterpriseTimestampFormatter;
  timeZone?: string;
}) {
  const toastMode = feedbackMode === "toast";
  const easyAuth = useEasyAuthSettings({ adapter, labels: labels.configuration, feedbackMode, canManage });
  const { notice } = easyAuth;
  const context: EasyAuthRenderContext = { adapter, labels: labels.configuration, easyAuth, canManage };

  return (
    <div className="space-y-2" data-test-id="authorization-integration-section">
      {!toastMode && notice ? <InlineNotice tone={notice.ok ? "success" : "error"} message={notice.message} /> : null}
      {canManage ? (
        <EasyAuthConfigurationBlock
          context={context}
          toastMode={toastMode}
          retryLabel={labels.configuration.retry ?? labels.authorization.refresh}
        />
      ) : null}
      <EnterpriseAuthorizationWorkspace
        key={easyAuth.revision}
        adapter={adapter}
        labels={labels.authorization}
        locale={locale}
        canManage={canManage}
        section="authorization"
        feedbackMode={feedbackMode}
        formatTimestamp={formatTimestamp}
        timeZone={timeZone}
      />
    </div>
  );
}

/** FE-UXA-10: shape-matched skeleton for the EasyAuth form; AsyncStateTransition stays mounted. */
function EasyAuthConfigurationBlock({
  context,
  toastMode,
  retryLabel,
}: {
  context: EasyAuthRenderContext;
  toastMode: boolean;
  retryLabel: string;
}) {
  const { easyAuth } = context;
  if (!toastMode) return renderInlineConfiguration(context);

  const { loading, value } = easyAuth;
  const configState = loading && !value ? "loading" : !value ? "empty" : "ready";
  const missing = (
    <div className="rounded-md border border-hairline bg-paper p-4" data-test-id="easyauth-settings-missing">
      <p className="text-[13px] text-ink-faint">—</p>
    </div>
  );
  return (
    <div className="space-y-3" data-test-id="easyauth-settings-block">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          loading={loading}
          data-test-id="easyauth-settings-retry"
          onClick={easyAuth.reload}
        >
          {retryLabel}
        </Button>
      </div>
      <AsyncStateTransition
        state={configState}
        minHeight={180}
        data-test-id="easyauth-settings-async"
        loading={<EnterpriseSettingsFormSkeleton testId="easyauth-settings-skeleton" rows={3} />}
        empty={missing}
        ready={value ? renderForm(context) : null}
      />
    </div>
  );
}

/** Default/inline: a loading line, then the form. A failed load leaves the slot empty. */
function renderInlineConfiguration(context: EasyAuthRenderContext): ReactNode {
  const { labels, easyAuth } = context;
  if (easyAuth.loading) return <p className="text-[13px] text-ink-soft">{labels.loading}</p>;
  if (!easyAuth.value) return null;
  return renderForm(context);
}

/** The one EasyAuth form; inline and toast mode render it with identical props. */
function renderForm({ adapter, labels, easyAuth, canManage }: EasyAuthRenderContext): ReactNode {
  return (
    <EnterpriseEasyAuthConfigurationForm
      labels={labels}
      value={easyAuth.value as EnterpriseEasyAuthConfigurationValue}
      credential={easyAuth.credential}
      webhookSecret={easyAuth.webhookSecret}
      disabled={!canManage}
      connectionDisabled={!adapter.easyAuthConnectionEditable}
      saving={easyAuth.saving}
      onChange={easyAuth.patchValue}
      onCredentialChange={easyAuth.setCredential}
      onWebhookSecretChange={easyAuth.setWebhookSecret}
      onSave={easyAuth.save}
    />
  );
}
