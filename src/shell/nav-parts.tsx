"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { EASE_OUT_PAPER } from "../motion";
import type { NavGroup, NavLink, NavPanel, RenderNavLink } from "./nav-model";

/** Shared item class for links + panel entries (active vs idle). */
export function navItemClass(active: boolean, extra = ""): string {
  return `group relative flex items-center gap-3 rounded-md px-3 py-2 text-[13px] transition-colors ${extra} ${
    // 选中态只保留左侧指示条(ActiveMarker)+ 加重文字,不再铺底色块。
    active ? "text-ink font-medium" : "text-ink-soft hover:bg-ink/[0.04] hover:text-ink"
  }`;
}

/**
 * The sliding active indicator. `layoutId` must be unique per rendered surface.
 *
 * A shared-element (`layoutId`) slide is the visible nav "switch" animation, so
 * it is deliberately kept on motion/react rather than approximated in CSS —
 * CSS cannot animate between two separate DOM nodes. Reduced-motion users get
 * the same marker with no travel.
 */
export function ActiveMarker({ layoutId }: { layoutId: string }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.span
      layoutId={layoutId}
      className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-sm bg-[rgb(var(--amber))]"
      transition={reduceMotion ? { duration: 0 } : { duration: 0.2, ease: EASE_OUT_PAPER }}
      aria-hidden
    />
  );
}

function DrillChevron() {
  return (
    <span className="ml-auto font-mono text-[13px] text-ink-faint" aria-hidden="true">
      &gt;
    </span>
  );
}

export function NavLinkItem({
  link,
  renderLink,
  onNavigate,
  markerLayoutId,
}: {
  link: NavLink;
  renderLink: RenderNavLink;
  /** Extra side effect on navigate (e.g. close the mobile drawer). */
  onNavigate?: () => void;
  markerLayoutId?: string;
}) {
  return (
    <li>
      {renderLink({
        href: link.href,
        active: link.active,
        className: navItemClass(link.active),
        testId: link.testId,
        onNavigate: () => onNavigate?.(),
        children: (
          <>
            <span>{link.label}</span>
            {link.active && markerLayoutId ? <ActiveMarker layoutId={markerLayoutId} /> : null}
          </>
        ),
      })}
    </li>
  );
}

export function NavPanelEntry({
  panel,
  onOpen,
  markerLayoutId,
}: {
  panel: NavPanel;
  onOpen: (panel: NavPanel) => void;
  markerLayoutId?: string;
}) {
  return (
    <li>
      <button
        type="button"
        aria-current={panel.active ? "page" : undefined}
        aria-haspopup="menu"
        onClick={() => onOpen(panel)}
        className={navItemClass(panel.active, "w-full text-left")}
        data-test-id={panel.testId}
      >
        <span>{panel.label}</span>
        <DrillChevron />
        {panel.active && markerLayoutId ? <ActiveMarker layoutId={markerLayoutId} /> : null}
      </button>
    </li>
  );
}

export function PanelBackButton({
  label,
  backLabel,
  onBack,
  testId,
}: {
  label: ReactNode;
  backLabel: string;
  onBack: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onBack}
      aria-label={backLabel}
      className="mb-3 flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[13px] font-medium text-ink transition-colors hover:bg-ink/[0.04]"
      data-test-id={testId}
    >
      <span className="font-mono text-[14px]" aria-hidden="true">
        &lt;
      </span>
      <span>{label}</span>
    </button>
  );
}

/** Render one group's nodes as an <ol> of links + panel entries. */
export function NavGroupList({
  group,
  className = "",
  renderLink,
  onOpenPanel,
  onNavigate,
  markerLayoutId,
}: {
  group: NavGroup;
  className?: string;
  renderLink: RenderNavLink;
  onOpenPanel: (panel: NavPanel) => void;
  onNavigate?: () => void;
  markerLayoutId?: string;
}) {
  return (
    <ol className={`flex flex-col gap-0.5 ${className}`}>
      {group.nodes.map((node) =>
        node.kind === "link" ? (
          <NavLinkItem
            key={node.link.key}
            link={node.link}
            renderLink={renderLink}
            onNavigate={onNavigate}
            markerLayoutId={markerLayoutId}
          />
        ) : (
          <NavPanelEntry
            key={`panel-${node.panel.id}`}
            panel={node.panel}
            onOpen={onOpenPanel}
            markerLayoutId={markerLayoutId}
          />
        ),
      )}
    </ol>
  );
}

/** A drilled-in panel view: back button + the panel's links. */
export function NavPanelView({
  panel,
  backLabel,
  onBack,
  renderLink,
  onNavigate,
  markerLayoutId,
}: {
  panel: NavPanel;
  backLabel: string;
  onBack: () => void;
  renderLink: RenderNavLink;
  onNavigate?: () => void;
  markerLayoutId?: string;
}) {
  return (
    <div>
      <PanelBackButton label={panel.label} backLabel={backLabel} onBack={onBack} testId={panel.backTestId} />
      <ol className="flex flex-col gap-0.5">
        {panel.items.map((item) => (
          <NavLinkItem
            key={item.key}
            link={item}
            renderLink={renderLink}
            onNavigate={onNavigate}
            markerLayoutId={markerLayoutId}
          />
        ))}
      </ol>
    </div>
  );
}

/** Spacing + divider classes for a group in the main (non-drilled) view. */
export function groupClassName(index: number, group: NavGroup): string {
  const spacing = index === 0 ? "" : "mt-4";
  const divider = group.divider ? "border-t border-hairline-soft pt-3" : "";
  return `${spacing} ${divider}`.trim();
}

/**
 * CSS class for a nav panel enter animation (used by the mobile drawer, which
 * has no exit-phase requirement and stays free of the animation runtime).
 * `direction > 0` slides in from the right (drill-in); negative from the left (back).
 */
export function panelEnterClass(direction: number): string {
  return direction >= 0 ? "easy-nav-panel-enter-right" : "easy-nav-panel-enter-left";
}

/** Desktop panel enter/exit transition (horizontal slide) — needs a presence phase. */
export const panelMotion = (direction: number) =>
  ({
    initial: { opacity: 0, x: direction },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: direction * 0.55 },
    transition: { duration: 0.18, ease: EASE_OUT_PAPER },
  }) as const;
