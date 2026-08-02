"use client";

import type { AriaAttributes, ButtonHTMLAttributes, ReactNode } from "react";

import { Button } from "./button";

type DialogSubmitButtonProps = Pick<ButtonHTMLAttributes<HTMLButtonElement>, "autoFocus" | "className" | "disabled" | "id" | "name" | "title" | "value"> &
  AriaAttributes &
  Record<`data-${string}`, string | boolean | undefined>;

export function ActionRow({
  left,
  children,
  align = "right",
  className = "",
}: {
  left?: ReactNode;
  children: ReactNode;
  align?: "right" | "between";
  className?: string;
}) {
  const layout = align === "between" ? "justify-between" : "justify-end";
  return (
    <div className={`flex items-center gap-2 ${layout} ${className}`}>
      {left && <div className="mr-auto">{left}</div>}
      {children}
    </div>
  );
}

export function DialogFormActions({
  cancelLabel,
  submitLabel,
  onCancel,
  onSubmit,
  submitting,
  cancelDisabled,
  blockedReason,
  blockedToastVariant,
  onBlockedSubmit,
  submitDataTestId,
  submitButtonProps,
  submitVariant = "primary",
}: {
  cancelLabel: string;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: () => void;
  submitting?: boolean;
  cancelDisabled?: boolean;
  blockedReason?: string;
  blockedToastVariant?: "warning" | "error";
  onBlockedSubmit?: () => void;
  submitDataTestId?: string;
  submitButtonProps?: DialogSubmitButtonProps;
  submitVariant?: "primary" | "danger";
}) {
  const submitButtonDataTestId = submitDataTestId ?? submitButtonProps?.["data-test-id"];

  return (
    <ActionRow>
      <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting || cancelDisabled}>
        {cancelLabel}
      </Button>
      <Button
        {...submitButtonProps}
        type="button"
        variant={submitVariant}
        onClick={onSubmit}
        loading={submitting}
        blockedReason={blockedReason}
        blockedToastVariant={blockedToastVariant}
        onBlockedClick={onBlockedSubmit}
        data-test-id={submitButtonDataTestId}
      >
        {submitLabel}
      </Button>
    </ActionRow>
  );
}
