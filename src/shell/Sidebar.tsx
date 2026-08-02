"use client";

import { AnimatePresence, motion } from "motion/react";
import type { NavModel, NavPanel, RenderNavLink } from "./nav-model";
import { NavGroupList, NavPanelView, groupClassName, panelMotion } from "./nav-parts";

const MARKER = "easyui-sidebar-active-marker";

export interface SidebarProps {
  model: NavModel;
  /** Currently drilled-in panel id, or null for the main view (controlled). */
  openPanelId: string | null;
  /** A panel entry was activated (host: open it + navigate to firstHref). */
  onOpenPanel: (panel: NavPanel) => void;
  /** The back button was pressed (host: return to the main view). */
  onBack: () => void;
  /** Router-aware link renderer (see RenderNavLink). */
  renderLink: RenderNavLink;
  /** Back-button label, e.g. localized "Menu". */
  backLabel: string;
  /** Fixed sidebar width. Defaults to 240px. */
  width?: number;
  /** Test id for the main (non-drilled) view container. */
  mainViewTestId?: string;
  /** Localized primary nav landmark aria-label. */
  navLabel: string;
  className?: string;
}

/**
 * EasyUI desktop sidebar: a data-driven vertical nav with animated drill-down
 * panels and a sliding active marker. Presentational + controlled — the host
 * owns routing, permissions and which panel is open.
 *
 * Hidden below `md`; pair it with `<MobileNav />` for small screens.
 *
 * Motion note: FE-PERF-04 replaced this with CSS enter-only classes, which lost
 * the exit phase and (via `ActiveMarker`) the shared-element marker slide — the
 * visible nav switch animation. The animation is restored here; the perf ruling
 * still holds where it matters, because the sidebar only renders on
 * authenticated app routes, never on the public/login entries.
 */
export function Sidebar({
  model,
  openPanelId,
  onOpenPanel,
  onBack,
  renderLink,
  backLabel,
  width = 240,
  mainViewTestId,
  navLabel,
  className = "",
}: SidebarProps) {
  const openPanel = findPanel(model, openPanelId);

  return (
    <aside
      className={`hidden h-full shrink-0 flex-col border-r border-hairline bg-paper md:flex ${className}`}
      style={{ width }}
    >
      <nav className="flex min-h-0 w-full flex-1 overflow-hidden px-3 py-4" aria-label={navLabel}>
        <AnimatePresence mode="wait" initial={false}>
          {openPanel ? (
            <motion.div
              key={`panel-${openPanel.id}`}
              {...panelMotion(18)}
              className="h-full min-h-0 w-full overflow-y-auto"
              data-test-id={openPanel.viewTestId}
            >
              <NavPanelView
                panel={openPanel}
                backLabel={backLabel}
                onBack={onBack}
                renderLink={renderLink}
                markerLayoutId={MARKER}
              />
            </motion.div>
          ) : (
            <motion.div
              key="main"
              {...panelMotion(-18)}
              className="h-full min-h-0 w-full overflow-y-auto"
              data-test-id={mainViewTestId}
            >
              {model.groups.map((group, index) => (
                <NavGroupList
                  key={group.key}
                  group={group}
                  className={groupClassName(index, group)}
                  renderLink={renderLink}
                  onOpenPanel={onOpenPanel}
                  markerLayoutId={MARKER}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </nav>
    </aside>
  );
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
