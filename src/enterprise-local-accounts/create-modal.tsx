"use client";

import { DatePicker, Form, Input, Modal, Switch, Typography } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useEffect, useRef, useState } from "react";
import { toast } from "../toast";
import { PasswordWithGenerator } from "./password-fields";
import { PermissionPicker } from "./permission-picker";
import { stripBaselinePermissions } from "./grants";
import { mapCreateExpiresAt } from "./serialize";
import type {
  CreateLocalAccountInput,
  EnterpriseLocalAccountsAdapter,
  EnterpriseLocalAccountsLabels,
  LocalAccountsPermissionCatalogItem,
  LocalGrant,
} from "./types";

const CREATE_FORM_DEFAULTS = {
  username: "",
  email: "",
  password: "",
  mustChangePassword: true,
  isAdmin: false,
  permissions: [] as LocalGrant[],
  expiresAt: null as Dayjs | null,
};

export function CreateAccountModal({
  open,
  canManage,
  isLocalSuperadmin,
  labels,
  locale,
  catalog,
  catalogFailed,
  catalogLoading,
  baselinePermissions,
  ensureCatalog,
  adapter,
  onClose,
  onSubmit,
}: {
  open: boolean;
  canManage: boolean;
  isLocalSuperadmin: boolean;
  labels: EnterpriseLocalAccountsLabels;
  locale: string;
  catalog: readonly LocalAccountsPermissionCatalogItem[];
  catalogFailed: boolean;
  catalogLoading: boolean;
  baselinePermissions: readonly string[];
  ensureCatalog: () => Promise<readonly LocalAccountsPermissionCatalogItem[]>;
  adapter: EnterpriseLocalAccountsAdapter;
  onClose: () => void;
  /** Returns the submitted password so the parent can show the receipt modal. */
  onSubmit: (input: CreateLocalAccountInput) => Promise<void>;
}) {
  const [form] = Form.useForm<{
    username: string;
    email?: string;
    password: string;
    mustChangePassword: boolean;
    isAdmin: boolean;
    permissions: LocalGrant[];
    expiresAt?: Dayjs | null;
  }>();
  const [submitting, setSubmitting] = useState(false);
  const isAdmin = Form.useWatch("isAdmin", form) ?? false;
  const selectedPermissions = Form.useWatch("permissions", form) ?? [];

  // Reset only on open/close *transitions* — never when catalog state settles
  // (ensureCatalog identity used to change and wipe in-progress input).
  const prevOpenRef = useRef(false);
  const ensureCatalogRef = useRef(ensureCatalog);
  ensureCatalogRef.current = ensureCatalog;

  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;

    if (open && !wasOpen) {
      void ensureCatalogRef.current();
      form.resetFields();
      form.setFieldsValue(CREATE_FORM_DEFAULTS);
      return;
    }

    if (!open && wasOpen) {
      // Scrub plaintext password from the antd Form store immediately on close.
      form.resetFields();
    }
  }, [form, open]);

  function handleClose() {
    form.resetFields();
    onClose();
  }

  async function handleOk() {
    if (!canManage) return;
    try {
      const values = await form.validateFields();
      if (!values.password?.trim()) {
        form.setFields([{ name: "password", errors: [labels.passwordRequired] }]);
        return;
      }
      setSubmitting(true);
      const input: CreateLocalAccountInput = {
        username: values.username.trim(),
        email: values.email?.trim() || null,
        password: values.password,
        mustChangePassword: values.mustChangePassword !== false,
        isAdmin: isLocalSuperadmin ? Boolean(values.isAdmin) : false,
        permissions:
          values.isAdmin && isLocalSuperadmin
            ? []
            : stripBaselinePermissions(values.permissions ?? [], baselinePermissions),
      };
      // Superadmin rows cannot carry expiresAt (backend 422); never send when isAdmin.
      // Dayjs → timezone-aware ISO via mapCreateExpiresAt (omit when empty/permanent).
      if (isLocalSuperadmin && !values.isAdmin) {
        Object.assign(input, mapCreateExpiresAt(values.expiresAt));
      }
      await onSubmit(input);
      // Success path closes the modal via parent; scrub form store now so the
      // password does not linger between receipt handoff and unmount.
      form.resetFields();
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
      onCancel={handleClose}
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
        initialValues={{ mustChangePassword: true, isAdmin: false, permissions: [], expiresAt: null }}
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

        {isLocalSuperadmin ? (
          <>
            <Form.Item name="isAdmin" label={labels.isAdmin} valuePropName="checked">
              <Switch data-test-id="local-accounts-create-is-admin" />
            </Form.Item>
            <Typography.Paragraph type="secondary" className="!mt-0">
              {labels.isAdminHint}
            </Typography.Paragraph>
            <Form.Item name="expiresAt" label={labels.expiresAt}>
              <DatePicker
                showTime
                allowClear
                style={{ width: "100%" }}
                disabled={isAdmin}
                disabledDate={(current) => Boolean(current && current.isBefore(dayjs().startOf("day")))}
                placeholder={labels.expiresAtPermanent}
                data-test-id="local-accounts-create-expires-at"
              />
            </Form.Item>
            <Typography.Paragraph type="secondary" className="!mt-0">
              {labels.expiresAtHint}
            </Typography.Paragraph>
          </>
        ) : null}

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
          disabled={!canManage || (isAdmin && isLocalSuperadmin)}
          adminLocked={isAdmin && isLocalSuperadmin}
          isLocalSuperadmin={isLocalSuperadmin}
          onRetryCatalog={() => void ensureCatalog()}
          adapter={adapter}
          showCopyFrom={canManage && !(isAdmin && isLocalSuperadmin)}
        />
      </Form>
    </Modal>
  );
}
