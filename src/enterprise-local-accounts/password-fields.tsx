"use client";

import { Button, Input, Modal, Space, Tooltip, Typography } from "antd";
import { useEffect, useState } from "react";
import { toast } from "../toast";
import { generatePolicyPassword } from "./password";
import type { EnterpriseLocalAccountsLabels } from "./types";

function GenerateIcon() {
  return (
    <svg viewBox="0 0 14 14" aria-hidden className="size-3.5">
      <path
        d="M12 7a5 5 0 1 1-1.47-3.54M12 1.5V4h-2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 14 14" aria-hidden className="size-3.5">
      <rect x="4.5" y="4.5" width="8" height="8" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M9.5 4.5v-2A1 1 0 0 0 8.5 1.5h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

async function copyToClipboard(value: string, labels: EnterpriseLocalAccountsLabels) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(labels.passwordCopied);
  } catch {
    toast.error(labels.copyFailed);
  }
}

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
      <Tooltip title={labels.generatePassword}>
        <Button
          disabled={disabled}
          aria-label={labels.generatePassword}
          icon={<GenerateIcon />}
          data-test-id={`${testIdPrefix}-generate-password`}
          onClick={() => setValue(generatePolicyPassword())}
        />
      </Tooltip>
      <Tooltip title={labels.copyPassword}>
        <Button
          disabled={disabled || !current}
          aria-label={labels.copyPassword}
          icon={<CopyIcon />}
          data-test-id={`${testIdPrefix}-copy-password`}
          onClick={() => void copyToClipboard(current, labels)}
        />
      </Tooltip>
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
          onClick={() => {
            if (heldPassword) void copyToClipboard(heldPassword, labels);
          }}
        >
          {labels.copyPassword}
        </Button>
      </Space.Compact>
    </Modal>
  );
}
