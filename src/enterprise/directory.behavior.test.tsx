// @vitest-environment happy-dom
/**
 * User risk: the directory section decides who exists in the host system, so
 * (a) it must not appear for hosts that cannot serve it, (b) a blank credential
 * box must never wipe the stored credential, and (c) a run that wrote nothing
 * must say so in plain words instead of reading as "sync done".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

function makeAdapter(overrides: Partial<EnterpriseAccessSettingsAdapter> = {}): EnterpriseAccessSettingsAdapter {
  return {
    easyAuthConnectionEditable: true,
    loadOidcSettings: vi.fn().mockResolvedValue({
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
    }),
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

async function mountSurface(adapter: EnterpriseAccessSettingsAdapter) {
  view = await mount(
    <EnterpriseAccessSettingsSurface
      adapter={adapter}
      labels={catalog.access}
      permissions={{ viewIdentity: true, manageIdentity: true, viewAuthorization: false, manageAuthorization: false }}
      locale="en"
      preferredTab="login"
    />,
  );
  await settle();
  return view;
}

beforeEach(() => {
  installReducedMotion(true);
});

afterEach(async () => {
  await view?.unmount();
  view = null;
  vi.restoreAllMocks();
});

describe("directory settings section", () => {
  it("renders the directory form only when the adapter provides the directory methods", async () => {
    const supported = await mountSurface(makeAdapter());
    expect(byTestId(supported.host, "directory-settings-section")).toBeTruthy();
    expect((byTestId(supported.host, "directory-enabled") as HTMLInputElement).checked).toBe(true);
    expect(byTestId(supported.host, "directory-last-sync-empty").textContent).toContain(directoryLabels.lastSyncNever);
    await supported.unmount();
    view = null;

    const bare = await mountSurface(
      makeAdapter({ loadDirectorySettings: undefined, saveDirectorySettings: undefined, testDirectory: undefined, syncDirectory: undefined }),
    );
    expect(bare.host.querySelector("[data-test-id='directory-settings-section']")).toBeNull();
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
