# 通用设置 / 品牌 / 应用框架——宿主接线

「设置 → 通用」这一页、顶栏品牌位、应用框架的页脚,以及用户菜单里的身份行,全部由本包提供。
宿主只负责传输(adapter)与文案(labels)。旧的 `EnterpriseFooterSettingsSurface` 及其
`EnterpriseFooterSettingsLabels` / `EnterpriseFooterSettingsValue` **已删除**,页脚现在是通用设置里
的一个字段。

全部从 `@easy-enterprise/ui/enterprise` 导出。

## 1. 数据形状与后端契约

```ts
interface EnterpriseGeneralSettingsValue {
  titleZh: string; titleEn: string;
  subtitleZh: string; subtitleEn: string;
  footerHtmlZh: string; footerHtmlEn: string;
  logoDataUrl: string | null;
}
```

对应后端 `GET /api/v1/app-settings/general`(公开,登录页也要读)与
`PUT /api/v1/app-settings/general`(需要 `settings.app_setting.update`)。

- **空字符串 = 用宿主默认值**。后端不替 title / subtitle / logo 编造默认值,回退全在前端
  (`resolveEnterpriseBrand`)。
- 标题 ≤ 80 字、副标题 ≤ 200 字、纯文本;页脚 HTML ≤ 20 000 字,由后端沿用既有的页脚白名单
  清洗,前端渲染时再清洗一次。
- Logo 只接受 `data:image/(png|jpeg|webp);base64,…`,解码后 ≤ 128 KiB;`null` / `""` 表示清除。
  表单在上传前就按 MIME 类型与文件大小拦一次(`logoInvalid` / `logoTooLarge`),后端仍然是权威。
  读取文件是异步的:读取期间**保存按钮不可用**,读完自动恢复;期间换一张图或点「移除」,先前那次
  读取的结果会被丢弃,不会把已经换掉或清空的 logo 又装回去。

## 2. 设置页:`EnterpriseGeneralSettingsSurface`

```tsx
<EnterpriseSettingsPageFrame>
  <EnterpriseGeneralSettingsSurface adapter={adapter} labels={t.generalSettings} feedbackMode="toast" />
</EnterpriseSettingsPageFrame>
```

`defaultLogoSrc?: string | null`(可选)——宿主自带的默认 Logo,用于「没上传自定义 Logo 时预览
当前真正在用的那张图」。**通常不用传**:宿主的外壳已经把默认 Logo 作为品牌兜底交给
`resolveEnterpriseBrand`,本包会记住它(见 §3)。只有当这一页不在带顶栏的外壳里渲染、或者宿主
想覆盖预览用的图时才传。

```ts
interface EnterpriseGeneralSettingsAdapter {
  load(): Promise<EnterpriseGeneralSettingsValue>;
  save(value: EnterpriseGeneralSettingsValue): Promise<EnterpriseGeneralSettingsValue>;
  onSaved?(value: EnterpriseGeneralSettingsValue): void;
}
```

页面结构:自己的 `PageHeader`(**本页唯一的 H1**)→ Logo 控件(文件选择 + 预览 + 移除)→
语言页签 `zh-CN` / `en`,每个页签里是应用名称、副标题、页脚 HTML → 一个保存按钮管全部。

Logo 控件**始终预览当前生效的 Logo**:传了自定义 Logo 就预览它,说明文字为「自定义 Logo」/
"Custom logo",旁边给「移除」;没有自定义 Logo 时预览宿主默认 Logo,说明文字为
「当前使用默认 Logo」/ "Using default logo",且不显示「移除」(默认值不归管理员清)。
点「移除」回到默认 Logo 的预览,而不是变成空白。两条说明文案来自
`labels.logoCustomCaption` / `labels.logoDefaultCaption`,`createEnterpriseLabelCatalog` 已给出中英文。
既没有自定义 Logo、宿主默认 Logo 也未知时,不画预览也不画说明。

语言页签切换有一段轻微的淡入上移(`--duration-fast`,`.easy-tab-panel-enter`),
`prefers-reduced-motion` 下自动关闭。

`feedbackMode`:

| 模式 | 加载中 | 加载失败 |
| --- | --- | --- |
| `inline`(默认) | 一行加载文案 | `InlineNotice` + 重试 |
| `toast` | 骨架屏 | toast 报错,表头常驻「重试」按钮;刷新失败不会清空已经加载成功的表单 |

保存成功后本组件会调用 `primeEnterpriseGeneralSettings(next)`:写入共享缓存并派发
`enterprise-starter:general-updated`,顶栏与页脚立刻跟着变,不需要刷新页面。宿主的
`onSaved` 仍会被调用(用于自己的埋点 / 缓存)。

`data-test-id`:

| 位置 | id |
| --- | --- |
| 页面 section | `general-settings-page` |
| 语言页签 | `general-locale-tab-zh-CN` / `general-locale-tab-en` |
| 应用名称 | `general-title-zh` / `general-title-en` |
| 副标题 | `general-subtitle-zh` / `general-subtitle-en` |
| 页脚 HTML | `footer-html-zh` / `footer-html-en`(沿用旧名) |
| Logo | `general-logo-input` / `general-logo-preview` / `general-logo-remove` |
| Logo 说明 | `general-logo-caption`(预览图上带 `data-logo-source="custom" \| "default"`) |
| 保存 / 刷新 | `app-settings-save`(沿用旧名) / `general-settings-refresh` |

文案来自 `createEnterpriseLabelCatalog(...).generalSettings`(类型 `EnterpriseGeneralSettingsLabels`,
next-intl 宿主可用 `defineEnterpriseGeneralSettingsLabels` 对齐)。导航项从
`navigation.footer` 改成了 `navigation.general`(通用 / General)。

## 2.1 无权限时的页面:`EnterprisePermissionDeniedPage`

通用设置页由宿主自己拥有路由,所以「没有 `settings.app_setting.update`」这一状态也得由宿主画。
直接用本包导出的这个组件,它保证页面**仍然只有一个 H1**,并且用一句人话说明为什么是空的:

```tsx
if (!canManageAppSettings) {
  return (
    <EnterpriseSettingsPageFrame>
      <EnterprisePermissionDeniedPage
        title={t.generalSettings.title}
        description={t.generalSettings.description}
        message={t.common.permissionDenied}
        testId="general-settings-page"
      />
    </EnterpriseSettingsPageFrame>
  );
}
```

```ts
interface EnterprisePermissionDeniedPageProps {
  title: ReactNode;                       // 页面标题,本页唯一的 H1
  description?: ReactNode;                // 标题下的副标题
  message: ReactNode;                     // 为什么这一页不可用
  feedbackMode?: "inline" | "toast";      // 默认 inline
  testId?: string;                        // section 的 data-test-id
  showHeader?: boolean;                   // 宿主自己画标题时传 false,默认 true
  messageDetail?: ReactNode;              // toast 模式下 message 之下的补充说明
  actions?: ReactNode;                    // 路由级动作;不传则给一个安全的返回入口
  defaultActionLabel?: ReactNode;         // 那个返回入口的文案
  surface?: string;                       // data-enterprise-surface 标记
}
```

`inline`(默认)画一条 `InlineNotice`(`data-test-id="permission-denied"`);`toast` 画整页的空状态
(标题 + 说明 + 返回按钮),两种模式都**不弹 toast、不跳转**。文案由宿主提供,不要写成技术口径。

## 3. 共享读取:`useEnterpriseGeneralSettings` 与两个解析函数

```ts
const { settings, error } = useEnterpriseGeneralSettings(loadGeneralSettings);
const brand = resolveEnterpriseBrand(settings, locale, { title: "学习工作台", logoSrc: null });
const footerHtml = resolveEnterpriseFooterHtml(settings, locale);
```

- 模块级缓存 + 单飞:顶栏、页脚、登录页共用同一次 GET,路由切换不重复请求,多个消费者不会打架。
- 订阅 `enterprise-starter:general-updated`,所以设置页保存后当前页立刻重新品牌化。
- 失败**不进缓存**(`error: true`),下一次挂载还能重试;而且成功的那一次 GET 会广播给**所有**已挂载
  的消费者 —— 顶栏在断网时挂载失败,只要页脚稍后那次请求成功,顶栏也会跟着恢复,不用刷新页面。
- `primeEnterpriseGeneralSettings(value)` 用于 SSR 交接或保存后写回,同时派发事件。
- `resetEnterpriseGeneralSettings()` 清缓存,给测试与登出流程用。
- `resolveEnterpriseBrand` 逐字段回退:该语言的值非空就用它,否则用宿主默认;
  `logoSrc` = `logoDataUrl` 非空则用它,否则 `fallback.logoSrc ?? null`。
- `resolveEnterpriseBrand` 顺手把 `fallback.logoSrc` 记进模块级的「宿主默认 Logo」
  (`registerEnterpriseDefaultBrandLogo` / `getEnterpriseDefaultBrandLogo` /
  `useEnterpriseDefaultBrandLogo`),通用设置页据此预览「当前在用的 Logo」。因为每个宿主的顶栏
  本来就要解析品牌,所以**不需要新接线**;不走这个解析器的宿主可以自己调
  `registerEnterpriseDefaultBrandLogo(src)`,或者给设置页传 `defaultLogoSrc`。
  `useEnterpriseDefaultBrandLogo()` 首帧一律返回 `null`(SSR 与水合一致),值在 effect 里补上。
- `resetEnterpriseGeneralSettings()` 同时清掉这个默认 Logo;下一次品牌解析会重新登记。
- `resolveEnterpriseFooterHtml` 没配置时返回 `undefined`,让 `EnterpriseConfiguredFooter` 画回退文案。
  `{year}` 始终是 `EnterpriseConfiguredFooter` 的渲染期替换,不会写进存储值。

## 4. 顶栏品牌位:`EnterpriseBrandSlot`

```tsx
<Topbar
  brand={
    <EnterpriseBrandSlot
      href={href("/app")}
      title={brand.title}
      subtitle={brand.subtitle}
      logoSrc={brand.logoSrc}
      testId="admin-brand-link"
      renderLink={({ href, className, children, testId }) => (
        <Link href={href} className={className} data-test-id={testId}>{children}</Link>
      )}
    />
  }
/>
```

`logoSrc` 为空时**完全不渲染** `<img>`(没上传 logo 的应用保持纯文字,不会出现裂图)。
logo 是装饰性的:`alt=""` + `aria-hidden`,因为产品名就在右边的可见文本里,再给 logo 加
alt 会让链接的可访问名播报两次。副标题 `hidden sm:block`,窄屏不占位。
测试 id:链接 `${testId}`,图片 `${testId}-logo`,标题 `${testId}-title`,副标题 `${testId}-subtitle`。

不传 `renderLink` 时渲染普通 `<a>`;Next 宿主传自己的 `Link`。

## 5. 应用框架:`EnterpriseAppFrame`

```tsx
<EnterpriseAppFrame topbar={…} sidebar={…} mobileNav={…} footer={<EnterpriseConfiguredFooter html={footerHtml} fallback={t.public.footer} />}>
  {content}
</EnterpriseAppFrame>
```

就是 `AppShell`,但 `footer` 从可选改成**必填**。若干宿主都出现过「构造了页脚节点却忘了传给
`AppShell`」的登录页有页脚、进了应用就没有的问题,类型层面堵住它比每个宿主各自记着更可靠。
`AppShell.footer?` 保持可选,给 EasyTrade 那种自己写 `fixed` 框架的宿主用。

## 6. 设置页外壳:`EnterpriseSettingsPageFrame`(破坏性变更)

```ts
function EnterpriseSettingsPageFrame(props: { children: ReactNode }): JSX.Element;
```

`title` / `description` / `backAction` **全部移除**,它现在只渲染 `mx-auto max-w-6xl` 的包裹层
(`data-test-id="enterprise-settings-page"`)。原因:它以前会在每个设置页顶上画一个产品级的
「设置」H1,下面紧跟着功能面板自己的「本地账户」H1 —— 一条分隔线夹着两个标题。

规则:**每个设置面板自己拥有唯一的 `PageHeader`,标题取最内层的叶子名**(「本地账户」,而不是
「设置」)。本包内的本地账户、安全、工作账号与访问、系统服务与新的通用设置都已符合。
侧边栏的返回按钮与移动端标题栏本来就取叶子名,不受影响。

反过来,宿主页面自己已经画了这一页的 H1 时,传 `showHeader={false}` 让面板闭嘴:
`EnterpriseAccessSettingsSurface`、`EnterpriseAccountSecuritySurface` 与
`EnterprisePermissionDeniedPage` 都支持,并且**无权限状态同样不画标题**——
不会出现「有权限时没标题、没权限时冒出一个标题」这种前后不一致。

## 7. 身份行:`resolveEnterpriseIdentityLabel`

```ts
const { kind, label } = resolveEnterpriseIdentityLabel(
  { isLocalSuperadmin, roleGroups, permissions },
  { ...t.identity, separator: t.access.authorization.roleGroupSeparator },
);
```

判定顺序(从具体到笼统):

1. `isLocalSuperadmin` → `labels.admin`(kind `admin`);
2. 非空 `roleGroups` → 用 `separator` 连接的授权组名(kind `user`);
3. 有任意一条权限 → `labels.user`(kind `user`);
4. 其余 → `labels.guest`(kind `guest`)。

`permissions` 接受数组或 `ReadonlySet`。文案默认值在 `catalog.identity`
(管理员 / 用户 / 游客,Administrator / User / Guest)。
