// @vitest-environment happy-dom
/**
 * User risk: the EasyAuth section now carries two write-only secrets. Mixing
 * them up, or letting a blank box overwrite a stored one, silently breaks
 * either the app's calls to EasyAuth (credential) or the signature check on
 * incoming grant events (webhook secret) — both fail long after the save.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EnterpriseAccessSettingsSurface, type EnterpriseAccessSettingsAdapter } from "./access-settings-surface";
import type { EnterpriseEasyAuthConfigurationValue } from "./integration-configuration-forms";
import { createEnterpriseLabelCatalog } from "./label-catalog";
import { byTestId, click, input, installReducedMotion, mount, settle, type MountedView } from "./behavior-test-utils";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const catalog = createEnterpriseLabelCatalog("en", { appName: "Test", appDescription: "Test" }, "business");
const configurationLabels = catalog.access.configuration;
let view: MountedView | null = null;

const settings: EnterpriseEasyAuthConfigurationValue = {
  baseUrl: "https://auth.example.com",
  appKey: "easytrade",
  hasCredential: true,
  hasWebhookSecret: false,
  permissionRequestUrl: "https://auth.example.com/apply",
};

function makeAdapter(value: EnterpriseEasyAuthConfigurationValue = settings): EnterpriseAccessSettingsAdapter {
  return {
    easyAuthConnectionEditable: true,
    loadStatus: vi.fn().mockResolvedValue({ easyauth: { configured: true, hasCredential: true }, principal: {}, catalog: {}, snapshots: {} }),
    loadOidcSettings: vi.fn(),
    saveOidcSettings: vi.fn(),
    loadEasyAuthSettings: vi.fn().mockResolvedValue(value),
    saveEasyAuthSettings: vi.fn().mockImplementation(async (next: EnterpriseEasyAuthConfigurationValue) => next),
  } as unknown as EnterpriseAccessSettingsAdapter;
}

async function mountSurface(adapter: EnterpriseAccessSettingsAdapter) {
  view = await mount(
    <EnterpriseAccessSettingsSurface
      adapter={adapter}
      labels={catalog.access}
      permissions={{ viewIdentity: false, manageIdentity: false, viewAuthorization: true, manageAuthorization: true }}
      locale="en"
      preferredTab="permissions"
    />,
  );
  await settle();
  return view;
}

function secretInput(host: ParentNode, testId: string): HTMLInputElement {
  return byTestId(host, testId).querySelector("input") as HTMLInputElement;
}

beforeEach(() => {
  installReducedMotion(true);
});

afterEach(async () => {
  await view?.unmount();
  view = null;
  vi.restoreAllMocks();
});

describe("EasyAuth settings secrets", () => {
  it("renders both secrets as write-only boxes and shows which one the server already holds", async () => {
    const mounted = await mountSurface(makeAdapter());

    const credential = secretInput(mounted.host, "easyauth-credential");
    const webhook = secretInput(mounted.host, "easyauth-webhook-secret");
    expect(credential.type).toBe("password");
    expect(webhook.type).toBe("password");
    // Neither secret is ever echoed back; only the "configured / not configured" state is.
    expect(credential.value).toBe("");
    expect(webhook.value).toBe("");
    expect(credential.placeholder).toBe(configurationLabels.configured);
    expect(webhook.placeholder).toBe(configurationLabels.notConfigured);
    expect(byTestId(mounted.host, "easyauth-webhook-secret").textContent).toContain(configurationLabels.webhookSecret);
    expect(byTestId(mounted.host, "easyauth-webhook-secret").textContent).toContain(configurationLabels.webhookSecretHint);
  });

  it("reports a stored webhook secret as configured without revealing it", async () => {
    const mounted = await mountSurface(makeAdapter({ ...settings, hasCredential: false, hasWebhookSecret: true }));

    expect(secretInput(mounted.host, "easyauth-webhook-secret").placeholder).toBe(configurationLabels.configured);
    expect(secretInput(mounted.host, "easyauth-credential").placeholder).toBe(configurationLabels.notConfigured);
  });

  it("passes a typed webhook secret through once and leaves the untouched credential alone", async () => {
    const adapter = makeAdapter();
    const mounted = await mountSurface(adapter);

    await click(byTestId(mounted.host, "enterprise-easyauth-save"));
    await settle();
    expect(adapter.saveEasyAuthSettings).toHaveBeenCalledWith(settings, { credential: undefined, webhookSecret: undefined });

    await input(secretInput(mounted.host, "easyauth-webhook-secret"), "whsec-live");
    await click(byTestId(mounted.host, "enterprise-easyauth-save"));
    await settle();
    expect(adapter.saveEasyAuthSettings).toHaveBeenLastCalledWith(settings, { credential: undefined, webhookSecret: "whsec-live" });
    // Emptied after a successful save so the secret is never echoed back into the DOM.
    expect(secretInput(mounted.host, "easyauth-webhook-secret").value).toBe("");
  });
});
