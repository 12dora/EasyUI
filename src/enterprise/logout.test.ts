// @vitest-environment happy-dom
// @vitest-environment-options { "settings": { "disableIframePageLoading": true } }
/**
 * User risk: 退出登录时上游 Authentik 的会话没被结束,用户以为自己退干净了,下一个人打开
 * 浏览器点「登录」会被直接放行;或者退出卡在 Authentik 自己的页面回不来。这里锁死四件事:
 * end-session 必须在本地撤销之前带着 bearer 发出去、上游那一跳必须是**顶层 GET**(带 query
 * 里的 id_token_hint / post_logout_redirect_uri,绝不再提交表单 —— Authentik 的 Django CSRF
 * 会把跨站 POST 判 403)、失败必须回落到今天的行为、上游 URL 只认 https。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  enterpriseEndSessionPath,
  enterpriseEndSessionUrl,
  enterpriseLogoutReturnTo,
  performEnterpriseLogout,
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

/** 后端给的 fields 拼进 query 之后,浏览器该被送去的那个地址。 */
const EXPECTED_END_SESSION_URL = `${FORM_BODY.url}?id_token_hint=raw.jwt.value&post_logout_redirect_uri=https%3A%2F%2Fapp.example.test%2Fzh-CN%2Flogin`;

let calls: string[];
let assigned: string[];

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

/** 这条链里再也不该有表单:任何一个 <form> 都意味着 CSRF 403 的老路又回来了。 */
function formElement(): HTMLFormElement | null {
  return document.querySelector<HTMLFormElement>("form");
}

beforeEach(() => {
  calls = [];
  assigned = [];
  // 每一步网络调用的 3 s 上限都是真实的 setTimeout;用假时钟才不会让它们在别的用例里迟到地开火。
  vi.useFakeTimers();
  resetEnterpriseIdentityCheckAbort();
  if (!document.body) document.documentElement.appendChild(document.createElement("body"));
  document.body.innerHTML = "";
  window.history.replaceState(null, "", "/zh-CN/dashboard");
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

describe("enterpriseEndSessionUrl", () => {
  it("puts every field in the query string of a plain https GET target", () => {
    expect(enterpriseEndSessionUrl(FORM_BODY)).toBe(EXPECTED_END_SESSION_URL);
    const target = new URL(enterpriseEndSessionUrl(FORM_BODY)!);
    expect(target.searchParams.get("id_token_hint")).toBe(FORM_BODY.fields.id_token_hint);
    expect(target.searchParams.get("post_logout_redirect_uri")).toBe(FORM_BODY.fields.post_logout_redirect_uri);
  });

  it("appends to an endpoint that already carries a query instead of starting a second one", () => {
    expect(enterpriseEndSessionUrl({ ...FORM_BODY, url: "https://auth.example.test/end-session/?tenant=a" }))
      .toBe("https://auth.example.test/end-session/?tenant=a&id_token_hint=raw.jwt.value&post_logout_redirect_uri=https%3A%2F%2Fapp.example.test%2Fzh-CN%2Flogin");
  });

  it("keeps the bare endpoint when the backend sends no fields", () => {
    expect(enterpriseEndSessionUrl({ url: FORM_BODY.url })).toBe(FORM_BODY.url);
  });

  it("refuses a non-https endpoint", () => {
    expect(enterpriseEndSessionUrl({ ...FORM_BODY, url: "http://auth.example.test/end-session/" })).toBeNull();
    expect(enterpriseEndSessionUrl({ ...FORM_BODY, url: "javascript:alert(1)" })).toBeNull();
  });

  it("ignores the verb the backend declares: this hop is always a GET", () => {
    // 老契约里 method 是 "POST";Authentik 的 Django CSRF 会把跨站 POST 判 403,所以本包
    // 不再照做 —— 后端将来改口说 GET 也不该把登出打回回落路径。
    expect(enterpriseEndSessionUrl({ ...FORM_BODY, method: "GET" })).toBe(EXPECTED_END_SESSION_URL);
    expect(enterpriseEndSessionUrl({ ...FORM_BODY, method: null })).toBe(EXPECTED_END_SESSION_URL);
  });
});

describe("performEnterpriseLogout", () => {
  it("asks for the end-session params with the bearer before revoking, then navigates by GET", async () => {
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
    // 那一次顶层导航严格排在 clearLocalSession 之后(否则浏览器可能带着还活着的本地会话离开本页)。
    expect(calls).toEqual(["status", "revoke", "clearLocalSession", "markLoggedOut", "clearAuthMethod", "assign"]);
    // 只导航一次,而且是 GET:hint 与回跳地址都在 query 里,页面上不留任何表单(表单 POST 会被
    // Authentik 的 Django CSRF 判 403,正是这次要修的病)。
    expect(assigned).toEqual([EXPECTED_END_SESSION_URL]);
    const target = new URL(assigned[0]!);
    expect(target.searchParams.get("id_token_hint")).toBe(FORM_BODY.fields.id_token_hint);
    expect(target.searchParams.get("post_logout_redirect_uri")).toBe(FORM_BODY.fields.post_logout_redirect_uri);
    expect(formElement()).toBeNull();
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

  it("treats a 200 without a usable id_token_hint as nothing usable at all", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response(200, { ...FORM_BODY, fields: { post_logout_redirect_uri: "https://app.example.test/zh-CN/login", id_token_hint: "  " } })));

    await performEnterpriseLogout(makeAdapter(), () => calls.push("redirect"));

    // Authentik 没有 hint 就忽略 post_logout_redirect_uri,用户停在它自己的页面 —— 不如走老的 GET。
    expect(assigned).toEqual([STATUS.endSessionUrl]);
  });

  it("still ends the upstream session when the backend declares a GET form", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response(200, { ...FORM_BODY, method: "GET" })));

    await performEnterpriseLogout(makeAdapter(), () => calls.push("redirect"));

    expect(assigned).toEqual([EXPECTED_END_SESSION_URL]);
    expect(formElement()).toBeNull();
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

  it("never appends a form and never navigates twice", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response(200, FORM_BODY)));

    await performEnterpriseLogout(makeAdapter(), () => calls.push("redirect"));
    // 一次 location.assign 就走完了:没有「提交了但页面没动」的窗口,也就不需要看门狗再补一跳。
    vi.advanceTimersByTime(10_000);

    expect(document.querySelectorAll("form")).toHaveLength(0);
    expect(assigned).toEqual([EXPECTED_END_SESSION_URL]);
    expect(calls).not.toContain("redirect");
  });

  it("keeps the https guard on both the returned end-session url and the legacy endSessionUrl", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response(200, { ...FORM_BODY, url: "http://auth.example.test/end-session/" })));
    const adapter = makeAdapter({ loadOidcStatus: async () => { calls.push("status"); return { ...STATUS, endSessionUrl: "http://auth.example.test/end-session/" }; } });

    await performEnterpriseLogout(adapter, () => calls.push("redirect"));

    expect(formElement()).toBeNull();
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
