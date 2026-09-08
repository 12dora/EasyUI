// @vitest-environment happy-dom
/**
 * User risk: the Customs access page must show one business instant on the
 * same Shanghai calendar date for every viewer, while shared hosts stay local.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixedInstant = "2026-12-31T18:30:00.000Z";
const consumerMocks = vi.hoisted(() => {
  const snapshot = {
    userId: "user-1",
    displayName: "Shanghai operator",
    grantCount: 3,
    snapshotVersion: "v1",
    roleGroups: ["ops"],
    fetchedAt: "2026-12-31T18:30:00.000Z",
    expiresAt: "2027-01-01T18:30:00.000Z",
    expired: false,
  };
  return {
    identity: {
      permissions: {
        has: (permission: string) => permission.startsWith("authz.integration"),
      },
    },
    adapter: {
      easyAuthConnectionEditable: true,
      loadIdentity: vi.fn().mockResolvedValue({ enabled: true, configured: true, hasClientSecret: true, hasAuthentikApiToken: true, userSyncEnabled: true }),
      loadStatus: vi.fn().mockResolvedValue({ easyauth: { configured: true, hasCredential: true }, principal: {}, catalog: {}, snapshots: {} }),
      testConnection: vi.fn().mockResolvedValue({ ok: true, latencyMs: 10 }),
      loadCatalog: vi.fn().mockResolvedValue([]),
      loadSnapshots: vi.fn().mockResolvedValue([snapshot]),
      refreshSnapshot: vi.fn().mockResolvedValue(snapshot),
      loadOidcSettings: vi.fn(),
      saveOidcSettings: vi.fn(),
      loadEasyAuthSettings: vi.fn().mockResolvedValue({ baseUrl: "https://auth.example", appKey: "customs", hasCredential: true, hasWebhookSecret: false, permissionRequestUrl: "" }),
      saveEasyAuthSettings: vi.fn(),
    },
  };
});

vi.mock("next/navigation", () => ({
  useParams: () => ({ locale: "en" }),
}));
vi.mock("../../../../apps/customs/components/customs-shell", () => ({
  useCustomsShellIdentity: () => consumerMocks.identity,
}));
vi.mock("../../../../apps/customs/lib/authorization-adapter", () => ({
  authorizationAdapter: consumerMocks.adapter,
}));

import AccessPage from "../../../../apps/customs/app/[locale]/app/settings/access/page";
import { formatShanghaiDateTime } from "../../../../apps/customs/lib/shanghai-time";
import { EnterpriseAuthorizationWorkspace, type EnterpriseAuthorizationAdapter } from "./authorization-workspace";
import { createEnterpriseLabelCatalog } from "./label-catalog";
import { installReducedMotion, mount, settle, type MountedView } from "./behavior-test-utils";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let view: MountedView | null = null;

function configureAdapter(): void {
  consumerMocks.adapter.loadIdentity.mockResolvedValue({ enabled: true, configured: true, hasClientSecret: true, hasAuthentikApiToken: true, userSyncEnabled: true });
  consumerMocks.adapter.loadStatus.mockResolvedValue({ easyauth: { configured: true, hasCredential: true }, principal: {}, catalog: {}, snapshots: {} });
  consumerMocks.adapter.testConnection.mockResolvedValue({ ok: true, latencyMs: 10 });
  consumerMocks.adapter.loadCatalog.mockResolvedValue([]);
  consumerMocks.adapter.loadSnapshots.mockResolvedValue([{
    userId: "user-1",
    displayName: "Shanghai operator",
    grantCount: 3,
    snapshotVersion: "v1",
    roleGroups: ["ops"],
    fetchedAt: fixedInstant,
    expiresAt: "2027-01-01T18:30:00.000Z",
    expired: false,
  }]);
  consumerMocks.adapter.loadEasyAuthSettings.mockResolvedValue({ baseUrl: "https://auth.example", appKey: "customs", hasCredential: true, hasWebhookSecret: false, permissionRequestUrl: "" });
}

beforeEach(() => {
  installReducedMotion(true);
  configureAdapter();
});

afterEach(async () => {
  await view?.unmount();
  view = null;
  vi.restoreAllMocks();
});

describe("FE-BUG-11 timestamp consumer contract", () => {
  it("renders the Customs snapshot in Asia/Shanghai even when browser-local formatting disagrees", async () => {
    vi.spyOn(Date.prototype, "toLocaleString").mockReturnValue("BROWSER-LOCAL-DEC-31");
    const expected = formatShanghaiDateTime(fixedInstant);

    view = await mount(<AccessPage />);
    await settle(30);

    expect(view.host.textContent).toContain("Shanghai operator");
    expect(view.host.textContent).toContain(expected);
    expect(view.host.textContent).not.toContain("BROWSER-LOCAL-DEC-31");
  });

  it("keeps the shared formatter browser-local when a host supplies no timezone option", async () => {
    vi.spyOn(Date.prototype, "toLocaleString").mockReturnValue("BROWSER-LOCAL");
    const labels = createEnterpriseLabelCatalog("en", { appName: "Test", appDescription: "Test" }, "business");

    view = await mount(
      <EnterpriseAuthorizationWorkspace
        adapter={consumerMocks.adapter as unknown as EnterpriseAuthorizationAdapter}
        labels={labels.access.authorization}
        locale="en-US"
        canManage
        section="authorization"
        feedbackMode="toast"
      />,
    );
    await settle(30);

    expect(view.host.textContent).toContain("BROWSER-LOCAL");
  });
});
