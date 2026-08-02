"use client";

import type { ReactNode } from "react";

type FormGridColumns = 1 | 2 | 3;
type FormGridGap = "sm" | "md" | "lg";

const COLUMNS_CLASS: Record<FormGridColumns, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-3",
};

const GAP_CLASS: Record<FormGridGap, string> = {
  sm: "gap-3",
  md: "gap-4",
  lg: "gap-5",
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
    <section className="space-y-3">
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
