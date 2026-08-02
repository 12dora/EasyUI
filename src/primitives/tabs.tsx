"use client";

import { useRef } from "react";
import type { CSSProperties, KeyboardEvent, ReactNode, Ref } from "react";

/**
 * Shared tab primitive — the single keyboard/ARIA model behind every in-page
 * tab strip.
 *
 * Hosts keep owning look and selection state (query string, local state, …);
 * this primitive owns only the accessibility contract that hand-rolled strips
 * kept getting wrong:
 *   - roving tabindex (only the selected tab is in the Tab sequence)
 *   - ArrowLeft / ArrowRight / Home / End move focus and selection
 *   - `aria-controls` / `aria-labelledby` wiring between tab and panel
 *
 * Selection follows focus (automatic activation), which is the WAI-ARIA
 * recommendation for tab strips whose panel is rendered immediately.
 */

export interface TabDefinition {
  readonly key: string;
  readonly label: ReactNode;
  /** Visual classes for this tab button; callers resolve active/inactive styling. */
  readonly className?: string;
  /** Extra `data-*` hooks. ARIA attributes stay owned by this primitive. */
  readonly dataAttributes?: Readonly<Record<`data-${string}`, string>>;
}

/** Stable DOM id of a tab button, so panels can point back at it. */
export function tabTriggerId(idBase: string, key: string): string {
  return `${idBase}-tab-${key}`;
}

/** Stable DOM id of the panel owned by a tab. */
export function tabPanelId(idBase: string, key: string): string {
  return `${idBase}-panel-${key}`;
}

export interface TabListProps {
  /** Page-unique prefix used to build tab/panel ids. */
  readonly idBase: string;
  /** Accessible name of the tab strip. */
  readonly label: string;
  readonly tabs: readonly TabDefinition[];
  readonly activeKey: string;
  readonly onSelect: (key: string) => void;
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly listRef?: Ref<HTMLDivElement>;
  readonly dataTestId?: string;
}

export function TabList({ idBase, label, tabs, activeKey, onSelect, className, style, listRef, dataTestId }: TabListProps) {
  const triggers = useRef(new Map<string, HTMLButtonElement>());
  const activeIndex = tabs.findIndex((tab) => tab.key === activeKey);
  // 越界 activeKey(权限过滤/深链脏值)下仍保留一个 tab stop,否则整条 tab 条键盘不可达。
  const rovingKey = activeIndex >= 0 ? activeKey : tabs[0]?.key;

  function moveTo(index: number) {
    if (tabs.length === 0) return;
    const target = tabs[(index + tabs.length) % tabs.length];
    if (!target) return;
    onSelect(target.key);
    triggers.current.get(target.key)?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = activeIndex >= 0 ? activeIndex : 0;
    if (event.key === "ArrowRight") moveTo(current + 1);
    else if (event.key === "ArrowLeft") moveTo(current - 1);
    else if (event.key === "Home") moveTo(0);
    else if (event.key === "End") moveTo(tabs.length - 1);
    else return;
    event.preventDefault();
  }

  return (
    <div ref={listRef} role="tablist" aria-label={label} className={className} style={style} onKeyDown={handleKeyDown} data-test-id={dataTestId}>
      {tabs.map((tab) => {
        const selected = tab.key === activeKey;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            id={tabTriggerId(idBase, tab.key)}
            aria-selected={selected}
            aria-controls={selected ? tabPanelId(idBase, tab.key) : undefined}
            tabIndex={tab.key === rovingKey ? 0 : -1}
            ref={(node) => {
              if (node) triggers.current.set(tab.key, node);
              else triggers.current.delete(tab.key);
            }}
            onClick={() => onSelect(tab.key)}
            className={tab.className}
            {...tab.dataAttributes}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export interface TabPanelProps {
  readonly idBase: string;
  readonly activeKey: string;
  readonly className?: string;
  readonly children: ReactNode;
}

/** Panel for the currently selected tab; hosts render one panel at a time. */
export function TabPanel({ idBase, activeKey, className, children }: TabPanelProps) {
  return (
    <div
      role="tabpanel"
      id={tabPanelId(idBase, activeKey)}
      aria-labelledby={tabTriggerId(idBase, activeKey)}
      tabIndex={0}
      className={className}
    >
      {children}
    </div>
  );
}
