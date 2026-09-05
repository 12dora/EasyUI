"use client";

import type { FormEvent, ReactNode } from "react";

/**
 * 业务表单的 `<form>` 外壳 —— 让「填完按回车提交」这件事重新成立。
 *
 * 背景:本套件里的表单历来是一堆 `<Field>` 加一个 `DialogFormActions`,整体不是 `<form>`,
 * 提交按钮也是 `type="button"`,于是在输入框里按 Enter 什么也不会发生。桌面端密集录入的
 * 用户(以及所有靠键盘操作的用户)只能每次都把手移到鼠标上点按钮。
 *
 * 用法:把对话框 / 抽屉的表单体包起来,提交动作交给 `onSubmit`,并把
 * `DialogFormActions` 的 `submitType` 打到 `"submit"`,让按钮委托给这个 `<form>`:
 *
 * ```tsx
 * <Form onSubmit={handleSave} busy={saving}>
 *   <FormGrid>
 *     <Field label={t("name")}>
 *       <Input value={name} onChange={(event) => setName(event.target.value)} />
 *     </Field>
 *   </FormGrid>
 *   <DialogFormActions
 *     submitType="submit"
 *     cancelLabel={t("cancel")}
 *     submitLabel={t("save")}
 *     onCancel={close}
 *     onSubmit={handleSave}
 *     submitting={saving}
 *   />
 * </Form>
 * ```
 *
 * 三条约定:
 * - 永远 `preventDefault()`:提交只走 `onSubmit`,不会触发原生的整页导航;
 * - `busy` 期间的提交直接丢弃(连点 Enter / 回车加点按钮都不会打出第二个请求),
 *   同时把 `aria-busy` 播报给读屏;
 * - 默认 `noValidate`:原生校验气泡不跟随应用语言、样式也不受控,校验反馈一律走
 *   `Field` 的 `error` 与按钮的 `blockedReason`。需要原生校验的场景显式传 `noValidate={false}`。
 *
 * 注意 `onSubmit` 不接收事件对象:`preventDefault` 已经做完,业务侧不需要它。
 */
export function Form({
  children,
  onSubmit,
  busy,
  noValidate = true,
  className = "",
  id,
  "aria-labelledby": ariaLabelledBy,
  "data-test-id": dataTestId,
}: {
  children: ReactNode;
  onSubmit: () => void;
  busy?: boolean;
  noValidate?: boolean;
  className?: string;
  id?: string;
  "aria-labelledby"?: string;
  "data-test-id"?: string;
}) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    onSubmit();
  }

  return (
    <form
      id={id}
      noValidate={noValidate}
      onSubmit={handleSubmit}
      aria-busy={busy ? true : undefined}
      aria-labelledby={ariaLabelledBy}
      className={className}
      data-test-id={dataTestId}
    >
      {children}
    </form>
  );
}
