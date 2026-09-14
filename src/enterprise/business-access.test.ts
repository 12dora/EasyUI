import { describe, expect, it } from "vitest";

import { hasEnterpriseBusinessAccess } from "./business-access";

const NAV = ["learning.course.view", "identity.integration.view", "settings.app_setting.update"] as const;

describe("hasEnterpriseBusinessAccess", () => {
  it("is false for a logged-in account with nothing granted", () => {
    expect(hasEnterpriseBusinessAccess({ permissions: new Set(), businessPermissionCodes: NAV })).toBe(false);
  });

  it("is false when the only permission is omitted from the host's gated-nav codes", () => {
    expect(
      hasEnterpriseBusinessAccess({
        permissions: new Set(["notification.center.view"]),
        businessPermissionCodes: NAV,
      }),
    ).toBe(false);
  });

  it("is true when any host-supplied business permission is held", () => {
    expect(
      hasEnterpriseBusinessAccess({
        permissions: new Set(["identity.integration.view"]),
        businessPermissionCodes: NAV,
      }),
    ).toBe(true);
  });

  it("is true when any local security capability is enabled", () => {
    expect(
      hasEnterpriseBusinessAccess({
        permissions: new Set(),
        securityCapabilities: { passwordChange: false, totpStatus: true },
        businessPermissionCodes: NAV,
      }),
    ).toBe(true);
    expect(
      hasEnterpriseBusinessAccess({
        permissions: new Set(),
        securityCapabilities: { passwordChange: false },
        businessPermissionCodes: NAV,
      }),
    ).toBe(false);
  });

  it("is true for the local superadmin regardless of permission codes", () => {
    expect(
      hasEnterpriseBusinessAccess({
        permissions: new Set(),
        isLocalSuperadmin: true,
        businessPermissionCodes: NAV,
      }),
    ).toBe(true);
  });

  it("ignores permission codes when the host passes none", () => {
    expect(hasEnterpriseBusinessAccess({ permissions: new Set(["learning.course.view"]) })).toBe(false);
    expect(
      hasEnterpriseBusinessAccess({
        permissions: new Set(["learning.course.view"]),
        securityCapabilities: { passwordChange: true },
      }),
    ).toBe(true);
  });
});
