"use client";

import type { ReactNode } from "react";

type PanelPadding = "none" | "sm" | "md" | "lg";

const PADDING_CLASS: Record<PanelPadding, string> = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-5",
};

export function PanelSurface({
  children,
  padding = "md",
  className = "",
  "data-test-id": dataTestId,
}: {
  children: ReactNode;
  padding?: PanelPadding;
  className?: string;
  "data-test-id"?: string;
}) {
  return (
    <div className={`paper-card ${PADDING_CLASS[padding]} ${className}`} data-test-id={dataTestId}>
      {children}
    </div>
  );
}
