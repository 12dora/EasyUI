# 无业务权限引导页——宿主接线

登录成功但一项功能都用不了的账号,看到的应该是「怎么拿到权限」,而不是设置页上的
「当前账号没有访问此页面的权限。」本包提供整页引导与判定函数,宿主只负责接线。

全部从 `@easy-enterprise/ui/enterprise` 导出。

## 判定:`hasEnterpriseBusinessAccess`

```ts
hasEnterpriseBusinessAccess({
  permissions: ReadonlySet<string>,
  securityCapabilities?: Record<string, boolean>,
  isLocalSuperadmin?: boolean,
  businessPermissionCodes: Iterable<string>,
}): boolean
```

为真当且仅当:本地超管、持有宿主传入的任一业务权限码、或任一本地安全能力为真。
**`businessPermissionCodes` 必填**:宿主必须传入自己带门禁的导航(以及设置面板)权限码,
漏传会把所有 SSO 用户挡在引导页。通知中心这种「看着有权限、其实没事可做」的码不要放进去。

为假时外壳整页换成引导,不要把人放进 `EnterpriseAppFrame`。

## 页面:`EnterprisePermissionOnboarding`

在身份已加载且 `!hasEnterpriseBusinessAccess(...)` 时渲染,**不要放进应用框架里**。
强制改密页仍优先于本页。

```tsx
<EnterprisePermissionOnboarding
  identity={{ displayName: identity.name, secondaryLabel: identity.email, avatarUrl: identity.avatarUrl }}
  permissionRequestUrl={permissionRequestUrl}
  onRecheck={() => void refreshIdentity()}
  onLogout={() => void performEnterpriseLogout(adapter, () => router.replace(`/${locale}/logged-out`))}
  labels={t.permissionOnboarding}
/>
```

| 属性 | 说明 |
| --- | --- |
| `identity.displayName` | 主名称 |
| `identity.secondaryLabel?` | 邮箱等次要行;与主名称相同则不画 |
| `identity.avatarUrl?` | 头像;空则首字母 |
| `permissionRequestUrl` | EasyAuth 申请入口;仅 `http://` / `https://` / 以 `/` 开头;`null` / 空白 / 其他协议不画「申请权限」 |
| `onRecheck` | 重新拉取 `/auth/me`;权限批下来后由它把用户放进工作台 |
| `onLogout` | 退出。宿主接到 `performEnterpriseLogout` |
| `recheckOnFocus?` | 默认 `true`:窗口回前台复查,节流 10 秒 |
| `labels` | `createEnterpriseLabelCatalog(...).permissionOnboarding` |

`permissionRequestUrl` 来自登录即可达的 `GET /api/v1/auth/session`(不要权限码,
零授权用户必须能读到)。`onRecheck` 只重拉 `/auth/me`。

文案(zh-CN / en)在共享目录 `permissionOnboarding`:标题「尚无可用权限」/
"No permissions yet",主按钮「申请权限」,次按钮「重新检查」,第三「退出登录」。
next-intl 宿主可用 `defineEnterprisePermissionOnboardingLabels` 对齐。

测试标识:`permission-onboarding`、`permission-onboarding-user`、
`permission-onboarding-avatar`、`permission-onboarding-name`、
`permission-onboarding-secondary`、`permission-onboarding-request`、
`permission-onboarding-recheck`、`permission-onboarding-logout`。
