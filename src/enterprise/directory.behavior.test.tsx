// @vitest-environment happy-dom
/**
 * User risk: the directory section decides who exists in the host system, so
 * (a) it must not appear for hosts that cannot serve it, (b) a blank credential
 * box must never wipe the stored credential, and (c) a run that wrote nothing
 * must say so in plain words instead of reading as "sync done".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { toastBus } from "../toast";
import { EnterpriseAccessSettingsSurface, type EnterpriseAccessSettingsAdapter } from "./access-settings-surface";
import type { EnterpriseDirectorySettingsValue, EnterpriseDirectorySyncResult } from "./directory-settings-form";
import { createEnterpriseLabelCatalog } from "./label-catalog";
import { byTestId, click, input, installReducedMotion, mount, settle, type MountedView } from "./behavior-test-utils";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const catalog = createEnterpriseLabelCatalog("en", { appName: "Test", appDescription: "Test" }, "business");
const directoryLabels = catalog.access.directory!;
let view: MountedView | null = null;

const settings: EnterpriseDirectorySettingsValue = {
  enabled: true,
  baseUrl: "https://auth.example.com",
  appKey: "easytrade",
  hasCredential: true,
  authMode: "static_app_token",
  syncIntervalMinutes: 30,
  lastSync: null,
};

const oidcSettings = {
  enabled: true,
  issuer: "https://id.example.com",
  authorizationEndpoint: "",
  tokenEndpoint: "",
  jwksUri: "",
  userinfoEndpoint: "",
  clientId: "trade",
  hasClientSecret: true,
  scopes: "openid",
  redirectBaseUrl: "https://app.example.com",
  redirectUri: "",
  frontendBaseUrl: "",
  serverBaseUrl: "",
};

function makeAdapter(overrides: Partial<EnterpriseAccessSettingsAdapter> = {}): EnterpriseAccessSettingsAdapter {
  return {
    easyAuthConnectionEditable: true,
    loadOidcSettings: vi.fn().mockResolvedValue(oidcSettings),
    saveOidcSettings: vi.fn(),
    loadEasyAuthSettings: vi.fn(),
    saveEasyAuthSettings: vi.fn(),
    loadDirectorySettings: vi.fn().mockResolvedValue(settings),
    saveDirectorySettings: vi.fn().mockImplementation(async (value: EnterpriseDirectorySettingsValue) => value),
    testDirectory: vi.fn(),
    syncDirectory: vi.fn(),
    ...overrides,
  } as unknown as EnterpriseAccessSettingsAdapter;
}

function surfaceNode(adapter: EnterpriseAccessSettingsAdapter, feedbackMode: "inline" | "toast" = "inline") {
  return (
    <EnterpriseAccessSettingsSurface
      adapter={adapter}
      labels={catalog.access}
      permissions={{ viewIdentity: true, manageIdentity: true, viewAuthorization: false, manageAuthorization: false }}
      locale="en"
      preferredTab="login"
      feedbackMode={feedbackMode}
    />
  );
}

async function mountSurface(adapter: EnterpriseAccessSettingsAdapter, feedbackMode: "inline" | "toast" = "inline") {
  view = await mount(surfaceNode(adapter, feedbackMode));
  await settle();
  return view;
}

beforeEach(() => {
  installReducedMotion(true);
});

afterEach(async () => {
  await view?.unmount();
  view = null;
  toastBus.clear();
  vi.restoreAllMocks();
});

describe("directory settings section", () => {
  it("renders the directory form only when the adapter provides the directory methods", async () => {
    const supported = await mountSurface(makeAdapter());
    expect(byTestId(supported.host, "directory-settings-section")).toBeTruthy();
    expect(byTestId(supported.host, "directory-enabled").getAttribute("aria-checked")).toBe("true");
    expect(byTestId(supported.host, "directory-last-sync-empty").textContent).toContain(directoryLabels.lastSyncNever);
    await supported.unmount();
    view = null;

    const bare = await mountSurface(
      makeAdapter({ loadDirectorySettings: undefined, saveDirectorySettings: undefined, testDirectory: undefined, syncDirectory: undefined }),
    );
    expect(bare.host.querySelector("[data-test-id='directory-settings-section']")).toBeNull();
  });

  it("switches the whole block from the card header and greys the body when it is off", async () => {
    const adapter = makeAdapter();
    const mounted = await mountSurface(adapter);

    const toggle = byTestId(mounted.host, "directory-enabled") as HTMLButtonElement;
    expect(toggle.getAttribute("role")).toBe("switch");
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(toggle.getAttribute("aria-label")).toBe(directoryLabels.enabled);

    // The gated body is always the last child of the form: the operation notice, when
    // there is one, is prepended outside the gate.
    const body = byTestId(mounted.host, "directory-settings-form").lastElementChild as HTMLElement;
    expect(body.hasAttribute("inert")).toBe(false);

    await click(toggle);
    await settle();

    // Off: the body is out of reach and greyed out, but the switch itself must stay
    // operable — it lives outside the gated body — or the block could never come back.
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(body.hasAttribute("inert")).toBe(true);
    expect(body.className).toContain("opacity-50");
    expect(toggle.disabled).toBe(false);

    // Save is a header action too, so the disabled state is savable.
    await click(byTestId(mounted.host, "directory-save"));
    await settle();
    expect(adapter.saveDirectorySettings).toHaveBeenLastCalledWith(
      expect.objectContaining({ enabled: false }),
      undefined,
    );

    // …and the answer to that save stays out of the inert subtree, or a screen reader
    // would never hear whether switching the block off actually saved.
    const notice = byTestId(mounted.host, "directory-operation-result");
    expect(body.contains(notice)).toBe(false);
    expect(notice.closest("[inert]")).toBeNull();
  });

  it("keeps the credential write-only: blank sends nothing, a typed value is passed through once", async () => {
    const adapter = makeAdapter();
    const mounted = await mountSurface(adapter);

    await click(byTestId(mounted.host, "directory-save"));
    await settle();
    expect(adapter.saveDirectorySettings).toHaveBeenCalledWith(expect.objectContaining({ appKey: "easytrade" }), undefined);

    const secret = byTestId(mounted.host, "directory-credential").querySelector("input") as HTMLInputElement;
    expect(secret.type).toBe("password");
    await input(secret, "directory-token");
    await click(byTestId(mounted.host, "directory-save"));
    await settle();
    expect(adapter.saveDirectorySettings).toHaveBeenLastCalledWith(expect.anything(), "directory-token");
    // The box is emptied after a successful save so the secret is never echoed back.
    expect((byTestId(mounted.host, "directory-credential").querySelector("input") as HTMLInputElement).value).toBe("");
  });

});

/** The last-run report: a run that wrote nothing must never read as "sync done". */
describe("directory last-run report", () => {
  it("explains in plain words that a non-authoritative run wrote nothing", async () => {
    const result: EnterpriseDirectorySyncResult = {
      status: "not_authoritative",
      at: "2026-09-03T02:00:00Z",
      authoritative: false,
      complete: false,
      stale: true,
      upstreamTotal: 120,
      created: 0,
      updated: 0,
      deactivated: 0,
      unmapped: 7,
      summary: "Partial snapshot; nothing was written.",
      errorDetail: null,
    };
    const adapter = makeAdapter({ syncDirectory: vi.fn().mockResolvedValue(result) });
    const mounted = await mountSurface(adapter);

    await click(byTestId(mounted.host, "directory-sync-now"));
    await settle();

    expect(adapter.syncDirectory).toHaveBeenCalledTimes(1);
    expect(byTestId(mounted.host, "directory-last-sync-status").dataset.status).toBe("not_authoritative");
    expect(byTestId(mounted.host, "directory-last-sync-explanation").textContent).toBe(
      directoryLabels.statusExplanations.not_authoritative,
    );
    expect(byTestId(mounted.host, "directory-last-sync-trust").textContent).toBe(directoryLabels.trustNotAuthoritative);
    expect(byTestId(mounted.host, "directory-last-sync-incomplete")).toBeTruthy();
    expect(byTestId(mounted.host, "directory-last-sync-stale")).toBeTruthy();
    expect(byTestId(mounted.host, "directory-count-unmapped").textContent).toBe("7");
    expect(byTestId(mounted.host, "directory-operation-result").textContent).toContain(result.summary);
  });

  it("never claims people were deactivated when the run did not finish, even if the snapshot says authoritative", async () => {
    // A failed run can still carry authoritative snapshot metadata; nothing was written.
    const result: EnterpriseDirectorySyncResult = {
      status: "failed",
      at: "2026-09-03T02:00:00Z",
      authoritative: true,
      complete: true,
      stale: false,
      upstreamTotal: 120,
      created: 0,
      updated: 0,
      deactivated: 0,
      unmapped: 0,
      summary: "Upstream returned 503.",
      errorDetail: "directory_unavailable",
    };
    const adapter = makeAdapter({ syncDirectory: vi.fn().mockResolvedValue(result) });
    const mounted = await mountSurface(adapter);

    await click(byTestId(mounted.host, "directory-sync-now"));
    await settle();

    const trust = byTestId(mounted.host, "directory-last-sync-trust").textContent;
    expect(trust).toBe(directoryLabels.trustUnchanged);
    expect(trust).not.toBe(directoryLabels.trustAuthoritative);
    expect(byTestId(mounted.host, "directory-last-sync-status").dataset.status).toBe("failed");
    expect(byTestId(mounted.host, "directory-last-sync-error").textContent).toContain("directory_unavailable");
  });

  it("reports a completed run as authoritative with the counts that were written", async () => {
    const result: EnterpriseDirectorySyncResult = {
      status: "completed",
      at: "2026-09-03T02:00:00Z",
      authoritative: true,
      complete: true,
      stale: false,
      upstreamTotal: 120,
      created: 3,
      updated: 5,
      deactivated: 2,
      unmapped: 7,
      summary: "Roster applied.",
      errorDetail: null,
    };
    const adapter = makeAdapter({ syncDirectory: vi.fn().mockResolvedValue(result) });
    const mounted = await mountSurface(adapter);

    await click(byTestId(mounted.host, "directory-sync-now"));
    await settle();

    expect(byTestId(mounted.host, "directory-last-sync-trust").textContent).toBe(directoryLabels.trustAuthoritative);
    expect(mounted.host.querySelector("[data-test-id='directory-last-sync-incomplete']")).toBeNull();
    expect(byTestId(mounted.host, "directory-count-deactivated").textContent).toBe("2");
  });
});

/**
 * A directory load that fails must still be recoverable: toast hosts used to get
 * a section that rendered nothing at all, which left the user no way back.
 */
describe("directory settings: a load that failed", () => {
  it("carries the retry in the inline failure notice, and drops it once the retry succeeds", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValue(settings);
    const mounted = await mountSurface(makeAdapter({ loadDirectorySettings: load }));

    expect(byTestId(mounted.host, "directory-settings-failed")).toBeTruthy();
    expect(mounted.host.querySelector("[data-test-id='directory-settings-section']")).toBeNull();

    await click(byTestId(mounted.host, "directory-settings-retry"));
    await settle();

    expect(load).toHaveBeenCalledTimes(2);
    expect(byTestId(mounted.host, "directory-settings-section")).toBeTruthy();
    // 重试不是常驻控件:读出来之后它就该消失。
    expect(mounted.host.querySelector("[data-test-id='directory-settings-retry']")).toBeNull();
  });

  it("gives toast hosts a placeholder with the retry instead of an empty section", async () => {
    const load = vi.fn().mockRejectedValue(new Error("down"));
    const mounted = await mountSurface(makeAdapter({ loadDirectorySettings: load }), "toast");

    expect(byTestId(mounted.host, "directory-settings-missing")).toBeTruthy();

    await click(byTestId(mounted.host, "directory-settings-retry"));
    await settle();

    expect(load).toHaveBeenCalledTimes(2);
  });
});

/**
 * A reload can fail long after the first one succeeded (a new adapter, a locale
 * switch): the card then still shows the value it read last time, so the retry
 * has to be keyed on "the last load failed", not on "there is no value".
 */
describe("settings cards: a reload that failed while the form is still on screen", () => {
  it("puts the retry in the card header next to the other buttons, and drops it once the retry succeeds", async () => {
    const mounted = await mountSurface(makeAdapter());
    expect(byTestId(mounted.host, "directory-settings-section")).toBeTruthy();
    // 读成功时两张卡都没有重试:它不是常驻控件。
    expect(mounted.host.querySelector("[data-test-id='directory-settings-retry']")).toBeNull();
    expect(mounted.host.querySelector("[data-test-id='identity-settings-retry']")).toBeNull();

    const failing = makeAdapter({
      loadOidcSettings: vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValue(oidcSettings),
      loadDirectorySettings: vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValue(settings),
    });
    await mounted.rerender(surfaceNode(failing));
    await settle();

    // 表单还在,重试和「测试连接 / 保存」同处标题行。
    expect(byTestId(mounted.host, "directory-settings-form")).toBeTruthy();
    const directoryRetry = byTestId(mounted.host, "directory-settings-retry");
    const identityRetry = byTestId(mounted.host, "identity-settings-retry");
    expect(directoryRetry.closest("header")).not.toBeNull();
    expect(directoryRetry.closest("header")?.querySelector("[data-test-id='directory-save']")).not.toBeNull();
    expect(identityRetry.closest("header")).not.toBeNull();
    expect(identityRetry.closest("header")?.querySelector("[data-test-id='enterprise-oidc-save']")).not.toBeNull();

    await click(directoryRetry);
    await settle();

    expect(byTestId(mounted.host, "directory-settings-section")).toBeTruthy();
    expect(mounted.host.querySelector("[data-test-id='directory-settings-retry']")).toBeNull();
    // 另一张卡各算各的:目录读回来了,登录那张还没重试过。
    expect(byTestId(mounted.host, "identity-settings-retry")).toBeTruthy();

    await click(byTestId(mounted.host, "identity-settings-retry"));
    await settle();

    expect(mounted.host.querySelector("[data-test-id='identity-settings-retry']")).toBeNull();
    expect(byTestId(mounted.host, "identity-integration-section")).toBeTruthy();
  });
});
