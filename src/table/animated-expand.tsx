"use client";

/**
 * useAnimatedExpand — enter/leave animation + whole-row click toggling for
 * antd Table tree child rows.
 *
 * Why this exists (antd ≥ 6.5):
 *   1. Tree child rows from `expandable.childrenColumnName` mount/unmount
 *      their `<tr>` directly — antd's own motion only covers the extra row
 *      rendered by `expandedRowRender`, so collapsing a tree row snaps shut
 *      with no transition and no class hook to attach one to;
 *   2. `expandRowByClick` can only toggle the whole row, runs before any
 *      host logic (links/buttons inside the row get swallowed — clicking a
 *      title would navigate *and* expand), and cannot express a two-phase
 *      collapse.
 * So this hook keeps **controlled** `expandedRowKeys` with a two-phase
 * collapse (tag child rows with a leaving class first, remove the key only
 * after the animation ran). The matching keyframes live in `table.css`
 * (import `@easy-enterprise/ui/table.css` once from the host stylesheet).
 *
 * Tree/grouped tables share this one mechanism — host pages only consume the
 * returned `expandable` / `rowClassName` / `onRow` triple.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import type { TableProps } from "antd";
import type { ExpandableConfig } from "antd/es/table/interface";

/** Collapse animation duration (ms). **Must** match the keyframes in table.css. */
export const ANIMATED_EXPAND_DURATION_MS = 180;

/** Elements with their own semantics (links/buttons/inputs/menu items) must not toggle expansion. */
const INTERACTIVE_SELECTOR = 'a,button,input,select,textarea,[role="menuitem"]';

export interface UseAnimatedExpandOptions<RecordType> {
  /** Row primary key; must return the same value as the Table's `rowKey`. */
  rowKey: (record: RecordType) => React.Key;
  /** Whether the row is an expandable parent (only parents get cursor-pointer + whole-row toggling). */
  isParent: (record: RecordType) => boolean;
  /** Key of the row's parent; top-level rows return null. Used to detect "parent is collapsing". */
  parentRowKey?: (record: RecordType) => React.Key | null;
  /** Override the animation duration (the CSS must change too; normally leave unset). */
  durationMs?: number;
  /** Accessible name for the expand button (host passes localized copy). */
  expandLabel?: string;
}

export interface AnimatedExpand<RecordType> {
  /** Currently expanded parent keys (still present while collapsing; removed after the animation). */
  expandedRowKeys: React.Key[];
  /** "Logically open" = expanded and not mid-collapse (the arrow orientation follows this). */
  isOpen: (key: React.Key) => boolean;
  /** Toggle a parent row; collapsing plays the animation before actually folding. */
  toggle: (key: React.Key) => void;
  /** Controlled-expansion triple; hosts spread their own childrenColumnName / indentSize on top. */
  expandable: Pick<
    ExpandableConfig<RecordType>,
    "expandedRowKeys" | "onExpand" | "expandIcon"
  >;
  rowClassName: (record: RecordType) => string;
  onRow: NonNullable<TableProps<RecordType>["onRow"]>;
}

/** Accessibility preference: with `reduce`, skip the animation and collapse immediately (SSR = "no preference"). */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function useAnimatedExpand<RecordType>({
  rowKey,
  isParent,
  parentRowKey,
  durationMs = ANIMATED_EXPAND_DURATION_MS,
  expandLabel,
}: UseAnimatedExpandOptions<RecordType>): AnimatedExpand<RecordType> {
  // Default fully collapsed: group rows start as a single line (no defaultExpandedRowKeys).
  const [expandedRowKeys, setExpandedRowKeys] = useState<React.Key[]>([]);
  // Parents whose collapse animation is running: child rows stay mounted with the leaving class.
  const [closingKeys, setClosingKeys] = useState<React.Key[]>([]);
  const timers = useRef(new Map<React.Key, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const pending = timers.current;
    return () => {
      // Clear unfinished collapse timers on unmount to avoid setState on an unmounted component.
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const toggle = useCallback(
    (key: React.Key) => {
      const pending = timers.current.get(key);
      if (pending) {
        // Clicking again mid-collapse = cancel: swapping back to the entering class replays the enter animation.
        clearTimeout(pending);
        timers.current.delete(key);
        setClosingKeys((prev) => prev.filter((k) => k !== key));
        return;
      }
      if (!expandedRowKeys.includes(key)) {
        setExpandedRowKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
        return;
      }
      if (prefersReducedMotion()) {
        setExpandedRowKeys((prev) => prev.filter((k) => k !== key));
        return;
      }
      // Two-phase collapse: tag with the leaving class first, remove the key only after durationMs.
      setClosingKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
      const timer = setTimeout(() => {
        timers.current.delete(key);
        setExpandedRowKeys((prev) => prev.filter((k) => k !== key));
        setClosingKeys((prev) => prev.filter((k) => k !== key));
      }, durationMs);
      timers.current.set(key, timer);
    },
    [expandedRowKeys, durationMs],
  );

  const isOpen = useCallback(
    (key: React.Key) => expandedRowKeys.includes(key) && !closingKeys.includes(key),
    [expandedRowKeys, closingKeys],
  );

  const rowClassName = useCallback(
    (record: RecordType): string => {
      if (isParent(record)) return "cursor-pointer";
      const parent = parentRowKey?.(record) ?? null;
      if (parent === null) return "";
      // Child rows only exist while the parent is expanded → mount plays enter; a collapsing parent swaps to leave.
      return closingKeys.includes(parent) ? "eui-tree-row-leave" : "eui-tree-row-enter";
    },
    [isParent, parentRowKey, closingKeys],
  );

  const onRow = useCallback<NonNullable<TableProps<RecordType>["onRow"]>>(
    (record: RecordType) => {
      if (!isParent(record)) return {};
      return {
        onClick: (event: React.MouseEvent<HTMLElement>) => {
          const target = event.target as HTMLElement | null;
          // In-row links/buttons carry their own semantics (clicking a title = navigate), never toggle too.
          if (target?.closest(INTERACTIVE_SELECTOR)) return;
          toggle(rowKey(record));
        },
      };
    },
    [isParent, rowKey, toggle],
  );

  const expandIcon = useCallback<NonNullable<ExpandableConfig<RecordType>["expandIcon"]>>(
    ({ record, expandable }) => {
      // Geometry matches antd's default icon (float:left + 16px box + 8px right gap): rc-table lays the
      // indent span, the icon and the column render output flat inside one td, floating the icon so the
      // text yields. Leaf rows must render an equal-width placeholder or their first column shifts left
      // by one arrow width relative to parent rows.
      if (!expandable) return <span className="float-left mt-1 mr-2 block h-4 w-4" />;
      const open = isOpen(rowKey(record));
      return (
        <button
          type="button"
          aria-label={expandLabel}
          aria-expanded={open}
          className="float-left mt-1 mr-2 inline-flex h-4 w-4 items-center justify-center text-ink-faint hover:text-ink"
          onClick={(event) => {
            // The icon is its own toggle entry point; bubbling to the row would double-toggle (open+close).
            event.stopPropagation();
            toggle(rowKey(record));
          }}
        >
          <svg
            viewBox="0 0 12 12"
            aria-hidden="true"
            className={`h-3 w-3 transition-transform duration-200 ease-out ${
              open ? "rotate-90" : "rotate-0"
            }`}
          >
            <path
              d="M4.5 2.5 L8 6 L4.5 9.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      );
    },
    [expandLabel, isOpen, rowKey, toggle],
  );

  return {
    expandedRowKeys,
    isOpen,
    toggle,
    expandable: {
      expandedRowKeys,
      // The custom icon already owns clicks; onExpand is only the fallback for antd's other trigger paths.
      onExpand: (_expanded, record) => toggle(rowKey(record)),
      expandIcon,
    },
    rowClassName,
    onRow,
  };
}
