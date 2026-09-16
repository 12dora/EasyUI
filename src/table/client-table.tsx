"use client";

/**
 * `ClientTable` — the unpaginated, in-memory list table.
 *
 * `DataTable`'s sibling: the rows are one array (API keys, import results,
 * collaborators), there is no server paging, and sorting / keyword filtering
 * happen in memory — so there is no `TableQuery` either. Everything else stays
 * identical: fixed `size="middle"`, `TABLE_SCROLL` so a narrow screen scrolls
 * horizontally instead of squeezing the columns, the shared empty state and the
 * same sort tooltips.
 *
 * Search and filtering still live in the header only: decorate columns with
 * `clientSearchColumn` / `filterColumn` and one header action comes back through
 * `onFilters`, keyed by the column's `param`. Filtering the rows is the caller's.
 */

import { Table } from "antd";
import type { ColumnsType, TableProps } from "antd/es/table";
import type { ReactNode } from "react";

import { EmptyState } from "../primitives/empty-state";
import { filterPatch, type DataTableLabels } from "./data-table";
import { TABLE_SCROLL } from "./table-columns";

export interface ClientTableProps<T extends object> {
  /** Test id of the table root; the empty state is `<testId>-empty`. */
  testId: string;
  columns: ColumnsType<T>;
  rows: readonly T[];
  loading?: boolean;
  labels: DataTableLabels;
  rowKey: TableProps<T>["rowKey"];
  /** Empty node; defaults to an `EmptyState` carrying `labels.empty`. */
  empty?: ReactNode;
  /** Header search / filter change: every filtered column at once, keyed by `param`. */
  onFilters?: (filters: Record<string, string[]>) => void;
  rowSelection?: TableProps<T>["rowSelection"];
}

export function ClientTable<T extends object>({
  testId,
  columns,
  rows,
  loading = false,
  labels,
  rowKey,
  empty,
  onFilters,
  rowSelection,
}: ClientTableProps<T>) {
  return (
    <div data-test-id={testId}>
      <Table<T>
        size="middle"
        scroll={TABLE_SCROLL}
        rowKey={rowKey}
        loading={loading}
        columns={columns}
        dataSource={rows as T[]}
        rowSelection={rowSelection}
        pagination={false}
        locale={{
          emptyText: empty ?? <EmptyState size="compact" title={labels.empty} data-test-id={`${testId}-empty`} />,
          triggerAsc: labels.sortAsc,
          triggerDesc: labels.sortDesc,
        }}
        onChange={(_pagination, filters, _sorter, extra) => {
          if (extra.action === "filter") onFilters?.(filterPatch(filters));
        }}
      />
    </div>
  );
}
