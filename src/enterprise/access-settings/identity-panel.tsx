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

/**
 * 重试按钮只在「这次加载失败了」的画面里出现,不做常驻控件:设置读出来之后,
 * 标题行已经有连接测试和保存,再挂一个重试只会让人以为那是必经的一步。
 */
function renderRetry(context: IdentityRenderContext): ReactNode {
  const { labels, identity } = context;
  return (
    <Button
      variant="outline"
      size="sm"
      loading={identity.busy === "load"}
      data-test-id="identity-settings-retry"
      onClick={identity.reload}
    >
      {labels.retry ?? "Retry"}
    </Button>
  );
}

/** Default/inline: loading text + InlineNotice that carries the retry. */
function renderInlineIdentity(context: IdentityRenderContext): ReactNode {
  const { labels, identity, canManage } = context;
  const { value, busy, result } = identity;
  if (busy === "load" && !value) return <p className="text-[13px] text-ink-soft">{labels.loading}</p>;
  if (!value) return <InlineNotice tone="error" message={result?.message ?? labels.loadFailed} action={renderRetry(context)} />;
  if (!canManage) return <IdentityStatusSummary value={value} labels={labels} />;
  return renderForm(context, result);
}

/**
 * FE-UXA-10 + FE-FB-01 toast mode: one mounted AsyncStateTransition; missing as —.
 *
 * `empty` 只在加载失败后才到得了(读成功一定有值),所以重试按钮就摆在这块占位里:
 * 真正需要重试的人正看着它,而读成功的人根本看不到它。
 */
function renderToastIdentity(context: IdentityRenderContext): ReactNode {
  const { labels, identity, canManage } = context;
  const { value, busy } = identity;
  const asyncState = busy === "load" && !value ? "loading" : !value ? "empty" : "ready";
  let readyBody: ReactNode = null;
  if (value) readyBody = canManage ? renderForm(context, null) : <IdentityStatusSummary value={value} labels={labels} />;

  const missingShell = (
    <div
      className="flex flex-wrap items-center justify-between gap-[var(--ui-gap-md,16px)] rounded-md border border-hairline bg-paper p-4"
      data-test-id="identity-settings-missing"
    >
      <p className="text-[13px] text-ink-faint">—</p>
      {renderRetry(context)}
    </div>
  );

  return (
    <AsyncStateTransition
      state={asyncState}
      minHeight={220}
      data-test-id="identity-settings-async"
      loading={<EnterpriseSettingsFormSkeleton testId="identity-settings-skeleton" />}
      empty={missingShell}
      ready={readyBody}
    />
  );
}
