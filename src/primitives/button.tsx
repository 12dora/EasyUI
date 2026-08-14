"use client";

import { forwardRef, type ButtonHTMLAttributes, type MouseEvent } from "react";
import { CONTROL_CLASS } from "../control-tokens";
import { toast } from "../toast";

type Variant = "primary" | "ghost" | "ghost-danger" | "danger" | "secondary" | "outline";
/**
 * `sm` — independent toolbar actions (28px).
 * `md` — default / form-control peer (36px); same box as antd `controlHeight`.
 * `control` — explicit form-control alias of `md` for buttons beside antd inputs.
 * `lg` — large emphasis actions (44px).
 */
type Size = "sm" | "md" | "control" | "lg";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  blockedReason?: string;
  /**
   * 阻断提示的 toast 级别。默认 `warning`(礼貌播报、3 秒自动消失), 表单必填/格式
   * 校验一律用默认值 —— 动作压根没执行, 持久的信号是按钮仍然处于阻断态, toast 只是
   * "为什么点不动" 的即时提示。
   *
   * `error` 是重语义: assertive 打断读屏 + 15 秒可暂停倒计时。只有真正的系统级失败
   * 才配得上, 不要拿来表达输入没填完。
   */
  blockedToastVariant?: "warning" | "error";
  onBlockedClick?: () => void;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-ink text-paper border border-ink hover:bg-ink/90 active:translate-y-px disabled:bg-ink/40 disabled:border-ink/40 disabled:cursor-not-allowed",
  // 蓝色填充按钮已退役:动作按钮统一 navy(与 primary 同色);蓝色仅作选中/聚焦强调。
  secondary:
    "bg-ink text-paper border border-ink hover:bg-ink/90 active:translate-y-px disabled:bg-ink/40 disabled:border-ink/40 disabled:cursor-not-allowed",
  outline:
    "bg-transparent text-ink border border-ink/30 hover:border-ink/60 hover:bg-ink/[0.04] active:translate-y-px disabled:opacity-40 disabled:cursor-not-allowed",
  ghost:
    "bg-transparent text-ink-soft hover:text-ink hover:bg-ink/[0.04] border border-transparent active:translate-y-px disabled:opacity-40 disabled:cursor-not-allowed",
  "ghost-danger":
    "bg-transparent text-[rgb(var(--signal))] hover:bg-[rgb(var(--signal))]/[0.08] border border-transparent active:translate-y-px disabled:opacity-40 disabled:cursor-not-allowed",
  danger:
    "bg-[rgb(var(--signal))] text-paper border border-[rgb(var(--signal))] hover:bg-[rgb(var(--signal))]/90 active:translate-y-px disabled:opacity-50 disabled:cursor-not-allowed",
};

const SIZES: Record<Size, string> = {
  sm: `${CONTROL_CLASS.heightSM} px-2.5 text-[12px] tracking-wide`,
  md: CONTROL_CLASS.buttonControl,
  /** Form-control size — identical box to `md` / antd `controlHeight` (36px). */
  control: CONTROL_CLASS.buttonControl,
  lg: `${CONTROL_CLASS.heightLG} px-6 text-[14px] tracking-wide`,
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  {
    variant = "outline",
    size = "md",
    loading,
    blockedReason,
    blockedToastVariant = "warning",
    onBlockedClick,
    className = "",
    children,
    disabled,
    "aria-disabled": ariaDisabled,
    ...rest
  },
  ref,
) {
  const blocked = Boolean(blockedReason) && !disabled && !loading;
  const blockedClass = blocked ? "cursor-not-allowed opacity-50 active:translate-y-0" : "";
  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (!blocked) {
      rest.onClick?.(event);
      return;
    }
    event.preventDefault();
    onBlockedClick?.();
    if (blockedReason) {
      const show = blockedToastVariant === "error" ? toast.error : toast.warning;
      show(blockedReason);
    }
  }

  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      {...rest}
      data-control={size === "control" || size === "md" ? "true" : undefined}
      aria-disabled={blocked ? true : ariaDisabled}
      onClick={handleClick}
      className={`relative inline-flex items-center justify-center gap-1.5 font-medium ${CONTROL_CLASS.radius} transition-all duration-150 ease-out select-none whitespace-nowrap ${VARIANTS[variant]} ${SIZES[size]} ${blockedClass} ${className}`}
    >
      {loading && (
        <span className="inline-block h-3 w-3 animate-spin rounded-full border border-current border-r-transparent opacity-70" />
      )}
      {children}
    </button>
  );
});
