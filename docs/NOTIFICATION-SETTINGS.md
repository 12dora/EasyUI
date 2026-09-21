# 通知设置——宿主接线

「设置 → 通知」这一页由本包提供(`EnterpriseNotificationSettingsSurface`),宿主只负责
传输(adapter)、文案(labels)与路由。页面自带 `PageHeader`,是**本页唯一的 H1**。

框架侧的完整契约(场景声明、平台托管语义、HTTP 形状、发送判定)在 EasyFrame 的
`docs/NOTIFICATION_SETTINGS.md`;这里只记前端必须对齐的部分。

全部从 `@easy-enterprise/ui/enterprise` 导出。

## 1. 模型

- **渠道(channel)**:`dingtalk`(钉钉工作通知)与 `in_app`(站内通知)。渠道 id 是数据,
  线上不做驼峰转换,前端也不改写。
- **场景(scene)**:一类业务事件,如 `exam.result_released`。场景不支持的渠道下发 `null`,
  页面画一个破折号而**不是**一个永远关着的开关——点不动的开关只会让人一直找"怎么打开"。
- **分组(group)**:一组面向同一角色的场景。`GET ``` 只返回当前账号持有 `gate_permission`
  的分组,所以前端不做任何权限过滤。
- **平台托管(managed)**:按分组生效。开着时这一组按平台值发送,成员只读;`editable`
  由后端算好(`!managed`),前端不自己推。

## 2. 挂载

```tsx
<EnterpriseSettingsPageFrame>
  <EnterpriseNotificationSettingsSurface
    adapter={notificationSettingsAdapter}
    labels={t.notificationSettings}
    locale={locale}
  />
</EnterpriseSettingsPageFrame>
```

`locale` 只用来挑双语文本:`en` 开头取 `LocalizedText.en`,其余(含 `zh-CN`)取 `.zh`。

## 3. 适配器契约

```ts
interface NotificationSettingsAdapter {
  load(): Promise<NotificationSettingsView>;                        // GET  /api/v1/notification-settings
  savePreference(change: NotificationSwitchChange): Promise<NotificationGroupView>;  // PATCH …/preferences
  loadPolicy(): Promise<NotificationPolicyView>;                    // GET  …/policy
  savePolicy(change: NotificationPolicyChange): Promise<NotificationGroupView>;      // PATCH …/policy
}

type NotificationChannel = "dingtalk" | "in_app";
interface LocalizedText { zh: string; en: string }

interface NotificationSceneView {
  key: string; title: LocalizedText; description: LocalizedText;
  channels: Record<NotificationChannel, boolean | null>;            // null = 本场景不支持该渠道
}
interface NotificationGroupView {
  key: string; title: LocalizedText; description: LocalizedText;
  managed: boolean; editable: boolean; scenes: NotificationSceneView[];
}
interface NotificationChannelStatus { key: NotificationChannel; available: boolean }

interface NotificationSettingsView { canManage: boolean; channels: NotificationChannelStatus[]; groups: NotificationGroupView[] }
interface NotificationPolicyView   { channels: NotificationChannelStatus[]; groups: NotificationGroupView[] }

interface NotificationSwitchChange { group: string; scene: string; channel: NotificationChannel; enabled: boolean }
type NotificationPolicyChange = { group: string; managed: boolean } | NotificationSwitchChange;
```

三条不是选项的约定:

- **两个 `save*` 必须返回更新后的整个分组。** 页面拿服务端那一份替换本地乐观值,自己不
  拼接结果——只回 `204` 的后端会让页面停在乐观值上,而那正是最容易与真实状态分叉的地方。
- **409 要能认出来。** 分组在用户读页面这段时间里被改成了托管时,`PATCH /preferences`
  回 409 `{"code": "notification_group_managed"}`。adapter 把 rejection 做成带
  `status: 409` **或** `code: "notification_group_managed"` 的对象即可
  (`isNotificationManagedConflict` 只认这两样,不 `instanceof` 任何具体错误类);页面收到
  之后回滚这一次改动,并重新读一遍「我的通知」——此刻本地那份视图已经不对了。
  常量导出为 `NOTIFICATION_GROUP_MANAGED_CODE`。
- **`loadPolicy` 只在管理员第一次切到「平台配置」时才调。** 没有 `canManage` 的账号不会
  发这个请求,后端的 403 也就永远不会出现在正常路径上。

```tsx
const notificationSettingsAdapter: NotificationSettingsAdapter = {
  load: () => api.get("/api/v1/notification-settings"),
  savePreference: (change) => api.patch("/api/v1/notification-settings/preferences", change),
  loadPolicy: () => api.get("/api/v1/notification-settings/policy"),
  savePolicy: (change) => api.patch("/api/v1/notification-settings/policy", change),
};
```

## 4. 页面行为

- `canManage` 为真时页头下方出现分段控件「我的通知 / 平台配置」;否则只有「我的通知」,
  连控件都不画。
- **切页签一律重拉**。平台值刚改完,本人的生效值就可能跟着变,拿缓存会给出一张过期的表。
- **即点即存,没有保存按钮**。乐观更新 → 请求 → 成功用返回的分组替换,失败回滚并
  `toast.error(labels.saveFailed)`。在途期间**只禁用被点的那一个开关**,同一张卡上的
  其他开关照常可点。
- 「我的通知」里托管中的分组:正文整表进 `GatedBody`(变灰 + `inert`),但**标题行的
  「平台托管」开关与那枚「由平台统一管理」标签留在灰区之外**——它们解释的正是"为什么这张表
  不能动",跟着一起变灰就没人读得到了(与「工作账号登录」卡片同一口径,见
  [`ACCESS-SETTINGS.md`](ACCESS-SETTINGS.md))。那枚开关在这一页恒为 `disabled`:它是状态
  展示,不是操作入口。
- 「平台配置」里所有分组 `editable = true`,托管开关可操作,表格不置灰。
- 某个渠道 `available === false` 时,页头下方印**一条** `labels.dingtalkUnavailable`
  (不是每张卡一条)。
- 状态:一次都没读到时是骨架屏;读失败时一条 `InlineNotice` + **重试**(重试只跟着失败走,
  读成功时不是常驻控件);`groups` 为空时是空状态。

## 5. 权限与导航

后端已经按 `gate_permission` 过滤分组,前端不重复判定。所以导航项的最简做法是
**对所有已登录用户都显示**:没有任何分组的账号打开这一页看到的是空状态,而不是一个
403。要更严一点的宿主可以在持有任一分组 gate 或 `notification.settings.manage` 时才显示。

导航文案用 `catalog.navigation.notificationSettings`(通知 / Notifications),路由建议
`settings/notifications`,中英文路由记得在 `routes.spec` 里补齐。

## 6. 文案

`createEnterpriseLabelCatalog(...).notificationSettings`(类型 `NotificationSettingsLabels`)
已经带上中英两份,**两种 `copyMode`(`legacy` / `business`)用的是同一份**:开关是什么、
托管意味着什么,与宿主是内部系统还是对客系统无关。

它与收件箱的 `catalog.notifications` 是**两个独立的键**,不要互相复用。

| 键 | zh-CN | en |
| --- | --- | --- |
| `title` | 通知 | Notifications |
| `description` | 选择接收哪些通知，以及通过哪些渠道接收。 | Choose which notifications you receive and where. |
| `tabs.mine` / `tabs.policy` | 我的通知 / 平台配置 | My notifications / Platform settings |
| `policyDescription` | 为各角色设置通知的平台值。…… | Set platform values for each role. … |
| `managed` / `managedTag` | 平台托管 / 由平台统一管理 | Platform managed / Managed by your organization |
| `columns.*` | 通知场景 / 钉钉 / 站内通知 | Notification / DingTalk / In-app |
| `unsupported` | 不支持 | Not supported |
| `dingtalkUnavailable` | 钉钉通知尚未配置，相关开关暂不生效。 | DingTalk isn't set up yet. … |
| `saveFailed` / `loadFailed` / `retry` / `empty` | 保存失败，请重试。/ 无法加载通知设置 / 重试 / 暂无可设置的通知 | Couldn't save. Try again. / Couldn't load notification settings / Retry / No notifications to configure |
| `switchLabel(scene, channel)` | `` `${scene} · ${channel}` `` | 同 |

`switchLabel` 是开关的**无障碍名**:开关本身没有可见文案,列头也不会被读屏当成它的名字,
所以必须由场景名 + 渠道名拼一个。

## 7. `data-test-id`

| 位置 | id |
| --- | --- |
| 页面 | `notification-settings-surface` |
| 页签 | `notification-settings-tabs`(选项上带 `data-notification-tab="mine" \| "policy"`) |
| 「平台配置」说明 | `notification-policy-description` |
| 渠道未配置提示 | `notification-channel-unavailable` |
| 骨架屏 / 空状态 | `notification-settings-skeleton` / `notification-settings-empty` |
| 读失败 / 重试 | `notification-settings-load-failed` / `notification-settings-retry` |
| 卡片列表 | `notification-settings-groups` |
| 一张卡片 | `notification-group-{group}` |
| 平台托管开关 / 静态标签 | `notification-group-{group}-managed` / `notification-group-{group}-tag` |
| 一格渠道开关 | `notification-switch-{scene}-{channel}` |

场景 key 带点(`exam.result_released`)是正常的,test id 里原样保留——选择器写成
`[data-test-id='notification-switch-exam.result_released-dingtalk']` 即可。
