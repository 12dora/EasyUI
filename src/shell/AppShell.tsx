import type { ReactNode } from "react";

export interface AppShellProps {
  /** Sticky header, usually `<Topbar />`. */
  topbar?: ReactNode;
  /** Desktop sidebar, usually `<Sidebar />` (hides itself below md). */
  sidebar?: ReactNode;
  /** Mobile nav bar + drawer, usually `<MobileNav />` (hides itself at md+). */
  mobileNav?: ReactNode;
  children: ReactNode;
  /**
   * Optional centered frame max width. Unset (the default) is full-bleed: the
   * sidebar pins to the left edge and every extra pixel of viewport width goes
   * to `<main>`, which is what wide screens are for. A fixed cap here centres
   * the whole frame instead, which strands the sidebar mid-screen and wastes
   * the margins — only pass one if that is genuinely wanted.
   */
  maxWidth?: number;
  /** Extra classes for the scrollable <main>. */
  mainClassName?: string;
}

/**
 * Horizontal/vertical rhythm of the scrollable content column. The step up at
 * the wide breakpoints keeps content off the bezel once `<main>` is free to
 * grow past ~1400px; hosts that compose their own `<main>` (see EasyTrade's
 * AdminShell) mirror this string so the two frames stay in sync.
 */
export const APP_SHELL_MAIN_PADDING = "px-4 py-6 md:px-10 md:py-12 2xl:px-12 3xl:px-16";

/**
 * EasyUI application frame: sticky topbar over a full-height content region that
 * holds the sidebar (desktop) / mobile nav and a scrollable main column.
 *
 * The frame is exactly one viewport tall (`h-dvh`, not `min-h-dvh`): the whole
 * `min-h-0 flex-1` chain below only resolves against a *definite* height, so
 * with `min-h-dvh` the frame silently grew to content height, `<main>`'s
 * `overflow-y-auto` never engaged and the **window** scrolled instead. That in
 * turn made a centred (`mx-auto` + `maxWidth`) frame jump sideways by the
 * scrollbar width whenever a route's content happened to overflow — a visible
 * horizontal jitter of the sidebar between pages on platforms with classic
 * (space-taking) scrollbars. Keep `h-dvh` even now that the frame is full-bleed
 * by default: `<main>`'s own scroller is still what the `min-h-0` chain feeds.
 *
 * A convenience composition for new projects. Apps that need custom in-main
 * behaviour (route-transition overlays, permission guards) can compose
 * `<Sidebar />` + `<MobileNav />` themselves instead.
 */
export function AppShell({
  topbar,
  sidebar,
  mobileNav,
  children,
  maxWidth,
  mainClassName = "",
}: AppShellProps) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-paper">
      {topbar}
      <div className="min-h-0 flex-1">
        <div className="mx-auto flex h-full flex-col md:flex-row" style={{ maxWidth }}>
          {sidebar}
          {mobileNav}
          <main
            // scrollbar-gutter: stable —— main 自己的滚动条出现/消失时内容不再横向抖动。
            style={{ scrollbarGutter: "stable" }}
            className={`min-h-0 w-full min-w-0 flex-1 overflow-y-auto ${APP_SHELL_MAIN_PADDING} ${mainClassName}`}
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
