"use client";

import type { ReactNode } from "react";

interface Props {
  index?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  /** A small mono badge to print after the title */
  badge?: ReactNode;
  /**
   * When true, omit the default trailing `mb-10`. Use for the sole / last
   * section inside a padded panel so the panel padding is not doubled with
   * a 40px empty margin (FE-UXA-11). Default keeps `mb-10` so stacked
   * sections in EasyTrade / enterprise settings keep their existing gaps.
   */
  flush?: boolean;
  /** Extra classes on the outer `<section>` (merged after spacing defaults). */
  className?: string;
}

/**
 * Section spacing contract (FE-UXA-11):
 * - Default: `mb-10` between stacked sections (unchanged for existing callers).
 * - Terminal / sole child of a panel: pass `flush` so the parent owns padding.
 * - Custom spacing: pass `className` (e.g. `mb-6`) — it is appended after the
 *   default spacing class; use `flush` + `className="mb-6"` for a custom gap.
 *
 * Call sites that need `flush` (sole child of PanelSurface / card):
 * - `frontend/apps/customs/app/[locale]/app/settings/provider/page.tsx`
 *   (status / credentials / verification / conflict cards)
 * - Any future "one Section per card" pattern in settings or detail panels.
 *
 * Multi-section pages (authorization workspace, product detail, etc.) keep the
 * default margin — no change required.
 */
export function Section({
  index,
  title,
  description,
  actions,
  children,
  badge,
  flush = false,
  className = "",
}: Props) {
  const spacing = flush ? "" : "mb-10";
  return (
    <section className={`easy-section-enter ${spacing} ${className}`.trim()}>
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-ink/10 pb-2">
        <div className="flex items-baseline gap-3">
          {/* Section ordinal ("01", "2.3"). 12px like every other meaning-carrying label,
              and no `tracking`: 0.18em pulled the two digits apart until they read as two
              separate marks. `tabular-nums` keeps a column of indices aligned. */}
          {index && (
            <span className="font-mono text-[12px] tabular-nums text-ink-faint">{index}</span>
          )}
          <h2 className="font-semibold text-[24px] leading-none text-ink">{title}</h2>
          {badge}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>
      </header>
      {description && <p className="mb-4 text-[12px] text-ink-soft">{description}</p>}
      {children}
    </section>
  );
}
