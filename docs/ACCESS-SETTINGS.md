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

## 文案

`createEnterpriseLabelCatalog` 已经带上了 `configuration.webhookSecret` 与
`configuration.webhookSecretHint`(中/英各一份);自己拼 `EnterpriseIntegrationConfigurationLabels`
的宿主必须补齐这两个键,否则 TS 直接报错——密钥填错要到事件验签失败才暴露,不能让它悄悄留空。
