/**
 * EasyUI shell — the reusable app frame: topbar, drill-down sidebar, mobile
 * drawer nav, and an optional AppShell composition. All data-driven + router
 * agnostic (see nav-model.ts + the `renderLink` render-prop).
 *
 * 导航即时反馈见 nav-intent.ts(useNavIntent:路由提交前先把标记挪过去)与
 * NavigationProgress.tsx(内容列顶边的延迟进度条)。
 */

export { AppShell, APP_SHELL_MAIN_PADDING, type AppShellProps } from "./AppShell";
export { Topbar, type TopbarProps } from "./Topbar";
export { Sidebar, type SidebarProps } from "./Sidebar";
export { MobileNav, type MobileNavProps } from "./MobileNav";
export {
  useNavIntent,
  intentPathOf,
  NAV_INTENT_TIMEOUT_MS,
  type NavIntent,
} from "./nav-intent";
export {
  NavigationProgress,
  NAV_PROGRESS_DELAY_MS,
  type NavigationProgressProps,
} from "./NavigationProgress";
export {
  activeNavLabel,
  type NavLink,
  type NavPanel,
  type NavNode,
  type NavGroup,
  type NavModel,
  type RenderNavLink,
} from "./nav-model";
