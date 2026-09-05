import type { AuthorizationWorkspaceLabels, EnterpriseAuthorizationAdapter } from "../authorization-workspace";
import type {
  EnterpriseDirectorySettingsLabels,
  EnterpriseDirectorySettingsValue,
  EnterpriseDirectorySyncResult,
} from "../directory-settings-form";
import type {
  EnterpriseEasyAuthConfigurationValue,
  EnterpriseIntegrationConfigurationLabels,
  EnterpriseOidcConfigurationValue,
} from "../integration-configuration-forms";
import type { LoginPermissionsLabels } from "../settings-surfaces";

export interface EnterpriseIdentityDiscoveryResult {
  ok: boolean;
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUri: string;
  userinfoEndpoint: string;
  errorDetail?: string | null;
}

export interface EnterpriseIdentityOperationResult {
  ok: boolean;
  latencyMs?: number;
  summary?: string;
  errorDetail?: string | null;
}

export interface EnterpriseAccessSettingsAdapter extends EnterpriseAuthorizationAdapter {
  /** Whether this host persists EasyAuth base URL, app key and credential from the UI. */
  easyAuthConnectionEditable: boolean;
  loadOidcSettings(): Promise<EnterpriseOidcConfigurationValue | EnterpriseOidcStatusSummary>;
  saveOidcSettings(value: EnterpriseOidcConfigurationValue, secrets: { clientSecret?: string }): Promise<EnterpriseOidcConfigurationValue>;
  loadEasyAuthSettings(): Promise<EnterpriseEasyAuthConfigurationValue>;
  saveEasyAuthSettings(value: EnterpriseEasyAuthConfigurationValue, credential?: string): Promise<EnterpriseEasyAuthConfigurationValue>;
  discoverIdentity?(issuer: string): Promise<EnterpriseIdentityDiscoveryResult>;
  testIdentityConnection?(): Promise<EnterpriseIdentityOperationResult>;
  /**
   * EasyAuth directory (user source of truth). All four are optional: the
   * directory section renders only for hosts that implement load + save.
   */
  loadDirectorySettings?(): Promise<EnterpriseDirectorySettingsValue>;
  saveDirectorySettings?(value: EnterpriseDirectorySettingsValue, credential?: string): Promise<EnterpriseDirectorySettingsValue>;
  testDirectory?(): Promise<EnterpriseIdentityOperationResult>;
  syncDirectory?(): Promise<EnterpriseDirectorySyncResult>;
}

export interface EnterpriseAccessSettingsLabels {
  page: LoginPermissionsLabels;
  configuration: EnterpriseIntegrationConfigurationLabels & {
    loading: string;
    loadFailed: string;
    saveFailed: string;
    saved: string;
    /** Toast-mode neutral retry control. Optional for main-app compatibility. */
    retry?: string;
  };
  authorization: AuthorizationWorkspaceLabels;
  /** Directory-section copy. Required for hosts whose adapter exposes the directory methods. */
  directory?: EnterpriseDirectorySettingsLabels;
  permissionDenied: string;
  /** Page-unavailable detail for toast-mode EmptyState (FE-FB-02). */
  permissionDeniedDetail?: string;
  /** Label for the safe root-navigation fallback when the host omits a route action. */
  permissionDeniedAction?: string;
}

export interface EnterpriseAccessSettingsPermissions {
  viewIdentity: boolean;
  manageIdentity: boolean;
  viewAuthorization: boolean;
  manageAuthorization: boolean;
}

export type EnterpriseSettingsFeedbackMode = "inline" | "toast";

export interface EnterpriseOidcStatusSummary {
  enabled: boolean;
  configured: boolean;
  hasClientSecret: boolean;
}

/** Configuration copy shared by the identity, directory and EasyAuth panels. */
export type EnterpriseSettingsConfigurationLabels = EnterpriseAccessSettingsLabels["configuration"];
