"use client";

/**
 * 「设置 → 通知 → 通知渠道」页签:目前只有钉钉一张卡。
 *
 * 形状照搬「登录与权限」里的集成表单:`Section` 标题行放状态徽标与「测试连接 / 保存」,
 * 正文第一行是这两个动作的结果(`InlineNotice`),下面是两列字段栅格。凭据是只写字段,
 * 与 `EnterpriseSecretField` 同一套约定(留空不改、勾选清除);这里不直接复用它,是因为
 * 「清除」只对**本应用保存的**凭据有意义——凭据来自部署环境或根本没有时,那个勾选框
 * 只会让人困惑,所以只在 `credentialSource === "settings"` 时画。
 *
 * 数据与保存在 `useDingtalkChannel` 里,本文件只负责画。
 */

import type { ReactNode } from "react";

import { Badge } from "../primitives/badge";
import { Button } from "../primitives/button";
import { Checkbox } from "../primitives/checkbox";
import { Field, Input } from "../primitives/field";
import { FormGrid } from "../primitives/form-grid";
import { InlineNotice } from "../primitives/inline-notice";
import { Section } from "../primitives/section";
import type { DingtalkChannelSettings, NotificationChannelSettingsLabels } from "./notification-settings-types";
import { EnterpriseSettingsFormSkeleton } from "./surface-helpers";
import type { DingtalkChannelController } from "./use-dingtalk-channel";

export interface NotificationChannelPanelProps {
  labels: NotificationChannelSettingsLabels;
  controller: DingtalkChannelController;
  /** 读失败时的重试按钮文案(沿用页面的 `labels.retry`)。 */
  retryLabel: string;
}

export function NotificationChannelPanel({ labels, controller, retryLabel }: NotificationChannelPanelProps) {
  const settings = controller.settings;
  const retry = (
    <Button variant="outline" size="sm" onClick={controller.reload} data-test-id="notification-dingtalk-retry">
      {retryLabel}
    </Button>
  );
  if (!settings) {
    if (controller.loadFailed) {
      return <InlineNotice tone="error" message={labels.loadFailed} action={retry} data-test-id="notification-dingtalk-load-failed" />;
    }
    return <EnterpriseSettingsFormSkeleton testId="notification-dingtalk-skeleton" rows={2} />;
  }
  return (
    <div data-test-id="notification-dingtalk-channel">
      <Section
        flush
        title={labels.dingtalkTitle}
        description={labels.dingtalkDescription}
        badge={
          <span data-test-id="notification-dingtalk-status" data-configured={settings.configured ? "true" : "false"}>
            <Badge tone={settings.configured ? "evergreen" : "amber"}>
              {settings.configured ? labels.configured : labels.notConfigured}
            </Badge>
          </span>
        }
        actions={<ChannelActions labels={labels} controller={controller} retry={controller.loadFailed ? retry : null} />}
      >
        <div className="ui-stack">
          {controller.outcome ? (
            <InlineNotice
              tone={controller.outcome.ok ? "success" : "error"}
              message={controller.outcome.message}
              data-test-id="notification-dingtalk-result"
            />
          ) : null}
          <FormGrid columns={2}>
            <ChannelFields labels={labels} settings={settings} controller={controller} />
          </FormGrid>
        </div>
      </Section>
    </div>
  );
}

function ChannelActions({
  labels,
  controller,
  retry,
}: {
  labels: NotificationChannelSettingsLabels;
  controller: DingtalkChannelController;
  retry: ReactNode;
}) {
  return (
    <>
      {retry}
      {/* 测试走的是已保存的配置:有未保存的改动时不发请求,点一下只提示先保存。 */}
      <Button
        variant="outline"
        size="sm"
        loading={controller.testing}
        disabled={controller.saving}
        blockedReason={controller.dirty ? labels.saveBeforeTest : undefined}
        onClick={() => void controller.test()}
        data-test-id="notification-dingtalk-test"
      >
        {labels.test}
      </Button>
      <Button
        variant="primary"
        size="sm"
        loading={controller.saving}
        disabled={!controller.dirty || controller.testing}
        onClick={() => void controller.save()}
        data-test-id="notification-dingtalk-save"
      >
        {labels.save}
      </Button>
    </>
  );
}

function ChannelFields({
  labels,
  settings,
  controller,
}: {
  labels: NotificationChannelSettingsLabels;
  settings: DingtalkChannelSettings;
  controller: DingtalkChannelController;
}) {
  const { draft, update } = controller;
  return (
    <>
      <Field label={labels.baseUrl} hint={settings.baseUrlInherited ? labels.inheritedHint : undefined} htmlFor="notification-dingtalk-base-url">
        <Input
          id="notification-dingtalk-base-url"
          type="url"
          className="font-mono"
          value={draft.baseUrl}
          placeholder={settings.baseUrlInherited ? settings.baseUrl : undefined}
          disabled={controller.busy}
          onChange={(event) => update({ baseUrl: event.target.value })}
        />
      </Field>
      <Field label={labels.appKey} hint={settings.appKeyInherited ? labels.inheritedHint : undefined} htmlFor="notification-dingtalk-app-key">
        <Input
          id="notification-dingtalk-app-key"
          className="font-mono"
          value={draft.appKey}
          placeholder={settings.appKeyInherited ? settings.appKey : undefined}
          disabled={controller.busy}
          onChange={(event) => update({ appKey: event.target.value })}
        />
      </Field>
      <CredentialField labels={labels} settings={settings} controller={controller} />
    </>
  );
}

function CredentialField({
  labels,
  settings,
  controller,
}: {
  labels: NotificationChannelSettingsLabels;
  settings: DingtalkChannelSettings;
  controller: DingtalkChannelController;
}) {
  const { draft, update } = controller;
  const fromEnv = settings.credentialSource === "env";
  return (
    <div className="flex flex-col gap-1" data-test-id="notification-dingtalk-credential">
      <Field
        label={labels.credential}
        hint={fromEnv ? <span data-test-id="notification-dingtalk-credential-env">{labels.credentialFromEnv}</span> : undefined}
        htmlFor="notification-dingtalk-credential-input"
      >
        <Input
          id="notification-dingtalk-credential-input"
          type="password"
          autoComplete="new-password"
          className="font-mono"
          value={draft.credential}
          placeholder={settings.hasCredential ? labels.credentialSaved : labels.credentialEmpty}
          disabled={draft.clearCredential || controller.busy}
          onChange={(event) => update({ credential: event.target.value })}
        />
      </Field>
      {settings.credentialSource === "settings" ? (
        <Checkbox
          label={labels.clearCredential}
          checked={draft.clearCredential}
          disabled={controller.busy}
          onChange={(event) => update({ clearCredential: event.target.checked, credential: "" })}
          wrapperClassName="min-h-0 text-[12px] text-ink-soft"
          data-test-id="notification-dingtalk-credential-clear"
        />
      ) : null}
    </div>
  );
}
