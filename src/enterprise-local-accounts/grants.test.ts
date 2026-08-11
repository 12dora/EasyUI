/**
 * Pure-logic suite for local-accounts v2 grant helpers.
 */
import { expect, it } from "vitest";

import {
  buildCatalogGroupTree,
  canToggleHighRisk,
  catalogGroupKey,
  defaultScopeForCode,
  flattenGroupKeys,
  isCapabilitiesAccountIdReady,
  isGrantable,
  isHighRisk,
  isPrivilegedTarget,
  isSelfAccount,
  isSelfDangerLocked,
  isTargetReadOnlyForOperator,
  isVersionConflictError,
  stripBaselinePermissions,
} from "./grants";
import type { LocalAccountsPermissionCatalogItem, LocalGrant } from "./types";

const catalog: LocalAccountsPermissionCatalogItem[] = [
  {
    code: "accounts.local.view",
    nameZh: "查看本地账户",
    nameEn: "View local accounts",
    groupKey: "accounts.local",
    riskLevel: "standard",
    supportedScopes: ["ALL"],
    grantableScopes: ["ALL"],
  },
  {
    code: "accounts.local.manage",
    nameZh: "管理本地账户",
    nameEn: "Manage local accounts",
    groupKey: "accounts.local",
    riskLevel: "high",
    supportedScopes: ["ALL"],
    grantableScopes: ["ALL"],
  },
  {
    code: "ops.upstream_health.view",
    nameZh: "上游健康",
    nameEn: "Upstream health",
    groupKey: "ops",
    riskLevel: "standard",
    supportedScopes: ["SELF", "ALL"],
    grantableScopes: ["SELF", "ALL"],
  },
  {
    code: "secret.token.view",
    nameZh: "密钥",
    nameEn: "Secret",
    groupKey: "secret",
    riskLevel: "high",
    supportedScopes: ["SELF"],
    grantableScopes: [],
  },
  {
    code: "legacy.item",
    nameZh: "旧项",
    nameEn: "Legacy",
    groupKey: "",
    riskLevel: "standard",
    supportedScopes: ["ALL"],
    grantableScopes: ["ALL"],
    domain: "legacy",
  },
];

it("catalogGroupKey falls back to domain when groupKey is empty", () => {
  expect(catalogGroupKey(catalog[4]!)).toBe("legacy");
  expect(catalogGroupKey(catalog[0]!)).toBe("accounts.local");
});

it("buildCatalogGroupTree nests by groupKey dot hierarchy", () => {
  const tree = buildCatalogGroupTree(catalog);
  const keys = flattenGroupKeys(tree);
  expect(keys).toContain("accounts");
  expect(keys).toContain("accounts.local");
  expect(keys).toContain("ops");
  expect(keys).toContain("legacy");

  const accounts = tree.find((node) => node.key === "accounts");
  expect(accounts).toBeTruthy();
  const local = accounts!.children.find((node) => node.key === "accounts.local");
  expect(local).toBeTruthy();
  expect(local!.items.map((item) => item.code).sort()).toEqual([
    "accounts.local.manage",
    "accounts.local.view",
  ]);
});

it("defaultScopeForCode prefers ALL then first grantable", () => {
  expect(defaultScopeForCode(catalog[2]!)).toBe("ALL");
  expect(defaultScopeForCode(catalog[3]!)).toBeNull();
  expect(
    defaultScopeForCode({
      ...catalog[2]!,
      grantableScopes: ["SELF"],
    }),
  ).toBe("SELF");
});

it("isGrantable / isHighRisk reflect catalog fields", () => {
  expect(isGrantable(catalog[0]!)).toBe(true);
  expect(isGrantable(catalog[3]!)).toBe(false);
  expect(isHighRisk(catalog[1]!)).toBe(true);
  expect(isHighRisk(catalog[0]!)).toBe(false);
});

it("stripBaselinePermissions removes locked codes and dedupes", () => {
  const grants: LocalGrant[] = [
    { code: "auth.totp.create", scope: "SELF" },
    { code: "ops.upstream_health.view", scope: "ALL" },
    { code: "ops.upstream_health.view", scope: "SELF" },
  ];
  const next = stripBaselinePermissions(grants, ["auth.totp.create"]);
  expect(next).toEqual([{ code: "ops.upstream_health.view", scope: "SELF" }]);
});

it("isPrivilegedTarget is true for admin or high grants", () => {
  expect(isPrivilegedTarget({ isAdmin: true }, catalog)).toBe(true);
  expect(
    isPrivilegedTarget(
      { isAdmin: false, permissions: [{ code: "accounts.local.manage", scope: "ALL" }] },
      catalog,
    ),
  ).toBe(true);
  expect(
    isPrivilegedTarget(
      { isAdmin: false, permissions: [{ code: "accounts.local.view", scope: "ALL" }] },
      catalog,
    ),
  ).toBe(false);
  // List row without grants: only isAdmin is known.
  expect(isPrivilegedTarget({ isAdmin: false }, catalog)).toBe(false);
});

it("capability gating: high toggle + privileged read-only + self lock", () => {
  expect(canToggleHighRisk(true)).toBe(true);
  expect(canToggleHighRisk(false)).toBe(false);

  expect(
    isTargetReadOnlyForOperator(
      false,
      { isAdmin: true, permissions: [] },
      catalog,
    ),
  ).toBe(true);
  expect(
    isTargetReadOnlyForOperator(
      true,
      { isAdmin: true, permissions: [] },
      catalog,
    ),
  ).toBe(false);
  expect(
    isTargetReadOnlyForOperator(
      false,
      { isAdmin: false, permissions: [{ code: "accounts.local.view", scope: "ALL" }] },
      catalog,
    ),
  ).toBe(false);

  expect(isSelfAccount("acc-1", "acc-1")).toBe(true);
  expect(isSelfAccount("acc-1", "acc-2")).toBe(false);
  expect(isSelfAccount("", "acc-1")).toBe(false);
});

it("isTargetReadOnlyForOperator fails closed when catalog is not ready", () => {
  const ordinary = {
    isAdmin: false,
    permissions: [{ code: "accounts.local.view", scope: "ALL" }],
  };
  const highGrant = {
    isAdmin: false,
    permissions: [{ code: "accounts.local.manage", scope: "ALL" }],
  };

  // Non-superadmin + catalog not ready → every target read-only (including ordinary).
  expect(isTargetReadOnlyForOperator(false, ordinary, catalog, false)).toBe(true);
  expect(isTargetReadOnlyForOperator(false, highGrant, [], false)).toBe(true);
  // Empty catalog without ready flag would otherwise fail open for high-grant holders.
  expect(isTargetReadOnlyForOperator(false, highGrant, [], true)).toBe(false);
  // Superadmin is never force-readonly by this rule.
  expect(isTargetReadOnlyForOperator(true, highGrant, [], false)).toBe(false);
  // Catalog ready + high grant → read-only for non-superadmin.
  expect(isTargetReadOnlyForOperator(false, highGrant, catalog, true)).toBe(true);
});

it("empty accountId is capabilities-not-ready: non-superadmin all-rows read-only; self danger locked", () => {
  const ordinary = {
    isAdmin: false,
    permissions: [{ code: "accounts.local.view", scope: "ALL" }],
  };

  expect(isCapabilitiesAccountIdReady("")).toBe(false);
  expect(isCapabilitiesAccountIdReady("   ")).toBe(false);
  expect(isCapabilitiesAccountIdReady(null)).toBe(false);
  expect(isCapabilitiesAccountIdReady(undefined)).toBe(false);
  expect(isCapabilitiesAccountIdReady("acc-1")).toBe(true);

  // Non-superadmin + empty accountId → every target read-only (same as catalog not ready).
  expect(isTargetReadOnlyForOperator(false, ordinary, catalog, true, false)).toBe(true);
  // Superadmin is not force-readonly by missing accountId (only loses self-exempt actions).
  expect(isTargetReadOnlyForOperator(true, ordinary, catalog, true, false)).toBe(false);
  // Ready accountId keeps ordinary targets editable for non-superadmin.
  expect(isTargetReadOnlyForOperator(false, ordinary, catalog, true, true)).toBe(false);

  // Self-danger: empty accountId locks every row (cannot distinguish self).
  expect(isSelfDangerLocked("", "acc-1")).toBe(true);
  expect(isSelfDangerLocked("   ", "acc-1")).toBe(true);
  expect(isSelfDangerLocked(null, "acc-1")).toBe(true);
  // Known accountId still locks only the self row.
  expect(isSelfDangerLocked("acc-1", "acc-1")).toBe(true);
  expect(isSelfDangerLocked("acc-1", "acc-2")).toBe(false);
  // isSelfAccount keeps prior empty semantics (false) — callers use isSelfDangerLocked.
  expect(isSelfAccount("", "acc-1")).toBe(false);
});

it("isVersionConflictError detects 409 from host-thrown errors", () => {
  expect(isVersionConflictError({ status: 409 })).toBe(true);
  expect(isVersionConflictError({ statusCode: 409 })).toBe(true);
  expect(isVersionConflictError(new Error("conflict"))).toBe(false);
  expect(isVersionConflictError({ status: 422 })).toBe(false);
  expect(isVersionConflictError(null)).toBe(false);
});
