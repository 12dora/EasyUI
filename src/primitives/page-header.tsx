"use client";

import type { ReactNode } from "react";

interface Props {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}

/** Page title block — CSS enter (MOTION.route timing via theme.css). */
export function PageHeader({ eyebrow, title, subtitle, meta, actions }: Props) {
  return (
    <header className="easy-page-header-enter mb-6 border-b border-hairline pb-5">
      {/* Stack on phones so a wide toolbar never squeezes the title into
          multiple lines; revert to the side-by-side layout from sm up. */}
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="w-full min-w-0 sm:flex-1">
          {eyebrow && <div className="eyebrow mb-1.5">{eyebrow}</div>}
          <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-ink sm:text-[26px]">{title}</h1>
          {subtitle && <p className="mt-1.5 max-w-2xl text-[13px] text-ink-soft">{subtitle}</p>}
          {meta && (
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-ink-faint">{meta}</div>
          )}
        </div>
        {actions && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">{actions}</div>}
      </div>
    </header>
  );
}
