// @vitest-environment happy-dom
/**
 * User risk: these three hooks own every write on the access-settings page.
 * A save that reports success without persisting, a discover that keeps stale
 * endpoints, or a blank credential box that wipes the stored secret are all
 * silent data losses, so each transition is pinned here rather than only
 * through the rendered panels.
 */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { toast, toastBus } from "../../toast";
import type { EnterpriseDirectorySettingsValue, EnterpriseDirectorySyncResult } from "../directory-settings-form";
import { createEnterpriseLabelCatalog } from "../label-catalog";
import type { EnterpriseOidcConfigurationValue } from "../integration-configuration-forms";
import { mount, settle, type MountedView } from "../behavior-test-utils";
import type { EnterpriseAccessSettingsAdapter, EnterpriseSettingsFeedbackMode } from "./types";
import { useDirectorySettings, type DirectorySettings } from "./use-directory-settings";
import { useEasyAuthSettings, type EasyAuthSettings } from "./use-easyauth-settings";
import { useIdentitySettings, type IdentitySettings } from "./use-identity-settings";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const catalog = createEnterpriseLabelCatalog("en", { appName: "Test", appDescription: "Test" }, "business");
const labels = catalog.access.configuration;
const directoryLabels = catalog.access.directory!;
let view: MountedView | null = null;

const oidc: EnterpriseOidcConfigurationValue = {
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

const directory: EnterpriseDirectorySettingsValue = {
  enabled: true,
  baseUrl: "https://auth.example.com",
  appKey: "easytrade",
  hasCredential: true,
  authMode: "static_app_token",
  syncIntervalMinutes: 30,
  lastSync: null,
};

const easyAuth = { baseUrl: "https://auth.example.com", appKey: "easytrade", hasCredential: true, permissionRequestUrl: "" };

function makeAdapter(overrides: Partial<EnterpriseAccessSettingsAdapter> = {}): EnterpriseAccessSettingsAdapter {
  return {
    easyAuthConnectionEditable: true,
    loadOidcSettings: vi.fn().mockResolvedValue(oidc),
    saveOidcSettings: vi.fn().mockImplementation(async (value: EnterpriseOidcConfigurationValue) => value),
    loadEasyAuthSettings: vi.fn().mockResolvedValue(easyAuth),
    saveEasyAuthSettings: vi.fn().mockImplementation(async (value: unknown) => value),
    loadDirectorySettings: vi.fn().mockResolvedValue(directory),
    saveDirectorySettings: vi.fn().mockImplementation(async (value: EnterpriseDirectorySettingsValue) => value),
    ...overrides,
  } as unknown as EnterpriseAccessSettingsAdapter;
}

/**
 * Mounts a hook behind a probe component and hands back a live reference to its
 * latest return value, so a test can drive the same transitions a panel drives.
 */
async function mountHook<T>(useHook: () => T): Promise<{ current: T }> {
  const ref = { current: undefined as unknown as T };
  function Probe() {
    ref.current = useHook();
    return null;
  }
  view = await mount(<Probe />);
  await settle();
  return ref;
}

/** Drives one hook action the way a click would: inside `act`, then let it settle. */
async function run(action: () => void | Promise<void>): Promise<void> {
  await act(async () => {
    await action();
  });
  await settle();
}

beforeEach(() => {
  toastBus.clear();
});

afterEach(async () => {
  await view?.unmount();
  view = null;
  toastBus.clear();
  vi.restoreAllMocks();
});

function mountIdentity(adapter: EnterpriseAccessSettingsAdapter, feedbackMode: EnterpriseSettingsFeedbackMode = "inline") {
  return mountHook<IdentitySettings>(() => useIdentitySettings({ adapter, labels, feedbackMode }));
}

describe("useIdentitySettings", () => {
  it("settles into a ready, idle state once the adapter answers", async () => {
    const identity = await mountIdentity(makeAdapter());

    expect(identity.current.value).toEqual(oidc);
    expect(identity.current.busy).toBeNull();
    expect(identity.current.result).toBeNull();
  });

  it("reports a failed load inline without inventing a blank form", async () => {
    const identity = await mountIdentity(makeAdapter({ loadOidcSettings: vi.fn().mockRejectedValue(new Error("down")) }));

    expect(identity.current.value).toBeNull();
    expect(identity.current.busy).toBeNull();
    expect(identity.current.result).toEqual({ ok: false, message: labels.loadFailed });
  });

  it("sends the typed client secret once, then empties the box so it is never echoed back", async () => {
    const adapter = makeAdapter();
    const identity = await mountIdentity(adapter);

    await run(() => identity.current.setClientSecret({ value: "s3cret", clear: false }));
    await run(() => identity.current.save());

    expect(adapter.saveOidcSettings).toHaveBeenCalledWith(oidc, { clientSecret: "s3cret" });
    expect(identity.current.clientSecret).toEqual({ value: "", clear: false });
    expect(identity.current.result).toEqual({ ok: true, message: labels.saved });
    expect(identity.current.busy).toBeNull();
  });

  it("keeps the stored secret when the box is blank and drops it only on an explicit clear", async () => {
    const adapter = makeAdapter();
    const identity = await mountIdentity(adapter);

    await run(() => identity.current.save());
    expect(adapter.saveOidcSettings).toHaveBeenLastCalledWith(oidc, {});

    await run(() => identity.current.setClientSecret({ value: "", clear: true }));
    await run(() => identity.current.save());
    expect(adapter.saveOidcSettings).toHaveBeenLastCalledWith(oidc, { clientSecret: "" });
  });

  it("says the save failed instead of leaving the success wording standing", async () => {
    const adapter = makeAdapter({ saveOidcSettings: vi.fn().mockRejectedValue(new Error("409")) });
    const identity = await mountIdentity(adapter);

    await run(() => identity.current.save());

    expect(identity.current.result).toEqual({ ok: false, message: labels.saveFailed });
    expect(identity.current.busy).toBeNull();
  });

  it("writes every discovered endpoint into the form", async () => {
    const endpoints = {
      issuer: "https://id.example.com/realms/main",
      authorizationEndpoint: "https://id.example.com/authorize",
      tokenEndpoint: "https://id.example.com/token",
      jwksUri: "https://id.example.com/jwks",
      userinfoEndpoint: "https://id.example.com/userinfo",
    };
    const adapter = makeAdapter({ discoverIdentity: vi.fn().mockResolvedValue({ ok: true, ...endpoints }) });
    const identity = await mountIdentity(adapter);

    await run(() => identity.current.discover());

    expect(adapter.discoverIdentity).toHaveBeenCalledWith(oidc.issuer);
    // Only the discovered endpoints move; the rest of the form (client id, scopes) is untouched.
    expect(identity.current.value).toEqual({ ...oidc, ...endpoints });
    expect(identity.current.result).toEqual({ ok: true, message: labels.operationSucceeded });
  });

  it("leaves the endpoints untouched when discovery answers not-ok", async () => {
    const adapter = makeAdapter({
      discoverIdentity: vi.fn().mockResolvedValue({ ok: false, issuer: "x", authorizationEndpoint: "x", tokenEndpoint: "x", jwksUri: "x", userinfoEndpoint: "x" }),
    });
    const identity = await mountIdentity(adapter);

    await run(() => identity.current.discover());

    expect(identity.current.value).toEqual(oidc);
    expect(identity.current.result).toEqual({ ok: false, message: labels.operationFailed });
  });

  it("puts the measured latency in the connection-test outcome", async () => {
    const adapter = makeAdapter({ testIdentityConnection: vi.fn().mockResolvedValue({ ok: true, latencyMs: 42 }) });
    const identity = await mountIdentity(adapter);

    await run(() => identity.current.testConnection());

    expect(identity.current.result).toEqual({ ok: true, message: `${labels.operationSucceeded} · 42 ms` });
  });

  it("reports a rejected connection test as a failure", async () => {
    const adapter = makeAdapter({ testIdentityConnection: vi.fn().mockRejectedValue(new Error("timeout")) });
    const identity = await mountIdentity(adapter);

    await run(() => identity.current.testConnection());

    expect(identity.current.result).toEqual({ ok: false, message: labels.operationFailed });
  });

  it("derives the redirect URI from the base URL rather than trusting a typed one", async () => {
    const identity = await mountIdentity(makeAdapter());

    await run(() => identity.current.patchValue({ redirectBaseUrl: "https://trade.example.com/" }));

    expect(identity.current.value).toMatchObject({
      redirectBaseUrl: "https://trade.example.com/",
      redirectUri: "https://trade.example.com/api/v1/auth/oidc/callback",
    });
  });

  it("toast hosts hear the failure and the page keeps no inline result", async () => {
    const error = vi.spyOn(toast, "error");
    const adapter = makeAdapter({ saveOidcSettings: vi.fn().mockRejectedValue(new Error("409")) });
    const identity = await mountIdentity(adapter, "toast");

    await run(() => identity.current.save());

    expect(error).toHaveBeenCalledWith(labels.saveFailed);
    expect(identity.current.result).toBeNull();
  });

  it("re-issues the load when the user retries", async () => {
    const adapter = makeAdapter();
    const identity = await mountIdentity(adapter, "toast");
    expect(adapter.loadOidcSettings).toHaveBeenCalledTimes(1);

    await run(() => identity.current.reload());

    expect(adapter.loadOidcSettings).toHaveBeenCalledTimes(2);
    expect(identity.current.busy).toBeNull();
  });
});

function mountDirectory(adapter: EnterpriseAccessSettingsAdapter, feedbackMode: EnterpriseSettingsFeedbackMode = "inline") {
  return mountHook<DirectorySettings>(() => useDirectorySettings({ adapter, labels, directoryLabels, feedbackMode }));
}

describe("useDirectorySettings", () => {
  it("keeps the credential write-only: blank sends nothing, clear sends an empty string", async () => {
    const adapter = makeAdapter();
    const state = await mountDirectory(adapter);

    await run(() => state.current.save());
    expect(adapter.saveDirectorySettings).toHaveBeenLastCalledWith(directory, undefined);

    await run(() => state.current.setCredential({ value: "", clear: true }));
    await run(() => state.current.save());
    expect(adapter.saveDirectorySettings).toHaveBeenLastCalledWith(directory, "");
    expect(state.current.result).toEqual({ ok: true, message: labels.saved });
  });

  it("reports a failed save without clearing the typed credential silently", async () => {
    const adapter = makeAdapter({ saveDirectorySettings: vi.fn().mockRejectedValue(new Error("502")) });
    const state = await mountDirectory(adapter);

    await run(() => state.current.setCredential({ value: "token", clear: false }));
    await run(() => state.current.save());

    expect(state.current.result).toEqual({ ok: false, message: labels.saveFailed });
    expect(state.current.credential).toEqual({ value: "token", clear: false });
  });

  it("prefers the upstream error detail over the generic failure wording", async () => {
    const adapter = makeAdapter({ testDirectory: vi.fn().mockResolvedValue({ ok: false, errorDetail: "directory_unavailable" }) });
    const state = await mountDirectory(adapter);

    await run(() => state.current.test());

    expect(state.current.result).toEqual({ ok: false, message: "directory_unavailable" });
  });

  it("calls a run that wrote nothing a failure, and still records the snapshot", async () => {
    const lastSync: EnterpriseDirectorySyncResult = {
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
    const adapter = makeAdapter({ syncDirectory: vi.fn().mockResolvedValue(lastSync) });
    const state = await mountDirectory(adapter);

    await run(() => state.current.sync());

    expect(state.current.result).toEqual({ ok: false, message: lastSync.summary });
    expect(state.current.value?.lastSync).toEqual(lastSync);
  });

  it("calls a completed run a success", async () => {
    const lastSync = { status: "completed", summary: "Roster applied." } as EnterpriseDirectorySyncResult;
    const adapter = makeAdapter({ syncDirectory: vi.fn().mockResolvedValue(lastSync) });
    const state = await mountDirectory(adapter);

    await run(() => state.current.sync());

    expect(state.current.result).toEqual({ ok: true, message: "Roster applied." });
  });

  it("stays inert for a host whose adapter cannot serve the directory", async () => {
    const adapter = makeAdapter({ loadDirectorySettings: undefined, saveDirectorySettings: undefined });
    const state = await mountDirectory(adapter);

    await run(() => state.current.save());

    expect(state.current.value).toBeNull();
    expect(state.current.busy).toBe("load");
  });
});

function mountEasyAuth(adapter: EnterpriseAccessSettingsAdapter, canManage = true, feedbackMode: EnterpriseSettingsFeedbackMode = "inline") {
  return mountHook<EasyAuthSettings>(() => useEasyAuthSettings({ adapter, labels, feedbackMode, canManage }));
}

describe("useEasyAuthSettings", () => {
  it("bumps the revision after a successful save so the workspace refetches", async () => {
    const adapter = makeAdapter();
    const state = await mountEasyAuth(adapter);
    expect(state.current.revision).toBe(0);

    await run(() => state.current.save());

    expect(adapter.saveEasyAuthSettings).toHaveBeenCalledWith(easyAuth, undefined);
    expect(state.current.notice).toEqual({ ok: true, message: labels.saved });
    expect(state.current.revision).toBe(1);
  });

  it("does not refetch the workspace after a failed save", async () => {
    const adapter = makeAdapter({ saveEasyAuthSettings: vi.fn().mockRejectedValue(new Error("403")) });
    const state = await mountEasyAuth(adapter);

    await run(() => state.current.save());

    expect(state.current.notice).toEqual({ ok: false, message: labels.saveFailed });
    expect(state.current.revision).toBe(0);
  });

  it("never requests the connection settings a view-only user may not read", async () => {
    const adapter = makeAdapter();
    const state = await mountEasyAuth(adapter, false);

    expect(adapter.loadEasyAuthSettings).not.toHaveBeenCalled();
    expect(state.current.loading).toBe(false);
    expect(state.current.value).toBeNull();
  });

  it("keeps the previously loaded value when a retry fails", async () => {
    const load = vi.fn().mockResolvedValueOnce(easyAuth).mockRejectedValue(new Error("down"));
    const state = await mountEasyAuth(makeAdapter({ loadEasyAuthSettings: load }));

    await run(() => state.current.reload());

    expect(load).toHaveBeenCalledTimes(2);
    expect(state.current.value).toEqual(easyAuth);
    expect(state.current.notice).toEqual({ ok: false, message: labels.loadFailed });
  });
});
