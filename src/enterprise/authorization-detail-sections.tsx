"use client";

/**
 * 设置 → 登录与权限 → 业务权限: the 用户授权 table and the 应用声明 card.
 *
 * Split out of authorization-workspace.tsx so the workspace component stays
 * under the file/function smell thresholds. Types come back from there as
 * `import type` only, so there is no runtime import cycle.
 *
 * `Fact` lives here rather than in the workspace for the same reason: the
 * workspace's identity card imports it back from this module, which keeps the
 * single runtime edge pointing workspace → detail-sections.
 */
import { useState, type ReactNode } from "react";
import { Button } from "../primitives/button";
import { Section } from "../primitives/section";
import { formatEnterpriseTimestamp, type EnterpriseTimestampFormatter } from "./format-timestamp";
import { HairlineGrid, hairlineHeaderCell } from "./hairline-grid";
import { StateBadge } from "./permission-list-sections";
import type {
  AuthorizationWorkspaceLabels,
  EnterpriseManifestOverview,
  EnterprisePermissionSnapshot,
} from "./authorization-workspace";

/** 一行「标签 / 值」。窄屏上下堆叠,宽屏左右对齐。 */
export function Fact({ label, value, empty }: { label: string; value: ReactNode; empty?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 border-b border-hairline-soft py-2 text-[12px] sm:flex-row sm:items-start sm:justify-between sm:gap-3">
      <span className="shrink-0 text-ink-faint">{label}</span>
      <span className="min-w-0 break-all text-left font-mono text-ink sm:text-right">{value || empty}</span>
    </div>
  );
}

export type FormatOpts = {
  locale: string;
  empty: string;
  formatTimestamp?: EnterpriseTimestampFormatter;
  timeZone?: string;
};

export function SnapshotsSection({
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
  const [refreshingAll, setRefreshingAll] = useState(false);
  // 一键刷新:串行逐个刷新当前列出的用户。宿主适配器直连真实服务,并发 N 个请求会把它打垮。
  async function refreshAll() {
    if (refreshingAll || items.length === 0) return;
    setRefreshingAll(true);
    try {
      // 按点击那一刻列出的行来刷新;吞掉单行失败,一个坏行不能把后面的用户堵死
      // (失败由宿主自己的 toast 通道播报,这里不另加错误面板)。
      for (const item of items) await onRefresh(item.userId).catch(() => undefined);
    } finally {
      setRefreshingAll(false);
    }
  }
  return (
    <Section
      title={labels.snapshotsTitle}
      description={labels.snapshotsDescription}
      actions={canManage ? (
        <Button variant="outline" size="sm" loading={refreshingAll} disabled={items.length === 0} onClick={() => void refreshAll()} data-test-id="authz-snapshots-refresh-all">
          {refreshingAll ? labels.refreshing : (labels.refreshAll ?? labels.refresh)}
        </Button>
      ) : null}
    >
      <div className="overflow-x-auto" data-test-id="authz-snapshots">
        <HairlineGrid<EnterprisePermissionSnapshot>
          className="w-full min-w-[700px]"
          rowKey={(item) => item.userId}
          dataSource={items}
          empty={labels.empty}
          columns={[
            { key: "user", title: labels.user, onHeaderCell: hairlineHeaderCell, onCell: () => ({ className: "font-medium" }), render: (_, item) => item.displayName || labels.notAvailable },
            { key: "roles", title: labels.roles, onHeaderCell: hairlineHeaderCell, render: (_, item) => item.roleGroups?.join(labels.roleGroupSeparator) || labels.notAvailable },
            { key: "grants", title: labels.grants, dataIndex: "grantCount", onHeaderCell: hairlineHeaderCell, onCell: () => ({ className: "font-mono" }) },
            { key: "fetchedAt", title: labels.fetchedAt, onHeaderCell: hairlineHeaderCell, onCell: () => ({ className: "font-mono" }), render: (_, item) => formatEnterpriseTimestamp(item.fetchedAt, formatOpts) },
            { key: "status", title: labels.status, onHeaderCell: hairlineHeaderCell, render: (_, item) => <StateBadge value={!item.expired} labels={labels}/> },
            ...(canManage
              ? [{
                  key: "actions",
                  onHeaderCell: hairlineHeaderCell,
                  onCell: () => ({ className: "text-right" }),
                  // 刷新不再走确认弹窗:点了就刷,按钮自己显示加载态。
                  // 一键刷新进行时禁用单行按钮,避免并发打到宿主适配器。
                  render: (_: unknown, item: EnterprisePermissionSnapshot) => (
                    <Button variant="ghost" size="sm" loading={refreshing === item.userId} disabled={refreshingAll} onClick={() => void onRefresh(item.userId)} data-test-id={`authz-snapshot-refresh-${item.userId}`}>
                      {refreshing === item.userId ? labels.refreshing : labels.refresh}
                    </Button>
                  ),
                }]
              : []),
          ]}
        />
      </div>
    </Section>
  );
}

/** 所有字段都可选,所以空清单就是合法的「什么都没声明」。 */
const EMPTY_MANIFEST: EnterpriseManifestOverview = {};

/** 空值统一回落到 notAvailable,免得四条事实各写一遍 `?? / ||`。 */
function factText(value: string | undefined, empty: string): string {
  return value || empty;
}

/** 应用声明卡片:四条事实。先把值算成数据再渲染,分支只留在 factText 里。 */
export function ManifestSection({ manifest, labels }: { manifest: EnterpriseManifestOverview | null; labels: AuthorizationWorkspaceLabels }) {
  const { appKey, version, capabilities = [], permissions = [] } = manifest ?? EMPTY_MANIFEST;
  const empty = labels.notAvailable;
  const facts = [
    { label: labels.appKey, value: factText(appKey, empty) },
    { label: labels.version, value: factText(version, empty) },
    { label: labels.capabilities, value: factText(capabilities.join(", "), empty) },
    { label: labels.permissions, value: String(permissions.length) },
  ];
  return (
    <Section title={labels.manifestTitle} description={labels.manifestDescription}>
      {/* 四条事实一行摆不下窄屏:手机单列、平板两列、宽屏四列,gap 沿用共享刻度。 */}
      <div className="grid gap-2 rounded-md border border-hairline bg-paper p-4 sm:grid-cols-2 lg:grid-cols-4">
        {facts.map((fact, index) => <Fact key={index} label={fact.label} value={fact.value} empty={empty}/>)}
      </div>
    </Section>
  );
}
