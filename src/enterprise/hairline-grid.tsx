"use client";

/**
 * HairlineGrid — antd Table dressed as the enterprise surfaces' original
 * hand-rolled hairline tables (12px text, 8px cell padding, transparent
 * header, hairline row separators, no hover tint, plain-text empty state).
 *
 * Internal to src/enterprise — not exported from any barrel. The contract is
 * **visual parity** with the previous raw `<table>` implementation: any
 * styling change here must be deliberate, never an antd default leaking
 * through. Requires antd ≥ 6.5 (the package's optional peer becomes required
 * for hosts that render the enterprise surfaces using it).
 */
import { ConfigProvider, Table } from "antd";
import type { TableProps } from "antd";
import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

/**
 * Resolved defaults for hosts on the stock theme.css palette — same approach
 * as CONTROL_STATE in control-tokens.ts (antd's JS theme API needs concrete
 * colours; fonts can stay on the CSS variable).
 */
const INK = "#0F172A"; // --ink
const INK_FAINT = "#64748B"; // --ink-faint
const HAIRLINE = "#E2E8F0"; // --hairline (header bottom border)
const HAIRLINE_SOFT = "#F1F5F9"; // --hairline-soft (row separators)

export interface HairlineGridProps<RecordType extends object>
  extends Pick<
    TableProps<RecordType>,
    "columns" | "dataSource" | "rowKey" | "showHeader" | "className" | "style"
  > {
  /** Empty-state copy; rendered like the previous `<p class="p-4 text-center text-ink-faint">` block. */
  empty: ReactNode;
  /**
   * Pin the header row to the top of the caller's fixed-height scroll viewport.
   * CSS `position: sticky` only takes effect on `<th>`/`<td>`, never on the
   * `<tr>` around them, and the header row is owned by antd — so callers cannot
   * reach those cells from the outside. Columns keep their own `onHeaderCell`
   * (e.g. `hairlineHeaderCell`); STICKY_HEADER_CELL is merged over its style.
   *
   * Pass it only while the list has rows: an uncapped empty state has nothing
   * to stick to, and a sticky cell there is dead weight.
   */
  stickyHeader?: boolean;
}

type HeaderCellFn = (...args: never[]) => HTMLAttributes<HTMLElement>;

/**
 * Inline style, deliberately — **not** a `sticky top-0 z-10 bg-paper` utility
 * class. antd ships `.ant-table-wrapper .ant-table-thead >tr>th` — two classes
 * plus two element selectors (0-2-2) — which sets `position: relative` and a
 * `background` of its own; a utility class on the same cell is 0-1-0 and loses
 * the cascade outright, so the header silently scrolls away with antd's own
 * styling. The `style` attribute is not part of that contest: it outranks every
 * stylesheet rule short of `!important`, and antd marks none of these
 * `!important`.
 *
 * The background must be opaque or body rows scroll through the pinned row —
 * the ConfigProvider below sets `headerBg: "transparent"` for the unpinned
 * case. `rgb(var(--paper))` keeps the host's theme in charge, exactly as the
 * `bg-paper` class did.
 */
const STICKY_HEADER_CELL: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 10,
  background: "rgb(var(--paper))",
};

/**
 * The raw tables drew a stronger hairline under the header row than between
 * body rows; antd only has one `borderColor`, so header cells override it
 * inline. Spread into every column: `onHeaderCell: hairlineHeaderCell`.
 */
export function hairlineHeaderCell() {
  return { style: { borderBottomColor: HAIRLINE } };
}

export function HairlineGrid<RecordType extends object>({
  empty,
  stickyHeader,
  columns,
  ...tableProps
}: HairlineGridProps<RecordType>) {
  const mergedColumns = stickyHeader && columns
    ? columns.map((column) => {
        const existing = (column as { onHeaderCell?: HeaderCellFn }).onHeaderCell;
        return {
          ...column,
          onHeaderCell: (...args: never[]) => {
            const base = existing ? existing(...args) : {};
            // Column style first: `hairlineHeaderCell`'s borderBottomColor survives.
            return { ...base, style: { ...base.style, ...STICKY_HEADER_CELL } };
          },
        };
      }) as typeof columns
    : columns;
  return (
    <ConfigProvider
      theme={{
        token: {
          // Follow the host page font (theme.css) instead of antd's stack.
          fontFamily: "var(--font-sans)",
          fontSize: 12,
          colorText: INK,
          // Raw <th> rendered browser-bold (700); antd headers default to 600.
          fontWeightStrong: 700,
        },
        components: {
          Table: {
            colorBgContainer: "transparent",
            headerBg: "transparent",
            headerColor: INK_FAINT,
            headerSplitColor: "transparent",
            borderColor: HAIRLINE_SOFT,
            rowHoverBg: "transparent",
            cellPaddingBlock: 8,
            cellPaddingInline: 8,
            headerBorderRadius: 0,
            cellFontSize: 12,
          },
        },
      }}
    >
      <Table<RecordType>
        {...tableProps}
        columns={mergedColumns}
        pagination={false}
        locale={{ emptyText: <p className="p-4 text-center text-ink-faint">{empty}</p> }}
      />
    </ConfigProvider>
  );
}
