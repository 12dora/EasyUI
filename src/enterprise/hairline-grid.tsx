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
import type { ReactNode } from "react";

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
}

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
  ...tableProps
}: HairlineGridProps<RecordType>) {
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
        pagination={false}
        locale={{ emptyText: <p className="p-4 text-center text-ink-faint">{empty}</p> }}
      />
    </ConfigProvider>
  );
}
