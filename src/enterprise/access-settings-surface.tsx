"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Button } from "../primitives/button";
import { InlineNotice } from "../primitives/inline-notice";
import { toast } from "../toast";
import type { EnterpriseAuthorizationAdapter, AuthorizationWorkspaceLabels } from "./authorization-workspace";
import { EnterpriseAuthorizationWorkspace } from "./authorization-workspace";
import type { EnterpriseTimestampFormatter } from "./format-timestamp";
import type { EnterpriseIntegrationCard } from "./models";
import {
  EnterpriseEasyAuthConfigurationForm,
  EnterpriseOidcConfigurationForm,
  type EnterpriseEasyAuthConfigurationValue,
  type EnterpriseIntegrationConfigurationLabels,
  type EnterpriseOidcConfigurationValue,
  type EnterpriseWriteOnlySecret,
} from "./integration-configuration-forms";
import { EnterpriseLoginPermissions, type LoginPermissionsLabels } from "./settings-surfaces";
import { AsyncStateTransition } from "../primitives/async-state-transition";
import { EnterprisePermissionDeniedState, EnterpriseSettingsFormSkeleton } from "./surface-helpers";

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
  saveOidcSettings(value: EnterpriseOidcConfigurationValue, secrets: { clientSecret?: string; authentikApiToken?: string }): Promise<EnterpriseOidcConfigurationValue>;
  loadEasyAuthSettings(): Promise<EnterpriseEasyAuthConfigurationValue>;
  saveEasyAuthSettings(value: EnterpriseEasyAuthConfigurationValue, credential?: string): Promise<EnterpriseEasyAuthConfigurationValue>;
  discoverIdentity?(issuer: string): Promise<EnterpriseIdentityDiscoveryResult>;
  testIdentityConnection?(): Promise<EnterpriseIdentityOperationResult>;
  syncIdentityUsers?(): Promise<EnterpriseIdentityOperationResult>;
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
  hasAuthentikApiToken: boolean;
  userSyncEnabled: boolean;
  userSyncSupported?: boolean;
}

/**
 * Complete access-settings surface shared by every host.
 *
 * `feedbackMode` defaults to `"inline"` so the main EasyTrade host keeps its
 * previous InlineNotice-based load/save path. Customs opts into `"toast"`.
 */
export function EnterpriseAccessSettingsSurface({
  adapter,
  labels,
  permissions,
  locale,
  preferredTab,
  showHeader = true,
  feedbackMode = "inline",
  formatTimestamp,
  timeZone,
  permissionDeniedActions,
}: {
  adapter: EnterpriseAccessSettingsAdapter;
  labels: EnterpriseAccessSettingsLabels;
  permissions: EnterpriseAccessSettingsPermissions;
  locale: string;
  preferredTab?: "login" | "permissions" | null;
  showHeader?: boolean;
  /** Default `inline` preserves main-app behavior; Customs passes `toast`. */
  feedbackMode?: EnterpriseSettingsFeedbackMode;
  /** FE-BUG-11: forwarded to the authorization workspace for snapshot timestamps. */
  formatTimestamp?: EnterpriseTimestampFormatter;
  /** FE-BUG-11: IANA zone when `formatTimestamp` is omitted. Default = browser local. */
  timeZone?: string;
  /** Optional route-specific action; omission falls back to safe root navigation. */
  permissionDeniedActions?: ReactNode;
}) {
  const visibleTabs = ([permissions.viewIdentity ? "login" : null, permissions.viewAuthorization ? "permissions" : null].filter(Boolean)) as ("login" | "permissions")[];
  const [selectedTab, setSelectedTab] = useState<"login" | "permissions" | null>(null);
  const activeTab = pickTab(visibleTabs, selectedTab, preferredTab);
  if (!activeTab) {
    // FE-FB-02 / DECISIONS ruling 4: page-state EmptyState (title + detail + home), no toast, no redirect.
    if (feedbackMode === "toast") {
      return (
        <EnterprisePermissionDeniedState
          title={labels.permissionDenied}
          description={labels.permissionDeniedDetail}
          actions={permissionDeniedActions}
          defaultActionLabel={labels.permissionDeniedAction}
        />
      );
    }
    return <InlineNotice tone="error" message={labels.permissionDenied} data-test-id="permission-denied" />;
  }
  const emptyCard = (id: "authentik" | "easyauth"): EnterpriseIntegrationCard => ({
    id,
    name: id === "authentik" ? labels.page.authentikTitle : labels.page.easyAuthTitle,
    description: id === "authentik" ? labels.page.authentikDescription : labels.page.easyAuthDescription,
    status: "not-configured",
    statusLabel: labels.page.notConfigured,
  });
  return (
    <div data-test-id="enterprise-access-settings" data-enterprise-surface="login-permissions-settings">
      <EnterpriseLoginPermissions
        labels={labels.page}
        activeTab={activeTab}
        onTabChange={setSelectedTab}
        authentik={emptyCard("authentik")}
        easyAuth={emptyCard("easyauth")}
        visibleTabs={visibleTabs}
        showHeader={showHeader}
      >
        {activeTab === "login" ? (
          <IdentityPanel adapter={adapter} labels={labels.configuration} canManage={permissions.manageIdentity} feedbackMode={feedbackMode} />
        ) : (
          <AuthorizationPanel
            adapter={adapter}
            labels={labels}
            locale={locale}
            canManage={permissions.manageAuthorization}
            feedbackMode={feedbackMode}
            formatTimestamp={formatTimestamp}
            timeZone={timeZone}
          />
        )}
      </EnterpriseLoginPermissions>
    </div>
  );
}

function IdentityPanel({
  adapter,
  labels,
  canManage,
  feedbackMode,
}: {
  adapter: EnterpriseAccessSettingsAdapter;
  labels: EnterpriseAccessSettingsLabels["configuration"];
  canManage: boolean;
  feedbackMode: EnterpriseSettingsFeedbackMode;
}) {
  const toastMode = feedbackMode === "toast";
  const [value, setValue] = useState<EnterpriseOidcConfigurationValue | EnterpriseOidcStatusSummary | null>(null);
  const [clientSecret, setClientSecret] = useState<EnterpriseWriteOnlySecret>({ value: "", clear: false });
  const [apiToken, setApiToken] = useState<EnterpriseWriteOnlySecret>({ value: "", clear: false });
  const [busy, setBusy] = useState<"load" | "save" | "discover" | "test" | "sync" | null>("load");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [loadRevision, setLoadRevision] = useState(0);
  const retryLabel = labels.retry ?? "Retry";

  const reload = useCallback(() => {
    setBusy("load");
    setLoadRevision((current) => current + 1);
  }, []);

  useEffect(() => {
    let active = true;
    adapter
      .loadOidcSettings()
      .then((next) => {
        if (active) setValue(next);
      })
      .catch(() => {
        if (!active) return;
        if (toastMode) toast.error(labels.loadFailed);
        else setResult({ ok: false, message: labels.loadFailed });
      })
      .finally(() => {
        if (active) setBusy(null);
      });
    return () => {
      active = false;
    };
  }, [adapter, labels.loadFailed, toastMode, loadRevision]);

  // Default/inline: loading text + InlineNotice (unchanged).
  if (!toastMode) {
    if (busy === "load" && !value) return <p className="text-[13px] text-ink-soft">{labels.loading}</p>;
    if (!value) return <InlineNotice tone="error" message={result?.message ?? labels.loadFailed} />;
    if (!canManage) return <IdentityStatusSummary value={value} labels={labels} />;
  }

  async function save() {
    if (!value) return;
    const editableValue = value as EnterpriseOidcConfigurationValue;
    setBusy("save");
    if (!toastMode) setResult(null);
    try {
      const next = await adapter.saveOidcSettings(editableValue, {
        ...(clientSecret.clear ? { clientSecret: "" } : clientSecret.value ? { clientSecret: clientSecret.value } : {}),
        ...(apiToken.clear ? { authentikApiToken: "" } : apiToken.value ? { authentikApiToken: apiToken.value } : {}),
      });
      setValue(next);
      setClientSecret({ value: "", clear: false });
      setApiToken({ value: "", clear: false });
      if (toastMode) toast.success(labels.saved);
      else setResult({ ok: true, message: labels.saved });
    } catch {
      if (toastMode) toast.error(labels.saveFailed);
      else setResult({ ok: false, message: labels.saveFailed });
    } finally {
      setBusy(null);
    }
  }

  async function discover() {
    if (!adapter.discoverIdentity || !value) return;
    const editableValue = value as EnterpriseOidcConfigurationValue;
    setBusy("discover");
    if (!toastMode) setResult(null);
    try {
      const next = await adapter.discoverIdentity(editableValue.issuer);
      if (next.ok) {
        setValue({
          ...editableValue,
          issuer: next.issuer,
          authorizationEndpoint: next.authorizationEndpoint,
          tokenEndpoint: next.tokenEndpoint,
          jwksUri: next.jwksUri,
          userinfoEndpoint: next.userinfoEndpoint,
        });
        const message = labels.operationSucceeded ?? labels.saved;
        if (toastMode) toast.success(message);
        else setResult({ ok: true, message });
      } else {
        const message = labels.operationFailed ?? labels.loadFailed;
        if (toastMode) toast.error(message);
        else setResult({ ok: false, message });
      }
    } catch {
      const message = labels.operationFailed ?? labels.loadFailed;
      if (toastMode) toast.error(message);
      else setResult({ ok: false, message });
    } finally {
      setBusy(null);
    }
  }

  async function operation(kind: "test" | "sync") {
    const action = kind === "test" ? adapter.testIdentityConnection : adapter.syncIdentityUsers;
    if (!action) return;
    setBusy(kind);
    if (!toastMode) setResult(null);
    try {
      const next = await action();
      if (next.ok) {
        const message = `${labels.operationSucceeded}${next.latencyMs === undefined ? "" : ` · ${next.latencyMs} ms`}`;
        if (toastMode) toast.success(message);
        else setResult({ ok: true, message });
      } else if (toastMode) toast.error(labels.operationFailed);
      else setResult({ ok: false, message: labels.operationFailed });
    } catch {
      if (toastMode) toast.error(labels.operationFailed);
      else setResult({ ok: false, message: labels.operationFailed });
    } finally {
      setBusy(null);
    }
  }

  // Inline manage path (value guaranteed above).
  if (!toastMode && value && canManage) {
    const userSyncSupported = value.userSyncSupported === true;
    return (
      <EnterpriseOidcConfigurationForm
        labels={labels}
        value={value as EnterpriseOidcConfigurationValue}
        clientSecret={clientSecret}
        apiToken={apiToken}
        disabled={!canManage}
        saving={busy === "save"}
        discovering={busy === "discover"}
        testing={busy === "test"}
        syncing={busy === "sync"}
        operationResult={result}
        showUserSync={userSyncSupported}
        hideAdvancedWhenDisabled={false}
        onChange={(patch) =>
          setValue((current) =>
            current
              ? {
                  ...current,
                  ...patch,
                  ...(patch.redirectBaseUrl !== undefined ? { redirectUri: computeRedirectUri(patch.redirectBaseUrl) } : {}),
                }
              : current,
          )
        }
        onClientSecretChange={setClientSecret}
        onApiTokenChange={setApiToken}
        onSave={save}
        onDiscover={adapter.discoverIdentity ? discover : undefined}
        onTest={adapter.testIdentityConnection ? () => operation("test") : undefined}
        onSync={userSyncSupported && adapter.syncIdentityUsers ? () => operation("sync") : undefined}
      />
    );
  }

  // FE-UXA-10 + FE-FB-01 toast mode: one mounted AsyncStateTransition; permanent refresh; missing as —.
  const loadingFirst = busy === "load" && !value;
  const missing = !value;
  const asyncState = loadingFirst ? "loading" : missing ? "empty" : "ready";

  let readyBody: ReactNode = null;
  if (value && !canManage) {
    readyBody = <IdentityStatusSummary value={value} labels={labels} />;
  } else if (value && canManage) {
    const userSyncSupported = value.userSyncSupported === true;
    readyBody = (
      <EnterpriseOidcConfigurationForm
        labels={labels}
        value={value as EnterpriseOidcConfigurationValue}
        clientSecret={clientSecret}
        apiToken={apiToken}
        disabled={!canManage}
        saving={busy === "save"}
        discovering={busy === "discover"}
        testing={busy === "test"}
        syncing={busy === "sync"}
        operationResult={null}
        showUserSync={userSyncSupported}
        hideAdvancedWhenDisabled={toastMode}
        onChange={(patch) =>
          setValue((current) =>
            current
              ? {
                  ...current,
                  ...patch,
                  ...(patch.redirectBaseUrl !== undefined ? { redirectUri: computeRedirectUri(patch.redirectBaseUrl) } : {}),
                }
              : current,
          )
        }
        onClientSecretChange={setClientSecret}
        onApiTokenChange={setApiToken}
        onSave={save}
        onDiscover={adapter.discoverIdentity ? discover : undefined}
        onTest={adapter.testIdentityConnection ? () => operation("test") : undefined}
        onSync={userSyncSupported && adapter.syncIdentityUsers ? () => operation("sync") : undefined}
      />
    );
  }

  const missingShell = (
    <div className="rounded-md border border-hairline bg-paper p-4" data-test-id="identity-settings-missing">
      <p className="text-[13px] text-ink-faint">—</p>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" loading={busy === "load"} data-test-id="identity-settings-retry" onClick={reload}>{retryLabel}</Button>
      </div>
      <AsyncStateTransition
        state={asyncState}
        minHeight={220}
        data-test-id="identity-settings-async"
        loading={<EnterpriseSettingsFormSkeleton testId="identity-settings-skeleton" />}
        empty={missingShell}
        ready={readyBody}
      />
    </div>
  );
}

/** View-only identity: business status language, no endpoint console. */
function IdentityStatusSummary({
  value,
  labels,
}: {
  value: EnterpriseOidcConfigurationValue | EnterpriseOidcStatusSummary;
  labels: EnterpriseAccessSettingsLabels["configuration"];
}) {
  return (
    <div className="space-y-3 rounded-md border border-hairline bg-paper p-4" data-test-id="identity-status-summary">
      <div>
        <p className="text-[14px] font-semibold text-ink">{labels.oidcTitle}</p>
        <p className="mt-1 text-[12px] text-ink-faint">{labels.oidcDescription}</p>
      </div>
      <dl className="grid gap-2 text-[13px] sm:grid-cols-2">
        <StatusFact label={labels.enabled} value={value.enabled ? labels.enabled : labels.notConfigured} />
        <StatusFact label={labels.clientSecret} value={value.hasClientSecret ? labels.configured : labels.notConfigured} />
        <StatusFact label={labels.authentikApiToken} value={value.hasAuthentikApiToken ? labels.configured : labels.notConfigured} />
        {value.userSyncSupported ? (
          <StatusFact label={labels.userSyncEnabled} value={value.userSyncEnabled ? labels.enabled : labels.notConfigured} />
        ) : null}
      </dl>
    </div>
  );
}

function StatusFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-hairline-soft py-2">
      <dt className="text-ink-faint">{label}</dt>
      <dd className="text-right text-ink">{value}</dd>
    </div>
  );
}

function AuthorizationPanel({
  adapter,
  labels,
  locale,
  canManage,
  feedbackMode,
  formatTimestamp,
  timeZone,
}: {
  adapter: EnterpriseAccessSettingsAdapter;
  labels: EnterpriseAccessSettingsLabels;
  locale: string;
  canManage: boolean;
  feedbackMode: EnterpriseSettingsFeedbackMode;
  formatTimestamp?: EnterpriseTimestampFormatter;
  timeZone?: string;
}) {
  const toastMode = feedbackMode === "toast";
  const [value, setValue] = useState<EnterpriseEasyAuthConfigurationValue | null>(null);
  const [credential, setCredential] = useState<EnterpriseWriteOnlySecret>({ value: "", clear: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);
  const [revision, setRevision] = useState(0);
  /** FE-FB-01: re-issue loadEasyAuthSettings after failure (workspace Refresh alone is a different API set). */
  const [configRevision, setConfigRevision] = useState(0);
  const skipConfigurationLoad = !canManage;
  const retryLabel = labels.configuration.retry ?? labels.authorization.refresh;

  useEffect(() => {
    if (skipConfigurationLoad) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    adapter
      .loadEasyAuthSettings()
      .then((next) => {
        if (active) setValue(next);
      })
      .catch(() => {
        if (!active) return;
        // Keep prior value if any; never invent a blank successful form after failure.
        if (toastMode) toast.error(labels.configuration.loadFailed);
        else setNotice({ ok: false, message: labels.configuration.loadFailed });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [adapter, configRevision, labels.configuration.loadFailed, skipConfigurationLoad, toastMode]);

  const reloadEasyAuth = useCallback(() => {
    setConfigRevision((current) => current + 1);
  }, []);

  async function save() {
    if (!value) return;
    setSaving(true);
    if (!toastMode) setNotice(null);
    try {
      const next = await adapter.saveEasyAuthSettings(value, credential.clear ? "" : credential.value || undefined);
      setValue(next);
      setCredential({ value: "", clear: false });
      if (toastMode) toast.success(labels.configuration.saved);
      else setNotice({ ok: true, message: labels.configuration.saved });
      setRevision((current) => current + 1);
    } catch {
      if (toastMode) toast.error(labels.configuration.saveFailed);
      else setNotice({ ok: false, message: labels.configuration.saveFailed });
    } finally {
      setSaving(false);
    }
  }

  // FE-UXA-10: shape-matched skeleton for the EasyAuth form; AsyncStateTransition stays mounted.
  const configurationBlock = (() => {
    if (skipConfigurationLoad) return null;
    if (!toastMode) {
      if (loading) return <p className="text-[13px] text-ink-soft">{labels.configuration.loading}</p>;
      if (!value) return null;
      return (
        <EnterpriseEasyAuthConfigurationForm
          labels={labels.configuration}
          value={value}
          credential={credential}
          disabled={!canManage}
          connectionDisabled={!adapter.easyAuthConnectionEditable}
          saving={saving}
          onChange={(patch) => setValue((current) => (current ? { ...current, ...patch } : current))}
          onCredentialChange={setCredential}
          onSave={save}
        />
      );
    }

    const configState = loading && !value ? "loading" : !value ? "empty" : "ready";
    const form = value ? (
      <EnterpriseEasyAuthConfigurationForm
        labels={labels.configuration}
        value={value}
        credential={credential}
        disabled={!canManage}
        connectionDisabled={!adapter.easyAuthConnectionEditable}
        saving={saving}
        onChange={(patch) => setValue((current) => (current ? { ...current, ...patch } : current))}
        onCredentialChange={setCredential}
        onSave={save}
      />
    ) : null;
    const missing = (
      <div className="rounded-md border border-hairline bg-paper p-4" data-test-id="easyauth-settings-missing">
        <p className="text-[13px] text-ink-faint">—</p>
      </div>
    );
    return (
      <div className="space-y-3" data-test-id="easyauth-settings-block">
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            loading={loading}
            data-test-id="easyauth-settings-retry"
            onClick={reloadEasyAuth}
          >
            {retryLabel}
          </Button>
        </div>
        <AsyncStateTransition
          state={configState}
          minHeight={180}
          data-test-id="easyauth-settings-async"
          loading={<EnterpriseSettingsFormSkeleton testId="easyauth-settings-skeleton" rows={3} />}
          empty={missing}
          ready={form}
        />
      </div>
    );
  })();

  return (
    <div className="space-y-2" data-test-id="authorization-integration-section">
      {!toastMode && notice ? <InlineNotice tone={notice.ok ? "success" : "error"} message={notice.message} /> : null}
      {configurationBlock}
      <EnterpriseAuthorizationWorkspace
        key={revision}
        adapter={adapter}
        labels={labels.authorization}
        locale={locale}
        canManage={canManage}
        section="authorization"
        feedbackMode={feedbackMode}
        formatTimestamp={formatTimestamp}
        timeZone={timeZone}
      />
    </div>
  );
}

function pickTab(
  visibleTabs: readonly ("login" | "permissions")[],
  selected: "login" | "permissions" | null,
  preferred?: "login" | "permissions" | null,
) {
  if (selected && visibleTabs.includes(selected)) return selected;
  if (preferred && visibleTabs.includes(preferred)) return preferred;
  return visibleTabs[0] ?? null;
}

function computeRedirectUri(base: string) {
  const normalized = base.trim().replace(/\/+$/, "");
  return normalized ? `${normalized}/api/v1/auth/oidc/callback` : "";
}
