"use client";

import type { ReactNode } from "react";

type FormGridColumns = 1 | 2 | 3;
type FormGridGap = "sm" | "md" | "lg";

const COLUMNS_CLASS: Record<FormGridColumns, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-3",
};

/**
 * 栅格间距走 `--ui-gap-*`,不写死像素:这三个变量由「行距」偏好(设置 → 外观)
 * 在 `<html data-ui-density>` 上整体切换,一处设置就把全站表单的纵向节奏一起收紧 / 放开,
 * 不用往下传 prop。表格行高是另一档偏好(「表格」),两者互不牵连。
 * 见 `theme.css` 与 `row-spacing.tsx`。
 *
 * 兜底值(12/16/20)是**改造前的老尺寸**,故意与 `theme.css` 里的缺省档(紧凑 8/12/16)
 * 不一致:theme.css 是产品默认,兜底只服务没引这份 theme 的宿主 —— 它们看到的仍是改造前的
 * 那一版几何,而不是变量失效后塌成 0。别为了"对齐"把两边改成一样。
 */
const GAP_CLASS: Record<FormGridGap, string> = {
  sm: "gap-[var(--ui-gap-sm,12px)]",
  md: "gap-[var(--ui-gap-md,16px)]",
  lg: "gap-[var(--ui-gap-lg,20px)]",
};

export function FormGrid({
  children,
  columns = 2,
  gap = "md",
  className = "",
  "data-test-id": dataTestId,
}: {
  children: ReactNode;
  columns?: FormGridColumns;
  gap?: FormGridGap;
  className?: string;
  "data-test-id"?: string;
}) {
  return (
    <div className={`grid ${COLUMNS_CLASS[columns]} ${GAP_CLASS[gap]} ${className}`} data-test-id={dataTestId}>
      {children}
    </div>
  );
}

export function FormSection({
  title,
  description,
  actions,
  children,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-[var(--ui-gap-sm,12px)]">
      {(title || description || actions) && (
        <div className="flex items-start justify-between gap-3">
          <div>
            {title && <h3 className="text-sm font-semibold text-ink">{title}</h3>}
            {description && <p className="mt-1 text-sm text-ink-soft">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}
