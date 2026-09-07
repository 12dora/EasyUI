# 静默身份复查(机制 2)——宿主接线

上游 Authentik 的会话可能在应用毫不知情的情况下变了:会话过期、用户登出后换另一个账号登录。
后端的反向通道登出(机制 1)只覆盖「有登出事件」的情形;**没有事件**的那一半由这里的静默复查兜底。

做法:前端挂一个隐藏 `<iframe>` 打开后端的静默授权入口(`prompt=none`),Authentik 不显示任何 UI
直接重定向回来,回调最终落在宿主前端页 `/login/oidc-silent`,该页把结论 `postMessage` 给父窗口,
父窗口据此决定「继续用当前会话 / 换身份刷新 / 跳登录页」。

本包提供两件东西:

| 导出 | 位置 | 作用 |
| --- | --- | --- |
| `EnterpriseOidcSilentCompleteController` | 宿主页 `/login/oidc-silent` | 解析 hash → 同源 postMessage → 抹掉 hash |
| `useEnterpriseIdentityCheck` | 宿主的当前用户 Provider | 挂隐藏 iframe、收消息、超时、节流、合并,把结论交给宿主回调 |

判断权全部留在宿主:本包不比对账号、不写 localStorage、不跳转。

## 后端契约

`GET {apiBase}/auth/oidc/authorize?silent=1`(绝对地址由宿主的 `apiUrl()` 拼;路径由
`/auth/oidc/status` 的 `silentAuthorizePath` 给出,已加进本包的 `EnterpriseOidcStatus` 类型)。
走完一圈后浏览器停在宿主前端页 `/login/oidc-silent`,结果放在 hash 里:

```
#outcome=authenticated&token=<jwt>&account=<accountId>
#outcome=logged_out&kind=<provider error>     # 如 login_required
#outcome=error&kind=<flow error kind>         # 如 state_mismatch
```

`parseSilentIdentityResult(hash)` 把它归一成 `IdentityCheckOutcome`:

- 缺 `outcome`、`outcome` 不认识、或 `authenticated` 却缺 token/account → `{ outcome: "error", kind: "malformed" }`(契约违例一律降级报错,绝不当成「登录着」放过去);
- `kind` 只保留 `^[a-z0-9][a-z0-9_.:-]{0,63}$` 形态的短标识,其余归一成 `unknown` —— 不把上游原文带进宿主界面或日志;
- 多余参数(`state`、`next` 等)忽略。

## 宿主要做的四件事

### 1. 页面 `/login/oidc-silent`(本地化 + 非本地化两条路由)

和现有的 `/login/oidc-complete` 完全同构:回调可能落在带 locale 前缀的地址上,也可能落在不带的,
两条都得有页面。以 EasyFrame `blank` 应用为例:

```
app/login/oidc-silent/page.tsx            → <OidcSilent/>
app/[locale]/login/oidc-silent/page.tsx   → <OidcSilent locale={locale}/>
```

```tsx
"use client";
import { EnterpriseOidcSilentCompleteController } from "@easy-enterprise/ui/enterprise";
import Link from "next/link";

export function OidcSilent({ locale = "zh-CN" }: { locale?: string }) {
  const labels = messages(locale).oidcSilent; // { standalone, back }
  return (
    <EnterpriseOidcSilentCompleteController
      labels={labels}
      renderBackLink={(label) => <Link href={`/${locale}/login`}>{label}</Link>}
    />
  );
}
```

这个页面**不要**套应用外壳、不要读当前用户、不要跳转:它 99% 的时间活在一个零尺寸 iframe 里。
被人直接(顶层)打开时它只渲染一行说明 + 返回链接,绝不重新发起授权 —— 否则会和授权端点来回
重定向成死循环。两种情形下它都会先 `history.replaceState` 把 hash 抹掉,**token 一秒都不留在地址栏**
(地址栏、历史记录、崩溃报告都会带走它)。

### 2. 只给这条路径开帧头

宿主全局是 `frame-ancestors 'none'` + `X-Frame-Options: DENY`,不改就没法被自己的页面套进 iframe。
**只**给 `/login/oidc-silent` 这一条路径放宽成同源可嵌:

```
Content-Security-Policy: ...; frame-ancestors 'self'
X-Frame-Options: SAMEORIGIN
Cache-Control: no-store
```

Next.js 的坑:`headers()` 里**所有**命中的规则都会生效,同一个 CSP 头出现两次时浏览器取交集,
`'none'` 会盖掉 `'self'`。所以必须让全局那条规则**排除**这个路径,而不是简单地在后面追加一条:

```ts
const framable = securityHeaders
  .filter((header) => header.key !== "X-Frame-Options" && header.key !== "Content-Security-Policy")
  .concat([
    { key: "X-Frame-Options", value: "SAMEORIGIN" },
    { key: "Content-Security-Policy", value: contentSecurityPolicy.replace("frame-ancestors 'none'", "frame-ancestors 'self'") },
    { key: "Cache-Control", value: "no-store" },
  ]);

async headers() {
  return [
    { source: "/:path((?!.*login/oidc-silent).*)", headers: securityHeaders },
    { source: "/login/oidc-silent", headers: framable },
    { source: "/:locale/login/oidc-silent", headers: framable },
  ];
}
```

接完请在宿主的路由头断言用例里加一条:`/login/oidc-silent` 的 CSP 含 `frame-ancestors 'self'`
且**只出现一次**,其余路径仍是 `'none'`。

### 2b. 父页面的 `frame-src` 要放行整条重定向链

隐藏 iframe 的第一跳是**后端 API 源**,中间还要经过 Authentik,最后才回到自己。CSP 的 `frame-src`
对 frame 内的每一次导航都生效,少一个源就整条链断在半路(表现为「一直超时」):

```
frame-src 'self' blob: https://<api-origin> https://auth.jiefakj.com
```

### 3. 在当前用户 Provider 里挂 hook

一个应用只挂一次(挂在当前用户 Provider 里,别挂在页面组件上,否则每次路由切换都会重新查):

```tsx
const { runCheck } = useEnterpriseIdentityCheck({
  // 只有经 Authentik 建立的会话才复查;本地口令 / 本地管理员会话传 false。
  enabled: authMethod === "oidc" && Boolean(silentAuthorizeUrl),
  silentAuthorizeUrl,                 // apiUrl(status.silentAuthorizePath)
  currentAccountId: user?.id ?? null,
  onAuthenticated({ token, accountId }) {
    if (accountId === user?.id) { persistAuthToken(token); return; }  // 同一个人:续上新 token
    persistAuthToken(token);                                          // 换人了:换 token 后整页重载
    window.location.reload();
  },
  onLoggedOut() {
    clearLocalSession();
    router.replace(`/${locale}/login?next=${encodeURIComponent(location.pathname + location.search)}`);
  },
  onError() { /* 什么都不做:回落到宿主既有行为 */ },
});
```

触发时机(全部内置,宿主不用自己写定时器):

| 时机 | 说明 |
| --- | --- |
| 启用 / 挂载 | 总是查一次 |
| 标签页切回前台 | `visibilitychange` → visible,距上次**完成**不足 `visibilityThrottleMs`(默认 60 s)就跳过 |
| 可见时定时 | 每 `intervalMs`(默认 5 min)一次;后台标签页跳过,回到前台继续 |
| `runCheck()` | 命令式,不受节流限制 |

任意时刻最多一次复查在飞:并发触发全部合并到同一个 Promise、同一个 iframe。超时(默认 15 s)
按 `onError({ kind: "timeout" })` 结算并摘掉 iframe。宿主卸载时 iframe 立即摘除,之后不再回调。

### 4. 401 路径

API 返回 401 时,**先复查再决定**,不要直接弹「会话已过期」:

```ts
const outcome = await runCheck();
if (outcome.outcome === "authenticated" && outcome.accountId !== user.id) { /* 换人 → reload */ }
else if (outcome.outcome === "logged_out") { /* 清会话 → 跳登录页 */ }
else { /* error / timeout / disabled → 照旧走原来的会话过期 UI */ }
```

`enabled: false` 时 `runCheck()` 返回 `{ outcome: "error", kind: "disabled" }` —— 如实说明「没查」,
不假装一切正常。

## 安全边界

- 父窗口只接受 `event.origin === window.location.origin` **且** `type === "easy-enterprise:identity-check"` 的消息;跨源消息、同源但类型不对的消息一律忽略(继续等,不当成结论)。
- 子页只往 `window.parent` 发,`targetOrigin` 固定为 `window.location.origin`,不用 `"*"`。
- token 只在 postMessage 的负载里出现一次,页面自己不落盘、不留在 URL 里。
- 复查页必须 `Cache-Control: no-store`。

## 导出速查

```ts
// 纯逻辑(identity-check.ts)
parseSilentIdentityResult(hash): IdentityCheckOutcome
normalizeIdentityCheckOutcome(raw): IdentityCheckOutcome
buildIdentityCheckMessage(outcome): IdentityCheckMessage
readIdentityCheckMessage(data): IdentityCheckOutcome | null
deliverIdentityCheckOutcome(outcome, handlers): void
createIdentityCheckScheduler(deps): IdentityCheckScheduler   // 注入时钟/定时器,可单测
IDENTITY_CHECK_MESSAGE_TYPE / _MALFORMED_KIND / _UNKNOWN_KIND / _TIMEOUT_KIND / _DISABLED_KIND

// React + DOM(identity-check-controller.tsx)
EnterpriseOidcSilentCompleteController({ labels, renderBackLink? })
useEnterpriseIdentityCheck(options): { runCheck(): Promise<IdentityCheckOutcome> }
runSilentIdentityCheck({ silentAuthorizeUrl, timeoutMs, signal? }): Promise<IdentityCheckOutcome>
IDENTITY_CHECK_FRAME_TEST_ID / IDENTITY_CHECK_ABORTED_KIND
```
