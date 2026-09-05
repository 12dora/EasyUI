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

/**
 * 对话框 / 抽屉底部的「取消 + 提交」动作行。
 *
 * `submitType`(默认 `"button"`)决定提交按钮是自己处理点击,还是委托给外层 `<form>`:
 * - `"button"` —— 历史行为,点击直接调 `onSubmit`,外面没有 `<form>` 也能用;
 * - `"submit"` —— 按钮变成 `type="submit"` 且**不再挂 onClick**(否则 Enter / 点击会各打一次
 *   请求),提交由外层的 `Form` 统一收口。这条路径才有「输入框里按 Enter 直接提交」。
 *   `onSubmit` 仍然要传:它是同一个处理函数,交给 `<Form onSubmit={…}>`,这里留着是为了
 *   两种模式的调用点长得一样。用法示例见 `Form` 的文档注释。
 *
 * `submitFormId` 是给「动作行挂在 Dialog 的 `footer`、表单体在 `children`」这种版式用的:
 * 页脚渲染在 `<form>` 外面,`type="submit"` 单靠 DOM 层级找不到它要提交的表单,于是
 * Enter 与点击都落空。把同一个 id 给 `<Form id={…}>` 和这里,按钮就通过原生的
 * `form` 属性认领那个表单 —— 它同时也重新成为该表单的默认提交按钮,输入框里按 Enter
 * 才有地方去。表单体与动作行在同一棵 `<form>` 里时不需要这个 prop。
 *
 * 两种模式下 `blockedReason` 都仍然拦得住:阻断态的 `Button` 会 `preventDefault()`,
 * 原生提交同样走不出去。
 */
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
  submitType = "button",
  submitFormId,
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
  submitType?: "button" | "submit";
  /** 表单体所在 `<form>` 的 id;仅在 `submitType="submit"` 且动作行渲染在该表单之外时需要。 */
  submitFormId?: string;
}) {
  const submitButtonDataTestId = submitDataTestId ?? submitButtonProps?.["data-test-id"];
  const delegatesToForm = submitType === "submit";

  return (
    <ActionRow>
      <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting || cancelDisabled}>
        {cancelLabel}
      </Button>
      <Button
        {...submitButtonProps}
        type={submitType}
        form={delegatesToForm ? submitFormId : undefined}
        variant={submitVariant}
        onClick={delegatesToForm ? undefined : onSubmit}
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
