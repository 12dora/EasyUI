# 登出(RP-initiated logout)——宿主接线

只清本地会话不算退出。Authentik 那边的会话还在:浏览器会停在 Authentik 自己的 session-end 页,
「再次登录」直接被放行并落到 Authentik 用户门户,而不是回到应用。用户看到的是「退不干净、
回不了应用」。

本包的 `performEnterpriseLogout` 负责把这条链补完:**在撤销本地会话之前**向后端要一份
end-session 表单,本地清干净之后用隐藏表单 POST 到 Authentik,由 Authentik 把浏览器送回
应用自己的登录页。

## 后端契约(EasyFrame `enterprise_platform`)

```
POST {apiBase}/auth/oidc/end-session
Authorization: Bearer <当前会话 token>        ← 必须在 POST /auth/logout 之前发,那时它还有效
Content-Type: application/json

{ "returnTo": "/zh-CN/login" }                ← 单个 `/` 开头的相对路径;缺省时后端不带 post_logout_redirect_uri
```

```jsonc
// 200
{
  "url": "https://auth.jiefakj.com/application/o/<slug>/end-session/",
  "method": "POST",
  "fields": {
    "id_token_hint": "<首登时存下的原始 ID token>",
    "post_logout_redirect_uri": "https://learn.jiefakj.com/zh-CN/login"
  }
}
// 404 —— 本地账号 / 没存过 id_token / OIDC 未启用
{ "code": "NO_END_SESSION" }
```

端点路径本包不硬编码 `/api/v1`:优先用 `/auth/oidc/status` 给出的 `endSessionPath`,没有就按
同一 api base 下的兄弟路由从 `authorizePath` 推(`…/auth/oidc/authorize` → `…/auth/oidc/end-session`)。
`authorizePath` 不是以 `/authorize` 结尾的相对路径时直接判定「推不出来」,跳过 end-session。

上游那一跳必须是 **POST 表单**,不是 GET:带钉钉声明的 `id_token_hint` 是一整个 JWT,GET 会被
网关按 414 截断。

Authentik 侧还要给 provider 注册一条 `redirect_uri_type: logout` 的 URI,strict / regex 命中
`post_logout_redirect_uri`,否则 Authentik 会忽略它、照样停在自己的页面(由部署脚本负责,
不是前端的事)。

## 登出顺序(本包内置,宿主不用自己编排)

| # | 动作 | 为什么是这个位置 |
| --- | --- | --- |
| 1 | `authMethod()` 为 `oidc` 才 `loadOidcStatus()`(3 s 上限) | 本地口令会话不该碰 Authentik |
| 2 | `POST …/auth/oidc/end-session`(带 bearer,3 s 上限) | 本地会话一撤销 bearer 就作废,所以必须在 `revoke()` **之前** |
| 3 | 中止并**闩住**静默身份复查 | 一次在飞的复查会在本地会话清掉之后回来,把新 token 写回宿主 —— 于是「刚退出就又登录着」;闩到下一次整页加载,免得 `revoke()` 那几秒里宿主的 401 重试又起一次新的 |
| 4 | `revoke()`(3 s 超时,失败不阻断)+ `clearLocalSession` / `markLoggedOut` / `clearAuthMethod` | 与今天完全一致 |
| 5 | 导航 | 见下面的回落矩阵 |

回落矩阵(任何一步失败都不会把用户卡在半截流程里):

| 情形 | 结果 |
| --- | --- |
| end-session 返回 200、`url` 是 https、`method` 是 POST、`fields.id_token_hint` 非空 | 隐藏表单 POST 到 `url`,隐藏域就是 `fields` |
| 404 / 401 / 5xx / 网络错误 / 3 s 超时 / 响应形状不对 / `url` 非 https / `method` 不是 POST / 缺 `id_token_hint` | 回落今天的行为:`/status.endSessionUrl` 顶层 GET(同样过 https 校验) |
| 宿主适配器没给 `apiUrl`,或 `authToken()` 是空 | 不发 end-session(没 bearer 只会换来 401),直接走上一行的 GET 回落 —— 未升级的宿主行为不变 |
| 表单挂不上 / `submit()` 抛异常(文档正在卸载、字段名遮住了 `submit`) | 同上,继续往下回落;**绝不**因为一个异常把用户扔在已清会话的当前页 |
| 表单提交了,但 1.5 s 内页面没开始离开(典型:CSP `form-action` 静默拦截) | 同上,改走 `endSessionUrl` 顶层 GET |
| 两者都没有 | 停在 `/<locale>/logged-out`(宿主传进来的 `redirectToLoggedOut`) |

「缺 `id_token_hint` 也算失败」不是洁癖:Authentik 没有有效 hint 就会忽略 `post_logout_redirect_uri`,
把用户留在自己的 session-end 页 —— 正是这条链要修的那个病。宁可回落今天的 GET。

`returnTo` 的默认值由 `window.location.pathname` 的首段推出:命中 `zh-CN` / `en` 就是
`/<locale>/login`,否则 `/login`。宿主传进来的 `returnTo` 要过和 OIDC 回调 `next` 同一把尺
(`safeInternalTarget`:必须单个 `/` 开头,`//`、反斜杠、控制字符一律丢弃回默认值)。

## 宿主要做的三件事(顺序不能换)

### 1. 先给 CSP 的 `form-action` 放行 Authentik 源

**这一步必须排在 `apiUrl` / `authToken` 之前。** 现有宿主的 CSP 都是 `form-action 'self'`
(静默复查那一轮只放宽了 `frame-src`,`form-action` 一个字没动)。这条指令一收紧,浏览器就会把
本包提交的那张隐藏表单**静默拦掉**:不抛异常、不发事件、页面停在原地,而本地会话已经清了 ——
用户看到的是「点了退出什么都没发生」,Authentik 那边的会话还活着。先加 `authToken` 后加 CSP,
比不升级还糟。

```diff
- "form-action 'self'",
+ // 登出要把 end-session 表单 POST 给 Authentik(见 EasyUI docs/LOGOUT.md),少这一源会被静默拦掉。
+ "form-action 'self' https://auth.jiefakj.com",
```

四个宿主各改一处(行号以 2026-09-16 的 HEAD 为准,按 `form-action` 搜更稳):

| 宿主 | 文件 |
| --- | --- |
| EasyTrade | `frontend/next.config.ts`(`form-action 'self'`,约 :63) |
| EasyCustoms | `frontend/apps/customs/next.config.ts`(约 :55) |
| EasyLearning | `frontend/apps/learning/next.config.ts`(约 :56) |
| EasyFrame blank(模板) | `frontend/apps/blank/next.config.ts`(约 :31) |

Authentik 源就是 `/status.endSessionUrl` / end-session `url` 的源(生产是
`https://auth.jiefakj.com`),**只加这一个源**,别写 `form-action *`。宿主如果有路由头断言用例
(EasyTrade `tests/*.spec.ts` 那种),顺手加一条「CSP 的 `form-action` 含 Authentik 源」。

本包自己也留了一层保险:表单提交 1.5 s 后页面还在原地,就回落到 `endSessionUrl` 顶层 GET。
那是兜底,不是替代 —— 走到兜底意味着用户多等 1.5 s,而且 GET 带不动长 `id_token_hint`。

### 2. bump 本包的 submodule pin

`performEnterpriseLogout(adapter, redirectToLoggedOut)` 的签名没变,调用点一个字都不用改;
只 bump pin 的宿主行为与今天完全一致(走 `endSessionUrl` GET 回落)。

### 3. 在登出适配器上补两个可选成员

它们是本包唯一拿不到的东西:api base 与当前 bearer。两行都是宿主早就有的函数,**两个都给全**:
`apiUrl` 决定往哪发,`authToken()` 决定能不能发(缺任一或 token 为空,本包直接跳过 end-session
走 GET 回落,不发一个注定 401 的请求)。

```ts
export const enterpriseLogoutAdapter: EnterpriseLogoutAdapter = {
  revoke: () => request("/api/v1/auth/logout", { method: "POST", headers: authHeaders() }),
  loadOidcStatus,
  authMethod,
  clearLocalSession: logout,
  clearAuthMethod,
  // 新增:本包据此发 end-session。缺省即回落今天的 GET,不会报错。
  apiUrl: (path) => `${API_BASE}${path}`,
  authToken,
};
```

可选:退出后想回别的页面(不是 `/<locale>/login`)就传 `returnTo`。

```ts
await performEnterpriseLogout(adapter, () => router.replace(`/${locale}/logged-out`), {
  returnTo: `/${locale}/login`,
});
```

后端侧对应的宿主清单(账号模型加 `oidc_id_token` 列 + 迁移 + 适配器实现 `store_id_token` /
`end_session_hint`)见 EasyFrame 的 OIDC 登出文档;前端只要上面这三件。

## 安全边界

- 上游 URL(后端返回的 `url` 与 `/status` 的 `endSessionUrl`)只认 `https:`,其余一律不导航。
- `id_token_hint` 只经由隐藏表单的 `<input type="hidden">` 出现一次:不落 URL、不落
  localStorage、不进日志。用 POST 也顺带保证它不会出现在地址栏与 Referer 里。
- `returnTo` 永远是本站相对路径,不接受绝对 URL —— 真正的 `post_logout_redirect_uri` 由后端
  用自己的 frontend base URL 拼,前端无权指定外站。
- 登出会 `abortEnterpriseIdentityChecks()`,静默复查(见 [`IDENTITY-CHECK.md`](IDENTITY-CHECK.md))
  在飞的那一次按 `aborted` 结算,**不回调宿主**(`onError` 也不发:登出途中弹「会话检查失败」纯属噪音)。
  这把闩还会一直保持到下一次整页加载:登出期间新起的复查直接以 `aborted` 结算、连 iframe 都不挂 ——
  否则 `revoke()` 那几秒里宿主的 401 重试能带回一个新 token,变成「刚退出就又登录着」。

## 导出速查

```ts
performEnterpriseLogout(adapter, redirectToLoggedOut, options?): Promise<void>
  // options: { returnTo?: string | null }
EnterpriseLogoutAdapter          // revoke / loadOidcStatus / authMethod / clearLocalSession
                                 // / clearAuthMethod / markLoggedOut? / apiUrl? / authToken?
EnterpriseEndSessionForm         // { url, method?, fields? }
EnterpriseLogoutOptions
requestEnterpriseEndSession(adapter, status, returnTo): Promise<EnterpriseEndSessionForm | null>
submitEnterpriseEndSessionForm(form): boolean
enterpriseLogoutReturnTo(pathname, locales?): string
enterpriseEndSessionPath(status): string | null
abortEnterpriseIdentityChecks(): void          // 来自 identity-check-controller
ENTERPRISE_LOGOUT_LOCALES / ENTERPRISE_END_SESSION_FORM_TEST_ID
ENTERPRISE_LOGOUT_TIMEOUT_MS                   // 3000:status / end-session / revoke 每一步的上限
ENTERPRISE_END_SESSION_NAVIGATION_TIMEOUT_MS   // 1500:提交后等导航开始的上限,到点回落 GET
resetEnterpriseIdentityCheckAbort(): void      // 只给测试用,解开上面那把登出闩
```

用例:`src/enterprise/logout.test.ts`。
