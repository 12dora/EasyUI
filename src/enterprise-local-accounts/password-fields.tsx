"use client";

import { Button, Input, Modal, Space, Typography } from "antd";
import { useEffect, useState } from "react";
import { toast } from "../toast";
import { generatePolicyPassword } from "./password";
import type { EnterpriseLocalAccountsLabels } from "./types";

export function PasswordWithGenerator({
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
        autoComplete="new-password"
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

/**
 * Dedicated one-time password handoff after create/reset SUCCESS.
 * Holds the password in local state and clears it on close / unmount so the
 * plaintext does not remain in the React tree after the flow ends (brief 05 §2).
 */
export function PasswordReceiptModal({
  open,
  password,
  labels,
  onClose,
}: {
  open: boolean;
  password: string | null;
  labels: EnterpriseLocalAccountsLabels;
  onClose: () => void;
}) {
  const [heldPassword, setHeldPassword] = useState<string | null>(null);

  useEffect(() => {
    if (open && password) {
      setHeldPassword(password);
      return;
    }
    if (!open) {
      setHeldPassword(null);
    }
  }, [open, password]);

  useEffect(() => {
    return () => {
      setHeldPassword(null);
    };
  }, []);

  function handleClose() {
    setHeldPassword(null);
    onClose();
  }

  const shown = open && Boolean(heldPassword);

  return (
    <Modal
      open={shown}
      title={labels.passwordReceiptTitle}
      onCancel={handleClose}
      footer={
        <Button type="primary" data-test-id="local-accounts-password-receipt-confirm" onClick={handleClose}>
          {labels.passwordReceiptConfirm}
        </Button>
      }
      destroyOnHidden
      closable={false}
      maskClosable={false}
      keyboard={false}
      modalRender={(node) => <div data-test-id="local-accounts-password-receipt">{node}</div>}
    >
      <Typography.Paragraph>{labels.passwordReceiptHint}</Typography.Paragraph>
      <Space.Compact style={{ width: "100%" }}>
        <Input.Password
          value={heldPassword ?? ""}
          readOnly
          autoComplete="new-password"
          data-test-id="local-accounts-password-receipt-value"
        />
        <Button
          data-test-id="local-accounts-password-receipt-copy"
          onClick={async () => {
            if (!heldPassword) return;
            try {
              await navigator.clipboard.writeText(heldPassword);
              toast.success(labels.passwordCopied);
            } catch {
              toast.error(labels.copyFailed);
            }
          }}
        >
          {labels.copyPassword}
        </Button>
      </Space.Compact>
    </Modal>
  );
}
