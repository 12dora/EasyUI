# EasyAuth 授权设置——宿主接线

`EnterpriseAccessSettingsSurface` 的「业务权限」页里那张 EasyAuth 连接表单
(`EnterpriseEasyAuthConfigurationForm`)由本包渲染,读写全部走宿主注入的
`EnterpriseAccessSettingsAdapter`。这里只记宿主必须对齐的契约。

## 两个只写密钥

表单上有两个只写(write-only)密钥框,形状完全一致,后端都**只回状态、不回明文**:

| 字段 | 表单 id / testId | 读模型 | 用途 |
| --- | --- | --- | --- |
| 应用凭据 | `enterprise-easyauth-credential` / `easyauth-credential` | `hasCredential` | 本应用调用 EasyAuth 时的凭据 |
| Webhook 密钥 | `enterprise-easyauth-webhook-secret` / `easyauth-webhook-secret` | `hasWebhookSecret` | 校验 EasyAuth 推来的授权事件签名 |

只写的三态由 `EnterpriseWriteOnlySecret`(`{ value, clear }`)表达,`writeOnlyCredential`
归一成一个可选字符串:

- 框留空 → 传 `undefined`(**不传该键**),后端保留已存的密钥;
- 勾了「清除已保存凭据」→ 传 `""`,后端删掉已存的密钥;
- 输入了内容 → 传明文,后端覆盖。

保存成功后两个框都会被清空,密钥绝不回显。

## 适配器契约(破坏性变更)

```ts
loadEasyAuthSettings(): Promise<EnterpriseEasyAuthConfigurationValue>;   // 含 hasCredential / hasWebhookSecret
saveEasyAuthSettings(
  value: EnterpriseEasyAuthConfigurationValue,
  secrets: { credential?: string; webhookSecret?: string },
): Promise<EnterpriseEasyAuthConfigurationValue>;
```

`saveEasyAuthSettings` 的第二个参数从旧的 `credential?: string` 改成了 `secrets` 对象:
宿主把它整体交给 `PUT /api/v1/authz-integration/settings` 即可(`JSON.stringify` 会自动
丢掉 `undefined` 的键,正好对上「不传即保留」的后端语义)。

`easyAuthConnectionEditable: false` 的宿主会把地址、App Key 与两个密钥一起置灰,
只留权限申请地址可改。

## 工作账号登录卡片(OIDC)

### 总开关

「启用工作账号登录」是这张卡的**总开关**,放在标题行右端(`Section` 的 `actions`),
`role="switch"`,testId 仍是 `identity-enabled`。关掉之后:

- 卡片正文(登录服务地址、配置栅格、回调地址)整体进 `GatedBody`——
  变灰、不接指针、Tab 也进不去(`inert`);
- **开关、「保存」与操作结果提示留在正文之外**:开关关掉后自己仍可操作(否则这张卡
  再也开不回来),「关掉」这个状态本身要能存下去,保存 / 连接测试的结果也要在正文
  变灰之后照样读得到、照样留在无障碍树里(与「用户目录」卡片同一口径);
- 只有在当前账号没有管理权限(`disabled` / `!canManage`)时,开关才置灰。

### 授权范围

`EnterpriseOidcConfigurationValue.scopes` 的线上格式不变,仍是**空格分隔的字符串**,
但表单侧已从自由文本框改成固定四项的勾选组,不开放自定义:

| 令牌 | 说明键 | 备注 |
| --- | --- | --- |
| `openid` | `configuration.scopeOptions.openid` | OIDC 硬性要求,常勾且不可取消 |
| `profile` | `configuration.scopeOptions.profile` | |
| `email` | `configuration.scopeOptions.email` | |
| `dingtalk` | `configuration.scopeOptions.dingtalk` | |

解析与序列化由 `access-settings/helpers.ts` 的 `parseOidcScopes` / `serializeOidcScopes`
负责,契约是:

- 空串 / 只有空白 → `"openid"`;
- 写回时按上表顺序输出,`openid` 永远打头;
- **这四项之外的令牌在下一次保存时被丢弃**(既有数据里如果存了 `offline_access`,
  管理员再点一次保存就没了)。宿主若需要别的范围,必须先扩这张表,而不是往库里塞。

归一化发生在**保存这道边界**上(`use-identity-settings.ts`):即使管理员一个勾选框
都没动,`saveOidcSettings` 收到的也是重排过的规范串,所以库里的旧值不会因为“没人碰过”
而一直漏下去。

勾选组本身没有可关联的单一控件,因此额外挂了 `role="group"` + `aria-label`;
testId:整组 `enterprise-oidc-scopes`,每项 `enterprise-oidc-scope-<令牌>`。

## 文案

`createEnterpriseLabelCatalog` 已经带上了 `configuration.webhookSecret`、
`configuration.webhookSecretHint`、`configuration.scopesHint` 与
`configuration.scopeOptions`(中/英各一份)。

两个密钥文案是**必填**:自己拼 `EnterpriseIntegrationConfigurationLabels` 的宿主漏了
TS 直接报错——密钥填错要到事件验签失败才暴露,不能让它悄悄留空。

`scopesHint` 与 `scopeOptions` 是**选填**,给手工拼文案的宿主留了退路:`scopesHint`
缺了就不显示那行说明,`scopeOptions` 里缺了哪一项,对应那行就只印令牌本身。勾选框、
顺序与写回的值都不受影响。
