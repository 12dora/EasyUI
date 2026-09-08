/**
 * User risk: the identity line is the only place a user sees what they are in
 * this app. Falling through to "guest" for someone who holds grants reads as
 * "you have been locked out".
 */
import { describe, expect, it } from "vitest";

import { resolveEnterpriseIdentityLabel } from "./identity-label";

const labels = { admin: "管理员", user: "用户", guest: "游客", separator: "、" };

describe("resolveEnterpriseIdentityLabel", () => {
  it("labels the local superadmin as administrator, whatever else it holds", () => {
    expect(
      resolveEnterpriseIdentityLabel({ isLocalSuperadmin: true, roleGroups: ["财务"], permissions: ["a"] }, labels),
    ).toEqual({ kind: "admin", label: "管理员" });
  });

  it("joins role groups with the separator", () => {
    expect(resolveEnterpriseIdentityLabel({ roleGroups: ["财务", "采购"] }, labels)).toEqual({
      kind: "user",
      label: "财务、采购",
    });
  });

  it("falls back to the generic user label when only permissions are held", () => {
    expect(resolveEnterpriseIdentityLabel({ roleGroups: [], permissions: ["exam.view"] }, labels)).toEqual({
      kind: "user",
      label: "用户",
    });
    expect(resolveEnterpriseIdentityLabel({ permissions: new Set(["exam.view"]) }, labels)).toEqual({
      kind: "user",
      label: "用户",
    });
  });

  it("is a guest with no superadmin flag, no role groups and no permissions", () => {
    expect(resolveEnterpriseIdentityLabel({}, labels)).toEqual({ kind: "guest", label: "游客" });
    expect(resolveEnterpriseIdentityLabel({ roleGroups: null, permissions: [] }, labels)).toEqual({
      kind: "guest",
      label: "游客",
    });
    // Blank group names are not a label.
    expect(resolveEnterpriseIdentityLabel({ roleGroups: ["  "] }, labels)).toEqual({ kind: "guest", label: "游客" });
  });
});
