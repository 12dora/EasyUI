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
  之后把**这个分组**所有还没落地的改动丢掉(包括还排在队列里、尚未发出的那些),再重读一遍。
  作废范围**停在分组边界上**:同一队列里排着的**别的分组**的改动照发不误 —— 它们与这次托管
  无关,连坐等于把用户刚点的东西悄悄吃掉。常量导出为 `NOTIFICATION_GROUP_MANAGED_CODE`。
- **`loadPolicy` 只在管理员切到「平台配置」时才调。** 没有 `canManage` 的账号不会发这个
  请求,后端的 403 也就永远不会出现在正常路径上。

> **adapter 必须是稳定引用**(模块常量或 `useMemo`),与本包其他设置面一个口径:它换一次
> 引用就重拉一次数据,每次渲染都新建一个对象会变成请求风暴。
>
> **两个 `load*` 不能合流到更早的那次在途请求上。** 本页面会在写落地之后主动补拉,一个把
> 相同 URL 的并发 GET 合并成一份(request de-duplication / `fetch` 缓存)的宿主实现,会让
> 这次补拉拿回写之前的旧响应,页面就永远停在旧的生效值上。宿主传 `cache: "no-store"`,或
> 用别的办法绕开自己那层去重。

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
- **即点即存,没有保存按钮**。在途期间**只禁用被点的那一个开关**,同一张卡上的其他开关
  照常可点;在途键带页签前缀,所以平台页签上的在途请求不会把「我的通知」里的同一个开关
  一起锁住。状态模型见下一节。
- 「我的通知」里托管中的分组:整张表**变灰、每个开关各自 `disabled`**,但**不** `inert` ——
  这是与「工作账号登录」卡片(`GatedBody`,见 [`ACCESS-SETTINGS.md`](ACCESS-SETTINGS.md))
  的一处**刻意不同**。那张卡关掉之后,正文里的输入框此刻不代表任何事实,整块退出无障碍树
  是对的;这里相反:托管中的开关展示的是**当前真正生效的值**,用户(尤其读屏用户)必须读
  得到"托管之下我还会收到哪些通知"。`inert` 会把场景名、说明与开关状态一起从无障碍树里摘
  掉,那等于只对读屏用户隐瞒生效状态。视觉上仍然复用 `GATED_DIM_CLASS`(`GatedBody` 导出的
  同一档灰度),所以两张卡看起来是一致的。
  标题行的「平台托管」开关与那枚「由平台统一管理」标签留在表格之外,并且在这一页恒为
  `disabled`:它是状态展示,不是操作入口。

- 「平台配置」里所有分组 `editable = true`,托管开关可操作,表格不置灰。
- 某个渠道 `available === false` 时,页头下方印**一条** `labels.dingtalkUnavailable`
  (不是每张卡一条)。
- 状态:一次都没读到时是骨架屏;读失败时一条 `InlineNotice` + **重试**(重试只跟着失败走,
  读成功时不是常驻控件);`groups` 为空时是空状态。

## 4.1 状态模型:已确认值 + 待落地改动

保存不是"把整个分组换成最后一次响应",而是:

- `confirmed` —— 服务端那一份,只有保存成功或加载成功才动;
- `ops` —— 一串还没落地的改动,按点击顺序排;
- 页面显示 `applyOps(confirmed, ops)`,即把待落地的改动**重放**在已确认值之上。

于是:

- **同一个分组连点两个开关**,先回来的那次响应只更新 `confirmed`,另一个开关的改动仍在
  `ops` 里重放,不会被"整组快照"抹掉;
- **某一次失败**只丢它自己那条 op,显示值重新算一遍——期间已经成功的兄弟改动自然留着
  (按快照回滚会把它一起吞掉);
- **每个页签一条串行队列**:同一时刻只有一个写请求在飞,后点的排队等着,但乐观值立刻生效。
  并发写同一个分组时,两份整组快照必然互相覆盖,所以这里不并发;
- **409 的作废范围按分组算**,不按页签。触发冲突的那个分组的待落地改动整串丢掉并重读,
  队列里**别的分组**的改动照发不误 —— 判定走"这条 op 还在不在登记表里",而不是一个页签级
  的代数,否则一次 409 会把用户在另一个分组上刚点的东西一起吃掉。重读回来的 `confirmed`
  之上,幸存的改动继续重放。

加载有两道闸:每次加载发一个 `loadId`,响应对不上就是被更晚的加载顶掉了,整条丢弃;
每次写落地 `revision` +1,加载开始时记下当时的 `revision`,响应回来时对不上说明这份数据
在读的过程中已经被写改过了,同样丢弃,并标记 `needsReload`。

**平台写会把「我的通知」一起标记为过期。** 平台值一变,本人的**生效值**就可能跟着变,而那
份数据只有 `GET ``` 知道:所以平台侧的写无论成功、失败还是冲突,落地时都给 `mine` 的
`revision` +1 并置上 `needsReload`。用户在 PATCH 回来之前切回「我的通知」时,那次 GET 是写
之前发出去的、带回的是旧值,`revision` 对不上于是被丢弃;等**两条队列都空**之后补拉一次。
`load-start` 会清掉 `needsReload`,所以一次失效只补拉一次,不会转圈。

组件卸载后所有回调一律闭嘴。纯逻辑在 `src/enterprise/notification-settings-state.ts`
(`notification-settings-state.test.ts` 里有单测)。

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
| 卡片里的场景表格 | `notification-group-{group}-table`(托管只读时 `data-readonly="true"`) |
| 平台托管开关 / 静态标签 | `notification-group-{group}-managed` / `notification-group-{group}-tag` |
| 一格渠道开关 | `notification-switch-{scene}-{channel}` |

场景 key 带点(`exam.result_released`)是正常的,test id 里原样保留——选择器写成
`[data-test-id='notification-switch-exam.result_released-dingtalk']` 即可。
