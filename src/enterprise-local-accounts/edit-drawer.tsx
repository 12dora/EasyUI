"use client";

import {
  Button,
  DatePicker,
  Drawer,
  Form,
  Input,
  Popconfirm,
  Space,
  Switch,
  Tag,
  Typography,
} from "antd";
import dayjs, { type Dayjs } from "dayjs";
import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { InlineNotice } from "../primitives/inline-notice";
import { toast } from "../toast";
import {
  isCapabilitiesAccountIdReady,
  isSelfAccount,
  isSelfDangerLocked,
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

  const effectiveBaseline = detail?.baselinePermissions?.length
    ? detail.baselinePermissions
    : baselinePermissions;

  const rowId = detail?.id ?? accountId;
  const isSelf = isSelfAccount(capabilities.accountId, rowId);
  // Catalog must be successfully loaded before high-grant privileged targets can be
  // detected. While loading or after error, non-superadmins treat every target as read-only.
  // Empty/absent accountId is likewise capabilities-not-ready: non-superadmin locks all
  // rows (self-lockout cannot be computed); superadmin only loses self-exempt actions.
  const catalogReady = catalogLoaded && !catalogFailed && !catalogLoading;
  const capabilitiesReady = isCapabilitiesAccountIdReady(capabilities.accountId);
  const targetReadOnly = detail
    ? isTargetReadOnlyForOperator(
        capabilities.isLocalSuperadmin,
        detail,
        catalog,
        catalogReady,
        capabilitiesReady,
      )
    : false;
  const formDisabled = !canManage || targetReadOnly;
  const selfDangerLocked = isSelfDangerLocked(capabilities.accountId, rowId);

  const loadDetail = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    setLoadFailed(false);
    setGrantsConflict(false);
    try {
      await ensureCatalog();
      const next = await adapter.getAccount(accountId);
      setDetail(next);
      setEmail(next.email ?? "");
      setPermissions(normalizeDetailGrants(next, baselinePermissions));
      setExpiresAt(next.expiresAt ? dayjs(next.expiresAt) : null);
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
      setReceiptPassword(null);
      setResetPassword("");
      setResetMustChange(true);
      return;
    }
    void loadDetail();
  }, [accountId, loadDetail, open]);

  async function runMutation(key: string, action: () => Promise<void>, success: string, failure: string) {
    if (!canManage || !accountId || targetReadOnly) return;
    setBusy(key);
    try {
      await action();
      toast.success(success);
      await loadDetail();
      await onChanged();
    } catch (error) {
      if (key === "permissions" && isVersionConflictError(error)) {
        toast.error(labels.grantsConflict);
        // Refresh detail first (loadDetail clears the banner), then re-show conflict.
        await loadDetail();
        setGrantsConflict(true);
        return;
      }
      toast.error(failure);
    } finally {
      setBusy(null);
    }
  }

  const showSavePermissions = Boolean(detail && !detail.isAdmin);
  // Superadmin self-exempt controls require a known accountId; without it every
  // row could be self, so hide promote/demote and expiry editors.
  const showExpiryEditor =
    capabilities.isLocalSuperadmin &&
    capabilitiesReady &&
    detail &&
    !detail.isAdmin &&
    !isSelf;
  const showAdminToggle =
    capabilities.isLocalSuperadmin && capabilitiesReady && detail && !isSelf;

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
        width={520}
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
                {detail.expired ? (
                  <Tag color="red" data-test-id="local-accounts-expired-badge">
                    {labels.expired}
                  </Tag>
                ) : null}
              </Space>
              <Form layout="vertical" disabled={formDisabled}>
                <Form.Item label={labels.email}>
                  <Input
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    data-test-id="local-accounts-edit-email"
                  />
                </Form.Item>
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
              </Form>
            </div>

            {showExpiryEditor ? (
              <div data-test-id="local-accounts-expiry-editor" className="space-y-2">
                <Typography.Title level={5}>{labels.expiresAt}</Typography.Title>
                <Typography.Paragraph type="secondary" className="!mt-0">
                  {labels.expiresAtHint}
                </Typography.Paragraph>
                <DatePicker
                  showTime
                  allowClear
                  style={{ width: "100%" }}
                  value={expiresAt}
                  onChange={(value) => setExpiresAt(value)}
                  disabled={formDisabled}
                  disabledDate={(current) => Boolean(current && current.isBefore(dayjs().startOf("day")))}
                  placeholder={labels.expiresAtPermanent}
                  data-test-id="local-accounts-edit-expires-at"
                />
                <Space wrap>
                  <Button
                    disabled={formDisabled}
                    loading={busy === "expiry"}
                    data-test-id="local-accounts-save-expiry"
                    onClick={() =>
                      void runMutation(
                        "expiry",
                        async () => {
                          await adapter.updateAccount(
                            detail.id,
                            mapExpiryUpdatePatch(expiresAt),
                          );
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
                </Space>
              </div>
            ) : null}

            <div className="space-y-2">
              <Space wrap>
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
              </Space>
            </div>

            <div>
              <Typography.Title level={5}>{labels.resetPasswordTitle}</Typography.Title>
              <div className="space-y-3">
                <PasswordWithGenerator
                  value={resetPassword}
                  onChange={setResetPassword}
                  labels={labels}
                  disabled={formDisabled || selfDangerLocked}
                  testIdPrefix="local-accounts-reset"
                />
                <div className="flex items-center gap-2">
                  <Switch
                    checked={resetMustChange}
                    onChange={setResetMustChange}
                    disabled={formDisabled || selfDangerLocked}
                    data-test-id="local-accounts-reset-must-change"
                  />
                  <span>{labels.mustChangePassword}</span>
                </div>
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

            <div>
              <Typography.Title level={5} type="danger">
                {labels.dangerSection}
              </Typography.Title>
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
            </div>
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
