/**
 * EasyUI shell — the reusable app frame: topbar, drill-down sidebar, mobile
 * drawer nav, and an optional AppShell composition. All data-driven + router
 * agnostic (see nav-model.ts + the `renderLink` render-prop).
 */

export { AppShell, APP_SHELL_MAIN_PADDING, type AppShellProps } from "./AppShell";
export { Topbar, type TopbarProps } from "./Topbar";
export { Sidebar, type SidebarProps } from "./Sidebar";
export { MobileNav, type MobileNavProps } from "./MobileNav";
export {
  activeNavLabel,
  type NavLink,
  type NavPanel,
  type NavNode,
  type NavGroup,
  type NavModel,
  type RenderNavLink,
} from "./nav-model";
