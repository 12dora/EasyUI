// @vitest-environment happy-dom
/**
 * User risk: this card decides whether the whole company can sign in with a work
 * account, and with which scopes. Two things must hold no matter what: the master
 * switch stays reachable after the block is turned off (otherwise sign-in can never
 * be restored), and the scope boxes can only ever produce a wire value the provider
 * accepts — `openid` first, nothing invented by hand.
 */
import { act, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { byTestId, click, installReducedMotion, mount, type MountedView } from "./behavior-test-utils";
import {
  EnterpriseOidcConfigurationForm,
  type EnterpriseIntegrationConfigurationLabels,
  type EnterpriseOidcConfigurationValue,
} from "./integration-configuration-forms";
import { createEnterpriseLabelCatalog } from "./label-catalog";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const catalog = createEnterpriseLabelCatalog("en", { appName: "Test", appDescription: "Test" }, "business");

/** The scope copy is filled in by the catalog; pinned here so the test reads on its own. */
const scopesHintText = "Information requested from the sign-in service.";

const labels: EnterpriseIntegrationConfigurationLabels = {
  ...catalog.access.configuration,
  scopesHint: scopesHintText,
  scopeOptions: {
    openid: "Basic identity (required)",
    profile: "Name and avatar",
    email: "Email address",
    dingtalk: "DingTalk user ID",
  },
};

const settings: EnterpriseOidcConfigurationValue = {
  enabled: true,
  issuer: "https://id.example.com",
  authorizationEndpoint: "",
  tokenEndpoint: "",
  jwksUri: "",
  userinfoEndpoint: "",
  clientId: "trade",
  hasClientSecret: true,
  scopes: "openid profile",
  redirectBaseUrl: "https://app.example.com",
  redirectUri: "https://app.example.com/api/v1/auth/oidc/callback",
  frontendBaseUrl: "",
  serverBaseUrl: "",
};

let view: MountedView | null = null;

/** Stateful host: the card is controlled, so a click must come back as a new value. */
function Harness({
  initial,
  onPatch,
  disabled,
}: {
  initial: EnterpriseOidcConfigurationValue;
  onPatch: (patch: Partial<EnterpriseOidcConfigurationValue>) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState(initial);
  return (
    <EnterpriseOidcConfigurationForm
      labels={labels}
      value={value}
      clientSecret={{ value: "", clear: false }}
      disabled={disabled}
      onChange={(patch) => {
        onPatch(patch);
        setValue((current) => ({ ...current, ...patch }));
      }}
      onClientSecretChange={() => undefined}
      onSave={() => undefined}
    />
  );
}

async function mountForm(overrides: Partial<EnterpriseOidcConfigurationValue> = {}, disabled?: boolean) {
  const onPatch = vi.fn();
  view = await mount(<Harness initial={{ ...settings, ...overrides }} onPatch={onPatch} disabled={disabled} />);
  return { host: view.host, onPatch };
}

/** Native activation, so the box's own `checked` flips before React reads it. */
async function toggleBox(element: HTMLElement): Promise<void> {
  await act(async () => {
    (element as HTMLInputElement).click();
  });
}

function scopeBox(host: ParentNode, token: string): HTMLInputElement {
  return byTestId(host, `enterprise-oidc-scope-${token}`) as HTMLInputElement;
}

beforeEach(() => {
  installReducedMotion(true);
});

afterEach(async () => {
  await view?.unmount();
  view = null;
  vi.restoreAllMocks();
});

describe("work-account sign-in card: the master switch", () => {
  it("is a switch in the card header, named by the enable label, and reports each flip", async () => {
    const { host, onPatch } = await mountForm();

    const control = byTestId(host, "identity-enabled");
    expect(control.getAttribute("role")).toBe("switch");
    expect(control.getAttribute("aria-checked")).toBe("true");
    expect(control.getAttribute("aria-label")).toBe(labels.enabled);
    // Top-right of the card, not the first row of the form body.
    expect(control.closest("header")).not.toBeNull();

    await click(control);

    expect(onPatch).toHaveBeenCalledWith({ enabled: false });
    expect(byTestId(host, "identity-enabled").getAttribute("aria-checked")).toBe("false");
  });

  it("greys the body out and takes it out of reach when off, while the switch stays operable", async () => {
    const { host, onPatch } = await mountForm({ enabled: false });

    const body = host.querySelector("[inert]") as HTMLElement;
    expect(body).not.toBeNull();
    expect(body.className).toContain("opacity-50");
    expect(body.className).toContain("pointer-events-none");
    // The gated block is the form body: the issuer box lives inside it.
    expect(body.querySelector("#enterprise-oidc-issuer")).not.toBeNull();
    // Save stays outside, so the user can persist the "off" state.
    expect(byTestId(host, "enterprise-oidc-save").closest("[inert]")).toBeNull();

    const control = byTestId(host, "identity-enabled") as HTMLButtonElement;
    expect(control.closest("[inert]")).toBeNull();
    expect(control.disabled).toBe(false);

    await click(control);

    expect(onPatch).toHaveBeenCalledWith({ enabled: true });
    expect(host.querySelector("[inert]")).toBeNull();
  });

  it("is the only control left when the account may not manage the settings", async () => {
    const { host } = await mountForm({}, true);

    expect((byTestId(host, "identity-enabled") as HTMLButtonElement).disabled).toBe(true);
    expect(host.querySelector("[data-test-id='enterprise-oidc-save']")).toBeNull();
    expect(scopeBox(host, "profile").disabled).toBe(true);
  });
});

describe("work-account sign-in card: scopes", () => {
  it("shows the four supported scopes as a named group and mirrors the stored value", async () => {
    const { host } = await mountForm();

    const group = byTestId(host, "enterprise-oidc-scopes");
    expect(group.getAttribute("role")).toBe("group");
    expect(group.getAttribute("aria-label")).toBe(labels.scopes);
    expect(scopeBox(host, "openid").checked).toBe(true);
    expect(scopeBox(host, "profile").checked).toBe(true);
    expect(scopeBox(host, "email").checked).toBe(false);
    expect(scopeBox(host, "dingtalk").checked).toBe(false);
    // The token is printed next to its plain-words description.
    expect(scopeBox(host, "dingtalk").closest("label")?.textContent).toBe(`dingtalk${labels.scopeOptions.dingtalk}`);
  });

  it("keeps openid checked and locked: OIDC has no sign-in without it", async () => {
    const { host, onPatch } = await mountForm({ scopes: "" });

    const openid = scopeBox(host, "openid");
    expect(openid.checked).toBe(true);
    expect(openid.disabled).toBe(true);

    await toggleBox(openid);

    expect(onPatch).not.toHaveBeenCalled();
    expect(scopeBox(host, "openid").checked).toBe(true);
  });

  it("writes back a canonical space-separated value as boxes are ticked and cleared", async () => {
    const { host, onPatch } = await mountForm({ scopes: "openid profile" });

    await toggleBox(scopeBox(host, "email"));
    expect(onPatch).toHaveBeenLastCalledWith({ scopes: "openid profile email" });

    await toggleBox(scopeBox(host, "dingtalk"));
    expect(onPatch).toHaveBeenLastCalledWith({ scopes: "openid profile email dingtalk" });

    await toggleBox(scopeBox(host, "profile"));
    expect(onPatch).toHaveBeenLastCalledWith({ scopes: "openid email dingtalk" });
    expect(scopeBox(host, "profile").checked).toBe(false);
  });

  it("drops a token the fixed list does not offer the next time the value is written", async () => {
    const { host, onPatch } = await mountForm({ scopes: "openid offline_access" });

    await toggleBox(scopeBox(host, "email"));

    expect(onPatch).toHaveBeenLastCalledWith({ scopes: "openid email" });
  });
});

describe("work-account sign-in card: a host that builds its own labels", () => {
  it("prints the bare token and no hint instead of crashing on the missing scope copy", async () => {
    const bare: EnterpriseIntegrationConfigurationLabels = { ...labels };
    delete bare.scopesHint;
    delete bare.scopeOptions;
    view = await mount(<EnterpriseOidcConfigurationForm labels={bare} value={settings} clientSecret={{ value: "", clear: false }} onChange={() => undefined} onClientSecretChange={() => undefined} onSave={() => undefined} />);

    const group = byTestId(view.host, "enterprise-oidc-scopes");
    expect(group.textContent).toBe("openidprofileemaildingtalk");
    expect(group.parentElement?.textContent).not.toContain(scopesHintText);
  });
});

describe("work-account sign-in card: operation feedback", () => {
  it("keeps the save / test result readable while the switched-off body is inert", async () => {
    view = await mount(
      <EnterpriseOidcConfigurationForm
        labels={labels}
        value={{ ...settings, enabled: false }}
        clientSecret={{ value: "", clear: false }}
        operationResult={{ ok: true, message: labels.operationSucceeded }}
        onChange={() => undefined}
        onClientSecretChange={() => undefined}
        onSave={() => undefined}
      />,
    );

    const notice = byTestId(view.host, "identity-connection-test-result");
    expect(notice.textContent).toContain(labels.operationSucceeded);
    expect(notice.closest("[inert]")).toBeNull();
    // It sits above the gate, next to the header actions it reports on.
    expect(view.host.querySelector("[inert]")).not.toBeNull();
  });
});
