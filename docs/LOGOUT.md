# 登出(RP-initiated logout)——宿主接线

只清本地会话不算退出。Authentik 那边的会话还在:浏览器会停在 Authentik 自己的 session-end 页,
「再次登录」直接被放行并落到 Authentik 用户门户,而不是回到应用。用户看到的是「退不干净、
回不了应用」。

本包的 `performEnterpriseLogout` 负责把这条链补完:**在撤销本地会话之前**向后端要一份
end-session 参数,本地清干净之后把它们拼进 query、用一次顶层 GET 导航到 Authentik,由
Authentik 把浏览器送回应用自己的登录页。

> 2026-09-16 修复:上游那一跳曾经是隐藏表单 POST,结果被 Authentik 的 Django CSRF 保护挡下
> (跨站 POST 一律 403「CSRF验证失败. 请求被中断.」),每个应用右上角的「退出登录」都死在那一页。
> 现在改成 GET(OIDC 的 end-session 端点 GET / POST 都认)。**宿主因此不再需要为 CSP 的
> `form-action` 放行 Authentik 源** —— `location.assign` 不受 `form-action` 管;已经加过那一源的
> 宿主留着也无害,可以顺手删掉。

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

响应里的 `method` 只是历史契约,本包不再照它行事:上游那一跳一律是 **GET**(`fields` 全部拼进
query)。Authentik 的 end-session 视图受 Django CSRF 保护,跨站 POST 只会换来 403;`id_token_hint`
虽然是一整个 JWT,但实测在网关的 URL 长度限制之内。

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
| end-session 返回 200、`url` 是 https、`fields.id_token_hint` 非空 | `location.assign(url + "?" + fields)`,一次顶层 GET(`url` 自己带 query 就用 `&` 续上) |
| 404 / 401 / 5xx / 网络错误 / 3 s 超时 / 响应形状不对 / `url` 非 https / 缺 `id_token_hint` | 回落今天的行为:`/status.endSessionUrl` 顶层 GET(同样过 https 校验) |
| 宿主适配器没给 `apiUrl`,或 `authToken()` 是空 | 不发 end-session(没 bearer 只会换来 401),直接走上一行的 GET 回落 —— 未升级的宿主行为不变 |
| 两者都没有 | 停在 `/<locale>/logged-out`(宿主传进来的 `redirectToLoggedOut`) |

「缺 `id_token_hint` 也算失败」不是洁癖:Authentik 没有有效 hint 就会忽略 `post_logout_redirect_uri`,
把用户留在自己的 session-end 页 —— 正是这条链要修的那个病。宁可回落今天的 GET。

`returnTo` 的默认值由 `window.location.pathname` 的首段推出:命中 `zh-CN` / `en` 就是
`/<locale>/login`,否则 `/login`。宿主传进来的 `returnTo` 要过和 OIDC 回调 `next` 同一把尺
(`safeInternalTarget`:必须单个 `/` 开头,`//`、反斜杠、控制字符一律丢弃回默认值)。

## 宿主要做的两件事

> 以前这里还有一条「先给 CSP 的 `form-action` 放行 Authentik 源」。上游那一跳改成 GET 之后
> **它不再是前置条件**:`location.assign` 的顶层导航不受 `form-action` 约束(那条指令只管表单
> 提交的目标)。已经放行过的宿主不用回滚,新宿主也不用再加。

### 1. bump 本包的 submodule pin

`performEnterpriseLogout(adapter, redirectToLoggedOut)` 的签名没变,调用点一个字都不用改;
只 bump pin 的宿主行为与今天完全一致(走 `endSessionUrl` GET 回落)。

### 2. 在登出适配器上补两个可选成员

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
`end_session_hint`)见 EasyFrame 的 OIDC 登出文档;前端只要上面这两件。

## 安全边界

- 上游 URL(后端返回的 `url` 与 `/status` 的 `endSessionUrl`)只认 `https:`,其余一律不导航。
- `id_token_hint` 会随这一次顶层导航出现在 URL 的 query 里(Authentik 的 CSRF 保护不接受跨站
  POST,只能走 GET)。它不落 localStorage、不进应用日志,且只是一张**注销凭证**:Authentik 校验
  完就把会话结束掉,不能拿它换任何访问权。跨源导航的 Referer 也带不走它(默认
  `strict-origin-when-cross-origin` 只发源)。
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
EnterpriseEndSessionForm         // { url, method?(忽略), fields? }
EnterpriseLogoutOptions
requestEnterpriseEndSession(adapter, status, returnTo): Promise<EnterpriseEndSessionForm | null>
enterpriseEndSessionUrl(form): string | null   // fields 拼进 query 的 GET 目标;非 https 回 null
enterpriseLogoutReturnTo(pathname, locales?): string
enterpriseEndSessionPath(status): string | null
abortEnterpriseIdentityChecks(): void          // 来自 identity-check-controller
ENTERPRISE_LOGOUT_LOCALES
ENTERPRISE_LOGOUT_TIMEOUT_MS                   // 3000:status / end-session / revoke 每一步的上限
resetEnterpriseIdentityCheckAbort(): void      // 只给测试用,解开上面那把登出闩
```

用例:`src/enterprise/logout.test.ts`。
