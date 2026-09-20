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
      retryAction={renderRetry(context)}
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
 * 重试只认「上一次加载失败了」这一件事,不认「手里没有值」:换了适配器或切了语言时
 * 加载会重跑,这一次失败了、卡里却还留着上次读到的值,用户同样需要一个重试。
 * 读成功时这里返回 null——它不是常驻控件。
 */
function renderRetry(context: IdentityRenderContext): ReactNode {
  const { labels, identity } = context;
  if (!identity.loadFailed) return null;
  return (
    <Button
      variant="outline"
      size="sm"
      loading={identity.busy === "load"}
      data-test-id="identity-settings-retry"
      onClick={identity.reload}
    >
      {labels.retry}
    </Button>
  );
}

/** Default/inline: loading text, then either the failure notice or the card — 重试跟着失败走。 */
function renderInlineIdentity(context: IdentityRenderContext): ReactNode {
  const { labels, identity, canManage } = context;
  const { value, busy, result } = identity;
  if (busy === "load" && !value) return <p className="text-[13px] text-ink-soft">{labels.loading}</p>;
  if (!value) return <InlineNotice tone="error" message={result?.message ?? labels.loadFailed} action={renderRetry(context)} />;
  if (!canManage) return <IdentityStatusSummary value={value} labels={labels} actions={renderRetry(context)} />;
  return renderForm(context, result);
}

/**
 * FE-UXA-10 + FE-FB-01 toast mode: one mounted AsyncStateTransition; missing as —.
 *
 * 重试跟着失败走:一次值都没读到就挂在这块占位里,已经有值(重跑时失败)就挂在
 * 卡片标题行,和测试连接、保存同一排。两者互斥,同一时刻只会存在一个。
 */
function renderToastIdentity(context: IdentityRenderContext): ReactNode {
  const { labels, identity, canManage } = context;
  const { value, busy } = identity;
  const asyncState = busy === "load" && !value ? "loading" : !value ? "empty" : "ready";
  let readyBody: ReactNode = null;
  if (value) readyBody = canManage ? renderForm(context, null) : <IdentityStatusSummary value={value} labels={labels} actions={renderRetry(context)} />;

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
