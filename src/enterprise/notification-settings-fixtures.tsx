/**
 * 通知设置两个行为用例文件共用的夹具与 DOM 取值助手。
 *
 * 为什么单独成文件:两个用例文件各自都要这一整套分组 / 适配器 / 取开关的助手,抄两份就会
 * 各改各的,断言渐渐对不上同一份数据;而合成一个文件又会顶破测试文件 400 SLOC 的门禁。
 *
 * **这个模块只给用例用,任何 barrel 都不导出它。** 它也刻意**不 import `vitest`** ——
 * 文件名不带 `.test.`,宿主 typecheck 一般会排除 `*.test.*` 却不会排除它,真引了 vitest
 * 就会在宿主那边炸。所以 `vi.fn()` 拼出来的适配器留在各自的用例文件里,这里只给纯数据。
 * 同理它也不设置 `IS_REACT_ACT_ENVIRONMENT`:那是用例文件自己的事,不该是 import 的副作用。
 */

import { byTestId, mount, settle, type MountedView } from "./behavior-test-utils";
import { createEnterpriseLabelCatalog } from "./label-catalog";
import { EnterpriseNotificationSettingsSurface } from "./notification-settings-surface";
import type {
  NotificationGroupView,
  NotificationPolicyView,
  NotificationSettingsAdapter,
  NotificationSettingsLabels,
  NotificationSettingsView,
} from "./notification-settings-types";

export const LABELS: NotificationSettingsLabels = createEnterpriseLabelCatalog(
  "zh-CN",
  { appName: "测试", appDescription: "测试" },
).notificationSettings;

export const EN_LABELS: NotificationSettingsLabels = createEnterpriseLabelCatalog(
  "en",
  { appName: "Test", appDescription: "Test" },
).notificationSettings;

/** 可改的分组:两个场景,其中一个不支持钉钉(破折号那一格)。 */
export const LEARNER: NotificationGroupView = {
  key: "learner",
  title: { zh: "学员", en: "Learner" },
  description: { zh: "学习与考试相关的通知。", en: "Learning and exam notifications." },
  managed: false,
  editable: true,
  scenes: [
    {
      key: "exam.result_released",
      title: { zh: "成绩发布", en: "Result released" },
      description: { zh: "考试成绩发布时提醒本人。", en: "When an exam result is released." },
      channels: { dingtalk: true, in_app: false },
    },
    {
      key: "course.assigned",
      title: { zh: "课程指派", en: "Course assigned" },
      description: { zh: "被指派新课程时提醒。", en: "When a course is assigned." },
      channels: { dingtalk: null, in_app: true },
    },
  ],
};

/** 托管中的分组:「我的通知」里整表只读。 */
export const SUPERVISOR: NotificationGroupView = {
  key: "supervisor",
  title: { zh: "主管", en: "Supervisor" },
  description: { zh: "下属的学习进度。", en: "Progress of your reports." },
  managed: true,
  editable: false,
  scenes: [
    {
      key: "plan.overdue",
      title: { zh: "计划逾期", en: "Plan overdue" },
      description: { zh: "下属学习计划逾期时提醒。", en: "When a plan is overdue." },
      channels: { dingtalk: true, in_app: true },
    },
  ],
};

/** 409 的作废范围必须停在分组边界上,所以夹具里要有**第二个可改分组**。 */
export const EDITABLE_SUPERVISOR: NotificationGroupView = { ...SUPERVISOR, managed: false, editable: true };

const BOTH_CHANNELS = [{ key: "dingtalk", available: true }, { key: "in_app", available: true }] as const;

export const MINE: NotificationSettingsView = {
  canManage: false,
  channels: [...BOTH_CHANNELS],
  groups: [LEARNER, SUPERVISOR],
};

export const MANAGER: NotificationSettingsView = { ...MINE, canManage: true };

export const TWO_EDITABLE: NotificationSettingsView = { ...MINE, groups: [LEARNER, EDITABLE_SUPERVISOR] };

export const POLICY: NotificationPolicyView = {
  channels: [...BOTH_CHANNELS],
  groups: [{ ...LEARNER, editable: true }, { ...SUPERVISOR, editable: true }],
};

/** 服务端返回的那种"整组快照":只改第一个场景的两个渠道,其余原样。 */
export function servedLearner(dingtalk: boolean, inApp: boolean): NotificationGroupView {
  return {
    ...LEARNER,
    scenes: [{ ...LEARNER.scenes[0]!, channels: { dingtalk, in_app: inApp } }, LEARNER.scenes[1]!],
  };
}

/** 手动控制落地时机的 promise —— 在途状态、响应乱序都要靠它摆出来。 */
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((settleOk, settleFail) => {
    resolve = settleOk;
    reject = settleFail;
  });
  return { promise, resolve, reject };
}

export async function openNotificationSettings(
  adapter: NotificationSettingsAdapter,
  locale = "zh-CN",
  labels = LABELS,
): Promise<MountedView> {
  const view = await mount(<EnterpriseNotificationSettingsSurface adapter={adapter} labels={labels} locale={locale} />);
  await settle(20);
  return view;
}

export function switchAt(host: ParentNode, scene: string, channel: string): HTMLButtonElement {
  return byTestId(host, `notification-switch-${scene}-${channel}`) as HTMLButtonElement;
}

export function tabOption(host: ParentNode, tab: string): HTMLElement {
  const element = byTestId(host, "notification-settings-tabs").querySelector(`[data-notification-tab='${tab}']`);
  if (!(element instanceof HTMLElement)) throw new Error(`missing tab ${tab}`);
  return element;
}
