"use client";

/**
 * 通知设置里的一张分组卡片:标题行 =「分组名 + 说明 + 平台托管开关」,正文 = 场景表格。
 *
 * 为什么是表格而不是一行一个 `SettingRow`:一个分组少则三五个场景、多则十几个,每个场景
 * 两个渠道。铺成竖排的开关清单时,"这一列是钉钉、那一列是站内"要靠用户一行行读文字去认;
 * 表格把渠道提成表头,两列开关在**所有卡片之间**也对得齐(渠道列定宽),扫一眼就知道哪
 * 一格是什么。语义也是真的表格:`<th scope="col">` 是渠道,`<th scope="row">` 是场景,读屏
 * 报一格开关时会带上两者。
 *
 * 置灰的口径与「工作账号登录」卡片一致(docs/ACCESS-SETTINGS.md):**只有正文进
 * `GatedBody`**,标题行的开关与那枚「由平台统一管理」标签留在外面——它们说明的正是"为什么
 * 这张表不能动",跟着一起变灰就没人读得到了。
 */

import { GatedBody } from "../primitives/gated-body";
import { Section } from "../primitives/section";
import { Switch } from "../primitives/switch";
import {
  NOTIFICATION_CHANNELS,
  resolveNotificationText,
  type NotificationChannel,
  type NotificationGroupView,
  type NotificationSceneView,
  type NotificationSettingsLabels,
} from "./notification-settings-types";
import {
  notificationManagedKey,
  notificationSwitchKey,
  type NotificationSettingsController,
} from "./use-notification-settings";

export interface NotificationGroupCardProps {
  group: NotificationGroupView;
  labels: NotificationSettingsLabels;
  locale: string;
  /** 「平台配置」页签:托管开关可操作,表格永不置灰。 */
  policyMode: boolean;
  controller: NotificationSettingsController;
}

/** 渠道列宽:两列定宽(80px)才能让所有卡片的开关竖着对齐;窄屏整表横向滚动。 */
const CHANNEL_COLUMN_CLASS = "w-20 px-3 py-2 text-center";

export function NotificationGroupCard({ group, labels, locale, policyMode, controller }: NotificationGroupCardProps) {
  const readOnly = !policyMode && !group.editable;
  return (
    <div data-test-id={`notification-group-${group.key}`}>
      <Section
        flush
        title={resolveNotificationText(group.title, locale)}
        description={resolveNotificationText(group.description, locale)}
        actions={
          <ManagedControl group={group} labels={labels} locale={locale} policyMode={policyMode} controller={controller} />
        }
      >
        <GatedBody off={readOnly} className="overflow-hidden rounded-md border border-hairline bg-paper">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] table-fixed border-collapse text-left">
              <thead>
                <tr className="border-b border-hairline">
                  <th scope="col" className="px-3 py-2 text-[12px] font-medium text-ink-soft">{labels.columns.scene}</th>
                  <th scope="col" className={`${CHANNEL_COLUMN_CLASS} text-[12px] font-medium text-ink-soft`}>{labels.columns.dingtalk}</th>
                  <th scope="col" className={`${CHANNEL_COLUMN_CLASS} text-[12px] font-medium text-ink-soft`}>{labels.columns.inApp}</th>
                </tr>
              </thead>
              <tbody>
                {group.scenes.map((scene) => (
                  <SceneRow
                    key={scene.key}
                    group={group}
                    scene={scene}
                    labels={labels}
                    locale={locale}
                    readOnly={readOnly}
                    policyMode={policyMode}
                    controller={controller}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </GatedBody>
      </Section>
    </div>
  );
}

/**
 * 标题行右端:文案 +(托管中且在「我的通知」里时)一枚静态标签 + 开关。
 *
 * 「我的通知」里这枚开关恒为 `disabled`——它是状态展示,不是操作入口;成员改不了托管,
 * 但必须看得见这一组是不是被托管了,否则"我的开关怎么点都不生效"就成了一桩无解的怪事。
 */
function ManagedControl({ group, labels, locale, policyMode, controller }: NotificationGroupCardProps) {
  const key = notificationManagedKey(group.key);
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {!policyMode && group.managed ? (
        <span
          className="rounded-full border border-hairline px-2 py-0.5 text-[12px] text-ink-soft"
          data-test-id={`notification-group-${group.key}-tag`}
        >
          {labels.managedTag}
        </span>
      ) : null}
      <span className="text-[13px] text-ink">{labels.managed}</span>
      <Switch
        checked={group.managed}
        disabled={!policyMode || controller.isPending(key)}
        aria-label={labels.switchLabel(resolveNotificationText(group.title, locale), labels.managed)}
        onChange={(managed) => controller.setManaged(group, managed)}
        data-test-id={`notification-group-${group.key}-managed`}
      />
    </div>
  );
}

interface SceneRowProps extends NotificationGroupCardProps {
  scene: NotificationSceneView;
  /** 整表置灰(托管中的分组在「我的通知」里)。 */
  readOnly: boolean;
}

function SceneRow({ group, scene, labels, locale, readOnly, policyMode, controller }: SceneRowProps) {
  const title = resolveNotificationText(scene.title, locale);
  const description = resolveNotificationText(scene.description, locale);
  return (
    <tr className="border-b border-hairline-soft last:border-b-0">
      {/* 场景名是这一行的行头:读屏报某一格开关时会连着念出来。 */}
      <th scope="row" className="px-3 py-2 text-left align-middle font-normal">
        <div className="text-[13px] text-ink">{title}</div>
        {/* 说明只占一行:它是补充,不该把行高撑成两倍。完整文案留在 title 属性里。 */}
        <div className="truncate text-[12px] text-ink-soft" title={description}>{description}</div>
      </th>
      {NOTIFICATION_CHANNELS.map((channel) => (
        <ChannelCell
          key={channel}
          group={group}
          scene={scene}
          channel={channel}
          sceneTitle={title}
          labels={labels}
          locale={locale}
          readOnly={readOnly}
          policyMode={policyMode}
          controller={controller}
        />
      ))}
    </tr>
  );
}

interface ChannelCellProps extends SceneRowProps {
  channel: NotificationChannel;
  /** 已经按 locale 取好的场景名,用来拼开关的无障碍名。 */
  sceneTitle: string;
}

/**
 * 一格开关。`null` = 本场景不支持这个渠道:画一个破折号,不画开关——一个永远关着、
 * 点不动的开关会让人一直找"为什么打不开"。
 */
function ChannelCell({ group, scene, channel, sceneTitle, labels, readOnly, controller }: ChannelCellProps) {
  // `?? null` 是对宿主的兜底:后端漏发某个渠道键时按"不支持"画,而不是画一个 undefined 开关。
  const value = scene.channels[channel] ?? null;
  const channelLabel = channel === "dingtalk" ? labels.columns.dingtalk : labels.columns.inApp;
  if (value === null) {
    return (
      <td className={CHANNEL_COLUMN_CLASS}>
        <span role="img" aria-label={labels.unsupported} title={labels.unsupported} className="text-[13px] text-ink-faint">
          —
        </span>
      </td>
    );
  }
  const key = notificationSwitchKey(group.key, scene.key, channel);
  return (
    <td className={CHANNEL_COLUMN_CLASS}>
      <div className="flex justify-center">
        <Switch
          checked={value}
          disabled={readOnly || controller.isPending(key)}
          aria-label={labels.switchLabel(sceneTitle, channelLabel)}
          onChange={(enabled) => controller.setChannel(group, { group: group.key, scene: scene.key, channel, enabled })}
          data-test-id={`notification-switch-${scene.key}-${channel}`}
        />
      </div>
    </td>
  );
}
