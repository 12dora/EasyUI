"use client";

import {
  Alert,
  Button,
  Checkbox,
  ConfigProvider,
  Drawer,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { ANTD_CONTROL_STATE_TOKEN, ANTD_CONTROL_TOKEN } from "../control-tokens";
import { InlineNotice } from "../primitives/inline-notice";
import { PageHeader } from "../primitives/page-header";
import { toast } from "../toast";

// ── Models ──────────────────────────────────────────────────────────────────

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
  createdAt: string | null;
}

export interface LocalAccountDetail extends LocalAccountSummary {
  uiLocale: string | null;
  permissions: string[];
  baselinePermissions: string[];
}

export interface LocalAccountListResult {
  data: LocalAccountSummary[];
  meta: { total: number };
}

/** Active grantable catalog entry from GET /local-accounts/permission-catalog. */
export interface LocalAccountsPermissionCatalogItem {
  code: string;
  domain: string;
  resource: string;
  riskLevel?: string;
  active: boolean;
  /** Optional display names when a host enriches catalog rows. */
  nameZh?: string;
  nameEn?: string;
  action?: string;
}

export interface CreateLocalAccountInput {
  username: string;
  email?: string | null;
  password: string;
  mustChangePassword?: boolean;
  isAdmin?: boolean;
  permissions?: string[];
}

export interface UpdateLocalAccountInput {
  email?: string | null;
  active?: boolean;
  isAdmin?: boolean;
  uiLocale?: string | null;
}

export interface ResetLocalAccountPasswordInput {
  password: string;
  mustChangePassword?: boolean;
}

/** Host transport for local-account CRUD and the shared permission catalog. */
export interface EnterpriseLocalAccountsAdapter {
  listAccounts(params?: { search?: string }): Promise<LocalAccountListResult>;
  getAccount(id: string): Promise<LocalAccountDetail>;
  createAccount(input: CreateLocalAccountInput): Promise<LocalAccountDetail>;
  updateAccount(id: string, patch: UpdateLocalAccountInput): Promise<LocalAccountDetail>;
  deleteAccount(id: string): Promise<void>;
  resetPassword(id: string, input: ResetLocalAccountPasswordInput): Promise<void>;
  setPermissions(id: string, permissions: string[]): Promise<LocalAccountDetail | void>;
  disableTotp(id: string): Promise<void>;
  loadPermissionCatalog(): Promise<readonly LocalAccountsPermissionCatalogItem[]>;
}

export interface EnterpriseLocalAccountsPermissions {
  view: boolean;
  manage: boolean;
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

// ── Password helper ─────────────────────────────────────────────────────────

const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnopqrstuvwxyz";
const DIGIT = "23456789";
const SYMBOL = "!@#$%^&*-_=+";
const ALL_CHARS = UPPER + LOWER + DIGIT + SYMBOL;

/** Crypto-strong password: ≥16 chars with upper, lower, digit, and symbol. */
export function generatePolicyPassword(length = 16): string {
  const size = Math.max(16, length);
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  const chars: string[] = [
    UPPER[bytes[0]! % UPPER.length]!,
    LOWER[bytes[1]! % LOWER.length]!,
    DIGIT[bytes[2]! % DIGIT.length]!,
    SYMBOL[bytes[3]! % SYMBOL.length]!,
  ];
  for (let i = 4; i < size; i += 1) {
    chars.push(ALL_CHARS[bytes[i]! % ALL_CHARS.length]!);
  }
  const shuffle = new Uint8Array(size);
  crypto.getRandomValues(shuffle);
  for (let i = size - 1; i > 0; i -= 1) {
    const j = shuffle[i]! % (i + 1);
    const tmp = chars[i]!;
    chars[i] = chars[j]!;
    chars[j] = tmp;
  }
  return chars.join("");
}

// ── Surface ─────────────────────────────────────────────────────────────────

export function EnterpriseLocalAccountsSurface({
  adapter,
  labels,
  permissions,
  locale,
  baselinePermissions = [],
}: {
  adapter: EnterpriseLocalAccountsAdapter;
  labels: EnterpriseLocalAccountsLabels;
  permissions: EnterpriseLocalAccountsPermissions;
  locale: string;
  /**
   * Implicit self-service codes for every local account. Host/adapter supplies
   * these — never hardcode the list inside EasyUI. Shown locked in the picker
   * and stripped from create/PUT grant payloads. Edit drawer prefers
   * `detail.baselinePermissions` when present.
   */
  baselinePermissions?: readonly string[];
}) {
  if (!permissions.view) {
    return <InlineNotice tone="error" message={labels.permissionDenied} data-test-id="permission-denied" />;
  }

  return (
    <ConfigProvider
      theme={{
        token: {
          ...ANTD_CONTROL_TOKEN,
          ...ANTD_CONTROL_STATE_TOKEN,
          fontSize: 13,
        },
      }}
    >
      <LocalAccountsBody
        adapter={adapter}
        labels={labels}
        canManage={permissions.manage}
        locale={locale}
        baselinePermissions={baselinePermissions}
      />
    </ConfigProvider>
  );
}

/** Drop implicit baseline codes from a grant list before create/PUT. */
export function stripBaselinePermissions(codes: readonly string[], baseline: readonly string[]): string[] {
  if (!baseline.length) return [...codes];
  const locked = new Set(baseline);
  return codes.filter((code) => !locked.has(code));
}

function LocalAccountsBody({
  adapter,
  labels,
  canManage,
  locale,
  baselinePermissions,
}: {
  adapter: EnterpriseLocalAccountsAdapter;
  labels: EnterpriseLocalAccountsLabels;
  canManage: boolean;
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

  const ensureCatalog = useCallback(async () => {
    if (catalogLoaded && !catalogFailed) return catalog;
    setCatalogLoading(true);
    try {
      const items = await adapter.loadPermissionCatalog();
      setCatalog(items);
      setCatalogLoaded(true);
      setCatalogFailed(false);
      return items;
    } catch {
      setCatalog([]);
      setCatalogLoaded(false);
      setCatalogFailed(true);
      return [];
    } finally {
      setCatalogLoading(false);
    }
  }, [adapter, catalog, catalogFailed, catalogLoaded]);

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
          <Button type="link" size="small" data-test-id={`local-accounts-open-${row.id}`} onClick={() => setEditId(row.id)}>
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
        labels={labels}
        locale={locale}
        catalog={catalog}
        catalogFailed={catalogFailed}
        catalogLoading={catalogLoading}
        baselinePermissions={baselinePermissions}
        ensureCatalog={ensureCatalog}
        onClose={() => setCreateOpen(false)}
        onSubmit={async (input) => {
          await adapter.createAccount(input);
          toast.success(labels.createSuccess);
          setCreateOpen(false);
          await loadList();
        }}
      />

      <EditAccountDrawer
        accountId={editId}
        open={Boolean(editId)}
        canManage={canManage}
        labels={labels}
        locale={locale}
        catalog={catalog}
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
    </section>
  );
}

// ── Permission picker ───────────────────────────────────────────────────────

function PermissionPicker({
  labels,
  locale,
  catalog,
  catalogFailed,
  catalogLoading,
  baselinePermissions,
  value,
  onChange,
  disabled,
  adminLocked,
  onRetryCatalog,
}: {
  labels: EnterpriseLocalAccountsLabels;
  locale: string;
  catalog: readonly LocalAccountsPermissionCatalogItem[];
  catalogFailed?: boolean;
  catalogLoading?: boolean;
  baselinePermissions: readonly string[];
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  adminLocked?: boolean;
  onRetryCatalog?: () => void;
}) {
  const baselineSet = useMemo(() => new Set(baselinePermissions), [baselinePermissions]);

  const groups = useMemo(() => {
    const map = new Map<string, LocalAccountsPermissionCatalogItem[]>();
    for (const item of catalog) {
      if (!item.active) continue;
      const list = map.get(item.domain) ?? [];
      list.push(item);
      map.set(item.domain, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [catalog]);

  const locked = Boolean(disabled || adminLocked);
  /** True once catalog has settled into a terminal render (groups, empty, or error) — not the loading placeholder. */
  const catalogReady = Boolean(catalogFailed || !catalogLoading || groups.length > 0);

  function toggleGrant(code: string, checked: boolean) {
    if (baselineSet.has(code) || locked) return;
    const next = checked ? Array.from(new Set([...value, code])) : value.filter((item) => item !== code);
    onChange(stripBaselinePermissions(next, baselinePermissions));
  }

  return (
    <div
      data-test-id="local-accounts-permission-picker"
      data-catalog-loaded={catalogReady ? "true" : "false"}
      className="space-y-3"
    >
      <Typography.Text strong>{labels.permissionPickerTitle}</Typography.Text>
      {adminLocked ? <Alert type="info" showIcon message={labels.permissionPickerAdminNote} /> : null}
      {catalogFailed ? (
        <InlineNotice
          tone="error"
          message={labels.permissionCatalogLoadFailed}
          actionLabel={labels.retry}
          onAction={onRetryCatalog}
          data-test-id="local-accounts-catalog-error"
        />
      ) : catalogLoading && groups.length === 0 ? (
        <Typography.Text type="secondary">{labels.loading}</Typography.Text>
      ) : groups.length === 0 ? (
        <Typography.Text type="secondary">{labels.permissionPickerEmpty}</Typography.Text>
      ) : (
        groups.map(([domain, items]) => (
          <div key={domain} data-test-id={`local-accounts-perm-group-${domain}`} className="rounded-md border border-hairline p-3">
            <Typography.Text className="mb-2 block font-medium">{domain}</Typography.Text>
            <div className="flex flex-col gap-1">
              {items.map((item) => {
                const isBaseline = baselineSet.has(item.code);
                const checked = adminLocked || isBaseline || value.includes(item.code);
                const itemDisabled = locked || isBaseline;
                const testId = isBaseline
                  ? `local-accounts-perm-baseline-${item.code}`
                  : `local-accounts-perm-${item.code}`;
                return (
                  <div key={item.code} data-test-id={testId}>
                    <Checkbox
                      checked={checked}
                      disabled={itemDisabled}
                      onChange={(event) => toggleGrant(item.code, event.target.checked)}
                    >
                      <span>
                        {permissionLabel(item, locale)}
                        {isBaseline ? (
                          <Typography.Text
                            type="secondary"
                            className="ml-2 text-[12px]"
                            data-test-id={`local-accounts-perm-baseline-hint-${item.code}`}
                          >
                            {labels.permissionPickerBaselineHint}
                          </Typography.Text>
                        ) : null}
                      </span>
                    </Checkbox>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function permissionLabel(item: LocalAccountsPermissionCatalogItem, locale: string) {
  const name = locale === "en" ? item.nameEn || item.nameZh : item.nameZh || item.nameEn;
  return name ? `${name} (${item.code})` : item.code;
}

// ── Password field with generator ───────────────────────────────────────────

function PasswordWithGenerator({
  value,
  onChange,
  labels,
  disabled,
  testIdPrefix,
}: {
  value?: string;
  onChange?: (next: string) => void;
  labels: EnterpriseLocalAccountsLabels;
  disabled?: boolean;
  testIdPrefix: string;
}) {
  const current = value ?? "";
  const setValue = (next: string) => onChange?.(next);
  return (
    <Space.Compact style={{ width: "100%" }}>
      <Input.Password
        value={current}
        onChange={(event) => setValue(event.target.value)}
        disabled={disabled}
        data-test-id={`${testIdPrefix}-password-input`}
      />
      <Button
        disabled={disabled}
        data-test-id={`${testIdPrefix}-generate-password`}
        onClick={() => setValue(generatePolicyPassword())}
      >
        {labels.generatePassword}
      </Button>
      <Button
        disabled={disabled || !current}
        data-test-id={`${testIdPrefix}-copy-password`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(current);
            toast.success(labels.passwordCopied);
          } catch {
            toast.error(labels.copyFailed);
          }
        }}
      >
        {labels.copyPassword}
      </Button>
    </Space.Compact>
  );
}

// ── Create modal ────────────────────────────────────────────────────────────

function CreateAccountModal({
  open,
  canManage,
  labels,
  locale,
  catalog,
  catalogFailed,
  catalogLoading,
  baselinePermissions,
  ensureCatalog,
  onClose,
  onSubmit,
}: {
  open: boolean;
  canManage: boolean;
  labels: EnterpriseLocalAccountsLabels;
  locale: string;
  catalog: readonly LocalAccountsPermissionCatalogItem[];
  catalogFailed: boolean;
  catalogLoading: boolean;
  baselinePermissions: readonly string[];
  ensureCatalog: () => Promise<readonly LocalAccountsPermissionCatalogItem[]>;
  onClose: () => void;
  onSubmit: (input: CreateLocalAccountInput) => Promise<void>;
}) {
  const [form] = Form.useForm<{
    username: string;
    email?: string;
    password: string;
    mustChangePassword: boolean;
    isAdmin: boolean;
    permissions: string[];
  }>();
  const [submitting, setSubmitting] = useState(false);
  const isAdmin = Form.useWatch("isAdmin", form) ?? false;
  const selectedPermissions = Form.useWatch("permissions", form) ?? [];

  useEffect(() => {
    if (!open) return;
    void ensureCatalog();
    form.setFieldsValue({
      username: "",
      email: "",
      password: "",
      mustChangePassword: true,
      isAdmin: false,
      permissions: [],
    });
  }, [ensureCatalog, form, open]);

  async function handleOk() {
    if (!canManage) return;
    try {
      const values = await form.validateFields();
      if (!values.password?.trim()) {
        form.setFields([{ name: "password", errors: [labels.passwordRequired] }]);
        return;
      }
      setSubmitting(true);
      await onSubmit({
        username: values.username.trim(),
        email: values.email?.trim() || null,
        password: values.password,
        mustChangePassword: values.mustChangePassword !== false,
        isAdmin: Boolean(values.isAdmin),
        permissions: values.isAdmin
          ? []
          : stripBaselinePermissions(values.permissions ?? [], baselinePermissions),
      });
    } catch (error) {
      if (error && typeof error === "object" && "errorFields" in error) return;
      toast.error(labels.createFailed);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      title={labels.createTitle}
      onCancel={onClose}
      onOk={() => void handleOk()}
      okText={submitting ? labels.saving : labels.save}
      cancelText={labels.cancel}
      confirmLoading={submitting}
      okButtonProps={{ disabled: !canManage, "data-test-id": "local-accounts-create-submit" } as never}
      destroyOnHidden
      width={640}
      modalRender={(node) => <div data-test-id="local-accounts-create-modal">{node}</div>}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{ mustChangePassword: true, isAdmin: false, permissions: [] }}
        disabled={!canManage}
      >
        <Form.Item name="username" label={labels.username} rules={[{ required: true, message: labels.usernameRequired }]}>
          <Input data-test-id="local-accounts-create-username" autoComplete="off" />
        </Form.Item>
        <Form.Item name="email" label={labels.email}>
          <Input data-test-id="local-accounts-create-email" autoComplete="off" />
        </Form.Item>
        <Form.Item name="password" label={labels.password} rules={[{ required: true, message: labels.passwordRequired }]}>
          <PasswordWithGenerator labels={labels} disabled={!canManage} testIdPrefix="local-accounts-create" />
        </Form.Item>
        <Form.Item name="mustChangePassword" label={labels.mustChangePassword} valuePropName="checked">
          <Switch data-test-id="local-accounts-create-must-change" />
        </Form.Item>
        <Typography.Paragraph type="secondary" className="!mt-0">
          {labels.mustChangePasswordHint}
        </Typography.Paragraph>
        <Form.Item name="isAdmin" label={labels.isAdmin} valuePropName="checked">
          <Switch data-test-id="local-accounts-create-is-admin" />
        </Form.Item>
        <Typography.Paragraph type="secondary" className="!mt-0">
          {labels.isAdminHint}
        </Typography.Paragraph>
        <Form.Item name="permissions" hidden>
          <Input />
        </Form.Item>
        <PermissionPicker
          labels={labels}
          locale={locale}
          catalog={catalog}
          catalogFailed={catalogFailed}
          catalogLoading={catalogLoading}
          baselinePermissions={baselinePermissions}
          value={selectedPermissions}
          onChange={(next) => form.setFieldValue("permissions", stripBaselinePermissions(next, baselinePermissions))}
          disabled={!canManage || isAdmin}
          adminLocked={isAdmin}
          onRetryCatalog={() => void ensureCatalog()}
        />
      </Form>
    </Modal>
  );
}

// ── Edit drawer ─────────────────────────────────────────────────────────────

function EditAccountDrawer({
  accountId,
  open,
  canManage,
  labels,
  locale,
  catalog,
  catalogFailed,
  catalogLoading,
  baselinePermissions,
  ensureCatalog,
  adapter,
  onClose,
  onChanged,
}: {
  accountId: string | null;
  open: boolean;
  canManage: boolean;
  labels: EnterpriseLocalAccountsLabels;
  locale: string;
  catalog: readonly LocalAccountsPermissionCatalogItem[];
  catalogFailed: boolean;
  catalogLoading: boolean;
  baselinePermissions: readonly string[];
  ensureCatalog: () => Promise<readonly LocalAccountsPermissionCatalogItem[]>;
  adapter: EnterpriseLocalAccountsAdapter;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [detail, setDetail] = useState<LocalAccountDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [email, setEmail] = useState("");
  const [permissions, setPermissions] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetMustChange, setResetMustChange] = useState(true);

  const effectiveBaseline = detail?.baselinePermissions?.length
    ? detail.baselinePermissions
    : baselinePermissions;

  const loadDetail = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    setLoadFailed(false);
    try {
      await ensureCatalog();
      const next = await adapter.getAccount(accountId);
      setDetail(next);
      setEmail(next.email ?? "");
      setPermissions(stripBaselinePermissions(next.permissions, next.baselinePermissions?.length ? next.baselinePermissions : baselinePermissions));
      setResetPassword("");
      setResetMustChange(true);
    } catch {
      setLoadFailed(true);
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [accountId, adapter, baselinePermissions, ensureCatalog]);

  useEffect(() => {
    if (!open || !accountId) {
      setDetail(null);
      return;
    }
    void loadDetail();
  }, [accountId, loadDetail, open]);

  async function runMutation(key: string, action: () => Promise<void>, success: string, failure: string) {
    if (!canManage || !accountId) return;
    setBusy(key);
    try {
      await action();
      toast.success(success);
      await loadDetail();
      await onChanged();
    } catch {
      toast.error(failure);
    } finally {
      setBusy(null);
    }
  }

  const showSavePermissions = Boolean(detail && !detail.isAdmin);

  const footer: ReactNode = (
    <Space wrap>
      {showSavePermissions ? (
        <Button
          type="primary"
          disabled={!canManage}
          loading={busy === "permissions"}
          data-test-id="local-accounts-save-permissions"
          onClick={() => {
            if (!detail || !canManage) return;
            void runMutation(
              "permissions",
              async () => {
                await adapter.setPermissions(
                  detail.id,
                  stripBaselinePermissions(permissions, effectiveBaseline),
                );
              },
              labels.permissionsSuccess,
              labels.permissionsFailed,
            );
          }}
        >
          {labels.savePermissions}
        </Button>
      ) : null}
      <Button onClick={onClose}>{labels.close}</Button>
    </Space>
  );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={520}
      title={labels.editTitle}
      destroyOnHidden
      footer={footer}
      // Keep header/footer pinned; only the body scrolls with long permission lists.
      styles={{ section: { overflow: "hidden" } }}
      // Attach test id without an extra wrapper div — wrapping breaks the section
      // height:100% chain and pushes the footer outside the viewport.
      drawerRender={(node) =>
        isValidElement(node)
          ? cloneElement(node as ReactElement<Record<string, unknown>>, {
              "data-test-id": "local-accounts-edit-drawer",
            })
          : node
      }
    >
      {loading ? (
        <Typography.Text type="secondary">{labels.loading}</Typography.Text>
      ) : loadFailed || !detail ? (
        <InlineNotice tone="error" message={labels.loadFailed} actionLabel={labels.retry} onAction={() => void loadDetail()} />
      ) : (
        <div className="space-y-6">
          <div>
            <Typography.Title level={5}>{labels.profileSection}</Typography.Title>
            <Space size={4} wrap className="mb-3">
              <Typography.Text strong>{detail.username}</Typography.Text>
              {detail.isAdmin ? <Tag color="blue">{labels.admin}</Tag> : null}
              <Tag color={detail.active ? "green" : "default"}>{detail.active ? labels.active : labels.inactive}</Tag>
              {detail.totpEnabled ? <Tag color="green">{labels.totpEnabled}</Tag> : null}
              {detail.mustChangePassword ? <Tag color="orange">{labels.mustChangePassword}</Tag> : null}
            </Space>
            <Form layout="vertical" disabled={!canManage}>
              <Form.Item label={labels.email}>
                <Input value={email} onChange={(event) => setEmail(event.target.value)} data-test-id="local-accounts-edit-email" />
              </Form.Item>
              <Button
                type="primary"
                loading={busy === "profile"}
                disabled={!canManage}
                data-test-id="local-accounts-edit-save-profile"
                onClick={() =>
                  void runMutation(
                    "profile",
                    async () => {
                      await adapter.updateAccount(detail.id, { email: email.trim() || null });
                    },
                    labels.updateSuccess,
                    labels.updateFailed,
                  )
                }
              >
                {busy === "profile" ? labels.saving : labels.save}
              </Button>
            </Form>
          </div>

          <div className="space-y-2">
            <Space wrap>
              <Button
                disabled={!canManage}
                loading={busy === "status"}
                data-test-id="local-accounts-toggle-active"
                onClick={() =>
                  void runMutation(
                    "status",
                    async () => {
                      await adapter.updateAccount(detail.id, { active: !detail.active });
                    },
                    labels.statusUpdateSuccess,
                    labels.statusUpdateFailed,
                  )
                }
              >
                {detail.active ? labels.deactivate : labels.activate}
              </Button>
              {detail.totpEnabled ? (
                <Popconfirm
                  title={labels.disableTotpConfirm}
                  disabled={!canManage}
                  onConfirm={() =>
                    void runMutation(
                      "totp",
                      async () => {
                        await adapter.disableTotp(detail.id);
                      },
                      labels.disableTotpSuccess,
                      labels.disableTotpFailed,
                    )
                  }
                >
                  <Button danger disabled={!canManage} loading={busy === "totp"} data-test-id="local-accounts-disable-totp">
                    {labels.disableTotp}
                  </Button>
                </Popconfirm>
              ) : null}
            </Space>
          </div>

          <div>
            <Typography.Title level={5}>{labels.resetPasswordTitle}</Typography.Title>
            <div className="space-y-3">
              <PasswordWithGenerator
                value={resetPassword}
                onChange={setResetPassword}
                labels={labels}
                disabled={!canManage}
                testIdPrefix="local-accounts-reset"
              />
              <div className="flex items-center gap-2">
                <Switch
                  checked={resetMustChange}
                  onChange={setResetMustChange}
                  disabled={!canManage}
                  data-test-id="local-accounts-reset-must-change"
                />
                <span>{labels.mustChangePassword}</span>
              </div>
              <Button
                disabled={!canManage || !resetPassword}
                loading={busy === "password"}
                data-test-id="local-accounts-reset-password-submit"
                onClick={() =>
                  void runMutation(
                    "password",
                    async () => {
                      await adapter.resetPassword(detail.id, {
                        password: resetPassword,
                        mustChangePassword: resetMustChange,
                      });
                      setResetPassword("");
                    },
                    labels.resetPasswordSuccess,
                    labels.resetPasswordFailed,
                  )
                }
              >
                {labels.resetPassword}
              </Button>
            </div>
          </div>

          <PermissionPicker
            labels={labels}
            locale={locale}
            catalog={catalog}
            catalogFailed={catalogFailed}
            catalogLoading={catalogLoading}
            baselinePermissions={effectiveBaseline}
            value={permissions}
            onChange={(next) => setPermissions(stripBaselinePermissions(next, effectiveBaseline))}
            disabled={!canManage || detail.isAdmin}
            adminLocked={detail.isAdmin}
            onRetryCatalog={() => void ensureCatalog()}
          />

          <div>
            <Typography.Title level={5} type="danger">
              {labels.dangerSection}
            </Typography.Title>
            <Popconfirm
              title={labels.deleteConfirm}
              disabled={!canManage}
              onConfirm={() =>
                void runMutation(
                  "delete",
                  async () => {
                    await adapter.deleteAccount(detail.id);
                    onClose();
                  },
                  labels.deleteSuccess,
                  labels.deleteFailed,
                )
              }
            >
              <Button danger disabled={!canManage} loading={busy === "delete"} data-test-id="local-accounts-delete">
                {labels.delete}
              </Button>
            </Popconfirm>
          </div>
        </div>
      )}
    </Drawer>
  );
}
