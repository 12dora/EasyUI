"use client";

/**
 * 「设置 → 通知」共享面。
 *
 * 页面结构:自己的 `PageHeader`(**本页唯一的 H1**)→(管理员且 adapter 实现了渠道方法时)
 * 页签条「通知规则 / 通知渠道」→ 通知规则:(有管理权限时)分段控件「我的通知 / 平台配置」
 * → 渠道未配置时的一行说明 → 一张张分组卡片;通知渠道:钉钉渠道配置卡
 * (`NotificationChannelPanel`)。没有页签条时,整页就是「通知规则」的内容。
 *
 * 数据与保存全在 `useNotificationSettings` 里,本文件只负责画:两个页签共用同一套卡片,
 * 差别只有「托管开关能不能点」与「托管中的分组要不要置灰」两件事,所以不做两套 markup。
 *
 * 文案按本包惯例从 props 注入(`NotificationSettingsLabels`,`createEnterpriseLabelCatalog`
 * 的 `notificationSettings` 里有 zh / en 两份)。宿主接线见 `docs/NOTIFICATION-SETTINGS.md`。
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "../primitives/button";
import { EmptyState } from "../primitives/empty-state";
import { InlineNotice } from "../primitives/inline-notice";
import { PageHeader } from "../primitives/page-header";
import { SegmentedToggle, type SegmentedToggleOption } from "../primitives/segmented-toggle";
import { TabList, TabPanel, tabTriggerId, type TabDefinition } from "../primitives/tabs";
import { NotificationChannelPanel } from "./notification-channel-panel";
import { NotificationGroupCard } from "./notification-settings-group-card";
import type {
  NotificationChannelSettingsLabels,
  NotificationSettingsAdapter,
  NotificationSettingsLabels,
} from "./notification-settings-types";
import { EnterpriseSettingsFormSkeleton } from "./surface-helpers";
import { supportsNotificationChannels, useDingtalkChannel } from "./use-dingtalk-channel";
import {
  useNotificationSettings,
  type NotificationSettingsController,
  type NotificationSettingsTab,
} from "./use-notification-settings";

export type {
  DingtalkChannelSettings,
  DingtalkChannelSettingsUpdate,
  DingtalkCredentialSource,
  LocalizedText,
  NotificationChannelSettingsLabels,
  NotificationChannelTestResult,
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

/** 页头下方的页签条:「通知规则」是今天的整页内容,「通知渠道」是渠道配置。 */
export type NotificationSettingsSection = "rules" | "channels";

const SECTION_TABS_ID = "notification-settings-sections";

export function EnterpriseNotificationSettingsSurface({
  adapter,
  labels,
  locale,
}: EnterpriseNotificationSettingsSurfaceProps) {
  const controller = useNotificationSettings(adapter, labels);
  const channelLabels = labels.channel;
  const channelsEnabled = controller.canManage && Boolean(channelLabels) && supportsNotificationChannels(adapter);
  const sections = useNotificationSections(controller);
  const channel = useDingtalkChannel({
    adapter,
    labels: channelLabels,
    active: channelsEnabled && sections.section === "channels",
    onSaved: sections.markRulesStale,
  });
  const rules = (
    <NotificationRules
      controller={controller}
      labels={labels}
      locale={locale}
      onConfigureChannel={channelsEnabled ? sections.openChannels : undefined}
    />
  );
  return (
    <div data-test-id="notification-settings-surface" data-enterprise-surface="notification-settings">
      <PageHeader title={labels.title} subtitle={labels.description} />
      {channelsEnabled && channelLabels ? (
        <>
          <TabList
            idBase={SECTION_TABS_ID}
            label={labels.title}
            tabs={sectionTabs(channelLabels, sections.section)}
            activeKey={sections.section}
            onSelect={(key) => sections.select(key as NotificationSettingsSection)}
            className="flex overflow-x-auto border-b border-ink/10"
            dataTestId="notification-settings-sections"
          />
          <TabPanel key={sections.section} idBase={SECTION_TABS_ID} activeKey={sections.section} className="mt-5 easy-tab-panel-enter">
            {sections.section === "rules" ? (
              rules
            ) : (
              <NotificationChannelPanel labels={channelLabels} controller={channel} retryLabel={labels.retry} />
            )}
          </TabPanel>
        </>
      ) : (
        rules
      )}
    </div>
  );
}

/**
 * 页签条的状态。两件额外的事:
 *
 * - 渠道保存成功后,「通知规则」那边「钉钉未配置」的提示可能已经不成立了 —— 切回去时重读一次
 *   (只在真的保存过之后,平常切页签不多发请求)。
 * - 从提示里的「前往配置」跳过来时,把焦点落到「通知渠道」页签上:点击的那个按钮随面板
 *   一起卸载了,焦点不能掉回 `<body>`。
 */
function useNotificationSections(controller: NotificationSettingsController) {
  const [section, setSection] = useState<NotificationSettingsSection>("rules");
  const rulesStale = useRef(false);
  const focusChannels = useRef(false);
  const { reload } = controller;

  useEffect(() => {
    if (section !== "channels" || !focusChannels.current) return;
    focusChannels.current = false;
    document.getElementById(tabTriggerId(SECTION_TABS_ID, "channels"))?.focus();
  }, [section]);

  const select = useCallback(
    (next: NotificationSettingsSection) => {
      setSection(next);
      if (next === "rules" && rulesStale.current) {
        rulesStale.current = false;
        reload();
      }
    },
    [reload],
  );

  const openChannels = useCallback(() => {
    focusChannels.current = true;
    setSection("channels");
  }, []);

  const markRulesStale = useCallback(() => {
    rulesStale.current = true;
  }, []);

  return { section, select, openChannels, markRulesStale };
}

function sectionTabs(labels: NotificationChannelSettingsLabels, active: NotificationSettingsSection): TabDefinition[] {
  return (["rules", "channels"] as const).map((key) => ({
    key,
    label: labels.sections[key],
    className: `shrink-0 border-b-2 px-4 py-2 text-[12px] font-medium ${active === key ? "border-ink text-ink" : "border-transparent text-ink-faint hover:text-ink-soft"}`,
    dataAttributes: { "data-test-id": `notification-settings-section-${key}` },
  }));
}

/** 「通知规则」:页签条出现之前的整页内容,原样保留。 */
function NotificationRules({
  controller,
  labels,
  locale,
  onConfigureChannel,
}: {
  controller: NotificationSettingsController;
  labels: NotificationSettingsLabels;
  locale: string;
  onConfigureChannel?: () => void;
}) {
  const policyMode = controller.tab === "policy";
  const header = renderIntro(controller, labels, policyMode, onConfigureChannel);
  return (
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
  onConfigureChannel: (() => void) | undefined,
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
      {dingtalkOff ? renderChannelNotice(controller.canManage, labels, onConfigureChannel) : null}
    </div>
  );
}

/**
 * 「钉钉未配置」那一条提示:能去配的管理员多一个「前往配置」;没有管理权限的人看到的是
 * 「请联系管理员」版本。管理员但宿主没接渠道方法时,仍是原来那句。
 */
function renderChannelNotice(
  canManage: boolean,
  labels: NotificationSettingsLabels,
  onConfigureChannel: (() => void) | undefined,
): ReactNode {
  const channel = labels.channel;
  const message = !canManage && channel ? channel.unavailableMember : labels.dingtalkUnavailable;
  const action =
    onConfigureChannel && channel ? (
      <Button variant="ghost" size="sm" onClick={onConfigureChannel} data-test-id="notification-channel-configure">
        {channel.configure}
      </Button>
    ) : undefined;
  return <InlineNotice tone="warning" message={message} action={action} data-test-id="notification-channel-unavailable" />;
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
