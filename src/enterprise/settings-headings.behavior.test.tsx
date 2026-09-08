// @vitest-environment happy-dom
/**
 * User risk: `EnterpriseSettingsPageFrame` stopped painting a parent "Settings"
 * heading, so each settings surface is now the sole owner of its route's H1.
 * A surface that returns early on permission denial therefore hands the user a
 * page with no heading at all — no title in the tab order, nothing for a screen
 * reader to land on, and no clue which page was refused.
 */
import { afterEach, describe, expect, it } from "vitest";

import { EnterpriseAccessSettingsSurface, type EnterpriseAccessSettingsAdapter } from "./access-settings-surface";
import { EnterprisePermissionDeniedPage } from "./surface-helpers";
import { createEnterpriseLabelCatalog } from "./label-catalog";
import { EnterpriseAccountSecuritySurface, type EnterpriseSecurityAdapter } from "./security-workspace";
import { EnterpriseUpstreamHealthController, type EnterpriseUpstreamHealthAdapter } from "./upstream-health-controller";
import {
  EnterpriseLocalAccountsSurface,
  type EnterpriseLocalAccountsAdapter,
  type EnterpriseLocalAccountsLabels,
} from "../enterprise-local-accounts/index";
import { byTestId, installReducedMotion, mount, settle, type MountedView } from "./behavior-test-utils";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const labels = createEnterpriseLabelCatalog("zh-CN", { appName: "测试", appDescription: "测试" }, "business");
const localAccountLabels = {
  title: "本地账户",
  description: "管理本机登录账户。",
  permissionDenied: "当前账号无法查看本地账户。",
} as unknown as EnterpriseLocalAccountsLabels;

let view: MountedView | null = null;

afterEach(async () => {
  await view?.unmount();
  view = null;
});

function headings(host: ParentNode): string[] {
  return [...host.querySelectorAll("h1")].map((node) => node.textContent ?? "");
}

const modes = ["inline", "toast"] as const;

describe("settings surfaces keep exactly one H1 when permission is denied", () => {
  it.each(modes)("access settings (%s)", async (feedbackMode) => {
    installReducedMotion(true);
    view = await mount(
      <EnterpriseAccessSettingsSurface
        adapter={{} as EnterpriseAccessSettingsAdapter}
        labels={labels.access}
        permissions={{ viewIdentity: false, manageIdentity: false, viewAuthorization: false, manageAuthorization: false }}
        locale="zh-CN"
        feedbackMode={feedbackMode}
      />,
    );
    await settle(10);
    expect(headings(view.host)).toEqual([labels.access.page.title]);
    expect(byTestId(view.host, "permission-denied")).toBeTruthy();
  });

  it.each(modes)("account security (%s)", async (feedbackMode) => {
    installReducedMotion(true);
    view = await mount(
      <EnterpriseAccountSecuritySurface
        adapter={{} as EnterpriseSecurityAdapter}
        labels={labels.security}
        permissions={{ password: false, totpStatus: false, createTotp: false, disableTotp: false, viewPasskeys: false, canRegisterPasskeys: false, canDeletePasskeys: false }}
        feedbackMode={feedbackMode}
      />,
    );
    await settle(10);
    expect(headings(view.host)).toEqual([labels.security.page.title]);
    expect(byTestId(view.host, "permission-denied")).toBeTruthy();
  });

  it.each(modes)("upstream health (%s)", async (feedbackMode) => {
    installReducedMotion(true);
    view = await mount(
      <EnterpriseUpstreamHealthController
        adapter={{} as EnterpriseUpstreamHealthAdapter}
        labels={labels.upstream}
        locale="zh-CN"
        canView={false}
        canManage={false}
        feedbackMode={feedbackMode}
      />,
    );
    await settle(10);
    expect(headings(view.host)).toEqual([labels.upstream.title]);
    expect(byTestId(view.host, "permission-denied")).toBeTruthy();
  });

  it("local accounts", async () => {
    installReducedMotion(true);
    view = await mount(
      <EnterpriseLocalAccountsSurface
        adapter={{} as EnterpriseLocalAccountsAdapter}
        labels={localAccountLabels}
        permissions={{ view: false, manage: false }}
        capabilities={{ isLocalSuperadmin: false, accountId: "u-1" }}
        locale="zh-CN"
      />,
    );
    await settle(10);
    expect(headings(view.host)).toEqual([localAccountLabels.title]);
    expect(byTestId(view.host, "permission-denied")).toBeTruthy();
  });
});

describe("hosts can paint a denied page for a route this package does not own", () => {
  it("gives the general settings route its heading and its reason", async () => {
    installReducedMotion(true);
    view = await mount(
      <EnterprisePermissionDeniedPage
        title={labels.generalSettings.title}
        description={labels.generalSettings.description}
        message="当前账号无法查看通用设置。"
        testId="general-settings-page"
      />,
    );
    await settle(10);
    expect(headings(view.host)).toEqual([labels.generalSettings.title]);
    expect(byTestId(view.host, "general-settings-page")).toBeTruthy();
    expect(view.host.textContent).toContain("当前账号无法查看通用设置。");
  });
});

describe("account security lets a host page own the heading", () => {
  const permissions = {
    password: true,
    totpStatus: true,
    createTotp: true,
    disableTotp: true,
    viewPasskeys: false,
    canRegisterPasskeys: false,
    canDeletePasskeys: false,
  };
  const adapter = {
    changePassword: () => Promise.resolve(),
    loadTotpStatus: () => Promise.resolve({ enabled: false }),
  } as unknown as EnterpriseSecurityAdapter;

  it("renders no heading of its own when showHeader is false", async () => {
    installReducedMotion(true);
    view = await mount(
      <EnterpriseAccountSecuritySurface adapter={adapter} labels={labels.security} permissions={permissions} showHeader={false} />,
    );
    await settle(20);
    // The host page painted the H1; a second one here would read as two pages.
    expect(headings(view.host)).toEqual([]);
    expect(byTestId(view.host, "password-card")).toBeTruthy();
  });

  it("keeps painting its own heading by default", async () => {
    installReducedMotion(true);
    view = await mount(
      <EnterpriseAccountSecuritySurface adapter={adapter} labels={labels.security} permissions={permissions} />,
    );
    await settle(20);
    expect(headings(view.host)).toEqual([labels.security.page.title]);
  });

  it.each(modes)("keeps the denial notice heading-less when showHeader is false (%s)", async (feedbackMode) => {
    installReducedMotion(true);
    view = await mount(
      <EnterpriseAccountSecuritySurface
        adapter={{} as EnterpriseSecurityAdapter}
        labels={labels.security}
        permissions={{ password: false, totpStatus: false, createTotp: false, disableTotp: false, viewPasskeys: false, canRegisterPasskeys: false, canDeletePasskeys: false }}
        feedbackMode={feedbackMode}
        showHeader={false}
      />,
    );
    await settle(10);
    expect(headings(view.host)).toEqual([]);
    // The user must still be told why the page is empty.
    expect(byTestId(view.host, "permission-denied")).toBeTruthy();
    expect(view.host.textContent).toContain(labels.security.permissionDenied);
  });
});

describe("settings surfaces keep exactly one H1 when the body fails to load", () => {
  it("upstream health keeps its heading beside the failure notice", async () => {
    installReducedMotion(true);
    const adapter = {
      load: () => Promise.reject(new Error("offline")),
      runChecks: () => Promise.reject(new Error("offline")),
    } as unknown as EnterpriseUpstreamHealthAdapter;
    view = await mount(
      <EnterpriseUpstreamHealthController
        adapter={adapter}
        labels={labels.upstream}
        locale="zh-CN"
        canView
        canManage
      />,
    );
    await settle(20);
    expect(headings(view.host)).toEqual([labels.upstream.title]);
    expect(view.host.textContent).toContain(labels.upstream.loadFailed);
  });
});
