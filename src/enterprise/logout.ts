"use client";

/**
 * 退出登录(含 RP-initiated logout)。
 *
 * 只清本地会话是不够的:Authentik 那边的会话还在,下一次点「登录」会被直接放行,而且浏览器
 * 会停在 Authentik 自己的 session-end 页,再登录还落到 Authentik 用户门户 —— 用户看到的是
 * 「退不干净、回不了应用」。所以本地撤销之前,先问后端要一份 end-session 表单:
 *
 * ```
 * POST {apiBase}/auth/oidc/end-session     Authorization: Bearer <当前会话 token>
 * { "returnTo": "/zh-CN/login" }
 * → 200 { "url": "https://auth…/application/o/<slug>/end-session/", "method": "POST",
 *         "fields": { "id_token_hint": "…", "post_logout_redirect_uri": "https://app/zh-CN/login" } }
 * → 404 { "code": "NO_END_SESSION" }   本地账号 / 没存过 id_token / OIDC 未启用
 * ```
 *
 * 顺序是硬性的:这一步必须在 `revoke()` **之前**(那时本地 bearer 还有效),拿到表单之后才
 * 撤销本地会话。navigate 走隐藏表单 POST 而不是 GET —— 带钉钉声明的 id_token 很长,GET 会被
 * 网关按 414 截断。任何一步失败都回落到今天的行为(`/status.endSessionUrl` 顶层 GET),没有
 * `endSessionUrl` 就留在 `/<locale>/logged-out`,绝不把用户卡在半截流程里。
 */

import { safeInternalTarget, type EnterpriseOidcStatus } from "./auth-controller";
import { abortEnterpriseIdentityChecks } from "./identity-check-controller";

/** 宿主支持的 locale 前缀;`returnTo` 默认按它从 pathname 推出来。 */
export const ENTERPRISE_LOGOUT_LOCALES = ["zh-CN", "en"] as const;
/** 隐藏 end-session 表单的 data-test-id;宿主不要依赖它,只给测试用。 */
export const ENTERPRISE_END_SESSION_FORM_TEST_ID = "enterprise-end-session-form";

/** 后端 `POST /auth/oidc/end-session` 的 200 响应:一份待自动提交的表单。 */
export interface EnterpriseEndSessionForm {
  /** 上游 end-session 端点,必须是 https。 */
  url: string;
  /** 默认 POST;后端显式给 GET 时才用 GET。 */
  method?: string | null;
  /** 隐藏域:`id_token_hint`、可选的 `post_logout_redirect_uri`。 */
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
  /** 可选:当前会话的 bearer token。end-session 要在本地会话还活着时带上它。 */
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
  const method = typeof record.method === "string" && record.method.trim().toUpperCase() === "GET" ? "GET" : "POST";
  return { url, method, fields: readEndSessionFields(record.fields) };
}

/**
 * 向后端要 end-session 表单。必须在本地会话被撤销之前调用。
 *
 * 404(`NO_END_SESSION`)、401、5xx、网络错误、响应形状不对 —— 一律回 `null`,由调用方回落。
 */
export async function requestEnterpriseEndSession(adapter: EnterpriseLogoutAdapter, status: EnterpriseOidcStatus, returnTo: string): Promise<EnterpriseEndSessionForm | null> {
  const path = enterpriseEndSessionPath(status);
  if (!path || !adapter.apiUrl) return null;
  const token = adapter.authToken?.();
  const response = await fetch(adapter.apiUrl(path), {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ returnTo }),
  });
  if (!response.ok) return null;
  return readEndSessionForm(await response.json());
}

/**
 * 隐藏表单自动提交到上游 end-session 端点。
 *
 * 用表单 POST 而不是 `location.assign` 的唯一原因是长度:`id_token_hint` 是一整个 JWT。
 */
export function submitEnterpriseEndSessionForm(form: EnterpriseEndSessionForm): boolean {
  if (!isSafeHttpsUrl(form.url)) return false;
  const element = document.createElement("form");
  element.setAttribute("method", (form.method ?? "POST").toUpperCase() === "GET" ? "GET" : "POST");
  element.setAttribute("action", form.url);
  element.setAttribute("data-test-id", ENTERPRISE_END_SESSION_FORM_TEST_ID);
  element.hidden = true;
  element.style.display = "none";
  for (const [name, value] of Object.entries(form.fields ?? {})) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    element.appendChild(input);
  }
  document.body.appendChild(element);
  element.submit();
  return true;
}

async function prepareEndSession(adapter: EnterpriseLogoutAdapter, status: EnterpriseOidcStatus, returnTo: string | null | undefined): Promise<EnterpriseEndSessionForm | null> {
  const target = safeInternalTarget(returnTo ?? null, enterpriseLogoutReturnTo(window.location.pathname));
  try {
    return await requestEnterpriseEndSession(adapter, status, target);
  } catch {
    return null;
  }
}

/**
 * 退出登录。OIDC 会话按 end-session 表单 → 今天的 `endSessionUrl` GET → 留在 logged-out
 * 三级回落;本地会话只清本地。`options.returnTo` 让宿主指定回哪个页面(默认 `/<locale>/login`)。
 */
export async function performEnterpriseLogout(adapter: EnterpriseLogoutAdapter, redirectToLoggedOut: () => void, options?: EnterpriseLogoutOptions): Promise<void> {
  const method = adapter.authMethod();
  const status = method === "oidc" ? await adapter.loadOidcStatus().catch(() => null) : null;
  const form = status ? await prepareEndSession(adapter, status, options?.returnTo) : null;
  // 在飞的静默复查会在本地会话清掉之后拿回一个新 token 写进 localStorage —— 先把它掐掉再撤销。
  abortEnterpriseIdentityChecks();
  await withTimeout(adapter.revoke(), 3000).catch(() => undefined);
  adapter.clearLocalSession(); adapter.markLoggedOut?.(); adapter.clearAuthMethod();
  navigateAfterEnterpriseLogout(form, status, redirectToLoggedOut);
}

/** 三级回落:end-session 表单 POST → 今天的 `endSessionUrl` 顶层 GET → 留在 logged-out 页。 */
function navigateAfterEnterpriseLogout(form: EnterpriseEndSessionForm | null, status: EnterpriseOidcStatus | null, redirectToLoggedOut: () => void): void {
  if (form && submitEnterpriseEndSessionForm(form)) return;
  const url = status?.endSessionUrl?.trim();
  if (url && isSafeHttpsUrl(url)) { window.location.assign(url); return; }
  redirectToLoggedOut();
}

function isSafeHttpsUrl(value: string) { try { return new URL(value).protocol === "https:"; } catch { return false; } }
function withTimeout<T>(promise: Promise<T>, ms: number) { return new Promise<T>((resolve, reject) => { const timer = setTimeout(() => reject(new Error("timeout")), ms); promise.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); }); }); }
