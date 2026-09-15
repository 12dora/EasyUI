// @vitest-environment happy-dom
// @vitest-environment-options { "settings": { "disableIframePageLoading": true } }
/**
 * User risk: 退出登录时上游 Authentik 的会话没被结束,用户以为自己退干净了,下一个人打开
 * 浏览器点「登录」会被直接放行;或者退出卡在 Authentik 自己的页面回不来。这里锁死三件事:
 * end-session 必须在本地撤销之前带着 bearer 发出去、失败必须回落到今天的行为、上游 URL
 * 只认 https。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ENTERPRISE_END_SESSION_FORM_TEST_ID,
  ENTERPRISE_END_SESSION_NAVIGATION_TIMEOUT_MS,
  enterpriseEndSessionPath,
  enterpriseLogoutReturnTo,
  performEnterpriseLogout,
  submitEnterpriseEndSessionForm,
  type EnterpriseLogoutAdapter,
} from "./logout";
import type { EnterpriseOidcStatus } from "./auth-controller";
import {
  IDENTITY_CHECK_ABORTED_KIND,
  IDENTITY_CHECK_FRAME_TEST_ID,
  resetEnterpriseIdentityCheckAbort,
  runSilentIdentityCheck,
} from "./identity-check-controller";

const STATUS: EnterpriseOidcStatus = {
  enabled: true,
  authorizePath: "/api/v1/auth/oidc/authorize",
  silentAuthorizePath: "/api/v1/auth/oidc/authorize?silent=1",
  endSessionUrl: "https://auth.example.test/application/o/app/end-session/",
};

const FORM_BODY = {
  url: "https://auth.example.test/application/o/app/end-session/",
  method: "POST",
  fields: { id_token_hint: "raw.jwt.value", post_logout_redirect_uri: "https://app.example.test/zh-CN/login" },
};

let calls: string[];
let assigned: string[];
let submitted: HTMLFormElement[];

function response(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

function makeAdapter(overrides: Partial<EnterpriseLogoutAdapter> = {}): EnterpriseLogoutAdapter {
  return {
    revoke: async () => { calls.push("revoke"); },
    loadOidcStatus: async () => { calls.push("status"); return STATUS; },
    authMethod: () => "oidc",
    clearLocalSession: () => calls.push("clearLocalSession"),
    clearAuthMethod: () => calls.push("clearAuthMethod"),
    markLoggedOut: () => calls.push("markLoggedOut"),
    apiUrl: (path: string) => `https://api.example.test${path}`,
    authToken: () => "session-token",
    ...overrides,
  };
}

function formElement(): HTMLFormElement | null {
  return document.querySelector<HTMLFormElement>(`form[data-test-id='${ENTERPRISE_END_SESSION_FORM_TEST_ID}']`);
}

function hiddenFields(form: HTMLFormElement): Record<string, string> {
  const entries = [...form.querySelectorAll<HTMLInputElement>("input")].map((input) => [input.name, input.value] as const);
  return Object.fromEntries(entries);
}

beforeEach(() => {
  calls = [];
  assigned = [];
  submitted = [];
  // 提交后的「导航没开始」看门狗是一个真实的 setTimeout;用假时钟才能既断言它、又不让它在
  // 别的用例里迟到地开火。
  vi.useFakeTimers();
  resetEnterpriseIdentityCheckAbort();
  if (!document.body) document.documentElement.appendChild(document.createElement("body"));
  document.body.innerHTML = "";
  // 「document 没有 body」那个用例会把表单挂到 <html> 上,别让它漏进下一个用例。
  for (const stale of document.querySelectorAll(`form[data-test-id='${ENTERPRISE_END_SESSION_FORM_TEST_ID}']`)) stale.remove();
  window.history.replaceState(null, "", "/zh-CN/dashboard");
  vi.spyOn(HTMLFormElement.prototype, "submit").mockImplementation(function submitSpy(this: HTMLFormElement) { calls.push("submit"); submitted.push(this); });
  vi.spyOn(window.location, "assign").mockImplementation((href: string | URL) => { calls.push("assign"); assigned.push(String(href)); });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("enterpriseLogoutReturnTo", () => {
  it("uses the first path segment when it is a supported locale", () => {
    expect(enterpriseLogoutReturnTo("/zh-CN/orders/42")).toBe("/zh-CN/login");
    expect(enterpriseLogoutReturnTo("/en")).toBe("/en/login");
  });

  it("falls back to a locale-less login path for anything else", () => {
    expect(enterpriseLogoutReturnTo("/orders/42")).toBe("/login");
    expect(enterpriseLogoutReturnTo("/")).toBe("/login");
    expect(enterpriseLogoutReturnTo("/fr/orders")).toBe("/login");
  });
});

describe("enterpriseEndSessionPath", () => {
  it("derives the sibling route from authorizePath instead of hardcoding an api base", () => {
    expect(enterpriseEndSessionPath(STATUS)).toBe("/api/v1/auth/oidc/end-session");
    expect(enterpriseEndSessionPath({ ...STATUS, authorizePath: "/backend/auth/oidc/authorize" })).toBe("/backend/auth/oidc/end-session");
  });

  it("prefers an explicit endSessionPath and rejects a non-derivable one", () => {
    expect(enterpriseEndSessionPath({ ...STATUS, endSessionPath: "/api/v2/auth/oidc/end-session" })).toBe("/api/v2/auth/oidc/end-session");
    expect(enterpriseEndSessionPath({ ...STATUS, authorizePath: "/api/v1/auth/oidc/start" })).toBeNull();
    expect(enterpriseEndSessionPath({ ...STATUS, authorizePath: "https://evil.test/authorize" })).toBeNull();
  });
});

describe("submitEnterpriseEndSessionForm", () => {
  it("appends a hidden POST form with one input per field and submits it", () => {
    expect(submitEnterpriseEndSessionForm(FORM_BODY)).toBe(true);
    const form = formElement();
    expect(form).not.toBeNull();
    expect(form?.getAttribute("method")).toBe("POST");
    expect(form?.getAttribute("action")).toBe(FORM_BODY.url);
    expect(form?.hidden).toBe(true);
    expect(hiddenFields(form!)).toEqual(FORM_BODY.fields);
    expect([...form!.querySelectorAll("input")].every((input) => input.type === "hidden")).toBe(true);
    expect(submitted).toEqual([form]);
  });

  it("refuses a non-https action and submits nothing", () => {
    expect(submitEnterpriseEndSessionForm({ ...FORM_BODY, url: "http://auth.example.test/end-session/" })).toBe(false);
    expect(formElement()).toBeNull();
    expect(submitted).toEqual([]);
  });

  it("refuses a GET form so the JWT never lands in a query string", () => {
    expect(submitEnterpriseEndSessionForm({ ...FORM_BODY, method: "GET" })).toBe(false);
    expect(formElement()).toBeNull();
    expect(submitted).toEqual([]);
  });

  it("reports failure (instead of throwing) when submit() itself blows up, and leaves no orphan form", () => {
    vi.spyOn(HTMLFormElement.prototype, "submit").mockImplementation(() => { throw new TypeError("submit is not a function"); });
    expect(submitEnterpriseEndSessionForm(FORM_BODY)).toBe(false);
    expect(formElement()).toBeNull();
  });

  it("still submits when the document has no body left (mid-unload)", () => {
    document.body.remove();
    expect(document.body).toBeNull();
    expect(submitEnterpriseEndSessionForm(FORM_BODY)).toBe(true);
    expect(submitted).toHaveLength(1);
    expect(submitted[0]?.parentElement).toBe(document.documentElement);
  });
});

describe("performEnterpriseLogout", () => {
  it("asks for the end-session form with the bearer before revoking, then POSTs it", async () => {
    const fetchMock = vi.fn(async () => response(200, FORM_BODY));
    vi.stubGlobal("fetch", fetchMock);

    await performEnterpriseLogout(makeAdapter(), () => calls.push("redirect"));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.example.test/api/v1/auth/oidc/end-session");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer session-token");
    expect(JSON.parse(String(init.body))).toEqual({ returnTo: "/zh-CN/login" });
    // 一条时间线上锁两件事:end-session 排在 revoke 之前(本地会话一撤销 bearer 就作废),
    // 表单提交严格排在 clearLocalSession 之后(否则浏览器可能带着还活着的本地会话离开本页)。
    expect(calls).toEqual(["status", "revoke", "clearLocalSession", "markLoggedOut", "clearAuthMethod", "submit"]);
    expect(hiddenFields(formElement()!)).toEqual(FORM_BODY.fields);
    expect(submitted).toHaveLength(1);
    expect(assigned).toEqual([]);
  });

  it("sends the host's returnTo override when one is given", async () => {
    const fetchMock = vi.fn(async () => response(200, FORM_BODY));
    vi.stubGlobal("fetch", fetchMock);

    await performEnterpriseLogout(makeAdapter(), () => calls.push("redirect"), { returnTo: "/en/goodbye" });

    expect(JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ returnTo: "/en/goodbye" });
  });

  it("ignores an off-site returnTo override and keeps the locale default", async () => {
    const fetchMock = vi.fn(async () => response(200, FORM_BODY));
    vi.stubGlobal("fetch", fetchMock);

    await performEnterpriseLogout(makeAdapter(), () => calls.push("redirect"), { returnTo: "//evil.test/login" });

    expect(JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ returnTo: "/zh-CN/login" });
  });

  // returnTo 会被后端拼成 post_logout_redirect_uri:放进去的任何外站形态都是一次开放重定向。
  it.each([
    ["backslash", "/en\\evil.test/login"],
    ["absolute http", "http://evil.test/login"],
    ["javascript scheme", "javascript:alert(1)"],
    ["control character", "/en/login\u0000/x"],
    ["protocol-relative", "//evil.test/login"],
    ["empty", ""],
  ])("drops a %s returnTo override and sends the locale default instead", async (_label, override) => {
    const fetchMock = vi.fn(async () => response(200, FORM_BODY));
    vi.stubGlobal("fetch", fetchMock);

    await performEnterpriseLogout(makeAdapter(), () => calls.push("redirect"), { returnTo: override });

    expect(JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ returnTo: "/zh-CN/login" });
  });

});

describe("performEnterpriseLogout fallbacks", () => {
  it("falls back to the status endSessionUrl GET when the backend answers 404", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response(404, { code: "NO_END_SESSION" })));

    await performEnterpriseLogout(makeAdapter(), () => calls.push("redirect"));

    expect(formElement()).toBeNull();
    expect(assigned).toEqual([STATUS.endSessionUrl]);
    expect(calls).not.toContain("redirect");
  });

  it("falls back to the status endSessionUrl GET on a 401 (bearer already gone / host not upgraded)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response(401, { detail: "unauthorized" })));

    await performEnterpriseLogout(makeAdapter(), () => calls.push("redirect"));

    expect(formElement()).toBeNull();
    expect(assigned).toEqual([STATUS.endSessionUrl]);
  });

  it("treats a 200 without a usable id_token_hint as no form at all", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response(200, { ...FORM_BODY, fields: { post_logout_redirect_uri: "https://app.example.test/zh-CN/login", id_token_hint: "  " } })));

    await performEnterpriseLogout(makeAdapter(), () => calls.push("redirect"));

    // Authentik 没有 hint 就忽略 post_logout_redirect_uri,用户停在它自己的页面 —— 不如走 GET。
    expect(submitted).toEqual([]);
    expect(assigned).toEqual([STATUS.endSessionUrl]);
  });

  it("refuses a backend-declared GET form and falls back", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response(200, { ...FORM_BODY, method: "GET" })));

    await performEnterpriseLogout(makeAdapter(), () => calls.push("redirect"));

    expect(submitted).toEqual([]);
    expect(assigned).toEqual([STATUS.endSessionUrl]);
  });

  it("falls back to the status endSessionUrl GET when the end-session call throws", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("network down"); }));

    await performEnterpriseLogout(makeAdapter(), () => calls.push("redirect"));

    expect(assigned).toEqual([STATUS.endSessionUrl]);
  });

  it("stays on the logged-out page when there is no end-session form and no endSessionUrl", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response(404, { code: "NO_END_SESSION" })));
    const adapter = makeAdapter({ loadOidcStatus: async () => { calls.push("status"); return { ...STATUS, endSessionUrl: null }; } });

    await performEnterpriseLogout(adapter, () => calls.push("redirect"));

    expect(assigned).toEqual([]);
    expect(formElement()).toBeNull();
    expect(calls).toContain("redirect");
  });

  it("navigates by GET when the form POST is silently blocked (host CSP form-action)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response(200, FORM_BODY)));

    await performEnterpriseLogout(makeAdapter(), () => calls.push("redirect"));

    // 提交同步返回了,但页面没有开始离开:CSP 把它拦掉了,而本地会话已经清了。
    expect(submitted).toHaveLength(1);
    expect(assigned).toEqual([]);
    vi.advanceTimersByTime(ENTERPRISE_END_SESSION_NAVIGATION_TIMEOUT_MS);
    expect(assigned).toEqual([STATUS.endSessionUrl]);
  });

  it("does not double-navigate once the browser really starts leaving the page", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response(200, FORM_BODY)));

    await performEnterpriseLogout(makeAdapter(), () => calls.push("redirect"));
    window.dispatchEvent(new Event("pagehide"));
    vi.advanceTimersByTime(ENTERPRISE_END_SESSION_NAVIGATION_TIMEOUT_MS * 4);

    expect(assigned).toEqual([]);
    expect(calls).not.toContain("redirect");
  });

  it("keeps the https guard on both the returned form action and the legacy endSessionUrl", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response(200, { ...FORM_BODY, url: "http://auth.example.test/end-session/" })));
    const adapter = makeAdapter({ loadOidcStatus: async () => { calls.push("status"); return { ...STATUS, endSessionUrl: "http://auth.example.test/end-session/" }; } });

    await performEnterpriseLogout(adapter, () => calls.push("redirect"));

    expect(formElement()).toBeNull();
    expect(submitted).toEqual([]);
    expect(assigned).toEqual([]);
    expect(calls).toContain("redirect");
  });

});

describe("performEnterpriseLogout on hosts that cannot end the upstream session", () => {
  it("does not call end-session for a local session and never touches Authentik", async () => {
    const fetchMock = vi.fn(async () => response(200, FORM_BODY));
    vi.stubGlobal("fetch", fetchMock);

    await performEnterpriseLogout(makeAdapter({ authMethod: () => "local" }), () => calls.push("redirect"));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(calls).toEqual(["revoke", "clearLocalSession", "markLoggedOut", "clearAuthMethod", "redirect"]);
    expect(assigned).toEqual([]);
  });

  it("skips end-session (and still logs out) when the host adapter exposes no apiUrl", async () => {
    const fetchMock = vi.fn(async () => response(200, FORM_BODY));
    vi.stubGlobal("fetch", fetchMock);
    const adapter = makeAdapter();
    delete (adapter as { apiUrl?: unknown }).apiUrl;

    await performEnterpriseLogout(adapter, () => calls.push("redirect"));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(assigned).toEqual([STATUS.endSessionUrl]);
  });

  it("skips end-session (and still logs out) when the host adapter has no bearer to send", async () => {
    const fetchMock = vi.fn(async () => response(200, FORM_BODY));
    vi.stubGlobal("fetch", fetchMock);

    await performEnterpriseLogout(makeAdapter({ authToken: () => "  " }), () => calls.push("redirect"));

    // 没有 bearer 的请求只会换来一个 401,不如直接走回落。
    expect(fetchMock).not.toHaveBeenCalled();
    expect(assigned).toEqual([STATUS.endSessionUrl]);
  });

  it("aborts an in-flight silent identity check so it cannot resurrect the session", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response(404, { code: "NO_END_SESSION" })));
    const check = runSilentIdentityCheck({ silentAuthorizeUrl: "https://api.example.test/api/v1/auth/oidc/authorize?silent=1", timeoutMs: 60_000 });

    await performEnterpriseLogout(makeAdapter(), () => calls.push("redirect"));

    await expect(check).resolves.toEqual({ outcome: "error", kind: IDENTITY_CHECK_ABORTED_KIND });
    expect(document.querySelector(`[data-test-id='${IDENTITY_CHECK_FRAME_TEST_ID}']`)).toBeNull();
  });

  it("latches the abort so a check started during logout never mounts a frame", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response(404, { code: "NO_END_SESSION" })));

    await performEnterpriseLogout(makeAdapter(), () => calls.push("redirect"));
    // 登出途中宿主的 401 拦截器 / 轮询会再起一次复查 —— 它不在刚才掐过的那一批里。
    const late = runSilentIdentityCheck({ silentAuthorizeUrl: "https://api.example.test/api/v1/auth/oidc/authorize?silent=1", timeoutMs: 60_000 });

    await expect(late).resolves.toEqual({ outcome: "error", kind: IDENTITY_CHECK_ABORTED_KIND });
    expect(document.querySelector(`[data-test-id='${IDENTITY_CHECK_FRAME_TEST_ID}']`)).toBeNull();
  });

  it("logs out even when loading the OIDC status fails", async () => {
    const fetchMock = vi.fn(async () => response(200, FORM_BODY));
    vi.stubGlobal("fetch", fetchMock);
    const adapter = makeAdapter({ loadOidcStatus: async () => { throw new Error("offline"); } });

    await performEnterpriseLogout(adapter, () => calls.push("redirect"));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(calls).toEqual(["revoke", "clearLocalSession", "markLoggedOut", "clearAuthMethod", "redirect"]);
  });
});
