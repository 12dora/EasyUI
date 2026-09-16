"use client";

/**
 * `DataTable` — the server-paginated list table.
 *
 * Every list page goes through here: search / filter / sort live in the header
 * only (the three decorators in `table-columns.tsx`), the state lives in a
 * `TableQuery` only, and the table itself holds none of it — one header action
 * becomes one patch handed to the query hook, which updates the URL and the
 * request together.
 *
 * **Why this renders antd `Table` directly instead of `DataTableShell`.** The
 * shell is the lower-level, three-state boundary: it emits a comma-joined
 * multi-column sort string and `null` for "sort cleared", and it owns its
 * pagination config outright. A list page needs the opposite on all three
 * counts — a single `TableSort`, a "never clear, flip instead" policy (the URL
 * has no way to express *explicitly unsorted*: an absent `sort` is the table's
 * default sort, so clearing would silently come back on the next refresh), and
 * a pagination block the caller can extend (`pageSizeOptions`, `items_per_page`
 * copy, `showSizeChanger: false`). Both wrappers stay; hosts that want the
 * third sort state keep using `DataTableShell`.
 */

import { Table } from "antd";
import type { ColumnType, ColumnsType, TablePaginationConfig, TableProps } from "antd/es/table";
import type { FilterValue, SorterResult, TableCurrentDataSource } from "antd/es/table/interface";
import { useEffect, useRef, type ReactNode } from "react";

import { EmptyState } from "../primitives/empty-state";
import { TABLE_SCROLL, type TableHeaderLabels } from "./table-columns";
import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  type Page,
  type TableQuery,
  type TableQueryPatch,
  type TableSort,
} from "./table-query";

/** Copy for the whole table — hosts pass one object from their message catalogue. */
export interface DataTableLabels extends TableHeaderLabels {
  sortAsc: string;
  sortDesc: string;
  empty: string;
  pageSize: string;
}

/**
 * A fixed-right actions column. The kit does not ship a row menu: hosts render
 * their own (a popover, a link row, a kebab) and this only reserves the column.
 */
export interface DataTableActions<T> {
  /** Column title, usually "Actions". */
  title: ReactNode;
  /** Column width, default 120px. */
  width?: number;
  render: (row: T) => ReactNode;
  /** Test id put on each action cell's wrapper. */
  testId?: string;
}

export interface DataTableProps<T extends object> {
  /** Test id of the table root; the empty state is `<testId>-empty`. */
  testId: string;
  columns: ColumnsType<T>;
  /** Server page; `null` means "not loaded yet" (first paint or an error). */
  page: Page<T> | null;
  loading?: boolean;
  query: TableQuery;
  labels: DataTableLabels;
  rowKey: TableProps<T>["rowKey"];
  /** Empty node; defaults to an `EmptyState` carrying `labels.empty`. */
  empty?: ReactNode;
  /** Fixed-right actions column; omit for no such column. */
  actions?: DataTableActions<T>;
  rowSelection?: TableProps<T>["rowSelection"];
  /** Override the page-size options (dialog tables often start at 10). */
  pageSizeOptions?: readonly number[];
  /** Override the rest of the pagination config (e.g. `showSizeChanger: false`). */
  pagination?: Partial<TablePaginationConfig>;
}

export function DataTable<T extends object>({
  testId,
  columns,
  page,
  loading = false,
  query,
  labels,
  rowKey,
  empty,
  actions,
  rowSelection,
  pageSizeOptions,
  pagination,
}: DataTableProps<T>) {
  useClampedPage(page, query);
  return (
    <div data-test-id={testId}>
      <Table<T>
        size="middle"
        scroll={TABLE_SCROLL}
        rowKey={rowKey}
        loading={loading}
        columns={actions ? [...columns, actionsColumn(actions)] : columns}
        dataSource={page?.items ?? []}
        rowSelection={rowSelection}
        locale={{
          emptyText: empty ?? <EmptyState size="compact" title={labels.empty} data-test-id={`${testId}-empty`} />,
          triggerAsc: labels.sortAsc,
          triggerDesc: labels.sortDesc,
        }}
        pagination={{ ...paginationOf(page, query, labels, pageSizeOptions), ...pagination }}
        onChange={(nextPagination, filters, sorter, extra) => {
          const patch = changePatch(query, nextPagination, filters, sorter, extra);
          if (patch) query.apply(patch);
        }}
      />
    </div>
  );
}

/** Actions column: pinned right so it does not scroll away from its row. */
function actionsColumn<T extends object>(actions: DataTableActions<T>): ColumnType<T> {
  return {
    title: actions.title,
    key: "actions",
    width: actions.width ?? 120,
    fixed: "right",
    render: (_value: unknown, record: T) =>
      actions.testId ? <div data-test-id={actions.testId}>{actions.render(record)}</div> : actions.render(record),
  };
}

function paginationOf<T extends object>(
  page: Page<T> | null,
  query: TableQuery,
  labels: DataTableLabels,
  pageSizeOptions?: readonly number[],
): TablePaginationConfig {
  return {
    current: page?.page ?? query.query.page,
    pageSize: page?.pageSize ?? query.query.pageSize,
    total: page?.total ?? 0,
    showSizeChanger: true,
    pageSizeOptions: [...(pageSizeOptions ?? PAGE_SIZE_OPTIONS)],
    locale: { items_per_page: labels.pageSize },
  };
}

/** Last page implied by the total (an empty table still has page 1). */
function lastPageOf<T extends object>(page: Page<T> | null): number | null {
  if (!page) return null;
  const pageSize = page.pageSize > 0 ? page.pageSize : DEFAULT_PAGE_SIZE;
  return Math.max(1, Math.ceil(page.total / pageSize));
}

/**
 * Pull an out-of-range page back to the last one.
 *
 * Filtering and sorting already return to page 1, so an out-of-range page can
 * only come from outside — an old `?page=99` bookmark, a shared link, or the
 * last row on the last page being deleted. The table is then empty while the
 * pager still sits on page 99, which reads as broken. Corrected once per
 * `total / pageSize` so it cannot ping-pong with the router.
 */
function useClampedPage<T extends object>(page: Page<T> | null, query: TableQuery) {
  const lastPage = lastPageOf(page);
  const clamped = useRef<number | null>(null);
  const current = query.query.page;
  const setPage = query.setPage;
  useEffect(() => {
    if (lastPage === null || current <= lastPage) {
      clamped.current = null;
      return;
    }
    if (clamped.current === lastPage) return;
    clamped.current = lastPage;
    setPage(lastPage);
  }, [current, lastPage, setPage]);
}

/**
 * One antd `onChange` → one query patch.
 *
 * The three actions are mutually exclusive: paging only touches page / page
 * size, a filter action carries every filtered column at once (so one patch is
 * enough and the router is written once), and sorting reads only the column
 * currently in effect.
 */
export function changePatch<T>(
  query: TableQuery,
  pagination: TablePaginationConfig,
  filters: Record<string, FilterValue | null>,
  sorter: SorterResult<T> | SorterResult<T>[],
  extra: TableCurrentDataSource<T>,
): TableQueryPatch | null {
  if (extra.action === "paginate") {
    const pageSize = pagination.pageSize ?? query.query.pageSize;
    if (pageSize !== query.query.pageSize) return { pageSize, page: 1 };
    return { page: pagination.current ?? 1 };
  }
  if (extra.action === "filter") return { filters: filterPatch(filters) };
  if (extra.action === "sort") return { sort: sorterSort(sorter, query.query.sort) };
  return null;
}

/** antd's filter result → `{ param: values[] }`; an unselected column gets `[]`, which clears it. */
export function filterPatch(filters: Record<string, FilterValue | null>): Record<string, string[]> {
  const patch: Record<string, string[]> = {};
  for (const [key, values] of Object.entries(filters)) {
    patch[key] = (values ?? []).map((value) => String(value));
  }
  return patch;
}

/**
 * antd's sort result → server sort key. Multi-column sort is not used; the first
 * column with a direction wins.
 *
 * antd's third click means "clear sort", but the URL cannot express *explicitly
 * unsorted*: with no `sort` parameter the table falls back to its default sort,
 * so one refresh would quietly bring the sort back (and the header arrow would
 * jump). Clearing is therefore treated as a **direction flip** — header sorting
 * cycles between ascending and descending, the two directions `sortColumn`
 * declares.
 *
 * On a clear antd does not even say which column it was (`field` / `columnKey`
 * are both undefined); with single-column sorting it can only be the current one.
 */
export function sorterSort<T>(
  sorter: SorterResult<T> | SorterResult<T>[],
  current: TableSort | null = null,
): TableSort | null {
  const active = (Array.isArray(sorter) ? sorter : [sorter]).find((entry) => entry.order);
  if (!active) return current ? { key: current.key, order: current.order === "asc" ? "desc" : "asc" } : null;
  const key = sortKeyOf(active);
  return key ? { key, order: active.order === "ascend" ? "asc" : "desc" } : null;
}

/** The server sort key inside a sort result: `field` (i.e. `dataIndex`) first, then the column `key`. */
function sortKeyOf<T>(entry: SorterResult<T>): string {
  const field = entry.field ?? entry.columnKey;
  return Array.isArray(field) ? field.join(".") : String(field ?? "");
}
