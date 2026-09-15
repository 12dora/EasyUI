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
  enterpriseEndSessionPath,
  enterpriseLogoutReturnTo,
  performEnterpriseLogout,
  submitEnterpriseEndSessionForm,
  type EnterpriseLogoutAdapter,
} from "./logout";
import type { EnterpriseOidcStatus } from "./auth-controller";
import { IDENTITY_CHECK_ABORTED_KIND, IDENTITY_CHECK_FRAME_TEST_ID, runSilentIdentityCheck } from "./identity-check-controller";

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
  document.body.innerHTML = "";
  window.history.replaceState(null, "", "/zh-CN/dashboard");
  vi.spyOn(HTMLFormElement.prototype, "submit").mockImplementation(function submitSpy(this: HTMLFormElement) { submitted.push(this); });
  vi.spyOn(window.location, "assign").mockImplementation((href: string | URL) => { assigned.push(String(href)); });
});

afterEach(() => {
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
    // end-session 必须排在 revoke 之前 —— 本地会话一撤销,bearer 就作废了。
    expect(calls).toEqual(["status", "revoke", "clearLocalSession", "markLoggedOut", "clearAuthMethod"]);
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

});

describe("performEnterpriseLogout fallbacks", () => {
  it("falls back to the status endSessionUrl GET when the backend answers 404", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response(404, { code: "NO_END_SESSION" })));

    await performEnterpriseLogout(makeAdapter(), () => calls.push("redirect"));

    expect(formElement()).toBeNull();
    expect(assigned).toEqual([STATUS.endSessionUrl]);
    expect(calls).not.toContain("redirect");
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

  it("aborts an in-flight silent identity check so it cannot resurrect the session", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response(404, { code: "NO_END_SESSION" })));
    const check = runSilentIdentityCheck({ silentAuthorizeUrl: "https://api.example.test/api/v1/auth/oidc/authorize?silent=1", timeoutMs: 60_000 });

    await performEnterpriseLogout(makeAdapter(), () => calls.push("redirect"));

    await expect(check).resolves.toEqual({ outcome: "error", kind: IDENTITY_CHECK_ABORTED_KIND });
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
