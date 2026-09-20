// @vitest-environment happy-dom
/**
 * User risk: 我的授权 / 权限目录 are the two lists a user reads to answer
 * "what am I allowed to do". Raw backend enums (`MANAGED_USERS`, `high`) and a
 * bare permission code are unreadable to the people who have to act on them,
 * and an unbounded list pushes the rest of the settings page off screen.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  EnterpriseAuthorizationWorkspace,
  type AuthorizationWorkspaceLabels,
  type EnterpriseAuthorizationAdapter,
  type EnterpriseCurrentGrant,
  type EnterprisePermissionCatalogItem,
} from "./authorization-workspace";
import { createEnterpriseLabelCatalog } from "./label-catalog";
import { byTestId, installReducedMotion, mount, settle, type MountedView } from "./behavior-test-utils";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const catalogLabels = createEnterpriseLabelCatalog("en", { appName: "Test", appDescription: "Test" }, "business");
const labels: AuthorizationWorkspaceLabels = {
  ...catalogLabels.access.authorization,
  riskStandard: "Standard",
  riskHigh: "High",
};
let view: MountedView | null = null;

const SCROLL_VIEWPORT = "max-h-[320px] overflow-auto overscroll-contain";

/**
 * The sticky header only works when the height-capped element is the header's
 * own scrolling ancestor: any nested `overflow-*` box would claim that role
 * (`overflow-x: auto` implies `overflow-y: auto`) and never scroll vertically.
 * Without layout in happy-dom, "nearest scrollable ancestor" is pinned
 * structurally — the first ancestor that scrolls on any axis.
 */
function nearestScrollAncestor(node: Element): Element | null {
  for (let current = node.parentElement; current; current = current.parentElement) {
    if (/overflow(-[xy])?-(auto|scroll)/.test(current.className)) return current;
  }
  return null;
}

const permission = (over: Partial<EnterprisePermissionCatalogItem>): EnterprisePermissionCatalogItem => ({
  code: "order.read",
  nameZh: "查看订单",
  nameEn: "View orders",
  domain: "order",
  resource: "order",
  action: "read",
  supportedScopes: ["SELF", "MANAGED_USERS", "ALL"],
  riskLevel: "standard",
  active: true,
  ...over,
});

function makeAdapter(
  catalog: readonly EnterprisePermissionCatalogItem[],
  grants: readonly EnterpriseCurrentGrant[],
): EnterpriseAuthorizationAdapter {
  return {
    loadStatus: vi.fn().mockResolvedValue({ easyauth: { configured: true, hasCredential: true }, principal: {}, catalog: {}, snapshots: {} }),
    loadCatalog: vi.fn().mockResolvedValue(catalog),
    loadSnapshots: vi.fn().mockResolvedValue([]),
    loadMyGrants: vi.fn().mockResolvedValue(grants),
    testConnection: vi.fn(),
    refreshSnapshot: vi.fn(),
    loadIdentity: vi.fn(),
  } as unknown as EnterpriseAuthorizationAdapter;
}

async function mountWorkspace(
  catalog: readonly EnterprisePermissionCatalogItem[],
  grants: readonly EnterpriseCurrentGrant[],
  locale = "en",
): Promise<MountedView> {
  view = await mount(
    <EnterpriseAuthorizationWorkspace
      adapter={makeAdapter(catalog, grants)}
      labels={labels}
      locale={locale}
      canManage
      section="authorization"
    />,
  );
  await settle(20);
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

describe("business-permission lists — localized values", () => {
  it("renders supported data scopes as localized text instead of backend codes", async () => {
    const host = (await mountWorkspace([permission({})], [])).host;

    const row = byTestId(host, "authz-permission-catalog").textContent ?? "";
    expect(row).toContain([labels.scopeSelf, labels.scopeManagedUsers, labels.scopeAll].join(labels.roleGroupSeparator));
    expect(row).not.toContain("MANAGED_USERS");
    expect(row).not.toContain("SELF");
  });

  it("keeps an unknown scope code visible rather than blanking the cell", async () => {
    const host = (await mountWorkspace([permission({ supportedScopes: ["DEPARTMENT"] })], [])).host;

    expect(byTestId(host, "authz-permission-catalog").textContent).toContain("DEPARTMENT");
  });

  it("localizes risk levels and badges the high-risk one", async () => {
    const host = (await mountWorkspace(
      [
        permission({ code: "order.read", riskLevel: "standard" }),
        permission({ code: "order.delete", nameEn: "Delete orders", riskLevel: "high" }),
        permission({ code: "order.odd", nameEn: "Odd", riskLevel: "critical" }),
      ],
      [],
    )).host;

    const table = byTestId(host, "authz-permission-catalog");
    expect(table.textContent).toContain(labels.riskStandard);
    expect(table.textContent).toContain(labels.riskHigh);
    expect(table.textContent).not.toContain("standard");
    // Unknown levels still surface their raw value.
    expect(table.textContent).toContain("critical");
    const highBadge = [...table.querySelectorAll("span")].find((node) => node.textContent === labels.riskHigh);
    expect(highBadge?.className).toContain("amber");
  });

  it("shows the catalog name with the code beneath it on a grant row", async () => {
    const host = (await mountWorkspace(
      [permission({ code: "order.read", nameEn: "View orders", nameZh: "查看订单" })],
      [{ permissionCode: "order.read", dataScope: "MANAGED_USERS" }],
    )).host;

    const grants = byTestId(host, "authz-my-grants-scroll");
    expect(grants.textContent).toContain("View orders");
    expect(grants.textContent).toContain("order.read");
    expect(grants.textContent).toContain(labels.scopeManagedUsers);
    expect(grants.textContent).not.toContain("MANAGED_USERS");
  });

  it("picks the Chinese catalog name when the locale is Chinese", async () => {
    const host = (await mountWorkspace(
      [permission({ code: "order.read" })],
      [{ permissionCode: "order.read", dataScope: "SELF" }],
      "zh-CN",
    )).host;

    expect(byTestId(host, "authz-my-grants-scroll").textContent).toContain("查看订单");
  });

  it("falls back to the bare code — never an em dash — when the catalog has no match", async () => {
    const host = (await mountWorkspace([], [{ permissionCode: "order.export", dataScope: "ALL" }])).host;

    const grants = byTestId(host, "authz-my-grants-scroll");
    expect(grants.textContent).toContain("order.export");
    expect(grants.textContent).not.toContain(labels.notAvailable);
  });
});

describe("business-permission lists — fixed-height viewport", () => {
  it("caps both lists with a scrollable viewport once they have rows", async () => {
    const host = (await mountWorkspace(
      [permission({ code: "order.read" }), permission({ code: "order.write", nameEn: "Write orders" })],
      [{ permissionCode: "order.read", dataScope: "SELF" }],
    )).host;

    for (const testId of ["authz-my-grants-scroll", "authz-permission-catalog-scroll"]) {
      const viewport = byTestId(host, testId);
      // One element owns the height cap AND both scroll axes.
      expect(viewport.className).toBe(SCROLL_VIEWPORT);
      const nested = [...viewport.querySelectorAll("*")].filter(
        (node) => /overflow(-[xy])?-(auto|scroll)/.test(node.className) || /overflow[^:]*:\s*(auto|scroll)/.test(node.getAttribute("style") ?? ""),
      );
      expect(nested).toEqual([]);
    }
    const catalogViewport = byTestId(host, "authz-permission-catalog-scroll");
    // Horizontal scrolling survives: the table keeps its min-width.
    expect(catalogViewport.querySelector(".min-w-\\[680px\\]")).toBeTruthy();

    const header = byTestId(host, "authz-permission-catalog").querySelector("th");
    expect(header?.className).toContain("sticky");
    expect(header?.className).toContain("top-0");
    // …and it sticks to the capped viewport, not to some inner overflow box.
    expect(nearestScrollAncestor(header!)).toBe(catalogViewport);
  });

  it("leaves the empty state uncapped so it is not boxed into 320px", async () => {
    const host = (await mountWorkspace([], [])).host;

    for (const testId of ["authz-my-grants-scroll", "authz-permission-catalog-scroll"]) {
      expect(byTestId(host, testId).className).not.toContain("max-h-");
    }
    expect(byTestId(host, "authz-permission-catalog").querySelector("th")?.className).not.toContain("sticky");
  });
});
