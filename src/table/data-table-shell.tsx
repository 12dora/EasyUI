"use client";

/**
 * DataTableShell — the EasyUI boundary wrapper around antd Table/Pagination.
 *
 * Contract:
 *   - Server-side pagination: the `pagination` prop mirrors the standard
 *     response envelope (`page` starts at 1);
 *   - Sort changes are emitted as a `field:asc|desc` comma-joined string
 *     (matching the x-conventions `sort` query parameter; the backend owns
 *     the field whitelist);
 *   - Host pages provide columns/dataSource/pagination + callbacks and never
 *     touch the rest of antd Table's global behaviour directly (loading
 *     skeleton and empty-state copy are normalised here).
 *
 * antd is an **optional peer** of this package: import this module via the
 * dedicated `@easy-enterprise/ui/table` entry so antd-less hosts stay clean.
 */
import { Table, type TableProps } from "antd";
import type { FilterValue } from "antd/es/table/interface";

/**
 * Standard pagination envelope. `totalPages` is accepted (hosts usually pass
 * the envelope through verbatim) but derived state is never read from it.
 */
export interface DataTablePagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages?: number;
}

export interface DataTableShellProps<RecordType extends object>
  extends Pick<
    TableProps<RecordType>,
    | "columns"
    | "dataSource"
    | "rowKey"
    | "loading"
    | "size"
    | "scroll"
    | "expandable"
    | "rowSelection"
    // Row-level interaction (whole-row expand toggles, row-state classes) is
    // passed through too: `useAnimatedExpand` produces onRow/rowClassName that
    // must reach the antd Table, while host pages still never hold the Table.
    | "onRow"
    | "rowClassName"
  > {
  /** Envelope pagination; omit to disable paging (e.g. small inline tables). */
  pagination?: DataTablePagination;
  onPageChange?: (page: number, pageSize: number) => void;
  /**
   * Sort change → `field:asc,field2:desc` (x-conventions; the backend owns the
   * field whitelist). `null` means the sort was cleared.
   */
  onSortChange?: (sort: string | null) => void;
  /**
   * Column-header filter change → `{ [columnKey]: selected[] | null }`
   * (`null` = that column was cleared).
   *
   * Filtering is always **server-side**: the host page writes the callback
   * result into its own URL state, and the URL state drives the API query.
   * Columns must set a controlled `filteredValue`, otherwise back/forward and
   * deep links drift out of sync with the header UI. Columns bound to a
   * single-value query parameter should set `filterMultiple: false`.
   */
  onFilterChange?: (filters: Record<string, FilterValue | null>) => void;
  emptyText?: React.ReactNode;
  "data-test-id"?: string;
}

export function DataTableShell<RecordType extends object>({
  pagination,
  onPageChange,
  onSortChange,
  onFilterChange,
  emptyText,
  "data-test-id": dataTestId,
  ...tableProps
}: DataTableShellProps<RecordType>) {
  return (
    <div data-test-id={dataTestId}>
      <Table<RecordType>
        {...tableProps}
        locale={emptyText !== undefined ? { emptyText } : undefined}
        pagination={
          pagination
            ? {
                current: pagination.page,
                pageSize: pagination.pageSize,
                total: pagination.totalItems,
                showSizeChanger: true,
                onChange: (page, pageSize) => onPageChange?.(page, pageSize),
              }
            : false
        }
        onChange={(_pagination, filters, sorter, extra) => {
          // Paging has its own onChange (above); only sort/filter actions are
          // handled here so page turns never re-emit the same sort/filter
          // (which would mean redundant history entries and requests).
          if (extra.action === "filter") {
            onFilterChange?.(filters);
            return;
          }
          if (extra.action !== "sort" || !onSortChange) return;
          const list = Array.isArray(sorter) ? sorter : [sorter];
          const parts = list
            .filter((s) => s.order && s.field)
            .map((s) => `${String(s.field)}:${s.order === "ascend" ? "asc" : "desc"}`);
          onSortChange(parts.length > 0 ? parts.join(",") : null);
        }}
      />
    </div>
  );
}
