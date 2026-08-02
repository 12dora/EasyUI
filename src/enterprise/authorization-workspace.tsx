"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Badge } from "../primitives/badge";
import { Button } from "../primitives/button";
import { Dialog } from "../primitives/dialog";
import { Field, Input } from "../primitives/field";
import { InlineNotice } from "../primitives/inline-notice";
import { InfoTooltip } from "../primitives/info-tooltip";
import { Section } from "../primitives/section";
import { AsyncStateTransition } from "../primitives/async-state-transition";
import { formatEnterpriseTimestamp, type EnterpriseTimestampFormatter } from "./format-timestamp";
import { EnterpriseIntegrationFactGrid } from "./shared-settings";
import { EnterpriseAuthorizationWorkspaceSkeleton } from "./surface-helpers";
import { toast } from "../toast";

export interface EnterpriseIdentityIntegrationSettings {
  enabled: boolean;
  issuer: string;
  clientId: string;
  redirectUri: string;
  hasClientSecret: boolean;
  authentikApiBaseUrl: string;
  hasAuthentikApiToken: boolean;
  userSyncEnabled: boolean;
  userSyncSupported?: boolean;
}

export interface EnterpriseIdentityIntegrationSummary {
  enabled: boolean;
  configured: boolean;
  hasClientSecret: boolean;
  hasAuthentikApiToken: boolean;
  userSyncEnabled: boolean;
  userSyncSupported?: boolean;
}

export interface EnterpriseAuthzStatus {
  easyauth: { configured: boolean; hasCredential: boolean; baseUrl?: string; appKey?: string; authMode?: string; timeoutSeconds?: number };
  principal: { configured?: boolean; mode?: string; headerName?: string; issuer?: string | null; audience?: string | null };
  catalog: { configured?: boolean; activeCount?: number; totalCount?: number };
  snapshots: { configured?: boolean; total?: number; expired?: number; latestFetchedAt?: string | null };
}
export interface EnterpriseConnectionResult { ok: boolean; latencyMs: number; snapshotVersion?: string | null; grantCount?: number | null; error?: { kind: string; message: string } | null; }
export interface EnterprisePermissionCatalogItem { code: string; nameZh: string; nameEn: string; domain: string; resource: string; action: string; supportedScopes: string[]; riskLevel: string; active: boolean; }
export interface EnterprisePermissionSnapshot { userId: string; displayName: string | null; grantCount: number; snapshotVersion: string; roleGroups?: readonly string[] | null; fetchedAt: string; expiresAt: string; expired: boolean; }
export interface EnterpriseManifestOverview { appKey?: string; name?: string; version?: string; capabilities?: readonly string[]; permissions?: readonly unknown[]; [key: string]: unknown; }
export interface EnterpriseCurrentGrant { permissionCode: string; dataScope: "SELF" | "MANAGED_USERS" | "ALL"; source?: string | null; }
export interface EnterpriseDescriptorKey { id: string; name: string; tokenPrefix: string; active: boolean; lastUsedAt: string | null; createdAt: string; }

/** Normalize the platform's snake_case manifest contract once for every host. */
export function normalizeEnterpriseManifest(raw: unknown): EnterpriseManifestOverview {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const record = raw as Record<string, unknown>;
  const app = record.app && typeof record.app === "object" && !Array.isArray(record.app)
    ? record.app as Record<string, unknown>
    : {};
  const schemaVersion = record.schemaVersion ?? record.schema_version;
  const appKey = record.appKey ?? record.app_key ?? app.appKey ?? app.app_key;
  return {
    ...record,
    appKey: typeof appKey === "string" ? appKey : undefined,
    name: typeof record.name === "string" ? record.name : typeof app.name === "string" ? app.name : undefined,
    version: typeof record.version === "string" || typeof record.version === "number"
      ? String(record.version)
      : typeof schemaVersion === "string" || typeof schemaVersion === "number" ? String(schemaVersion) : undefined,
    capabilities: Array.isArray(record.capabilities) ? record.capabilities.filter((item): item is string => typeof item === "string") : [],
    permissions: Array.isArray(record.permissions) ? record.permissions : [],
  };
}

export interface EnterpriseAuthorizationAdapter {
  loadIdentity(): Promise<EnterpriseIdentityIntegrationSettings | EnterpriseIdentityIntegrationSummary>;
  loadStatus(): Promise<EnterpriseAuthzStatus>;
  testConnection(): Promise<EnterpriseConnectionResult>;
  loadCatalog(): Promise<readonly EnterprisePermissionCatalogItem[]>;
  loadSnapshots(): Promise<readonly EnterprisePermissionSnapshot[]>;
  refreshSnapshot(userId: string): Promise<EnterprisePermissionSnapshot>;
  loadManifest?(): Promise<EnterpriseManifestOverview>;
  loadMyGrants?(): Promise<readonly EnterpriseCurrentGrant[]>;
  loadDescriptorKeys?(): Promise<readonly EnterpriseDescriptorKey[]>;
  createDescriptorKey?(name: string): Promise<{ key: EnterpriseDescriptorKey; token: string }>;
  updateDescriptorKey?(id: string, active: boolean): Promise<EnterpriseDescriptorKey>;
  deleteDescriptorKey?(id: string): Promise<void>;
}

export interface AuthorizationWorkspaceLabels {
  identityTitle: string; identityDescription: string; authorizationTitle: string; authorizationDescription: string;
  enabled: string; disabled: string; configured: string; notConfigured: string; credential: string; clientSecret: string; apiToken: string;
  issuer: string; clientId: string; redirectUri: string; endpoint: string; appKey: string; principalMode: string;
  connectionTest: string; testing: string; connectionOk: string; connectionFailed: string;
  catalogTitle: string; catalogDescription: string; permissionCode: string; permissionName: string; scopes: string; risk: string; status: string;
  snapshotsTitle: string; snapshotsDescription: string; user: string; grants: string; roles: string; fetchedAt: string; refresh: string; refreshing: string; expired: string;
  manifestTitle: string; manifestDescription: string; version: string; capabilities: string; permissions: string;
  loading: string; loadFailed: string; empty: string;
  myGrantsTitle: string; myGrantsDescription: string; scopeSelf: string; scopeManagedUsers: string; scopeAll: string;
  manifestExport: string; descriptorKeysTitle: string; descriptorKeysDescription: string; create: string; cancel: string; close: string; delete: string; disable: string; name: string; confirm: string;
  baseUrlGuide: string; guideAriaLabel: string; roleGroupSeparator: string; notAvailable: string; manifestFileName: string;
}

export interface EnterpriseAuthorizationWorkspaceProps {
  adapter: EnterpriseAuthorizationAdapter;
  labels: AuthorizationWorkspaceLabels;
  locale: string;
  canManage?: boolean;
  section?: "all" | "identity" | "authorization";
  /** Default `inline` preserves main-app InlineNotice path; Customs passes `toast`. */
  feedbackMode?: "inline" | "toast";
  /**
   * FE-BUG-11: optional absolute timestamp formatter. When set, snapshot
   * `fetchedAt` values use this instead of browser-local `toLocaleString`.
   * Prop name for host wiring: `formatTimestamp`.
   */
  formatTimestamp?: EnterpriseTimestampFormatter;
  /**
   * FE-BUG-11 alternative: explicit IANA time zone (e.g. `"Asia/Shanghai"`).
   * Ignored when `formatTimestamp` is provided. Default = browser local.
   */
  timeZone?: string;
}

/** Complete shared Authentik + EasyAuth operations surface. All I/O is host-injected. */
export function EnterpriseAuthorizationWorkspace({
  adapter,
  labels,
  locale,
  canManage = true,
  section = "all",
  feedbackMode = "inline",
  formatTimestamp,
  timeZone,
}: EnterpriseAuthorizationWorkspaceProps) {
  const toastMode = feedbackMode === "toast";
  // Response redaction is host-independent: every non-manager gets business status only.
  const restrictedViewer = !canManage;
  const [identity, setIdentity] = useState<EnterpriseIdentityIntegrationSettings | EnterpriseIdentityIntegrationSummary | null>(null);
  const [status, setStatus] = useState<EnterpriseAuthzStatus | null>(null);
  const [catalog, setCatalog] = useState<readonly EnterprisePermissionCatalogItem[]>([]);
  const [snapshots, setSnapshots] = useState<readonly EnterprisePermissionSnapshot[]>([]);
  const [manifest, setManifest] = useState<EnterpriseManifestOverview | null>(null);
  const [grants, setGrants] = useState<readonly EnterpriseCurrentGrant[]>([]);
  const [descriptorKeys, setDescriptorKeys] = useState<readonly EnterpriseDescriptorKey[]>([]);
  const [connection, setConnection] = useState<EnterpriseConnectionResult | null>(null);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(false); const [operationError, setOperationError] = useState<string | null>(null); const [testing, setTesting] = useState(false); const [refreshing, setRefreshing] = useState<string | null>(null);
  const reload = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      if (section !== "authorization") setIdentity(await adapter.loadIdentity());
      if (section !== "identity") {
        if (restrictedViewer) {
          setStatus(await adapter.loadStatus());
        } else {
          const [nextStatus, nextCatalog, nextSnapshots, nextManifest, nextGrants, nextKeys] = await Promise.all([
            adapter.loadStatus(),
            adapter.loadCatalog(),
            adapter.loadSnapshots(),
            canManage && adapter.loadManifest ? adapter.loadManifest() : null,
            adapter.loadMyGrants?.() ?? [],
            canManage && adapter.loadDescriptorKeys ? adapter.loadDescriptorKeys() : [],
          ]);
          setStatus(nextStatus);
          setCatalog(nextCatalog);
          setSnapshots(nextSnapshots);
          setManifest(nextManifest);
          setGrants(nextGrants);
          setDescriptorKeys(nextKeys);
        }
      }
    } catch {
      setError(true);
      if (toastMode) toast.error(labels.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [adapter, canManage, labels.loadFailed, restrictedViewer, section, toastMode]);
  useEffect(() => { const timer = window.setTimeout(() => void reload(), 0); return () => window.clearTimeout(timer); }, [reload]);
  async function test() {
    setTesting(true); setOperationError(null);
    if (toastMode) setConnection(null);
    try {
      const next = await adapter.testConnection();
      if (toastMode) {
        if (next.ok) toast.success(`${labels.connectionOk} · ${next.latencyMs} ms`);
        else toast.error(labels.connectionFailed);
      } else setConnection(next);
    } catch {
      if (toastMode) toast.error(labels.connectionFailed);
      else setConnection({ ok: false, latencyMs: 0, error: { kind: "request", message: labels.connectionFailed } });
    } finally { setTesting(false); }
  }
  async function refresh(userId: string) {
    setRefreshing(userId); setOperationError(null);
    try {
      const next = await adapter.refreshSnapshot(userId);
      setSnapshots((current) => current.map((item) => item.userId === userId ? next : item));
      if (toastMode) toast.success(labels.refresh);
    } catch {
      if (toastMode) toast.error(labels.loadFailed);
      else setOperationError(labels.loadFailed);
    } finally { setRefreshing(null); }
  }
  // FE-FB-01: refresh failure must NOT wipe retained successful sections. `error` alone is not missing data.
  const identityMissing = section !== "authorization" && !identity;
  const authorizationMissing = section !== "identity" && !status;
  const dataMissing = identityMissing || authorizationMissing;
  // Inline path still treats any load failure as a hard error panel (pre-existing host contract).
  const inlineFailed = error || dataMissing;

  // Default/inline: loading text + InlineNotice failure path (unchanged for main app / blank host).
  if (!toastMode) {
    if (loading && dataMissing) return <p className="text-[13px] text-ink-soft">{labels.loading}</p>;
    if (inlineFailed) {
      return <InlineNotice tone="error" message={labels.loadFailed} actionLabel={labels.refresh} onAction={() => void reload()}/>;
    }
  }

  const formatOpts = { formatTimestamp, timeZone, empty: labels.notAvailable, locale };
  const firstLoad = loading && dataMissing;
  const toastAsyncState = firstLoad ? "loading" : dataMissing ? "empty" : "ready";

  const missingShell = (
    <div className="rounded-md border border-hairline bg-paper p-4" data-test-id="authz-load-missing">
      <EnterpriseIntegrationFactGrid
        facts={[
          { label: labels.status, value: labels.notAvailable },
          { label: labels.credential, value: labels.notAvailable },
        ]}
      />
    </div>
  );

  // When data is still missing, skip body construction (cast would be unsafe).
  const currentIdentity = identity as EnterpriseIdentityIntegrationSettings | EnterpriseIdentityIntegrationSummary | null;
  const currentStatus = status as EnterpriseAuthzStatus | null;
  const fullIdentity = currentIdentity as EnterpriseIdentityIntegrationSettings | null;

  const workspaceBody = !currentIdentity && section !== "authorization" ? null : !currentStatus && section !== "identity" ? null : (
    <>
      {!toastMode && operationError ? <InlineNotice tone="error" message={operationError} /> : null}
      {section !== "authorization" && currentIdentity ? (
        <Section title={labels.identityTitle} description={labels.identityDescription}>
          <div className="grid gap-2 rounded-md border border-hairline bg-paper p-4 sm:grid-cols-2">
            <Fact label={labels.status} value={<StateBadge value={currentIdentity.enabled} labels={labels}/>} empty={labels.notAvailable}/>
            {!restrictedViewer && fullIdentity ? (
              <>
                <Fact label={labels.issuer} value={fullIdentity.issuer} empty={labels.notAvailable}/>
                <Fact label={labels.clientId} value={fullIdentity.clientId} empty={labels.notAvailable}/>
                <Fact label={labels.redirectUri} value={fullIdentity.redirectUri} empty={labels.notAvailable}/>
              </>
            ) : null}
            <Fact label={labels.clientSecret} value={<StateBadge value={currentIdentity.hasClientSecret} labels={labels}/>} empty={labels.notAvailable}/>
            <Fact label={labels.apiToken} value={<StateBadge value={currentIdentity.hasAuthentikApiToken} labels={labels}/>} empty={labels.notAvailable}/>
          </div>
        </Section>
      ) : null}
      {section !== "identity" && currentStatus ? (
        <>
          <Section
            title={labels.authorizationTitle}
            description={labels.authorizationDescription}
            actions={canManage ? (
              <>
                <Button variant="outline" size="sm" loading={testing} onClick={() => void test()} data-test-id="authz-connection-test">{testing ? labels.testing : labels.connectionTest}</Button>
                <Button variant="outline" size="sm" onClick={() => downloadManifest(manifest, labels.manifestFileName)} data-test-id="authz-manifest-export">{labels.manifestExport}</Button>
              </>
            ) : null}
          >
            <div data-test-id="authz-integration-status-card">
              <EnterpriseIntegrationFactGrid
                facts={
                  restrictedViewer
                    ? [
                        { label: labels.status, value: <StateBadge value={currentStatus.easyauth.configured} labels={labels}/> },
                        { label: labels.credential, value: <StateBadge value={currentStatus.easyauth.hasCredential} labels={labels}/> },
                      ]
                    : [
                        { label: labels.status, value: <StateBadge value={currentStatus.easyauth.configured} labels={labels}/> },
                        {
                          label: (
                            <span className="inline-flex items-center gap-1">
                              <span>{labels.endpoint}</span>
                              <InfoTooltip label={labels.guideAriaLabel} testId="authz-guide-base-url">{labels.baseUrlGuide}</InfoTooltip>
                            </span>
                          ),
                          value: currentStatus.easyauth.baseUrl ?? labels.notAvailable,
                        },
                        { label: labels.appKey, value: currentStatus.easyauth.appKey ?? labels.notAvailable },
                        { label: labels.credential, value: <StateBadge value={currentStatus.easyauth.hasCredential} labels={labels}/> },
                        { label: labels.principalMode, value: currentStatus.principal.mode ?? labels.notAvailable },
                      ]
                }
              />
              {!toastMode && connection ? (
                <InlineNotice
                  className="mt-3"
                  tone={connection.ok ? "success" : "error"}
                  message={connection.ok ? `${labels.connectionOk} · ${connection.latencyMs} ms` : labels.connectionFailed}
                  data-test-id="authz-connection-test-result"
                />
              ) : null}
            </div>
          </Section>
          {!restrictedViewer && canManage && adapter.loadDescriptorKeys ? (
            <DescriptorKeys adapter={adapter} labels={labels} items={descriptorKeys} onChange={setDescriptorKeys} canManage={canManage}/>
          ) : null}
          {!restrictedViewer && adapter.loadMyGrants ? (
            <Section title={labels.myGrantsTitle} description={labels.myGrantsDescription}>
              <div className="overflow-x-auto" data-data-grid="authz-my-grants">
                <table className="w-full text-left text-[12px]">
                  <tbody>
                    {grants.map((grant) => (
                      <tr key={`${grant.permissionCode}:${grant.dataScope}`} className="border-b border-hairline-soft">
                        <td className="p-2 font-mono">{grant.permissionCode}</td>
                        <td className="p-2"><Badge tone="neutral">{scopeLabel(grant.dataScope, labels)}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!grants.length ? <p className="p-4 text-center text-ink-faint">{labels.empty}</p> : null}
              </div>
            </Section>
          ) : null}
          {!restrictedViewer ? (
            <Section title={labels.catalogTitle} description={labels.catalogDescription}>
              <div className="overflow-x-auto" data-test-id="authz-permission-catalog">
                <table className="w-full min-w-[680px] text-left text-[12px]">
                  <thead>
                    <tr className="border-b border-hairline text-ink-faint">
                      <th className="p-2">{labels.permissionCode}</th>
                      <th className="p-2">{labels.permissionName}</th>
                      <th className="p-2">{labels.scopes}</th>
                      <th className="p-2">{labels.risk}</th>
                      <th className="p-2">{labels.status}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {catalog.map((item) => (
                      <tr key={item.code} className="border-b border-hairline-soft">
                        <td className="p-2 font-mono">{item.code}</td>
                        <td className="p-2">{(locale.startsWith("zh") ? item.nameZh : item.nameEn) || labels.notAvailable}</td>
                        <td className="p-2 font-mono">{item.supportedScopes.join(", ")}</td>
                        <td className="p-2">{item.riskLevel}</td>
                        <td className="p-2"><StateBadge value={item.active} labels={labels}/></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!catalog.length ? <p className="p-4 text-center text-ink-faint">{labels.empty}</p> : null}
              </div>
            </Section>
          ) : null}
          {!restrictedViewer ? (
            <SnapshotsSection
              items={snapshots}
              labels={labels}
              canManage={canManage}
              refreshing={refreshing}
              onRefresh={refresh}
              formatOpts={formatOpts}
            />
          ) : null}
          {!restrictedViewer && canManage && adapter.loadManifest ? (
            <Section title={labels.manifestTitle} description={labels.manifestDescription}>
              <div className="grid gap-2 rounded-md border border-hairline bg-paper p-4 sm:grid-cols-3">
                <Fact label={labels.appKey} value={String(manifest?.appKey ?? labels.notAvailable)} empty={labels.notAvailable}/>
                <Fact label={labels.version} value={String(manifest?.version ?? labels.notAvailable)} empty={labels.notAvailable}/>
                <Fact label={labels.capabilities} value={manifest?.capabilities?.join(", ") || labels.notAvailable} empty={labels.notAvailable}/>
                <Fact label={labels.permissions} value={String(manifest?.permissions?.length ?? 0)} empty={labels.notAvailable}/>
              </div>
            </Section>
          ) : null}
        </>
      ) : null}
    </>
  );

  // FE-FB-01 + FE-UXA-10 toast mode: one mounted AsyncStateTransition for loading/empty/ready;
  // refresh failure keeps ready content (error is not dataMissing).
  if (toastMode) {
    return (
      <div className="space-y-2" data-test-id="enterprise-authorization-workspace">
        <div className="flex justify-end">
          <Button variant="outline" size="sm" loading={loading} onClick={() => void reload()}>{labels.refresh}</Button>
        </div>
        <AsyncStateTransition
          state={toastAsyncState}
          minHeight={320}
          data-test-id="authz-async-state"
          loading={<EnterpriseAuthorizationWorkspaceSkeleton />}
          empty={missingShell}
          ready={workspaceBody}
        />
      </div>
    );
  }

  return (
    <div className="space-y-2" data-test-id="enterprise-authorization-workspace">
      {workspaceBody}
    </div>
  );
}

function Fact({ label, value, empty }: { label: string; value: ReactNode; empty?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 border-b border-hairline-soft py-2 text-[12px] sm:flex-row sm:items-start sm:justify-between sm:gap-3">
      <span className="shrink-0 text-ink-faint">{label}</span>
      <span className="min-w-0 break-all text-left font-mono text-ink sm:text-right">{value || empty}</span>
    </div>
  );
}
function StateBadge({ value, labels }: { value: boolean; labels: AuthorizationWorkspaceLabels }) {
  return <Badge tone={value ? "evergreen" : "amber"}>{value ? labels.configured : labels.notConfigured}</Badge>;
}

type FormatOpts = {
  locale: string;
  empty: string;
  formatTimestamp?: EnterpriseTimestampFormatter;
  timeZone?: string;
};

function scopeLabel(scope: EnterpriseCurrentGrant["dataScope"], labels: AuthorizationWorkspaceLabels) {
  if (scope === "SELF") return labels.scopeSelf;
  if (scope === "MANAGED_USERS") return labels.scopeManagedUsers;
  return labels.scopeAll;
}
function downloadManifest(manifest: EnterpriseManifestOverview | null, fileName: string) {
  if (!manifest || typeof document === "undefined") return;
  const url = URL.createObjectURL(new Blob([`${JSON.stringify(manifest, null, 2)}\n`], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function SnapshotsSection({
  items,
  labels,
  canManage,
  refreshing,
  onRefresh,
  formatOpts,
}: {
  items: readonly EnterprisePermissionSnapshot[];
  labels: AuthorizationWorkspaceLabels;
  canManage: boolean;
  refreshing: string | null;
  onRefresh: (userId: string) => Promise<void>;
  formatOpts: FormatOpts;
}) {
  const [target, setTarget] = useState<EnterprisePermissionSnapshot | null>(null);
  return (
    <Section title={labels.snapshotsTitle} description={labels.snapshotsDescription}>
      <div className="overflow-x-auto" data-test-id="authz-snapshots">
        <table className="w-full min-w-[700px] text-left text-[12px]">
          <thead>
            <tr className="border-b border-hairline text-ink-faint">
              <th className="p-2">{labels.user}</th>
              <th className="p-2">{labels.roles}</th>
              <th className="p-2">{labels.grants}</th>
              <th className="p-2">{labels.fetchedAt}</th>
              <th className="p-2">{labels.status}</th>
              {canManage ? <th/> : null}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.userId} className="border-b border-hairline-soft">
                <td className="p-2 font-medium">{item.displayName || labels.notAvailable}</td>
                <td className="p-2">{item.roleGroups?.join(labels.roleGroupSeparator) || labels.notAvailable}</td>
                <td className="p-2 font-mono">{item.grantCount}</td>
                <td className="p-2 font-mono">{formatEnterpriseTimestamp(item.fetchedAt, formatOpts)}</td>
                <td className="p-2"><StateBadge value={!item.expired} labels={labels}/></td>
                {canManage ? (
                  <td className="p-2 text-right">
                    <Button variant="ghost" size="sm" loading={refreshing === item.userId} onClick={() => setTarget(item)} data-test-id={`authz-snapshot-refresh-${item.userId}`}>
                      {refreshing === item.userId ? labels.refreshing : labels.refresh}
                    </Button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
        {!items.length ? <p className="p-4 text-center text-ink-faint">{labels.empty}</p> : null}
      </div>
      <Dialog
        open={Boolean(target)}
        onClose={() => setTarget(null)}
        title={labels.refresh}
        closeLabel={labels.close}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setTarget(null)}>{labels.cancel}</Button>
            <Button variant="primary" onClick={() => { if (target) void onRefresh(target.userId).then(() => setTarget(null)); }} data-test-id="authz-snapshot-refresh-confirm">{labels.confirm}</Button>
          </>
        }
      >
        <p>{target?.displayName}</p>
      </Dialog>
    </Section>
  );
}

export function EnterpriseDescriptorKeysTable({
  items,
  labels,
  onToggle,
  onDelete,
}: {
  items: readonly EnterpriseDescriptorKey[];
  labels: Pick<AuthorizationWorkspaceLabels, "disable" | "enabled" | "delete" | "empty">;
  onToggle: (item: EnterpriseDescriptorKey) => void;
  onDelete: (item: EnterpriseDescriptorKey) => void;
}) {
  return (
    <div
      className="max-w-full overflow-x-auto"
      style={{ maxWidth: "100%", overflowX: "auto" }}
      data-test-id="authz-descriptor-keys"
    >
      <table
        className="w-full min-w-[520px] text-left text-[12px]"
        style={{ minWidth: 520, width: "100%" }}
        data-testid="authz-descriptor-keys-table"
      >
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-hairline">
              <td className="min-w-0 max-w-[200px] break-all p-2" style={{ maxWidth: 200, overflowWrap: "anywhere" }}>{item.name}</td>
              <td className="min-w-0 break-all p-2 font-mono" style={{ overflowWrap: "anywhere" }}>{item.tokenPrefix}</td>
              <td className="whitespace-nowrap p-2 text-right">
                <Button variant="ghost" size="sm" onClick={() => onToggle(item)} data-test-id={`authz-descriptor-key-toggle-${item.id}`}>{item.active ? labels.disable : labels.enabled}</Button>
                <Button variant="ghost-danger" size="sm" onClick={() => onDelete(item)} data-test-id={`authz-descriptor-key-delete-${item.id}`}>{labels.delete}</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!items.length ? <p className="p-4 text-center text-ink-faint">{labels.empty}</p> : null}
    </div>
  );
}

function DescriptorKeys({ adapter, labels, items, onChange, canManage }: { adapter: EnterpriseAuthorizationAdapter; labels: AuthorizationWorkspaceLabels; items: readonly EnterpriseDescriptorKey[]; onChange: (items: readonly EnterpriseDescriptorKey[]) => void; canManage: boolean }) {
  const [createOpen, setCreateOpen] = useState(false); const [name, setName] = useState(""); const [token, setToken] = useState(""); const [deleteTarget, setDeleteTarget] = useState<EnterpriseDescriptorKey | null>(null);
  async function create() { if (!adapter.createDescriptorKey || !name.trim()) return; try { const result = await adapter.createDescriptorKey(name.trim()); onChange([...items, result.key]); setToken(result.token); } catch { toast.error(labels.loadFailed); } }
  async function toggle(item: EnterpriseDescriptorKey) { if (!adapter.updateDescriptorKey) return; try { const next = await adapter.updateDescriptorKey(item.id, !item.active); onChange(items.map((current) => current.id === item.id ? next : current)); } catch { toast.error(labels.loadFailed); } }
  async function remove() { if (!deleteTarget || !adapter.deleteDescriptorKey) return; try { await adapter.deleteDescriptorKey(deleteTarget.id); onChange(items.filter((item) => item.id !== deleteTarget.id)); setDeleteTarget(null); } catch { toast.error(labels.loadFailed); } }
  if (!canManage) return null;
  // FE-UXA-13: match catalog/snapshot overflow pattern with min-width scroll container.
  return (
    <Section title={labels.descriptorKeysTitle} description={labels.descriptorKeysDescription} actions={<Button variant="outline" size="sm" onClick={() => setCreateOpen(true)} data-test-id="authz-descriptor-key-create">{labels.create}</Button>}>
      <EnterpriseDescriptorKeysTable
        items={items}
        labels={labels}
        onToggle={(item) => void toggle(item)}
        onDelete={setDeleteTarget}
      />
      <Dialog open={createOpen} onClose={() => { setCreateOpen(false); setToken(""); }} title={labels.descriptorKeysTitle} closeLabel={labels.close} size="sm" footer={token ? <Button variant="primary" onClick={() => { setCreateOpen(false); setToken(""); setName(""); }} data-test-id="authz-descriptor-key-dialog-close">{labels.close}</Button> : <><Button variant="ghost" onClick={() => setCreateOpen(false)}>{labels.cancel}</Button><Button variant="primary" onClick={() => void create()} data-test-id="authz-descriptor-key-submit">{labels.create}</Button></>}><div className="space-y-3">{token ? <code className="block break-all" data-test-id="authz-descriptor-key-token">{token}</code> : <Field label={labels.name}><Input value={name} onChange={(event) => setName(event.target.value)} data-test-id="authz-descriptor-key-name" /></Field>}</div></Dialog>
      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} title={labels.delete} closeLabel={labels.close} size="sm" footer={<><Button variant="ghost" onClick={() => setDeleteTarget(null)}>{labels.cancel}</Button><Button variant="danger" onClick={() => void remove()} data-test-id="authz-descriptor-key-delete-confirm">{labels.confirm}</Button></>}><p>{deleteTarget?.name}</p></Dialog>
    </Section>
  );
}
