import type {
  LocalAccountDetail,
  LocalAccountSummary,
  LocalAccountsPermissionCatalogItem,
  LocalGrant,
} from "./types";

/** Resolve the grouping key for a catalog row (groupKey, else domain). */
export function catalogGroupKey(item: LocalAccountsPermissionCatalogItem): string {
  const key = item.groupKey?.trim() || item.domain?.trim() || "";
  return key || "other";
}

export function isHighRisk(item: LocalAccountsPermissionCatalogItem): boolean {
  return item.riskLevel === "high";
}

export function isGrantable(item: LocalAccountsPermissionCatalogItem): boolean {
  return Array.isArray(item.grantableScopes) && item.grantableScopes.length > 0;
}

/** Prefer ALL when present; otherwise the first grantable scope. */
export function defaultScopeForCode(item: LocalAccountsPermissionCatalogItem): string | null {
  const scopes = item.grantableScopes ?? [];
  if (!scopes.length) return null;
  if (scopes.includes("ALL")) return "ALL";
  return scopes[0] ?? null;
}

/** Drop implicit baseline codes from a grant list before create/PUT. */
export function stripBaselinePermissions(
  grants: readonly LocalGrant[],
  baseline: readonly string[],
): LocalGrant[] {
  if (!baseline.length) return dedupeGrantsByCode(grants);
  const locked = new Set(baseline);
  return dedupeGrantsByCode(grants.filter((grant) => !locked.has(grant.code)));
}

/** Keep one grant per code (last wins). Payload must not contain duplicate codes. */
export function dedupeGrantsByCode(grants: readonly LocalGrant[]): LocalGrant[] {
  const map = new Map<string, LocalGrant>();
  for (const grant of grants) {
    if (!grant?.code) continue;
    map.set(grant.code, { code: grant.code, scope: grant.scope });
  }
  return Array.from(map.values());
}

export function grantCodes(grants: readonly LocalGrant[]): string[] {
  return grants.map((grant) => grant.code);
}

export function hasGrant(grants: readonly LocalGrant[], code: string): boolean {
  return grants.some((grant) => grant.code === code);
}

export function grantScope(grants: readonly LocalGrant[], code: string): string | undefined {
  return grants.find((grant) => grant.code === code)?.scope;
}

export function setGrant(
  grants: readonly LocalGrant[],
  code: string,
  scope: string,
  baseline: readonly string[],
): LocalGrant[] {
  return stripBaselinePermissions([...grants.filter((g) => g.code !== code), { code, scope }], baseline);
}

export function removeGrant(
  grants: readonly LocalGrant[],
  code: string,
  baseline: readonly string[],
): LocalGrant[] {
  return stripBaselinePermissions(
    grants.filter((g) => g.code !== code),
    baseline,
  );
}

export interface CatalogGroupNode {
  /** Full dotted path for this node (e.g. "accounts.local"). */
  key: string;
  /** Last segment of the path (display label). */
  label: string;
  items: LocalAccountsPermissionCatalogItem[];
  children: CatalogGroupNode[];
}

/**
 * Build a tree of catalog groups from `groupKey` dot hierarchy.
 * Missing groupKey falls back to domain (via {@link catalogGroupKey}).
 */
export function buildCatalogGroupTree(
  catalog: readonly LocalAccountsPermissionCatalogItem[],
): CatalogGroupNode[] {
  type MutableNode = {
    key: string;
    label: string;
    items: LocalAccountsPermissionCatalogItem[];
    children: Map<string, MutableNode>;
  };

  const roots = new Map<string, MutableNode>();

  function ensurePath(segments: string[]): MutableNode {
    let map = roots;
    let path = "";
    let node: MutableNode | undefined;
    for (const segment of segments) {
      path = path ? `${path}.${segment}` : segment;
      let next = map.get(segment);
      if (!next) {
        next = { key: path, label: segment, items: [], children: new Map() };
        map.set(segment, next);
      }
      node = next;
      map = next.children;
    }
    return node!;
  }

  for (const item of catalog) {
    // Skip explicitly inactive rows when hosts still emit the flag.
    if (item.active === false) continue;
    const group = catalogGroupKey(item);
    const segments = group.split(".").filter(Boolean);
    if (!segments.length) {
      const other = ensurePath(["other"]);
      other.items.push(item);
      continue;
    }
    ensurePath(segments).items.push(item);
  }

  function toNode(node: MutableNode): CatalogGroupNode {
    const children = Array.from(node.children.values())
      .map(toNode)
      .sort((a, b) => a.key.localeCompare(b.key));
    const items = [...node.items].sort((a, b) => a.code.localeCompare(b.code));
    return { key: node.key, label: node.label, items, children };
  }

  return Array.from(roots.values())
    .map(toNode)
    .sort((a, b) => a.key.localeCompare(b.key));
}

/** Flatten group tree keys (for tests / group test-ids). */
export function flattenGroupKeys(nodes: readonly CatalogGroupNode[]): string[] {
  const keys: string[] = [];
  function walk(list: readonly CatalogGroupNode[]) {
    for (const node of list) {
      keys.push(node.key);
      walk(node.children);
    }
  }
  walk(nodes);
  return keys;
}

/**
 * Privileged target := isAdmin OR holds any high-risk grant (matched against catalog).
 * When grants are unknown (list row without detail), only `isAdmin` can be evaluated.
 */
export function isPrivilegedTarget(
  account: Pick<LocalAccountSummary, "isAdmin"> & { permissions?: readonly LocalGrant[] },
  catalog: readonly LocalAccountsPermissionCatalogItem[],
): boolean {
  if (account.isAdmin) return true;
  const grants = account.permissions;
  if (!grants?.length) return false;
  const highCodes = new Set(
    catalog.filter((item) => isHighRisk(item)).map((item) => item.code),
  );
  return grants.some((grant) => highCodes.has(grant.code));
}

/**
 * Whether the host supplied a non-empty `capabilities.accountId` for self-lockout.
 * Empty / absent / whitespace-only ⇒ capabilities-not-ready (cannot distinguish self).
 */
export function isCapabilitiesAccountIdReady(
  accountId: string | null | undefined,
): boolean {
  return typeof accountId === "string" && accountId.trim().length > 0;
}

/** Self-row lockout: deactivate / demote / delete / reset-password / TOTP rescue. */
export function isSelfAccount(
  accountId: string | null | undefined,
  rowId: string | null | undefined,
): boolean {
  if (!accountId || !rowId) return false;
  return accountId === rowId;
}

/**
 * Self-danger actions (deactivate / demote / delete / reset-password / TOTP).
 * When `accountId` is not ready, self cannot be computed → lock on every row
 * (including for superadmin self-exempt actions).
 */
export function isSelfDangerLocked(
  accountId: string | null | undefined,
  rowId: string | null | undefined,
): boolean {
  if (!isCapabilitiesAccountIdReady(accountId)) return true;
  return isSelfAccount(accountId, rowId);
}

/**
 * Detect HTTP 409 (grants version conflict). Hosts should attach `status` on thrown errors
 * (e.g. PlatformRequestError); also accepts `statusCode` aliases.
 */
export function isVersionConflictError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { status?: unknown; statusCode?: unknown };
  return record.status === 409 || record.statusCode === 409;
}

/**
 * Whether a non-superadmin operator may interact with a high-risk checkbox.
 * Superadmins always can; non-superadmins cannot toggle high codes.
 */
export function canToggleHighRisk(isLocalSuperadmin: boolean): boolean {
  return isLocalSuperadmin;
}

/**
 * Full read-only for non-superadmin against privileged targets.
 * Superadmins are never force-readonly by this rule.
 *
 * Fail-closed:
 * - when the permission catalog has not loaded successfully
 *   (`catalogReady === false`), a non-superadmin cannot detect high-grant
 *   privileged targets (empty catalog would otherwise fail open);
 * - when `capabilities.accountId` is empty/absent (`capabilitiesReady === false`),
 *   self-lockout cannot be computed, so every target is read-only for a
 *   non-superadmin. Superadmin only loses self-exempt actions via
 *   {@link isSelfDangerLocked}, not full read-only.
 */
export function isTargetReadOnlyForOperator(
  isLocalSuperadmin: boolean,
  account: Pick<LocalAccountSummary, "isAdmin"> & { permissions?: readonly LocalGrant[] },
  catalog: readonly LocalAccountsPermissionCatalogItem[],
  catalogReady = true,
  capabilitiesReady = true,
): boolean {
  if (isLocalSuperadmin) return false;
  if (!catalogReady || !capabilitiesReady) return true;
  return isPrivilegedTarget(account, catalog);
}

/** Normalize detail permissions, stripping baseline and unknown empty scopes. */
export function normalizeDetailGrants(
  detail: Pick<LocalAccountDetail, "permissions" | "baselinePermissions">,
  hostBaseline: readonly string[] = [],
): LocalGrant[] {
  const baseline =
    detail.baselinePermissions?.length > 0 ? detail.baselinePermissions : hostBaseline;
  const raw = Array.isArray(detail.permissions) ? detail.permissions : [];
  return stripBaselinePermissions(
    raw
      .filter((g): g is LocalGrant => Boolean(g && typeof g.code === "string" && typeof g.scope === "string"))
      .map((g) => ({ code: g.code, scope: g.scope })),
    baseline,
  );
}

export function permissionDisplayName(
  item: LocalAccountsPermissionCatalogItem,
  locale: string,
): string {
  const name = locale === "en" || locale.startsWith("en")
    ? item.nameEn || item.nameZh
    : item.nameZh || item.nameEn;
  return name ? `${name} (${item.code})` : item.code;
}
