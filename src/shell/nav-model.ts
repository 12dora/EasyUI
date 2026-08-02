import type { ReactNode } from "react";

/**
 * EasyUI shell — navigation model.
 *
 * A router-agnostic description of a sidebar's contents. The host app builds a
 * `NavModel` (applying its own permission filtering, i18n and active-path
 * detection) and hands it to `<Sidebar />` / `<MobileNav />`, which render it
 * with drill-down panels on both desktop and mobile.
 */

/** A leaf navigation entry that routes somewhere. */
export interface NavLink {
  /** Stable identity (used for React keys). */
  key: string;
  label: ReactNode;
  href: string;
  /** Whether the current route is within this link (host computes it). */
  active: boolean;
  testId?: string;
}

/** A drill-down group: a labelled entry that opens a sub-list of links. */
export interface NavPanel {
  /** Stable panel id, e.g. "records" | "library" | "settings". */
  id: string;
  label: ReactNode;
  /** Whether the current route lives inside this panel. */
  active: boolean;
  items: readonly NavLink[];
  /** Where activating the panel entry should navigate (usually items[0].href). */
  firstHref: string;
  /** Test id for the panel entry button. */
  testId?: string;
  /** Test id for the drilled-in panel container. */
  viewTestId?: string;
  /** Back-button test id when the panel is open. */
  backTestId?: string;
}

export type NavNode =
  | { readonly kind: "link"; readonly link: NavLink }
  | { readonly kind: "panel"; readonly panel: NavPanel };

/** A visual cluster of nodes. `divider` renders a top rule + spacing. */
export interface NavGroup {
  key: string;
  nodes: readonly NavNode[];
  divider?: boolean;
}

export interface NavModel {
  groups: readonly NavGroup[];
}

/**
 * Render-prop the host supplies so the shell stays framework-agnostic: it wires
 * up its router's `Link`, `aria-current`, and any route-transition side effects.
 * `onNavigate` is the shell's own hook (e.g. close the mobile drawer) — the host
 * must invoke it inside the link's click handler.
 */
export type RenderNavLink = (args: {
  href: string;
  active: boolean;
  className: string;
  testId?: string;
  onNavigate: () => void;
  children: ReactNode;
}) => ReactNode;

/** Flatten all links (used to resolve the active label for the mobile bar). */
export function activeNavLabel(model: NavModel): ReactNode | null {
  // A panel and its active leaf are both marked active. The leaf is the current
  // destination and must win over the parent section title on mobile.
  for (const group of model.groups) {
    for (const node of group.nodes) {
      if (node.kind !== "panel") continue;
      const activeLeaf = node.panel.items.find((item) => item.active);
      if (activeLeaf) return activeLeaf.label;
    }
  }
  for (const group of model.groups) {
    for (const node of group.nodes) {
      if (node.kind === "link" && node.link.active) return node.link.label;
      if (node.kind === "panel" && node.panel.active) return node.panel.label;
    }
  }
  return null;
}
