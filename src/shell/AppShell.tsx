import type { ReactNode } from "react";
import { NavigationProgress } from "./NavigationProgress";

export interface AppShellProps {
  /** Sticky header, usually `<Topbar />`. */
  topbar?: ReactNode;
  /** Desktop sidebar, usually `<Sidebar />` (hides itself below md). */
  sidebar?: ReactNode;
  /**
   * Mobile nav bar + drawer, usually `<MobileNav />` (hides itself at md+).
   *
   * 手机上「只留一条头部栏」的宿主不再用这个插槽:改成把
   * `<MobileNav variant="trigger" footer={…} />` 放进 `<Topbar leading>`,
   * 汉堡按钮与 Topbar 同处一行,页脚文案落到抽屉底部。这里保留是为了兼容旧宿主。
   */
  mobileNav?: ReactNode;
  children: ReactNode;
  /**
   * Footer pinned to the bottom of the viewport frame, usually `<Footer />`.
   * Rendered as a sibling AFTER the scroll region, so it never scrolls with
   * `<main>`. Omitted from the DOM entirely when not provided.
   *
   * 只在 md+ 显示:手机上这条钉死的页脚会再吃掉 ~50px 首屏,同样的文案改由
   * `<MobileNav footer>` 在抽屉底部呈现。
   */
  footer?: ReactNode;
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
  /**
   * 有一次客户端导航在途:内容列顶边显示延迟出现的进度条,`<main>` 挂 `aria-busy`。
   * 宿主用 `useNavIntent(pathname).pending` 喂它。
   */
  pending?: boolean;
  /** 进度条状态文案(本地化,视觉隐藏,只读给读屏),例如「加载中」。 */
  pendingLabel?: string;
}

/**
 * Horizontal/vertical rhythm of the scrollable content column. The step up at
 * the wide breakpoints keeps content off the bezel once `<main>` is free to
 * grow past ~1400px; hosts that compose their own `<main>` (see EasyTrade's
 * AdminShell) mirror this string so the two frames stay in sync.
 */
export const APP_SHELL_MAIN_PADDING = "px-4 py-4 md:px-10 md:py-12 2xl:px-12 3xl:px-16";

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
  footer,
  maxWidth,
  mainClassName = "",
  pending = false,
  pendingLabel,
}: AppShellProps) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-paper">
      {topbar}
      <div className="min-h-0 flex-1">
        <div className="mx-auto flex h-full flex-col md:flex-row" style={{ maxWidth }}>
          {sidebar}
          {mobileNav}
          {/* 进度条挂在这层 relative 包裹里、`<main>` 之外:它贴内容列顶边,不随内容滚动。 */}
          <div className="relative flex min-h-0 w-full min-w-0 flex-1 flex-col">
            <NavigationProgress pending={pending} label={pendingLabel} />
            <main
              // scrollbar-gutter: stable —— main 自己的滚动条出现/消失时内容不再横向抖动。
              style={{ scrollbarGutter: "stable" }}
              aria-busy={pending || undefined}
              className={`min-h-0 w-full min-w-0 flex-1 overflow-y-auto ${APP_SHELL_MAIN_PADDING} ${mainClassName}`}
            >
              {children}
            </main>
          </div>
        </div>
      </div>
      {/* 手机上不钉页脚:114px 的头部已经吃掉首屏,页脚文案改由 MobileNav 抽屉底部承载。 */}
      {footer ? <div className="hidden shrink-0 md:block">{footer}</div> : null}
    </div>
  );
}
