/** Wire types for local-accounts surface v2 (camelCase; 04 §3). */

export interface LocalGrant {
  code: string;
  scope: string;
}

export interface LocalAccountSummary {
  id: string;
  username: string;
  email: string | null;
  active: boolean;
  isAdmin: boolean;
  totpEnabled: boolean;
  passkeyCount: number;
  mustChangePassword: boolean;
  permissionCount: number;
  /** ISO-8601 instant, or null for permanent. */
  expiresAt: string | null;
  /** Server-derived: expiresAt != null && expiresAt <= serverNow. */
  expired: boolean;
  createdAt: string | null;
}

export interface LocalAccountDetail extends LocalAccountSummary {
  uiLocale: string | null;
  permissions: LocalGrant[];
  baselinePermissions: string[];
  localGrantsVersion: number;
}

export interface LocalAccountListResult {
  data: LocalAccountSummary[];
  meta: { total: number };
}

/**
 * Active grantable catalog entry from GET /local-accounts/permission-catalog.
 * `grantableScopes = supportedScopes ∩ {SELF, ALL}`; empty ⇒ not grantable to local users.
 */
export interface LocalAccountsPermissionCatalogItem {
  code: string;
  nameZh: string;
  nameEn: string;
  groupKey: string;
  riskLevel: "standard" | "high";
  supportedScopes: string[];
  grantableScopes: string[];
  /**
   * Optional fallbacks for hosts that still emit legacy catalog rows during migration.
   * Prefer `groupKey` / `grantableScopes` from the v2 contract.
   */
  domain?: string;
  resource?: string;
  active?: boolean;
}

export interface CreateLocalAccountInput {
  username: string;
  email?: string | null;
  password: string;
  mustChangePassword?: boolean;
  isAdmin?: boolean;
  permissions?: LocalGrant[];
  /** ISO-8601; omit for permanent. */
  expiresAt?: string;
}

/**
 * PATCH payload. `expiresAt` is tri-state:
 * - omit → unchanged
 * - null → clear (permanent)
 * - value → set
 */
export interface UpdateLocalAccountInput {
  email?: string | null;
  active?: boolean;
  isAdmin?: boolean;
  uiLocale?: string | null;
  expiresAt?: string | null;
}

export interface ResetLocalAccountPasswordInput {
  password: string;
  mustChangePassword?: boolean;
}

export interface SetLocalAccountPermissionsInput {
  permissions: LocalGrant[];
  expectedVersion: number;
}

/** Host transport for local-account CRUD and the shared permission catalog. */
export interface EnterpriseLocalAccountsAdapter {
  listAccounts(params?: { search?: string }): Promise<LocalAccountListResult>;
  getAccount(id: string): Promise<LocalAccountDetail>;
  createAccount(input: CreateLocalAccountInput): Promise<LocalAccountDetail>;
  updateAccount(id: string, patch: UpdateLocalAccountInput): Promise<LocalAccountDetail>;
  deleteAccount(id: string): Promise<void>;
  resetPassword(id: string, input: ResetLocalAccountPasswordInput): Promise<void>;
  setPermissions(id: string, input: SetLocalAccountPermissionsInput): Promise<LocalAccountDetail | void>;
  disableTotp(id: string): Promise<void>;
  loadPermissionCatalog(): Promise<readonly LocalAccountsPermissionCatalogItem[]>;
}

/** Route/nav gating — host derives from permission set (`accounts.local.*`). */
export interface EnterpriseLocalAccountsPermissions {
  view: boolean;
  manage: boolean;
}

/**
 * Capability-driven controls — host sources from `/auth/me` server-derived fields.
 * Do NOT infer from the permission set.
 */
export interface EnterpriseLocalAccountsCapabilities {
  isLocalSuperadmin: boolean;
  accountId: string;
}

export interface EnterpriseLocalAccountsLabels {
  title: string;
  description: string;
  permissionDenied: string;
  loading: string;
  loadFailed: string;
  empty: string;
  retry: string;
  searchPlaceholder: string;
  search: string;
  create: string;
  refresh: string;
  username: string;
  email: string;
  password: string;
  status: string;
  permissions: string;
  actions: string;
  active: string;
  inactive: string;
  admin: string;
  totpEnabled: string;
  mustChangePassword: string;
  /** Badge for expired accounts (D12). */
  expired: string;
  permissionCount: (count: number) => string;
  createTitle: string;
  editTitle: string;
  save: string;
  saving: string;
  cancel: string;
  close: string;
  generatePassword: string;
  copyPassword: string;
  passwordCopied: string;
  copyFailed: string;
  mustChangePasswordHint: string;
  isAdmin: string;
  isAdminHint: string;
  permissionPickerTitle: string;
  permissionPickerAdminNote: string;
  permissionPickerEmpty: string;
  /** Hint on locked baseline self-service codes (host-supplied i18n). */
  permissionPickerBaselineHint: string;
  /** Catalog load failure (do not silently empty the picker). */
  permissionCatalogLoadFailed: string;
  /** Greyed permission whose grantableScopes is empty. */
  permissionNotGrantable: string;
  /** Red badge text for riskLevel=high codes. */
  permissionHighRisk: string;
  /** Scope select label (shown only for multi-scope codes). */
  scopeLabel: string;
  /** Importer: seed grants from an existing local account. */
  copyGrantsFrom: string;
  copyGrantsFromPlaceholder: string;
  copyGrantsFromSuccess: string;
  copyGrantsFromFailed: string;
  /** 409 CAS on PUT permissions. */
  grantsConflict: string;
  /** Account-level expiry (D12). */
  expiresAt: string;
  expiresAtHint: string;
  expiresAtPermanent: string;
  clearExpiry: string;
  /** One-time password handoff receipt (create/reset success). */
  passwordReceiptTitle: string;
  passwordReceiptHint: string;
  passwordReceiptConfirm: string;
  createSuccess: string;
  createFailed: string;
  updateSuccess: string;
  updateFailed: string;
  delete: string;
  deleteConfirm: string;
  deleteSuccess: string;
  deleteFailed: string;
  activate: string;
  deactivate: string;
  statusUpdateSuccess: string;
  statusUpdateFailed: string;
  resetPasswordTitle: string;
  resetPassword: string;
  resetPasswordSuccess: string;
  resetPasswordFailed: string;
  disableTotp: string;
  disableTotpConfirm: string;
  disableTotpSuccess: string;
  disableTotpFailed: string;
  promoteAdmin: string;
  demoteAdmin: string;
  adminUpdateSuccess: string;
  adminUpdateFailed: string;
  savePermissions: string;
  permissionsSuccess: string;
  permissionsFailed: string;
  usernameRequired: string;
  passwordRequired: string;
  profileSection: string;
  dangerSection: string;
  open: string;
  notAvailable: string;
}
