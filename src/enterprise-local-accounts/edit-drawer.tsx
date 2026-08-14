"use client";

import {
  Button,
  DatePicker,
  Drawer,
  Input,
  Popconfirm,
  Skeleton,
  Space,
  Switch,
  Tag,
} from "antd";
import dayjs, { type Dayjs } from "dayjs";
import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { InlineNotice } from "../primitives/inline-notice";
import { toast } from "../toast";
import {
  isSelfAccount,
  isTargetReadOnlyForOperator,
  isVersionConflictError,
  normalizeDetailGrants,
  stripBaselinePermissions,
} from "./grants";
import { PasswordReceiptModal, PasswordWithGenerator } from "./password-fields";
import { PermissionPicker } from "./permission-picker";
import { mapExpiryUpdatePatch } from "./serialize";
import type {
  EnterpriseLocalAccountsAdapter,
  EnterpriseLocalAccountsCapabilities,
  EnterpriseLocalAccountsLabels,
  LocalAccountDetail,
  LocalAccountsPermissionCatalogItem,
  LocalGrant,
} from "./types";

/** 统一的分节样式:首节无上边线,其余节以发丝线分隔。 */
function DrawerSection({
  title,
  first = false,
  danger = false,
  children,
  "data-test-id": testId,
}: {
  title?: ReactNode;
  first?: boolean;
  danger?: boolean;
  children: ReactNode;
  "data-test-id"?: string;
}) {
  return (
    <section data-test-id={testId} className={first ? "" : "border-t border-hairline pt-4"}>
      {title ? (
        <h4
          className={`mb-2.5 text-[13px] font-semibold ${danger ? "text-[rgb(var(--signal))]" : "text-ink"}`}
        >
          {title}
        </h4>
      ) : null}
      {children}
    </section>
  );
}

export function EditAccountDrawer({
  accountId,
  open,
  canManage,
  capabilities,
  labels,
  locale,
  catalog,
  catalogLoaded,
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
  capabilities: EnterpriseLocalAccountsCapabilities;
  labels: EnterpriseLocalAccountsLabels;
  locale: string;
  catalog: readonly LocalAccountsPermissionCatalogItem[];
  /** True only after a successful catalog load (fail-closed gate for non-superadmins). */
  catalogLoaded: boolean;
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
  const [permissions, setPermissions] = useState<LocalGrant[]>([]);
  const [expiresAt, setExpiresAt] = useState<Dayjs | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetMustChange, setResetMustChange] = useState(true);
  const [grantsConflict, setGrantsConflict] = useState(false);
  const [receiptPassword, setReceiptPassword] = useState<string | null>(null);
  const emailInputId = useId();

  const effectiveBaseline = detail?.baselinePermissions?.length
    ? detail.baselinePermissions
    : baselinePermissions;

  const isSelf = isSelfAccount(capabilities.accountId, detail?.id ?? accountId);
  // Catalog must be successfully loaded before high-grant privileged targets can be
  // detected. While loading or after error, non-superadmins treat every target as read-only.
  const catalogReady = catalogLoaded && !catalogFailed && !catalogLoading;
  const targetReadOnly = detail
    ? isTargetReadOnlyForOperator(capabilities.isLocalSuperadmin, detail, catalog, catalogReady)
    : false;
  const formDisabled = !canManage || targetReadOnly;
  const selfDangerLocked = isSelf;

  // 请求代际号:快速关闭/切换账户时,旧的在途响应一律作废,防止串号覆盖新账户。
  const loadSeqRef = useRef(0);
  // 抽屉当前目标账户:陈旧闭包(如 A 账户的慢速变更完成后回调 loadDetail)不得
  // 为已切换/已关闭的目标发起新一轮加载——代际号只挡"旧响应",挡不住"旧闭包发新请求"。
  const currentTargetRef = useRef<string | null>(null);

  // silent:变更后的静默刷新——不进 loading 骨架屏,内容原地更新,避免整个抽屉闪一下。
  const loadDetail = useCallback(async (options?: { silent?: boolean }) => {
    if (!accountId || currentTargetRef.current !== accountId) return;
    const seq = ++loadSeqRef.current;
    if (!options?.silent) setLoading(true);
    setLoadFailed(false);
    setGrantsConflict(false);
    try {
      // 打开速度关键路径:目录与账户详情并行拉取(此前串行,叠加两轮网络往返)。
      const [next] = await Promise.all([adapter.getAccount(accountId), ensureCatalog()]);
      if (seq !== loadSeqRef.current || currentTargetRef.current !== accountId) return;
      setDetail(next);
      setEmail(next.email ?? "");
      setPermissions(normalizeDetailGrants(next, baselinePermissions));
      setExpiresAt(next.expiresAt ? dayjs(next.expiresAt) : null);
      setResetPassword("");
      setResetMustChange(true);
    } catch {
      if (seq !== loadSeqRef.current || currentTargetRef.current !== accountId) return;
      setLoadFailed(true);
      setDetail(null);
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [accountId, adapter, baselinePermissions, ensureCatalog]);

  useEffect(() => {
    if (!open || !accountId) {
      currentTargetRef.current = null;
      loadSeqRef.current += 1;
      setDetail(null);
      setReceiptPassword(null);
      setResetPassword("");
      setResetMustChange(true);
      return;
    }
    currentTargetRef.current = accountId;
    void loadDetail();
  }, [accountId, loadDetail, open]);

  async function runMutation(key: string, action: () => Promise<void>, success: string, failure: string) {
    if (!canManage || !accountId || targetReadOnly) return;
    setBusy(key);
    try {
      await action();
      toast.success(success);
      await loadDetail({ silent: true });
      await onChanged();
    } catch (error) {
      if (key === "permissions" && isVersionConflictError(error)) {
        toast.error(labels.grantsConflict);
        // Refresh detail first (loadDetail clears the banner), then re-show conflict.
        await loadDetail({ silent: true });
        setGrantsConflict(true);
        return;
      }
      toast.error(failure);
    } finally {
      setBusy(null);
    }
  }

  const showSavePermissions = Boolean(detail && !detail.isAdmin);
  const showExpiryEditor = capabilities.isLocalSuperadmin && detail && !detail.isAdmin && !isSelf;
  const showAdminToggle = capabilities.isLocalSuperadmin && detail && !isSelf;

  const footer: ReactNode = (
    <Space wrap>
      {showSavePermissions ? (
        <Button
          type="primary"
          disabled={formDisabled}
          loading={busy === "permissions"}
          data-test-id="local-accounts-save-permissions"
          onClick={() => {
            if (!detail || formDisabled) return;
            void runMutation(
              "permissions",
              async () => {
                await adapter.setPermissions(detail.id, {
                  permissions: stripBaselinePermissions(permissions, effectiveBaseline),
                  expectedVersion: detail.localGrantsVersion,
                });
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
    <>
      <Drawer
        open={open}
        onClose={onClose}
        width={560}
        title={labels.editTitle}
        destroyOnHidden
        footer={footer}
        styles={{ section: { overflow: "hidden" } }}
        drawerRender={(node) =>
          isValidElement(node)
            ? cloneElement(node as ReactElement<Record<string, unknown>>, {
                "data-test-id": "local-accounts-edit-drawer",
              })
            : node
        }
      >
        {loading ? (
          <Skeleton active paragraph={{ rows: 6 }} title={false} />
        ) : loadFailed || !detail ? (
          <InlineNotice tone="error" message={labels.loadFailed} actionLabel={labels.retry} onAction={() => void loadDetail()} />
        ) : (
          <div className="space-y-4">
            <DrawerSection first>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-[15px] font-semibold text-ink">{detail.username}</span>
                {detail.isAdmin ? <Tag color="blue">{labels.admin}</Tag> : null}
                <Tag color={detail.active ? "green" : "default"}>{detail.active ? labels.active : labels.inactive}</Tag>
                {detail.totpEnabled ? <Tag color="green">{labels.totpEnabled}</Tag> : null}
                {detail.mustChangePassword ? <Tag color="orange">{labels.mustChangePassword}</Tag> : null}
                {detail.expired ? (
                  <Tag color="red" data-test-id="local-accounts-expired-badge">
                    {labels.expired}
                  </Tag>
                ) : null}
              </div>
            </DrawerSection>

            <DrawerSection title={labels.profileSection}>
              <div className="space-y-3">
                <div>
                  <label htmlFor={emailInputId} className="mb-1 block text-[12px] text-ink-soft">
                    {labels.email}
                  </label>
                  <Space.Compact style={{ width: "100%" }}>
                    <Input
                      id={emailInputId}
                      value={email}
                      disabled={formDisabled}
                      onChange={(event) => setEmail(event.target.value)}
                      data-test-id="local-accounts-edit-email"
                    />
                    <Button
                      type="primary"
                      loading={busy === "profile"}
                      disabled={formDisabled}
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
                  </Space.Compact>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={formDisabled || selfDangerLocked}
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
                  {showAdminToggle ? (
                    <Button
                      disabled={formDisabled || selfDangerLocked}
                      loading={busy === "admin"}
                      data-test-id="local-accounts-toggle-admin"
                      onClick={() =>
                        void runMutation(
                          "admin",
                          async () => {
                            await adapter.updateAccount(detail.id, { isAdmin: !detail.isAdmin });
                          },
                          labels.adminUpdateSuccess,
                          labels.adminUpdateFailed,
                        )
                      }
                    >
                      {detail.isAdmin ? labels.demoteAdmin : labels.promoteAdmin}
                    </Button>
                  ) : null}
                  {detail.totpEnabled ? (
                    <Popconfirm
                      title={labels.disableTotpConfirm}
                      disabled={formDisabled || selfDangerLocked}
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
                      <Button
                        danger
                        disabled={formDisabled || selfDangerLocked}
                        loading={busy === "totp"}
                        data-test-id="local-accounts-disable-totp"
                      >
                        {labels.disableTotp}
                      </Button>
                    </Popconfirm>
                  ) : null}
                </div>
              </div>
            </DrawerSection>

            {showExpiryEditor ? (
              <DrawerSection title={labels.expiresAt} data-test-id="local-accounts-expiry-editor">
                <div className="flex flex-wrap items-center gap-2">
                  <DatePicker
                    showTime
                    allowClear
                    className="min-w-[220px] flex-1"
                    value={expiresAt}
                    onChange={(value) => setExpiresAt(value)}
                    disabled={formDisabled}
                    disabledDate={(current) => Boolean(current && current.isBefore(dayjs().startOf("day")))}
                    placeholder={labels.expiresAtPermanent}
                    data-test-id="local-accounts-edit-expires-at"
                  />
                  <Button
                    disabled={formDisabled}
                    loading={busy === "expiry"}
                    data-test-id="local-accounts-save-expiry"
                    onClick={() =>
                      void runMutation(
                        "expiry",
                        async () => {
                          await adapter.updateAccount(detail.id, mapExpiryUpdatePatch(expiresAt));
                        },
                        labels.updateSuccess,
                        labels.updateFailed,
                      )
                    }
                  >
                    {labels.save}
                  </Button>
                  <Button
                    disabled={formDisabled || !detail.expiresAt}
                    loading={busy === "clear-expiry"}
                    data-test-id="local-accounts-clear-expiry"
                    onClick={() =>
                      void runMutation(
                        "clear-expiry",
                        async () => {
                          await adapter.updateAccount(detail.id, { expiresAt: null });
                          setExpiresAt(null);
                        },
                        labels.updateSuccess,
                        labels.updateFailed,
                      )
                    }
                  >
                    {labels.clearExpiry}
                  </Button>
                </div>
                <p className="mb-0 mt-1.5 text-[11px] text-ink-faint">{labels.expiresAtHint}</p>
              </DrawerSection>
            ) : null}

            <DrawerSection title={labels.resetPasswordTitle}>
              <div className="space-y-2.5">
                <PasswordWithGenerator
                  value={resetPassword}
                  onChange={setResetPassword}
                  labels={labels}
                  disabled={formDisabled || selfDangerLocked}
                  testIdPrefix="local-accounts-reset"
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-[13px] text-ink">
                    <Switch
                      checked={resetMustChange}
                      onChange={setResetMustChange}
                      disabled={formDisabled || selfDangerLocked}
                      data-test-id="local-accounts-reset-must-change"
                    />
                    <span>{labels.mustChangePasswordFirstLogin}</span>
                  </label>
                  <Button
                    disabled={formDisabled || selfDangerLocked || !resetPassword}
                    loading={busy === "password"}
                    data-test-id="local-accounts-reset-password-submit"
                    onClick={() => {
                      if (!detail || formDisabled || selfDangerLocked) return;
                      const password = resetPassword;
                      void runMutation(
                        "password",
                        async () => {
                          await adapter.resetPassword(detail.id, {
                            password,
                            mustChangePassword: resetMustChange,
                          });
                          setResetPassword("");
                          setReceiptPassword(password);
                        },
                        labels.resetPasswordSuccess,
                        labels.resetPasswordFailed,
                      );
                    }}
                  >
                    {labels.resetPassword}
                  </Button>
                </div>
              </div>
            </DrawerSection>

            <DrawerSection>
              <div className="space-y-2.5">
                {grantsConflict ? (
                  <InlineNotice
                    tone="error"
                    message={labels.grantsConflict}
                    actionLabel={labels.retry}
                    onAction={() => void loadDetail()}
                    data-test-id="local-accounts-grants-conflict"
                  />
                ) : null}
                <PermissionPicker
                  labels={labels}
                  locale={locale}
                  catalog={catalog}
                  catalogFailed={catalogFailed}
                  catalogLoading={catalogLoading}
                  baselinePermissions={effectiveBaseline}
                  value={permissions}
                  onChange={(next) => setPermissions(stripBaselinePermissions(next, effectiveBaseline))}
                  disabled={formDisabled || detail.isAdmin}
                  adminLocked={detail.isAdmin}
                  isLocalSuperadmin={capabilities.isLocalSuperadmin}
                  onRetryCatalog={() => void ensureCatalog()}
                  adapter={adapter}
                  excludeAccountId={detail.id}
                  showCopyFrom={!formDisabled && !detail.isAdmin}
                />
              </div>
            </DrawerSection>

            <DrawerSection title={labels.dangerSection} danger>
              <Popconfirm
                title={labels.deleteConfirm}
                disabled={formDisabled || selfDangerLocked}
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
                <Button
                  danger
                  disabled={formDisabled || selfDangerLocked}
                  loading={busy === "delete"}
                  data-test-id="local-accounts-delete"
                >
                  {labels.delete}
                </Button>
              </Popconfirm>
            </DrawerSection>
          </div>
        )}
      </Drawer>

      <PasswordReceiptModal
        open={Boolean(receiptPassword)}
        password={receiptPassword}
        labels={labels}
        onClose={() => setReceiptPassword(null)}
      />
    </>
  );
}
