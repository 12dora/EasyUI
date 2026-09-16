"use client";

/**
 * 退出登录(含 RP-initiated logout)。
 *
 * 只清本地会话是不够的:Authentik 那边的会话还在,下一次点「登录」会被直接放行,而且浏览器
 * 会停在 Authentik 自己的 session-end 页,再登录还落到 Authentik 用户门户 —— 用户看到的是
 * 「退不干净、回不了应用」。所以本地撤销之前,先问后端要一份 end-session 参数:
 *
 * ```
 * POST {apiBase}/auth/oidc/end-session     Authorization: Bearer <当前会话 token>
 * { "returnTo": "/zh-CN/login" }
 * → 200 { "url": "https://auth…/application/o/<slug>/end-session/", "method": "POST",
 *         "fields": { "id_token_hint": "…", "post_logout_redirect_uri": "https://app/zh-CN/login" } }
 * → 404 { "code": "NO_END_SESSION" }   本地账号 / 没存过 id_token / OIDC 未启用
 * ```
 *
 * 顺序是硬性的:这一步必须在 `revoke()` **之前**(那时本地 bearer 还有效),拿到参数之后才
 * 撤销本地会话。任何一步失败都回落到今天的行为(`/status.endSessionUrl` 顶层 GET),没有
 * `endSessionUrl` 就留在 `/<locale>/logged-out`,绝不把用户卡在半截流程里。
 *
 * navigate 走 **GET**(`fields` 拼进 query,`location.assign` 一次顶层导航),不是隐藏表单
 * POST:Authentik 的 end-session 视图挂着 Django 的 CSRF 保护,跨站 POST 一律 403
 * 「CSRF验证失败」,而 OIDC RP-initiated logout 本来就允许 GET。也正因为不再提交表单,
 * **宿主不再需要为 CSP 的 `form-action` 放行 Authentik 源**(`location.assign` 受
 * `form-action` 管不着),那条前置条件已作废;提交后等导航开始的那层看门狗也一并去掉了。
 */

import { safeInternalTarget, type EnterpriseOidcStatus } from "./auth-controller";
import { abortEnterpriseIdentityChecks } from "./identity-check-controller";

/** 宿主支持的 locale 前缀;`returnTo` 默认按它从 pathname 推出来。 */
export const ENTERPRISE_LOGOUT_LOCALES = ["zh-CN", "en"] as const;
/** `/status` / end-session / `revoke` 每一步的上限:网络挂住也不能让用户「点了登出没反应」。 */
export const ENTERPRISE_LOGOUT_TIMEOUT_MS = 3000;

/** 后端 `POST /auth/oidc/end-session` 的 200 响应:上游端点 + 要带过去的参数。 */
export interface EnterpriseEndSessionForm {
  /** 上游 end-session 端点,必须是 https。 */
  url: string;
  /**
   * 后端建议的动词。仅作历史契约保留:本包一律按 GET 导航(Authentik 的 CSRF 保护挡跨站
   * POST),所以这里给什么都不改变行为。
   */
  method?: string | null;
  /** 要拼进 query 的参数:必须含 `id_token_hint`,外加可选的 `post_logout_redirect_uri`。 */
  fields?: Record<string, string> | null;
}

export interface EnterpriseLogoutAdapter {
  revoke(): Promise<unknown>;
  loadOidcStatus(): Promise<EnterpriseOidcStatus>;
  authMethod(): "local" | "oidc" | null;
  clearLocalSession(): void;
  clearAuthMethod(): void;
  markLoggedOut?(): void;
  /** 可选:把后端相对路径拼成绝对 URL(宿主已有的 API base)。不给就跳过 end-session,回落今天的 GET。 */
  apiUrl?(path: string): string;
  /** 可选:当前会话的 bearer token。end-session 要在本地会话还活着时带上它;缺了就跳过,不发注定 401 的请求。 */
  authToken?(): string | null;
}

export interface EnterpriseLogoutOptions {
  /** 覆盖登出后要返回的宿主路径(单个 `/` 开头的相对路径);默认 `/<locale>/login`。 */
  returnTo?: string | null;
}

/** pathname 的首段命中支持的 locale 就回 `/<locale>/login`,否则 `/login`。 */
export function enterpriseLogoutReturnTo(pathname: string, locales: readonly string[] = ENTERPRISE_LOGOUT_LOCALES): string {
  const first = pathname.replace(/^\/+/, "").split("/")[0] ?? "";
  return locales.includes(first) ? `/${first}/login` : "/login";
}

/**
 * end-session 端点的相对路径。后端显式给了 `endSessionPath` 就用它,否则从 `authorizePath`
 * 推(同一个 api base 下的兄弟路由)—— 本包不硬编码 `/api/v1`,宿主可以换 api base。
 */
export function enterpriseEndSessionPath(status: EnterpriseOidcStatus): string | null {
  const explicit = status.endSessionPath?.trim();
  if (explicit) return explicit.startsWith("/") ? explicit : null;
  const authorize = status.authorizePath?.trim().split("?")[0]?.replace(/\/+$/, "") ?? "";
  if (!authorize.startsWith("/") || !authorize.endsWith("/authorize")) return null;
  return `${authorize.slice(0, -"/authorize".length)}/end-session`;
}

function readEndSessionFields(raw: unknown): Record<string, string> {
  const fields: Record<string, string> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fields;
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string") fields[name] = value;
  }
  return fields;
}

function readEndSessionForm(body: unknown): EnterpriseEndSessionForm | null {
  if (!body || typeof body !== "object") return null;
  const record = body as { url?: unknown; method?: unknown; fields?: unknown };
  const url = typeof record.url === "string" ? record.url.trim() : "";
  // 上游 URL 来自后端,但它最终会被顶层导航用掉:https 之外一律不认(与今天的 endSessionUrl 同一把尺)。
  if (!url || !isSafeHttpsUrl(url)) return null;
  const fields = readEndSessionFields(record.fields);
  // 没有 hint 的请求在 Authentik 那边等于白发:它会忽略 post_logout_redirect_uri,把用户留在
  // 自己的 session-end 页 —— 正是这条链要修的病。宁可回落今天的 GET。
  const hint = fields.id_token_hint;
  if (!hint || !hint.trim()) return null;
  return { url, fields };
}

/**
 * 向后端要 end-session 参数。必须在本地会话被撤销之前调用。
 *
 * 404(`NO_END_SESSION`)、401、5xx、网络错误、响应形状不对 —— 一律回 `null`,由调用方回落。
 */
export async function requestEnterpriseEndSession(adapter: EnterpriseLogoutAdapter, status: EnterpriseOidcStatus, returnTo: string): Promise<EnterpriseEndSessionForm | null> {
  const path = enterpriseEndSessionPath(status);
  const token = adapter.authToken?.()?.trim();
  // 没有 api base 或没有 bearer 就发不出有效请求(后端只会回 401),直接按回落处理。
  if (!path || !adapter.apiUrl || !token) return null;
  const response = await fetch(adapter.apiUrl(path), {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ returnTo }),
  });
  if (!response.ok) return null;
  return readEndSessionForm(await response.json());
}

/**
 * 把后端给的 end-session 参数拼成一个可直接导航的 GET URL(`fields` 进 query)。
 *
 * 用 GET 而不是表单 POST:Authentik 的 end-session 视图受 Django CSRF 保护,跨站 POST 只会
 * 换来 403「CSRF验证失败」,而 OIDC 规范对 end-session 端点 GET / POST 都认。URL 非 https
 * 就回 `null`,由调用方继续回落 —— 这时本地会话已经清了,绝不能把用户扔在原地。
 */
export function enterpriseEndSessionUrl(form: EnterpriseEndSessionForm): string | null {
  if (!isSafeHttpsUrl(form.url)) return null;
  const query = new URLSearchParams(form.fields ?? {}).toString();
  if (!query) return form.url;
  return `${form.url}${form.url.includes("?") ? "&" : "?"}${query}`;
}

async function prepareEndSession(adapter: EnterpriseLogoutAdapter, status: EnterpriseOidcStatus, returnTo: string | null | undefined): Promise<EnterpriseEndSessionForm | null> {
  const target = safeInternalTarget(returnTo ?? null, enterpriseLogoutReturnTo(window.location.pathname));
  try {
    return await withTimeout(requestEnterpriseEndSession(adapter, status, target), ENTERPRISE_LOGOUT_TIMEOUT_MS);
  } catch {
    return null;
  }
}

/**
 * 退出登录。OIDC 会话按 end-session GET → 今天的 `endSessionUrl` GET → 留在 logged-out
 * 三级回落;本地会话只清本地。`options.returnTo` 让宿主指定回哪个页面(默认 `/<locale>/login`)。
 *
 * 撤销之前的两个网络调用都有 3 s 上限:上游挂住时按「拿不到参数」继续走,本地会话照样清掉 ——
 * 卡在一半(本地还登着、页面不动)比退不干净更糟。
 */
export async function performEnterpriseLogout(adapter: EnterpriseLogoutAdapter, redirectToLoggedOut: () => void, options?: EnterpriseLogoutOptions): Promise<void> {
  const method = adapter.authMethod();
  const status = method === "oidc" ? await withTimeout(adapter.loadOidcStatus(), ENTERPRISE_LOGOUT_TIMEOUT_MS).catch(() => null) : null;
  const form = status ? await prepareEndSession(adapter, status, options?.returnTo) : null;
  // 在飞的静默复查会在本地会话清掉之后拿回一个新 token 写进 localStorage —— 先把它掐掉再撤销。
  abortEnterpriseIdentityChecks();
  await withTimeout(adapter.revoke(), ENTERPRISE_LOGOUT_TIMEOUT_MS).catch(() => undefined);
  adapter.clearLocalSession(); adapter.markLoggedOut?.(); adapter.clearAuthMethod();
  navigateAfterEnterpriseLogout(form, status, redirectToLoggedOut);
}

/** 三级回落:带 hint 的 end-session GET → 今天的 `endSessionUrl` 顶层 GET → 留在 logged-out 页。 */
function navigateAfterEnterpriseLogout(form: EnterpriseEndSessionForm | null, status: EnterpriseOidcStatus | null, redirectToLoggedOut: () => void): void {
  const target = form ? enterpriseEndSessionUrl(form) : null;
  if (target) { window.location.assign(target); return; }
  const url = status?.endSessionUrl?.trim();
  if (url && isSafeHttpsUrl(url)) { window.location.assign(url); return; }
  redirectToLoggedOut();
}

function isSafeHttpsUrl(value: string) { try { return new URL(value).protocol === "https:"; } catch { return false; } }
function withTimeout<T>(promise: Promise<T>, ms: number) { return new Promise<T>((resolve, reject) => { const timer = setTimeout(() => reject(new Error("timeout")), ms); promise.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); }); }); }
