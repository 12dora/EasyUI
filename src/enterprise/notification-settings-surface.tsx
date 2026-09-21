"use client";

/**
 * 「设置 → 通知」共享面。
 *
 * 页面结构:自己的 `PageHeader`(**本页唯一的 H1**)→(有管理权限时)顶部分段控件
 * 「我的通知 / 平台配置」→ 渠道未配置时的一行说明 → 一张张分组卡片。
 *
 * 数据与保存全在 `useNotificationSettings` 里,本文件只负责画:两个页签共用同一套卡片,
 * 差别只有「托管开关能不能点」与「托管中的分组要不要置灰」两件事,所以不做两套 markup。
 *
 * 文案按本包惯例从 props 注入(`NotificationSettingsLabels`,`createEnterpriseLabelCatalog`
 * 的 `notificationSettings` 里有 zh / en 两份)。宿主接线见 `docs/NOTIFICATION-SETTINGS.md`。
 */

import type { ReactNode } from "react";

import { Button } from "../primitives/button";
import { EmptyState } from "../primitives/empty-state";
import { InlineNotice } from "../primitives/inline-notice";
import { PageHeader } from "../primitives/page-header";
import { SegmentedToggle, type SegmentedToggleOption } from "../primitives/segmented-toggle";
import { NotificationGroupCard } from "./notification-settings-group-card";
import type { NotificationSettingsAdapter, NotificationSettingsLabels } from "./notification-settings-types";
import { EnterpriseSettingsFormSkeleton } from "./surface-helpers";
import {
  useNotificationSettings,
  type NotificationSettingsController,
  type NotificationSettingsTab,
} from "./use-notification-settings";

export type {
  LocalizedText,
  NotificationChannel,
  NotificationChannelStatus,
  NotificationGroupView,
  NotificationPolicyChange,
  NotificationPolicyView,
  NotificationSceneView,
  NotificationSettingsAdapter,
  NotificationSettingsLabels,
  NotificationSettingsView,
  NotificationSwitchChange,
} from "./notification-settings-types";

export interface EnterpriseNotificationSettingsSurfaceProps {
  adapter: NotificationSettingsAdapter;
  labels: NotificationSettingsLabels;
  /** `"zh-CN"` / `"en"`:`en` 开头取 `LocalizedText.en`,其余取 `.zh`。 */
  locale: string;
}

export function EnterpriseNotificationSettingsSurface({
  adapter,
  labels,
  locale,
}: EnterpriseNotificationSettingsSurfaceProps) {
  const controller = useNotificationSettings(adapter, labels);
  const policyMode = controller.tab === "policy";
  const header = renderIntro(controller, labels, policyMode);
  return (
    <div data-test-id="notification-settings-surface" data-enterprise-surface="notification-settings">
      <PageHeader title={labels.title} subtitle={labels.description} />
      <div className="ui-stack">
        {header}
        {controller.loadFailed ? (
          <InlineNotice
            tone="error"
            message={labels.loadFailed}
            data-test-id="notification-settings-load-failed"
            action={
              <Button variant="outline" size="sm" onClick={controller.reload} data-test-id="notification-settings-retry">
                {labels.retry}
              </Button>
            }
          />
        ) : null}
        <NotificationSettingsBody controller={controller} labels={labels} locale={locale} policyMode={policyMode} />
      </div>
    </div>
  );
}

/**
 * 页头与卡片之间的那一块:页签、「平台配置」的说明、渠道未配置的提示。
 *
 * 三样都可能不存在;全都没有时整块返回 `null`,而不是留一个空 `<div>` —— `ui-stack` 是
 * 「相邻兄弟之间加间距」,一个空容器照样会把卡片往下推出一截白。
 */
function renderIntro(
  controller: NotificationSettingsController,
  labels: NotificationSettingsLabels,
  policyMode: boolean,
): ReactNode {
  const dingtalkOff = controller.view?.channels.some((channel) => channel.key === "dingtalk" && !channel.available);
  if (!controller.canManage && !dingtalkOff) return null;
  return (
    <div className="ui-stack-sm">
      {controller.canManage ? (
        <SegmentedToggle<NotificationSettingsTab>
          value={controller.tab}
          options={tabOptions(labels)}
          ariaLabel={labels.title}
          dataTestId="notification-settings-tabs"
          dataOptionAttribute="data-notification-tab"
          onChange={controller.selectTab}
        />
      ) : null}
      {controller.canManage && policyMode ? (
        <p className="text-[13px] text-ink-soft" data-test-id="notification-policy-description">
          {labels.policyDescription}
        </p>
      ) : null}
      {/* 渠道级的提示只印一条,挂在页头下方:它对每一张卡片都成立,逐卡重复只是噪声。 */}
      {dingtalkOff ? (
        <InlineNotice tone="warning" message={labels.dingtalkUnavailable} data-test-id="notification-channel-unavailable" />
      ) : null}
    </div>
  );
}

function tabOptions(labels: NotificationSettingsLabels): readonly SegmentedToggleOption<NotificationSettingsTab>[] {
  return [
    { value: "mine", label: labels.tabs.mine },
    { value: "policy", label: labels.tabs.policy },
  ];
}

/** 骨架屏 / 空状态 / 卡片列表。加载失败的提示由上面那条 `InlineNotice` 负责。 */
function NotificationSettingsBody({
  controller,
  labels,
  locale,
  policyMode,
}: {
  controller: NotificationSettingsController;
  labels: NotificationSettingsLabels;
  locale: string;
  policyMode: boolean;
}) {
  if (controller.loading) return <EnterpriseSettingsFormSkeleton testId="notification-settings-skeleton" rows={2} />;
  const view = controller.view;
  if (!view) return null;
  if (view.groups.length === 0) {
    return <EmptyState title={labels.empty} data-test-id="notification-settings-empty" />;
  }
  return (
    <div className="ui-stack-lg" data-test-id="notification-settings-groups">
      {view.groups.map((group) => (
        <NotificationGroupCard
          key={group.key}
          group={group}
          labels={labels}
          locale={locale}
          policyMode={policyMode}
          controller={controller}
        />
      ))}
    </div>
  );
}
