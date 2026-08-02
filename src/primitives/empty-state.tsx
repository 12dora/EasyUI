"use client";

import type { ReactNode } from "react";

export type EmptyStateKind = "empty" | "noResults" | "notFound" | "prerequisite";
export type EmptyStateSize = "compact" | "section" | "page";

interface EmptyStateProps {
  kind?: EmptyStateKind;
  size?: EmptyStateSize;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  "data-test-id"?: string;
}

const SIZE_CLASS: Record<EmptyStateSize, string> = {
  compact: "py-4",
  section: "py-8",
  page: "py-14",
};

export function EmptyState({
  kind = "empty",
  size = "section",
  title,
  description,
  actions,
  className = "",
  "data-test-id": dataTestId,
}: EmptyStateProps) {
  return (
    <div className={`text-center ${SIZE_CLASS[size]} ${className}`} data-empty-state-kind={kind} data-test-id={dataTestId}>
      <div className="text-sm font-medium text-ink">{title}</div>
      {description && <div className="mx-auto mt-1 max-w-xl text-sm text-ink-soft">{description}</div>}
      {actions && <div className="mt-4 flex justify-center gap-2">{actions}</div>}
    </div>
  );
}
