"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { DURATION } from "../motion";
import { useFocusTrap } from "../primitives/focus-trap";
import { activeNavLabel, type NavModel, type NavPanel, type RenderNavLink } from "./nav-model";
import { NavGroupList, NavPanelView, groupClassName, panelEnterClass } from "./nav-parts";

const MARKER = "easyui-mobilenav-active-marker";

/** Drawer slide duration — matches `.easy-drawer-*` / `--duration-base`. */
const DRAWER_MS = Math.round(DURATION.base * 1000);

const TRIGGER_CLASS =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-ink-soft transition-colors hover:bg-ink/[0.04] hover:text-ink -ml-1.5";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export interface MobileNavProps {
  model: NavModel;
  renderLink: RenderNavLink;
  /** Panel back-button label. */
  backLabel: string;
  /** Hamburger aria-label, e.g. localized "Menu". */
  menuLabel: string;
  /** Drawer close aria-label. */
  closeLabel: string;
  /** Localized drawer nav landmark aria-label. */
  navLabel: string;
  /** Bar title fallback when nothing is active (`variant="bar"` only). */
  title?: ReactNode;
  /** Changing this (e.g. pathname) closes the drawer + resets drill state. */
  pathKey?: string;
  /**
   * `"bar"`(默认,旧行为):汉堡 + 当前分区标题的独立顶栏。
   * `"trigger"`:只渲染汉堡按钮本身(自带 `md:hidden`)+ 抽屉 portal,
   * 供宿主塞进 `<Topbar leading>`,这样手机上只剩一条头部栏。
   * 两种形态共用同一套抽屉/下钻/路由关闭逻辑。
   */
  variant?: "bar" | "trigger";
  /**
   * 抽屉底部内容(通常是宿主的 `<EnterpriseConfiguredFooter bare />`)。手机上 `AppShell`
   * 的页脚包裹层是 `hidden md:block`,所以传了 `AppShell footer` 的宿主必须把同一份文案
   * 再传到这里,否则手机上页脚整条消失。两种 `variant` 都渲染这个插槽。
   */
  footer?: ReactNode;
  className?: string;
}

/**
 * EasyUI mobile navigation: a hamburger button (optionally inside a slim top
 * bar) plus a left off-canvas drawer that renders the SAME drill-down nav model
 * as the desktop sidebar — so secondary menus (records / library / settings…)
 * are reachable on phones instead of being flattened into one scroll strip.
 *
 * Shown only below `md`. Drill-down is local (tapping a group reveals its items
 * without navigating); tapping a leaf link navigates and closes the drawer.
 *
 * Animations are CSS-only (FE-PERF-04) — no motion/react on the shell path.
 */
export function MobileNav({
  model,
  renderLink,
  backLabel,
  menuLabel,
  closeLabel,
  navLabel,
  title,
  pathKey,
  variant = "bar",
  footer,
  className = "",
}: MobileNavProps) {
  const drawer = useDrawerController(pathKey);
  const triggerOnly = variant === "trigger";

  const trigger = (
    <button
      type="button"
      onClick={drawer.openDrawer}
      aria-label={menuLabel}
      aria-haspopup="menu"
      aria-expanded={drawer.open}
      className={triggerOnly ? `${TRIGGER_CLASS} md:hidden ${className}` : TRIGGER_CLASS}
      data-test-id="admin-mobile-nav-trigger"
    >
      <MenuIcon />
    </button>
  );

  const portal =
    drawer.mounted && drawer.portalOpen
      ? createPortal(
          <NavDrawer
            model={model}
            renderLink={renderLink}
            backLabel={backLabel}
            menuLabel={menuLabel}
            closeLabel={closeLabel}
            navLabel={navLabel}
            footer={footer}
            drawer={drawer}
          />,
          document.body,
        )
      : null;

  // trigger 形态没有自己的容器:按钮直接进宿主的 `<Topbar leading>`。
  if (triggerOnly) {
    return (
      <>
        {trigger}
        {portal}
      </>
    );
  }

  const currentLabel = activeNavLabel(model) ?? title ?? null;
  return (
    <div
      className={`z-[3] flex w-full shrink-0 items-center gap-2 border-b border-hairline bg-paper/95 px-4 py-2 backdrop-blur md:hidden ${className}`}
      data-test-id="admin-mobile-nav"
    >
      {trigger}
      {currentLabel ? (
        <span className="truncate text-[13px] font-medium text-ink" data-test-id="admin-mobile-nav-current">
          {currentLabel}
        </span>
      ) : null}
      {portal}
    </div>
  );
}

interface DrawerController {
  open: boolean;
  portalOpen: boolean;
  exiting: boolean;
  mounted: boolean;
  drillId: string | null;
  setPanel: (node: HTMLDivElement | null) => void;
  setDrillId: (id: string | null) => void;
  openDrawer: () => void;
  closeDrawer: () => void;
}

/**
 * 抽屉的全部状态与副作用:开合、退场动画、下钻、焦点陷阱、Esc、断点关闭、
 * 路由变化关闭。两种 variant 共用同一份实现(所以 trigger 形态不是另一条代码路径)。
 */
function useDrawerController(pathKey?: string): DrawerController {
  const [open, setOpen] = useState(false);
  const [drillId, setDrillId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [panel, setPanel] = useState<HTMLDivElement | null>(null);
  // Portal stays mounted through the exit animation.
  const [portalOpen, setPortalOpen] = useState(false);
  const [exiting, setExiting] = useState(false);

  // 抽屉复用 Dialog 的焦点管理:打开聚焦容器、Tab 环绕、关闭恢复到汉堡按钮。
  useFocusTrap(panel, open && !exiting);
  // 下钻/返回时 main↔drill 子树整体替换,原按钮卸载会让焦点落到 BODY;把焦点拉回容器。
  useEffect(() => {
    if (open && !exiting) panel?.focus?.();
  }, [drillId, open, exiting, panel]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  // Close + reset when the route changes.
  useEffect(() => {
    setOpen(false);
    setDrillId(null);
  }, [pathKey]);

  // Drive portal open/exit from `open`.
  useEffect(() => {
    if (open) {
      setPortalOpen(true);
      setExiting(false);
      return;
    }
    if (!portalOpen) return;
    if (prefersReducedMotion()) {
      setPortalOpen(false);
      return;
    }
    setExiting(true);
    const handle = window.setTimeout(() => {
      setPortalOpen(false);
      setExiting(false);
    }, DRAWER_MS);
    return () => window.clearTimeout(handle);
  }, [open, portalOpen]);

  // Esc-to-close while the drawer is open. 滚动锁移到抽屉子节点(BodyScrollLock),
  // 由退出动画决定解锁时机,退场期间背景不再露出滚动。
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      // Esc 关闭也要重置下钻,否则下次打开仍停在旧二级菜单。
      if (event.key === "Escape") {
        setOpen(false);
        setDrillId(null);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // 桌面断点关闭:抽屉打开后 resize 到 >=md 会因 md:hidden 隐藏节点却仍 open,
  // body overflow 锁死无法滚动。监听 md 断点,进入桌面即关闭并解锁。
  useEffect(() => {
    if (!open) return;
    const desktop = window.matchMedia("(min-width: 768px)");
    const onChange = () => {
      if (desktop.matches) {
        setOpen(false);
        setDrillId(null);
      }
    };
    desktop.addEventListener("change", onChange);
    return () => desktop.removeEventListener("change", onChange);
  }, [open]);

  return {
    open,
    portalOpen,
    exiting,
    mounted,
    drillId,
    setPanel,
    setDrillId,
    openDrawer: () => setOpen(true),
    closeDrawer: () => {
      setOpen(false);
      setDrillId(null);
    },
  };
}

interface NavDrawerProps {
  model: NavModel;
  renderLink: RenderNavLink;
  backLabel: string;
  menuLabel: string;
  closeLabel: string;
  navLabel: string;
  footer?: ReactNode;
  drawer: DrawerController;
}

/** 抽屉本体(portal 的内容)。 */
function NavDrawer({ model, renderLink, backLabel, menuLabel, closeLabel, navLabel, footer, drawer }: NavDrawerProps) {
  const { exiting, drillId, setDrillId, setPanel, closeDrawer } = drawer;
  const drillPanel = findPanel(model, drillId);
  return (
    <div className="fixed inset-0 z-[60] md:hidden" role="dialog" aria-modal="true" aria-label={menuLabel}>
      <BodyScrollLock />
      <div
        className={`absolute inset-0 bg-ink/30 backdrop-blur-[1px] ${
          exiting ? "easy-drawer-backdrop-exit" : "easy-drawer-backdrop-enter"
        }`}
        onClick={closeDrawer}
      />
      <div
        ref={setPanel}
        tabIndex={-1}
        className={`absolute inset-y-0 left-0 flex w-[82%] max-w-[320px] flex-col border-r border-hairline bg-paper shadow-xl focus:outline-none ${
          exiting ? "easy-drawer-panel-exit" : "easy-drawer-panel-enter"
        }`}
        data-test-id="admin-mobile-nav-drawer"
      >
        <div className="flex items-center justify-between border-b border-hairline-soft px-4 py-3">
          <span className="text-[13px] font-medium text-ink">{menuLabel}</span>
          <button
            type="button"
            onClick={closeDrawer}
            aria-label={closeLabel}
            className="flex h-9 w-9 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-ink/[0.04] hover:text-ink -mr-1.5"
            data-test-id="admin-mobile-nav-close"
          >
            <CloseIcon />
          </button>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4" aria-label={navLabel}>
          {drillPanel ? (
            <div key={`drill-${drillPanel.id}`} className={panelEnterClass(18)} data-test-id={drillPanel.viewTestId}>
              <NavPanelView
                panel={drillPanel}
                backLabel={backLabel}
                onBack={() => setDrillId(null)}
                renderLink={renderLink}
                onNavigate={closeDrawer}
                markerLayoutId={MARKER}
              />
            </div>
          ) : (
            <div key="main" className={panelEnterClass(-18)}>
              {model.groups.map((group, index) => (
                <NavGroupList
                  key={group.key}
                  group={group}
                  className={groupClassName(index, group)}
                  renderLink={renderLink}
                  onOpenPanel={(next) => setDrillId(next.id)}
                  onNavigate={closeDrawer}
                  markerLayoutId={MARKER}
                />
              ))}
            </div>
          )}
        </nav>
        {/* 手机上 AppShell 不再钉页脚,页脚文案落在抽屉底部。这里只是一个透明的布局槽:
            分隔线与内边距属于抽屉自己(和上面的标题行同一套),外观 / 地标由传进来的节点决定 ——
            宿主应当传 `<EnterpriseConfiguredFooter bare />`,避免在抽屉里嵌出第二个 <footer> 地标。 */}
        {footer ? (
          <div className="shrink-0 border-t border-hairline-soft px-4 py-3" data-test-id="admin-mobile-nav-footer">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * 抽屉的 body 滚动锁。作为 portal 子节点挂载:卸载推迟到退出动画结束后,
 * 所以 overflow 恢复发生在滑出之后,退场期间背景保持锁定。
 */
function BodyScrollLock() {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
  return null;
}

function findPanel(model: NavModel, id: string | null): NavPanel | null {
  if (!id) return null;
  for (const group of model.groups) {
    for (const node of group.nodes) {
      if (node.kind === "panel" && node.panel.id === id) return node.panel;
    }
  }
  return null;
}

function MenuIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9">
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
