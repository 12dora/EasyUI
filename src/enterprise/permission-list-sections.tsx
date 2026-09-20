"use client";

/**
 * 设置 → 登录与权限 → 业务权限: the 我的授权 and 权限目录 lists.
 *
 * Split out of authorization-workspace.tsx so the workspace component stays
 * under the file/function smell thresholds. Types come back from there as
 * `import type` only, so there is no runtime import cycle.
 *
 * Both lists sit in a fixed-height scroll viewport once they have rows: they are
 * unbounded server data and would otherwise push the rest of the page down.
 */
import { useMemo } from "react";
import { Badge } from "../primitives/badge";
import { Section } from "../primitives/section";
import { HairlineGrid, hairlineHeaderCell } from "./hairline-grid";
import type {
  AuthorizationWorkspaceLabels,
  EnterpriseCurrentGrant,
  EnterprisePermissionCatalogItem,
} from "./authorization-workspace";

/**
 * One element owns BOTH axes. It cannot be split into a vertical box around a
 * horizontal one: `overflow-x: auto` computes `overflow-y` to `auto` too, so the
 * inner div would become the sticky header's nearest scrolling ancestor — and
 * with no height of its own it never scrolls, letting the header slide away.
 *
 * `max-h` only applies to a populated list; an empty state boxed into 320px
 * looks broken, so it keeps the plain horizontal container.
 */
const SCROLL_VIEWPORT = "max-h-[320px] overflow-auto overscroll-contain";
const SCROLL_VIEWPORT_UNCAPPED = "overflow-x-auto";

export function StateBadge({ value, labels }: { value: boolean; labels: AuthorizationWorkspaceLabels }) {
  return <Badge tone={value ? "evergreen" : "amber"}>{value ? labels.configured : labels.notConfigured}</Badge>;
}

/**
 * Data-scope codes (`SELF` / `MANAGED_USERS` / `ALL`) reach the UI raw, from both
 * grants and catalog `supportedScopes`. A code the contract has not defined yet
 * falls back to itself — never a blank cell.
 */
export function scopeLabel(scope: string, labels: AuthorizationWorkspaceLabels) {
  if (scope === "SELF") return labels.scopeSelf || scope;
  if (scope === "MANAGED_USERS") return labels.scopeManagedUsers || scope;
  if (scope === "ALL") return labels.scopeAll || scope;
  return scope;
}

/** Risk level: high risk gets the warning badge so it is scannable, standard stays plain text. */
function RiskCell({ level, labels }: { level: string; labels: AuthorizationWorkspaceLabels }) {
  if (level === "high") return <Badge tone="amber">{labels.riskHigh || level}</Badge>;
  return <>{level === "standard" ? labels.riskStandard || level : level}</>;
}

/** Grant row: human name first, permission code underneath; code alone when unresolved. */
function GrantIdentity({ code, name }: { code: string; name?: string }) {
  if (!name) return <span className="font-mono">{code}</span>;
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="text-ink">{name}</span>
      <span className="font-mono text-[12px] text-ink-faint">{code}</span>
    </span>
  );
}

export function EnterpriseMyGrantsSection({
  grants,
  catalog,
  labels,
  locale,
}: {
  grants: readonly EnterpriseCurrentGrant[];
  catalog: readonly EnterprisePermissionCatalogItem[];
  labels: AuthorizationWorkspaceLabels;
  locale: string;
}) {
  // The catalog is only fetched for non-restricted viewers, so this map is simply
  // empty when it is unavailable and every row falls back to its code.
  const permissionNames = useMemo(() => {
    const zh = locale.startsWith("zh");
    return new Map(catalog.map((item) => [item.code, (zh ? item.nameZh : item.nameEn) || ""]));
  }, [catalog, locale]);
  return (
    <Section title={labels.myGrantsTitle} description={labels.myGrantsDescription}>
      <div className={grants.length ? SCROLL_VIEWPORT : SCROLL_VIEWPORT_UNCAPPED} data-test-id="authz-my-grants-scroll">
        <div data-data-grid="authz-my-grants">
          <HairlineGrid<EnterpriseCurrentGrant>
            className="w-full"
            showHeader={false}
            rowKey={(grant) => `${grant.permissionCode}:${grant.dataScope}`}
            dataSource={grants}
            empty={labels.empty}
            columns={[
              { key: "code", render: (_, grant) => <GrantIdentity code={grant.permissionCode} name={permissionNames.get(grant.permissionCode)}/> },
              { key: "scope", render: (_, grant) => <Badge tone="neutral">{scopeLabel(grant.dataScope, labels)}</Badge> },
            ]}
          />
        </div>
      </div>
    </Section>
  );
}

export function EnterprisePermissionCatalogSection({
  catalog,
  labels,
  locale,
}: {
  catalog: readonly EnterprisePermissionCatalogItem[];
  labels: AuthorizationWorkspaceLabels;
  locale: string;
}) {
  return (
    <Section title={labels.catalogTitle} description={labels.catalogDescription}>
      {/* The header sticks to the top of the scroll viewport so the columns stay
          readable while scrolling (see HairlineGrid#headerCellClassName). */}
      <div className={catalog.length ? SCROLL_VIEWPORT : SCROLL_VIEWPORT_UNCAPPED} data-test-id="authz-permission-catalog-scroll">
        <div data-test-id="authz-permission-catalog">
          <HairlineGrid<EnterprisePermissionCatalogItem>
            className="w-full min-w-[680px]"
            rowKey={(item) => item.code}
            dataSource={catalog}
            empty={labels.empty}
            headerCellClassName={catalog.length ? "sticky top-0 z-10 bg-paper" : undefined}
            columns={[
              { key: "code", title: labels.permissionCode, dataIndex: "code", onHeaderCell: hairlineHeaderCell, onCell: () => ({ className: "font-mono" }) },
              { key: "name", title: labels.permissionName, onHeaderCell: hairlineHeaderCell, render: (_, item) => (locale.startsWith("zh") ? item.nameZh : item.nameEn) || labels.notAvailable },
              { key: "scopes", title: labels.scopes, onHeaderCell: hairlineHeaderCell, render: (_, item) => item.supportedScopes.map((scope) => scopeLabel(scope, labels)).join(labels.roleGroupSeparator) || labels.notAvailable },
              { key: "risk", title: labels.risk, onHeaderCell: hairlineHeaderCell, render: (_, item) => <RiskCell level={item.riskLevel} labels={labels}/> },
              { key: "status", title: labels.status, onHeaderCell: hairlineHeaderCell, render: (_, item) => <StateBadge value={item.active} labels={labels}/> },
            ]}
          />
        </div>
      </div>
    </Section>
  );
}
