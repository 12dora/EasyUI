export type EnterpriseIdentityKind = "admin" | "user" | "guest";

export interface EnterpriseIdentityInput {
  /** Local break-glass superadmin — outranks every grant-derived label. */
  isLocalSuperadmin?: boolean;
  /** Authorization role groups; the joined list is the most specific label. */
  roleGroups?: readonly string[] | null;
  /** Any granted permission is enough to be a "user" rather than a guest. */
  permissions?: readonly string[] | ReadonlySet<string> | null;
}

export interface EnterpriseIdentityLabels {
  admin: string;
  user: string;
  guest: string;
  /** Joins several role groups, e.g. "、" in zh-CN and ", " in en. */
  separator: string;
}

export interface EnterpriseIdentityResolution {
  kind: EnterpriseIdentityKind;
  label: string;
}

function permissionCount(permissions: EnterpriseIdentityInput["permissions"]): number {
  if (!permissions) return 0;
  if (Array.isArray(permissions)) return permissions.length;
  return (permissions as ReadonlySet<string>).size ?? 0;
}

/**
 * The single rule behind the identity line in the user menu, shared by every host.
 *
 * Precedence, most specific first:
 *   1. local superadmin  -> `labels.admin`
 *   2. role groups       -> the groups joined by `labels.separator`
 *   3. any permission    -> `labels.user`
 *   4. nothing           -> `labels.guest`
 *
 * Cases 2 and 3 are both `kind: "user"`: the kind describes the account's
 * standing, the label describes what it was granted.
 */
export function resolveEnterpriseIdentityLabel(
  input: EnterpriseIdentityInput,
  labels: EnterpriseIdentityLabels,
): EnterpriseIdentityResolution {
  if (input.isLocalSuperadmin) return { kind: "admin", label: labels.admin };
  const groups = (input.roleGroups ?? []).map((group) => group.trim()).filter((group) => group.length > 0);
  if (groups.length > 0) return { kind: "user", label: groups.join(labels.separator) };
  if (permissionCount(input.permissions) > 0) return { kind: "user", label: labels.user };
  return { kind: "guest", label: labels.guest };
}
