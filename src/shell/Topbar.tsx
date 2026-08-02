import type { ReactNode } from "react";

export interface TopbarProps {
  /** Left slot — usually a brand/logo link. */
  brand: ReactNode;
  /** Right slot — usually user/notification/language actions. */
  actions?: ReactNode;
  /** Optional slot before the brand (e.g. a mobile menu button). */
  leading?: ReactNode;
  /**
   * Optional centered content max width. Unset (the default) is full-bleed, so
   * the brand stays flush with the sidebar and the actions stay flush with the
   * right edge of the viewport — matching `<AppShell />`, which is full-bleed
   * for the same reason. Only pass a number for surfaces that deliberately
   * centre a narrow column.
   */
  maxWidth?: number;
  testId?: string;
  className?: string;
}

/**
 * EasyUI top bar: a sticky, translucent header with a brand slot and an actions
 * slot. Purely presentational — the host supplies brand + action components.
 */
export function Topbar({ brand, actions, leading, maxWidth, testId, className = "" }: TopbarProps) {
  return (
    <header
      className={`sticky top-0 z-20 border-b border-hairline bg-paper/95 backdrop-blur-sm ${className}`}
      data-test-id={testId}
    >
      <div
        className="mx-auto flex h-14 items-center justify-between gap-4 px-5"
        style={{ maxWidth }}
      >
        <div className="flex min-w-0 items-center gap-2">
          {leading}
          {brand}
        </div>
        {actions}
      </div>
    </header>
  );
}
