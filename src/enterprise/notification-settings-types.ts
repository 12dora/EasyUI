/**
 * 「设置 → 通知」的数据契约。
 *
 * 线上形状由 EasyFrame `docs/NOTIFICATION_SETTINGS.md` §4 定义,本文件是它的 TS 镜像:
 * 场景按**角色分组**(group),每个场景两个渠道(`dingtalk` / `in_app`),渠道值为 `null`
 * 表示该场景不支持这个渠道。分组的「平台托管」(`managed`)一开,成员只读;`editable`
 * 就是后端算好的 `!managed`,前端不自己推。
 *
 * 宿主接线见 `docs/NOTIFICATION-SETTINGS.md`。
 */

export type NotificationChannel = "dingtalk" | "in_app";

/** 渠道是固定两项,顺序即设置页表格的列序。渠道 id 是数据,不做驼峰转换。 */
export const NOTIFICATION_CHANNELS: readonly NotificationChannel[] = ["dingtalk", "in_app"];

/** 后端直接下发的双语文本:前端按 locale 取一边,不在前端翻译业务词。 */
export interface LocalizedText {
  zh: string;
  en: string;
}

export interface NotificationSceneView {
  key: string;
  title: LocalizedText;
  description: LocalizedText;
  /** `null` = 本场景不支持这个渠道:表格里画一个破折号,不画开关。 */
  channels: Record<NotificationChannel, boolean | null>;
}

export interface NotificationGroupView {
  key: string;
  title: LocalizedText;
  description: LocalizedText;
  /** 平台托管:开着时这一组按平台值发送,成员只读。 */
  managed: boolean;
  /** 成员能否改这一组(「我的通知」里 = `!managed`;「平台配置」里恒为 true)。 */
  editable: boolean;
  scenes: NotificationSceneView[];
}

export interface NotificationChannelStatus {
  key: NotificationChannel;
  /** 渠道尚未配置时为 `false`:开关照画,但页头多一句说明。 */
  available: boolean;
}

export interface NotificationSettingsView {
  /** 持有 `notification.settings.manage` 时为真,页面顶部才有「平台配置」页签。 */
  canManage: boolean;
  channels: NotificationChannelStatus[];
  groups: NotificationGroupView[];
}

export interface NotificationPolicyView {
  channels: NotificationChannelStatus[];
  groups: NotificationGroupView[];
}

export interface NotificationSwitchChange {
  group: string;
  scene: string;
  channel: NotificationChannel;
  enabled: boolean;
}

/** 平台配置的一次改动:要么是托管开关,要么是某个场景渠道。 */
export type NotificationPolicyChange = { group: string; managed: boolean } | NotificationSwitchChange;

/**
 * 传输口。四个方法一一对应 `/api/v1/notification-settings` 的四个端点,
 * 两个 `save*` 都返回**更新后的整个分组**——前端拿服务端的那一份替换本地乐观值,
 * 不自己拼接结果。
 */
export interface NotificationSettingsAdapter {
  load(): Promise<NotificationSettingsView>;
  savePreference(change: NotificationSwitchChange): Promise<NotificationGroupView>;
  loadPolicy(): Promise<NotificationPolicyView>;
  savePolicy(change: NotificationPolicyChange): Promise<NotificationGroupView>;
  /**
   * 「通知渠道」页签的三个方法(`/notification-settings/channels/dingtalk`,需要
   * `notification.settings.manage`)。三个都实现了、且当前账号 `canManage`,页面才画页签;
   * 否则整页就是今天的「通知规则」,连页签条都没有。
   */
  loadDingtalkChannel?(): Promise<DingtalkChannelSettings>;
  /** 只带改动过的字段;返回保存后的整份读模型。凭据永不回显。 */
  saveDingtalkChannel?(patch: DingtalkChannelSettingsUpdate): Promise<DingtalkChannelSettings>;
  /** 用已保存的配置探测 EasyAuth 通知接口;**不发送**任何钉钉消息。 */
  testDingtalkChannel?(): Promise<NotificationChannelTestResult>;
}

/** 通知凭据从哪来:平台设置里存的、部署环境变量给的,或者没有。 */
export type DingtalkCredentialSource = "settings" | "env" | "none";

/**
 * 钉钉渠道的读模型。钉钉应用自己的 AppKey / AppSecret / AgentId 在 EasyAuth 里维护,
 * 本应用只配「去哪个 EasyAuth、用哪个应用标识、拿什么通知凭据」。
 */
export interface DingtalkChannelSettings {
  /** 生效值(可能是继承来的);没有时为 `""`。 */
  baseUrl: string;
  appKey: string;
  /** 没单独保存、沿用「登录与权限」里 EasyAuth 集成的值时为真。 */
  baseUrlInherited: boolean;
  appKeyInherited: boolean;
  hasCredential: boolean;
  credentialSource: DingtalkCredentialSource;
  /** 渠道可用(= 页头那条「未配置」提示的反面)。 */
  configured: boolean;
  updatedAt: string | null;
}

/** 缺省的键 = 不改;`""` = 清除已保存的值(地址 / 标识回落到继承值)。 */
export interface DingtalkChannelSettingsUpdate {
  baseUrl?: string;
  appKey?: string;
  /** 只写:`""` 清除,其余为新凭据。 */
  credential?: string;
}

/** 连接测试结果(EasyFrame `ConnectionTestResult`)。 */
export interface NotificationChannelTestResult {
  ok: boolean;
  latencyMs?: number | null;
  /** `auth` / `unreachable` / `not_configured` / `unexpected`;未知值按 `unexpected` 处理。 */
  errorKind?: string | null;
  errorDetail?: string | null;
}

/** 「通知渠道」页签的文案。`createEnterpriseLabelCatalog` 两种 copyMode 都带;手工拼 labels 的宿主不给就不画页签。 */
export interface NotificationChannelSettingsLabels {
  /** 页头下方的页签条:通知规则 / 通知渠道。 */
  sections: { rules: string; channels: string };
  /** 「钉钉未配置」提示里,给管理员的跳转动作。 */
  configure: string;
  /** 同一条提示给没有管理权限的人看的版本。 */
  unavailableMember: string;
  dingtalkTitle: string;
  dingtalkDescription: string;
  configured: string;
  notConfigured: string;
  baseUrl: string;
  appKey: string;
  credential: string;
  /** 地址 / 标识沿用「登录与权限」的值时,输入框下方的一句说明。 */
  inheritedHint: string;
  credentialSaved: string;
  credentialEmpty: string;
  /** 凭据由部署环境提供时的只读说明。 */
  credentialFromEnv: string;
  clearCredential: string;
  save: string;
  saved: string;
  saveFailed: string;
  loadFailed: string;
  test: string;
  /** 有未保存的改动时点「测试连接」的提示:测试走的是已保存的配置。 */
  saveBeforeTest: string;
  testOk: string;
  testFailed: { auth: string; unreachable: string; notConfigured: string; unexpected: string };
}

export interface NotificationSettingsLabels {
  title: string;
  description: string;
  /** 顶部分段控件:只有 `canManage` 为真时才画。 */
  tabs: { mine: string; policy: string };
  /** 「平台配置」页签下的一句说明。 */
  policyDescription: string;
  /** 卡片标题行右端的开关文案。 */
  managed: string;
  /** 「我的通知」里托管中的分组,开关旁边那枚静态标签。 */
  managedTag: string;
  columns: { scene: string; dingtalk: string; inApp: string };
  /** 破折号单元格的无障碍名与悬停提示。 */
  unsupported: string;
  /** 钉钉未配置时页头下方那一行说明。 */
  dingtalkUnavailable: string;
  saveFailed: string;
  loadFailed: string;
  retry: string;
  empty: string;
  /** 开关的无障碍名:场景名 + 渠道名(开关自己没有可见文案)。 */
  switchLabel: (scene: string, channel: string) => string;
  /** 「通知渠道」页签与相关提示;缺省时不画页签(见 `NotificationChannelSettingsLabels`)。 */
  channel?: NotificationChannelSettingsLabels;
}

/** 分组在读页面的这段时间里被改成托管时,PATCH `/preferences` 的错误码。 */
export const NOTIFICATION_GROUP_MANAGED_CODE = "notification_group_managed";

/**
 * 这次保存失败是不是「分组刚刚被改成托管了」(HTTP 409)。
 *
 * 宿主的 adapter 只要把 rejection 做成带 `status` 或 `code` 的对象就能命中——本包不假设
 * 宿主用哪个 HTTP 客户端,也不去 `instanceof` 某个具体的错误类。命中后页面会回滚并重新
 * 拉一次「我的通知」:此刻本地那份视图已经是错的,补一次读比留着一个假状态便宜。
 */
export function isNotificationManagedConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const shape = error as { status?: unknown; code?: unknown };
  return shape.status === 409 || shape.code === NOTIFICATION_GROUP_MANAGED_CODE;
}

/** 双语文本按 locale 取一边:`en` 开头走英文,其余(含 `zh-CN`)走中文。 */
export function resolveNotificationText(text: LocalizedText, locale: string): string {
  return locale.startsWith("en") ? text.en : text.zh;
}
