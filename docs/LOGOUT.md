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
| 1 | `authMethod()` 为 `oidc` 才 `loadOidcStatus()` | 本地口令会话不该碰 Authentik |
| 2 | `POST …/auth/oidc/end-session`(带 bearer) | 本地会话一撤销 bearer 就作废,所以必须在 `revoke()` **之前** |
| 3 | 中止所有在飞的静默身份复查 | 一次在飞的复查会在本地会话清掉之后回来,把新 token 写回宿主 —— 于是「刚退出就又登录着」 |
| 4 | `revoke()`(3 s 超时,失败不阻断)+ `clearLocalSession` / `markLoggedOut` / `clearAuthMethod` | 与今天完全一致 |
| 5 | 导航 | 见下面的回落矩阵 |

回落矩阵(任何一步失败都不会把用户卡在半截流程里):

| 情形 | 结果 |
| --- | --- |
| end-session 返回 200 且 `url` 是 https | 隐藏表单 POST 到 `url`,隐藏域就是 `fields` |
| 404 / 401 / 5xx / 网络错误 / 响应形状不对 / `url` 非 https | 回落今天的行为:`/status.endSessionUrl` 顶层 GET(同样过 https 校验) |
| 宿主适配器没给 `apiUrl` | 不发 end-session,直接走上一行的 GET 回落 —— 未升级的宿主行为不变 |
| 两者都没有 | 停在 `/<locale>/logged-out`(宿主传进来的 `redirectToLoggedOut`) |

`returnTo` 的默认值由 `window.location.pathname` 的首段推出:命中 `zh-CN` / `en` 就是
`/<locale>/login`,否则 `/login`。宿主传进来的 `returnTo` 要过和 OIDC 回调 `next` 同一把尺
(`safeInternalTarget`:必须单个 `/` 开头,`//`、反斜杠、控制字符一律丢弃回默认值)。

## 宿主要做的两件事

### 1. bump 本包的 submodule pin

`performEnterpriseLogout(adapter, redirectToLoggedOut)` 的签名没变,调用点一个字都不用改;
只 bump pin 的宿主行为与今天完全一致(走 `endSessionUrl` GET 回落)。

### 2. 在登出适配器上补两个可选成员

它们是本包唯一拿不到的东西:api base 与当前 bearer。两行都是宿主早就有的函数。

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
- `id_token_hint` 只经由隐藏表单的 `<input type="hidden">` 出现一次:不落 URL、不落
  localStorage、不进日志。用 POST 也顺带保证它不会出现在地址栏与 Referer 里。
- `returnTo` 永远是本站相对路径,不接受绝对 URL —— 真正的 `post_logout_redirect_uri` 由后端
  用自己的 frontend base URL 拼,前端无权指定外站。
- 登出会 `abortEnterpriseIdentityChecks()`,静默复查(见 [`IDENTITY-CHECK.md`](IDENTITY-CHECK.md))
  在飞的那一次按 `aborted` 结算,不再回调宿主。

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
```

用例:`src/enterprise/logout.test.ts`。
