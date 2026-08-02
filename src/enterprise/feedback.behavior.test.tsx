// @vitest-environment happy-dom
/**
 * User risk: toast-only warnings/failures must not also rewrite the page, and
 * permission denial must never strand a user when a host forgets an override.
 */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { toast, toastBus } from "../toast";
import { EnterpriseAccessSettingsSurface, type EnterpriseAccessSettingsAdapter } from "./access-settings-surface";
import { EnterpriseLoginController, type EnterpriseLoginAdapter } from "./auth-controller";
import { EnterpriseAuthorizationWorkspace, type EnterpriseAuthorizationAdapter, type EnterpriseAuthzStatus } from "./authorization-workspace";
import { createEnterpriseLabelCatalog } from "./label-catalog";
import { EnterpriseFooterSettingsSurface, type EnterpriseFooterSettingsAdapter } from "./footer-settings-surface";
import { EnterprisePasswordRecoverySurface } from "./page-frames";
import { EnterpriseAccountSecuritySurface, type EnterpriseSecurityAdapter } from "./security-workspace";
import { EnterpriseUpstreamHealthController, type EnterpriseUpstreamHealthAdapter } from "./upstream-health-controller";
import { byTestId, click, input, installReducedMotion, mount, settle, type MountedView } from "./behavior-test-utils";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const labels = createEnterpriseLabelCatalog("en", { appName: "Test", appDescription: "Test" }, "business");
let view: MountedView | null = null;

interface TotpRefreshCase {
  enabled: boolean;
  statusTestId: string;
  actionTestId: string;
}

beforeEach(() => {
  installReducedMotion(true);
  toastBus.clear();
});

afterEach(async () => {
  await view?.unmount();
  view = null;
  toastBus.clear();
  vi.restoreAllMocks();
});

describe("FE-FB-02 permission-denial recovery", () => {
  it("renders a default navigation action for every toast-mode denial when callers omit actions", async () => {
    window.history.replaceState(null, "", "/en/app/settings/access");
    const denied = [
      <EnterpriseAccountSecuritySurface
        key="security"
        adapter={{} as EnterpriseSecurityAdapter}
        labels={labels.security}
        permissions={{ password: false, totpStatus: false, createTotp: false, disableTotp: false, viewPasskeys: false, canRegisterPasskeys: false, canDeletePasskeys: false }}
        feedbackMode="toast"
      />,
      <EnterpriseAccessSettingsSurface
        key="access"
        adapter={{} as EnterpriseAccessSettingsAdapter}
        labels={labels.access}
        permissions={{ viewIdentity: false, manageIdentity: false, viewAuthorization: false, manageAuthorization: false }}
        locale="en"
        feedbackMode="toast"
      />,
      <EnterpriseUpstreamHealthController
        key="upstream"
        adapter={{} as EnterpriseUpstreamHealthAdapter}
        labels={labels.upstream}
        locale="en"
        canView={false}
        canManage={false}
        feedbackMode="toast"
      />,
    ];

    view = await mount(<>{denied}</>);
    const states = [...view.host.querySelectorAll("[data-test-id='permission-denied']")];
    expect(states).toHaveLength(3);
    for (const state of states) {
      const link = state.querySelector("a");
      expect(new URL(link!.href).pathname).toBe("/en/app");
      expect(link?.textContent).toBe("Back to workbench");
    }
    expect(toastBus.getSnapshot()).toHaveLength(0);
  });
});

describe("FE-FB-04 authentication warning transitions", () => {
  it("warns exactly once on entry to an unsupported passkey pane and renders no inline warning paragraph", async () => {
    Object.defineProperty(window, "PublicKeyCredential", { configurable: true, value: undefined });
    const warning = vi.spyOn(toast, "warning");
    const adapter: EnterpriseLoginAdapter = {
      loadOidcStatus: vi.fn().mockResolvedValue({ enabled: false, authorizePath: "" }),
      passwordLogin: vi.fn().mockRejectedValue({
        status: 401,
        detail: { code: "REQUIRE_SECOND_FACTOR", methods: ["passkey"] },
      }),
      beginPasskeyLogin: vi.fn(),
      completePasskeyLogin: vi.fn(),
      startOidcLogin: vi.fn(),
    };
    const login = (
      <EnterpriseLoginController
        adapter={adapter}
        labels={labels.login}
        target="/app"
        changePasswordTarget="/change-password"
        navigate={vi.fn()}
        feedbackMode="toast"
      />
    );

    view = await mount(login);
    await input(byTestId(view.host, "login-username") as HTMLInputElement, "admin");
    await input(byTestId(view.host, "login-password") as HTMLInputElement, "secret");
    await click(byTestId(view.host, "login-submit"));
    await settle();

    expect(byTestId(view.host, "login-passkey-pane")).toBeTruthy();
    expect(view.host.querySelector("p[data-test-id='login-passkey-unsupported']")).toBeNull();
    expect(warning).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledWith(labels.login.passkeyUnsupported, { id: "login-passkey-unsupported" });

    await view.rerender(login);
    await settle();
    expect(warning).toHaveBeenCalledTimes(1);
  });

  it("warns once on forced-password route entry and keeps the warning sentence out of the page", async () => {
    const warning = vi.spyOn(toast, "warning");
    const surface = (forced: boolean) => (
      <EnterprisePasswordRecoverySurface
        title="Change password"
        forced={forced}
        forcedNotice="Set a new password before continuing."
        feedbackMode="toast"
      >
        <form>password fields</form>
      </EnterprisePasswordRecoverySurface>
    );

    view = await mount(surface(false));
    await view.rerender(surface(true));
    await settle();
    expect(warning).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledWith("Set a new password before continuing.", { id: "forced-password-notice" });
    expect(view.host.textContent).not.toContain("Set a new password before continuing.");

    await view.rerender(surface(true));
    await settle();
    expect(warning).toHaveBeenCalledTimes(1);

    await view.rerender(
      <EnterprisePasswordRecoverySurface
        title="Change password"
        forced
        forcedNotice="Updated copy for the same forced pane."
        feedbackMode="toast"
      >
        <form>password fields</form>
      </EnterprisePasswordRecoverySurface>,
    );
    await settle();
    expect(warning).toHaveBeenCalledTimes(1);
  });

  it("does not warn again when a repeated password response keeps the same unsupported passkey pane active", async () => {
    Object.defineProperty(window, "PublicKeyCredential", { configurable: true, value: undefined });
    const warning = vi.spyOn(toast, "warning");
    const adapter: EnterpriseLoginAdapter = {
      loadOidcStatus: vi.fn().mockResolvedValue({ enabled: false, authorizePath: "" }),
      passwordLogin: vi.fn().mockRejectedValue({
        status: 401,
        detail: { code: "REQUIRE_SECOND_FACTOR", methods: ["passkey"] },
      }),
      beginPasskeyLogin: vi.fn(),
      completePasskeyLogin: vi.fn(),
      startOidcLogin: vi.fn(),
    };

    view = await mount(
      <EnterpriseLoginController
        adapter={adapter}
        labels={labels.login}
        target="/app"
        changePasswordTarget="/change-password"
        navigate={vi.fn()}
        feedbackMode="toast"
      />,
    );
    await input(byTestId(view.host, "login-username") as HTMLInputElement, "admin");
    await input(byTestId(view.host, "login-password") as HTMLInputElement, "secret");
    await click(byTestId(view.host, "login-submit"));
    await settle();

    const form = byTestId(view.host, "login-form");
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await settle();

    expect(adapter.passwordLogin).toHaveBeenCalledTimes(2);
    expect(byTestId(view.host, "login-passkey-pane")).toBeTruthy();
    expect(warning).toHaveBeenCalledTimes(1);
  });
});

describe("FE-FB-01 retained data and neutral recovery", () => {
  it("recovers from an initial failure, retains successful data after a failed refresh, and never renders failure copy or fabricated empty values", async () => {
    const status: EnterpriseAuthzStatus = {
      easyauth: { configured: true, hasCredential: true },
      principal: {},
      catalog: {},
      snapshots: {},
    };
    const responses = [
      () => Promise.reject(new Error("offline")),
      () => Promise.resolve(status),
      () => Promise.reject(new Error("offline again")),
    ];
    const adapter = {
      loadStatus: vi.fn(() => responses.shift()?.() ?? Promise.resolve(status)),
    } as unknown as EnterpriseAuthorizationAdapter;

    view = await mount(
      <EnterpriseAuthorizationWorkspace
        adapter={adapter}
        labels={labels.access.authorization}
        locale="en"
        canManage={false}
        section="authorization"
        feedbackMode="toast"
      />,
    );
    await settle(20);

    const recovery = () => [...view!.host.querySelectorAll("button")].find((button) => button.textContent === labels.access.authorization.refresh);
    expect(byTestId(view.host, "authz-load-missing").textContent?.match(/—/g)).toHaveLength(2);
    expect(view.host.textContent).not.toContain(labels.access.authorization.loadFailed);
    expect(view.host.textContent).not.toContain(labels.access.authorization.empty);
    expect(view.host.textContent).not.toMatch(/\b0\b/);
    expect(recovery()).toBeTruthy();

    await click(recovery()!);
    await settle(20);
    expect(byTestId(view.host, "authz-integration-status-card")).toBeTruthy();
    expect(view.host.textContent).toContain(labels.access.authorization.configured);
    expect(recovery()).toBeTruthy();

    await click(recovery()!);
    await settle(20);
    expect(byTestId(view.host, "authz-integration-status-card")).toBeTruthy();
    expect(view.host.querySelector("[data-test-id='authz-load-missing']")).toBeNull();
    expect(view.host.textContent).not.toContain(labels.access.authorization.loadFailed);
    expect(recovery()).toBeTruthy();
    expect(adapter.loadStatus).toHaveBeenCalledTimes(3);
  });

  it.each([
    { enabled: true, statusTestId: "totp-enabled-label", actionTestId: "totp-disable-btn" },
    { enabled: false, statusTestId: "totp-disabled-label", actionTestId: "totp-enable-btn" },
  ] satisfies TotpRefreshCase[])("retains a known TOTP status and action after a rejected refresh ($statusTestId)", async ({ enabled, statusTestId, actionTestId }: TotpRefreshCase) => {
    const failure = vi.spyOn(toast, "error");
    const adapter = {
      loadTotpStatus: vi.fn()
        .mockResolvedValueOnce({ enabled })
        .mockRejectedValueOnce(new Error("offline")),
      beginTotp: vi.fn(),
      disableTotp: vi.fn(),
    } as unknown as EnterpriseSecurityAdapter;

    view = await mount(
      <EnterpriseAccountSecuritySurface
        adapter={adapter}
        labels={labels.security}
        permissions={{ password: false, totpStatus: true, createTotp: true, disableTotp: true, viewPasskeys: false, canRegisterPasskeys: false, canDeletePasskeys: false }}
        feedbackMode="toast"
      />,
    );
    await settle(20);
    const status = byTestId(view.host, statusTestId);
    const action = byTestId(view.host, actionTestId);

    await click(byTestId(view.host, "totp-status-retry"));
    await settle(20);

    expect(byTestId(view.host, statusTestId)).toBe(status);
    expect(byTestId(view.host, actionTestId)).toBe(action);
    expect(view.host.querySelector("[data-test-id='totp-status-missing']")).toBeNull();
    expect(view.host.textContent).not.toContain(labels.security.statusFailed);
    expect(failure).toHaveBeenCalledWith(labels.security.statusFailed);
    expect(adapter.loadTotpStatus).toHaveBeenCalledTimes(2);
  });

  it("keeps a successfully loaded footer form enabled and unchanged after a rejected refresh", async () => {
    const failure = vi.spyOn(toast, "error");
    const known = { footerHtmlZh: "<strong>已知页脚</strong>", footerHtmlEn: "<strong>Known footer</strong>" };
    const adapter = {
      load: vi.fn()
        .mockResolvedValueOnce(known)
        .mockRejectedValueOnce(new Error("offline")),
      save: vi.fn(),
    } as unknown as EnterpriseFooterSettingsAdapter;

    view = await mount(
      <EnterpriseFooterSettingsSurface adapter={adapter} labels={labels.footerSettings} feedbackMode="toast" />,
    );
    await settle(20);
    const chinese = byTestId(view.host, "footer-html-zh") as HTMLTextAreaElement;
    const english = byTestId(view.host, "footer-html-en") as HTMLTextAreaElement;
    const save = byTestId(view.host, "app-settings-save") as HTMLButtonElement;

    await click(byTestId(view.host, "footer-settings-refresh"));
    await settle(20);

    expect(byTestId(view.host, "footer-html-zh")).toBe(chinese);
    expect(byTestId(view.host, "footer-html-en")).toBe(english);
    expect(chinese.value).toBe(known.footerHtmlZh);
    expect(english.value).toBe(known.footerHtmlEn);
    expect(chinese.disabled).toBe(false);
    expect(english.disabled).toBe(false);
    expect(save.disabled).toBe(false);
    expect(view.host.querySelector("[data-test-id='footer-settings-missing']")).toBeNull();
    expect(view.host.textContent).not.toContain(labels.footerSettings.loadFailed);
    expect(failure).toHaveBeenCalledWith(labels.footerSettings.loadFailed);
  });
});

describe("login credential-error classification with host-normalized Error.message", () => {
  it("classifies by error.detail when the host API layer replaces Error.message with a generic sentence", async () => {
    const credentialError = Object.assign(new Error("请求失败，请稍后重试"), { detail: "用户名或密码错误" });
    const adapter: EnterpriseLoginAdapter = {
      loadOidcStatus: vi.fn().mockResolvedValue({ enabled: false, authorizePath: "" }),
      passwordLogin: vi.fn().mockRejectedValue(credentialError),
      beginPasskeyLogin: vi.fn(),
      completePasskeyLogin: vi.fn(),
      startOidcLogin: vi.fn(),
    };
    view = await mount(
      <EnterpriseLoginController
        adapter={adapter}
        labels={labels.login}
        target="/app"
        changePasswordTarget="/change-password"
        navigate={vi.fn()}
      />,
    );
    await input(byTestId(view.host, "login-username") as HTMLInputElement, "admin");
    await input(byTestId(view.host, "login-password") as HTMLInputElement, "wrong");
    await click(byTestId(view.host, "login-submit"));
    await settle();

    expect(view.host.textContent).toContain(labels.login.invalidCredentials);
    expect(view.host.textContent).not.toContain(labels.login.unknownError);
    expect(toastBus.getSnapshot()).toHaveLength(0);
  });
});
