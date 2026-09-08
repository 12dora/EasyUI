"use client";

import { Button, ConfigProvider, Empty, Input, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import enUS from "antd/locale/en_US";
import zhCN from "antd/locale/zh_CN";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ANTD_CONTROL_STATE_TOKEN, ANTD_CONTROL_TOKEN, ANTD_NAVY_BUTTON_TOKEN } from "../control-tokens";
import { InlineNotice } from "../primitives/inline-notice";
import { PageHeader } from "../primitives/page-header";
import { EnterprisePermissionDeniedPage } from "../enterprise/surface-helpers";
import { toast } from "../toast";
import { CreateAccountModal } from "./create-modal";
import { EditAccountDrawer } from "./edit-drawer";
import { PasswordReceiptModal } from "./password-fields";
import type {
  CreateLocalAccountInput,
  EnterpriseLocalAccountsAdapter,
  EnterpriseLocalAccountsCapabilities,
  EnterpriseLocalAccountsLabels,
  EnterpriseLocalAccountsPermissions,
  LocalAccountSummary,
  LocalAccountsPermissionCatalogItem,
} from "./types";

// Re-export public API
export type {
  CreateLocalAccountInput,
  EnterpriseLocalAccountsAdapter,
  EnterpriseLocalAccountsCapabilities,
  EnterpriseLocalAccountsLabels,
  EnterpriseLocalAccountsPermissions,
  LocalAccountDetail,
  LocalAccountListResult,
  LocalAccountSummary,
  LocalAccountsPermissionCatalogItem,
  LocalGrant,
  ResetLocalAccountPasswordInput,
  SetLocalAccountPermissionsInput,
  UpdateLocalAccountInput,
} from "./types";

export { generatePolicyPassword } from "./password";
export {
  buildCatalogGroupTree,
  catalogGroupKey,
  canToggleHighRisk,
  defaultScopeForCode,
  dedupeGrantsByCode,
  flattenGroupKeys,
  isCapabilitiesAccountIdReady,
  isGrantable,
  isHighRisk,
  isPrivilegedTarget,
  isSelfAccount,
  isSelfDangerLocked,
  isTargetReadOnlyForOperator,
  isVersionConflictError,
  normalizeDetailGrants,
  stripBaselinePermissions,
} from "./grants";

// ── Surface ─────────────────────────────────────────────────────────────────

export function EnterpriseLocalAccountsSurface({
  adapter,
  labels,
  permissions,
  capabilities,
  locale,
  baselinePermissions = [],
}: {
  adapter: EnterpriseLocalAccountsAdapter;
  labels: EnterpriseLocalAccountsLabels;
  permissions: EnterpriseLocalAccountsPermissions;
  /** Server-derived from `/auth/me` — do not infer from permission sets. */
  capabilities: EnterpriseLocalAccountsCapabilities;
  locale: string;
  /**
   * Implicit self-service codes for every local account. Host/adapter supplies
   * these — never hardcode the list inside EasyUI. Shown locked in the picker
   * and stripped from create/PUT grant payloads. Edit drawer prefers
   * `detail.baselinePermissions` when present.
   */
  baselinePermissions?: readonly string[];
}) {
  const isZh = !(locale === "en" || locale.startsWith("en"));

  // DatePicker/Calendar 面板的星期起始与格式化跟随 dayjs 全局 locale;
  // antd 组件内建文案(Popconfirm 确定/取消、Select 暂无数据等)走 ConfigProvider locale。
  useEffect(() => {
    dayjs.locale(isZh ? "zh-cn" : "en");
  }, [isZh]);

  if (!permissions.view) {
    // The heading belongs to the route, not to the body: a viewer without the
    // permission still gets exactly one H1 telling them which page this is.
    return (
      <EnterprisePermissionDeniedPage
        pageTitle={labels.title}
        pageDescription={labels.description}
        sectionTestId="enterprise-local-accounts"
        surface="local-accounts"
        deniedTitle={labels.permissionDenied}
      />
    );
  }

  return (
    <ConfigProvider
      locale={isZh ? zhCN : enUS}
      theme={{
        token: {
          ...ANTD_CONTROL_TOKEN,
          ...ANTD_CONTROL_STATE_TOKEN,
          fontSize: 13,
        },
        components: {
          // 按钮走项目统一的 navy 主色(与 EasyUI bg-ink 主按钮对齐);蓝色仅保留为
          // 选中/聚焦强调色(勾选框、输入框聚焦边等)。
          Button: { ...ANTD_NAVY_BUTTON_TOKEN },
          // 紧凑表单密度:对话框内条目间距从默认 24px 收敛到 14px。
          Form: { itemMarginBottom: 14, verticalLabelPadding: "0 0 4px" },
        },
      }}
    >
      <LocalAccountsBody
        adapter={adapter}
        labels={labels}
        canManage={permissions.manage}
        capabilities={capabilities}
        locale={locale}
        baselinePermissions={baselinePermissions}
      />
    </ConfigProvider>
  );
}

function LocalAccountsBody({
  adapter,
  labels,
  canManage,
  capabilities,
  locale,
  baselinePermissions,
}: {
  adapter: EnterpriseLocalAccountsAdapter;
  labels: EnterpriseLocalAccountsLabels;
  canManage: boolean;
  capabilities: EnterpriseLocalAccountsCapabilities;
  locale: string;
  baselinePermissions: readonly string[];
}) {
  const [rows, setRows] = useState<LocalAccountSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [search, setSearch] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<readonly LocalAccountsPermissionCatalogItem[]>([]);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [catalogFailed, setCatalogFailed] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [receiptPassword, setReceiptPassword] = useState<string | null>(null);

  // Keep ensureCatalog identity stable across catalog state updates so consumers
  // (create-modal open effect) do not re-fire when a slow catalog response lands.
  const catalogStateRef = useRef({ catalog, catalogLoaded, catalogFailed });
  catalogStateRef.current = { catalog, catalogLoaded, catalogFailed };

  const loadList = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const result = await adapter.listAccounts(search ? { search } : undefined);
      setRows(result.data);
      setTotal(result.meta.total);
    } catch {
      setLoadFailed(true);
      toast.error(labels.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [adapter, labels.loadFailed, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadList(), 0);
    return () => window.clearTimeout(timer);
  }, [loadList]);

  // 单飞(single-flight):预取、创建按钮、对话框/抽屉可能并发调用,共享同一
  // 在途请求,避免后到的失败结果覆盖先前成功加载的目录。
  const catalogInFlightRef = useRef<Promise<readonly LocalAccountsPermissionCatalogItem[]> | null>(null);

  const ensureCatalog = useCallback(() => {
    const state = catalogStateRef.current;
    if (state.catalogLoaded && !state.catalogFailed) return Promise.resolve(state.catalog);
    if (catalogInFlightRef.current) return catalogInFlightRef.current;
    setCatalogLoading(true);
    const request = (async () => {
      try {
        const items = await adapter.loadPermissionCatalog();
        setCatalog(items);
        setCatalogLoaded(true);
        setCatalogFailed(false);
        catalogStateRef.current = { catalog: items, catalogLoaded: true, catalogFailed: false };
        return items;
      } catch {
        // Fail closed: empty catalog must not be treated as "loaded successfully".
        setCatalog([]);
        setCatalogLoaded(false);
        setCatalogFailed(true);
        catalogStateRef.current = { catalog: [], catalogLoaded: false, catalogFailed: true };
        return [] as readonly LocalAccountsPermissionCatalogItem[];
      } finally {
        catalogInFlightRef.current = null;
        setCatalogLoading(false);
      }
    })();
    catalogInFlightRef.current = request;
    return request;
  }, [adapter]);

  // 目录很小且创建/编辑都要用:进页面就预取,点开编辑抽屉时无需再等目录往返。
  useEffect(() => {
    void ensureCatalog();
  }, [ensureCatalog]);

  const columns: ColumnsType<LocalAccountSummary> = useMemo(
    () => [
      {
        title: labels.username,
        dataIndex: "username",
        key: "username",
        render: (value: string, row) => (
          <Space size={4} wrap>
            <Typography.Text strong>{value}</Typography.Text>
            {row.isAdmin ? <Tag color="blue">{labels.admin}</Tag> : null}
            {!row.active ? <Tag color="default">{labels.inactive}</Tag> : null}
            {row.totpEnabled ? <Tag color="green">{labels.totpEnabled}</Tag> : null}
            {row.mustChangePassword ? <Tag color="orange">{labels.mustChangePassword}</Tag> : null}
            {row.expired ? (
              <Tag color="red" data-test-id={`local-accounts-expired-${row.id}`}>
                {labels.expired}
              </Tag>
            ) : null}
          </Space>
        ),
      },
      {
        title: labels.email,
        dataIndex: "email",
        key: "email",
        render: (value: string | null) => value || labels.notAvailable,
      },
      {
        title: labels.permissions,
        dataIndex: "permissionCount",
        key: "permissionCount",
        width: 120,
        render: (count: number, row) => (row.isAdmin ? labels.admin : labels.permissionCount(count)),
      },
      {
        title: labels.actions,
        key: "actions",
        width: 100,
        render: (_: unknown, row) => (
          <Button size="small" data-test-id={`local-accounts-open-${row.id}`} onClick={() => setEditId(row.id)}>
            {labels.open}
          </Button>
        ),
      },
    ],
    [labels],
  );

  return (
    <section data-test-id="enterprise-local-accounts" data-enterprise-surface="local-accounts">
      <PageHeader
        title={labels.title}
        subtitle={labels.description}
        actions={
          <Space wrap>
            <Button data-test-id="local-accounts-refresh" onClick={() => void loadList()} loading={loading}>
              {labels.refresh}
            </Button>
            {canManage ? (
              <Button
                type="primary"
                data-test-id="local-accounts-create-btn"
                onClick={() => {
                  void ensureCatalog();
                  setCreateOpen(true);
                }}
              >
                {labels.create}
              </Button>
            ) : null}
          </Space>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Input.Search
          allowClear
          value={searchDraft}
          placeholder={labels.searchPlaceholder}
          onChange={(event) => setSearchDraft(event.target.value)}
          onSearch={(value) => setSearch(value.trim())}
          enterButton={labels.search}
          style={{ maxWidth: 360 }}
          data-test-id="local-accounts-search"
        />
      </div>

      {loadFailed && !loading ? (
        <InlineNotice tone="error" message={labels.loadFailed} actionLabel={labels.retry} onAction={() => void loadList()} />
      ) : (
        <div data-test-id="local-accounts-table">
          <Table<LocalAccountSummary>
            rowKey="id"
            loading={loading}
            columns={columns}
            dataSource={rows}
            pagination={total > rows.length ? { total, pageSize: rows.length || 20, hideOnSinglePage: true } : false}
            locale={{ emptyText: <Empty description={labels.empty} /> }}
          />
        </div>
      )}

      <CreateAccountModal
        open={createOpen}
        canManage={canManage}
        isLocalSuperadmin={capabilities.isLocalSuperadmin}
        labels={labels}
        locale={locale}
        catalog={catalog}
        catalogFailed={catalogFailed}
        catalogLoading={catalogLoading}
        baselinePermissions={baselinePermissions}
        ensureCatalog={ensureCatalog}
        adapter={adapter}
        onClose={() => setCreateOpen(false)}
        onSubmit={async (input: CreateLocalAccountInput) => {
          await adapter.createAccount(input);
          toast.success(labels.createSuccess);
          setCreateOpen(false);
          setReceiptPassword(input.password);
          await loadList();
        }}
      />

      <EditAccountDrawer
        accountId={editId}
        open={Boolean(editId)}
        canManage={canManage}
        capabilities={capabilities}
        labels={labels}
        locale={locale}
        catalog={catalog}
        catalogLoaded={catalogLoaded}
        catalogFailed={catalogFailed}
        catalogLoading={catalogLoading}
        baselinePermissions={baselinePermissions}
        ensureCatalog={ensureCatalog}
        adapter={adapter}
        onClose={() => setEditId(null)}
        onChanged={async () => {
          await loadList();
        }}
      />

      <PasswordReceiptModal
        open={Boolean(receiptPassword)}
        password={receiptPassword}
        labels={labels}
        onClose={() => setReceiptPassword(null)}
      />
    </section>
  );
}
