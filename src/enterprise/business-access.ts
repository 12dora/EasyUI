/**
 * Whether a signed-in account has any usable function in this application.
 *
 * Hosts **must** pass their gated-nav (and settings-panel) permission codes as
 * `businessPermissionCodes`. Omitting the list (or passing an empty one) strands
 * every SSO user on the onboarding page. Codes that do not open a real surface —
 * for example notification-centre view — must be omitted, otherwise a user who
 * can only read notifications would skip the onboarding page.
 *
 * True when any of:
 *   1. local superadmin (`isLocalSuperadmin`)
 *   2. the account holds any of `businessPermissionCodes`
 *   3. any local security capability is true (password / TOTP / passkey)
 */

export interface EnterpriseBusinessAccessInput {
  permissions: ReadonlySet<string>;
  securityCapabilities?: Record<string, boolean>;
  isLocalSuperadmin?: boolean;
  /** Host-owned gated-nav and settings-panel permission codes. Required. */
  businessPermissionCodes: Iterable<string>;
}

export function hasEnterpriseBusinessAccess({
  permissions,
  securityCapabilities,
  isLocalSuperadmin = false,
  businessPermissionCodes,
}: EnterpriseBusinessAccessInput): boolean {
  if (isLocalSuperadmin) return true;
  for (const code of businessPermissionCodes) {
    if (permissions.has(code)) return true;
  }
  return Boolean(securityCapabilities && Object.values(securityCapabilities).some(Boolean));
}
