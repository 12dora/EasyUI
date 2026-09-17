"use client";

/**
 * `ClientTable` — the in-memory list table.
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
 *
 * **Paging is local.** A list handed over in one array still must not render as
 * 800 `<tr>`: the table pages it itself (20 rows, bottom-right, `size="small"`)
 * and `hideOnSinglePage` keeps the chrome away from the short lists this table
 * was originally written for. The page index is this component's own state —
 * there is no query string to put it in — and it returns to 1 whenever the
 * visible set changes: a new `rows` array (the caller filtered or reloaded) or
 * a different header filter (a `clientSearchColumn` with a `subject` lets antd
 * filter the rows, and antd counts the *filtered* rows for the pager). Pass
 * `pagination={false}` for the old unpaginated behaviour.
 */

import { Table } from "antd";
import type { ColumnType, ColumnsType, TablePaginationConfig, TableProps } from "antd/es/table";
import type { SortOrder } from "antd/es/table/interface";
import { useState, type ReactNode } from "react";

import { EmptyState } from "../primitives/empty-state";
import { useIsPhone } from "../primitives/use-media-query";
import { filterPatch, sorterSort, type DataTableLabels } from "./data-table";
import { TableCards } from "./table-cards";
import { sortKeyOf, type TableCardsSort } from "./table-cards-columns";
import { TABLE_SCROLL, type MobileColumn } from "./table-columns";
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from "./table-query";

/** Local pager options. `false` (instead of this object) renders every row, unpaginated. */
export interface ClientTablePagination {
  /** Rows per page; defaults to `DEFAULT_PAGE_SIZE` (20). */
  pageSize?: number;
  /** Offer `PAGE_SIZE_OPTIONS` in the pager; defaults to `true`. */
  showSizeChanger?: boolean;
}

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
  /** Local pager; `false` renders all rows. Default `{ pageSize: 20, showSizeChanger: true }`. */
  pagination?: false | ClientTablePagination;
  /** 手机卡片里哪一列算动作列(默认 `"actions"`);`fixed: "right"` 的列同样算。 */
  actionsKey?: string;
  /**
   * 手机(< 768px)上的形态:`"cards"`(默认)换成卡片列表,`"table"` 保留横向滚动的表格。
   *
   * 卡片里的检索 / 筛选 / 排序 / 分页与表头同一份状态,所以来回切换不会丢页码或关键字。
   */
  mobile?: "cards" | "table";
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
  pagination = {},
  actionsKey,
  mobile = "cards",
}: ClientTableProps<T>) {
  const [paging, setPaging] = useClientPaging(rows, columns, pageSizeOf(pagination));
  // 排序状态提到这一层:卡片里选的排序,转回桌面表格后还得算数(页码同理)。
  const [sort, setSort] = useState<TableCardsSort | null>(null);
  const phone = useIsPhone();
  // 换了筛选条件,旧页码多半已经不存在了(表头那条路走 onChange,卡片这条路走这里)。
  const filtered = (filters: Record<string, string[]>) => {
    setPaging((current) => ({ ...current, page: 1 }));
    onFilters?.(filters);
  };
  if (phone && mobile === "cards") {
    return (
      <div data-test-id={testId}>
        <TableCards<T>
          testId={testId}
          columns={columns}
          sort={sort}
          onSort={setSort}
          rows={rows}
          rowKey={rowKey}
          labels={labels}
          loading={loading}
          empty={empty}
          actionsKey={actionsKey}
          rowSelection={rowSelection}
          onFilters={filtered}
          pagination={
            pagination === false
              ? false
              : {
                  current: paging.page,
                  pageSize: paging.pageSize,
                  onChange: (page, pageSize) => setPaging({ page, pageSize }),
                }
          }
        />
      </div>
    );
  }
  return (
    <div data-test-id={testId}>
      <Table<T>
        size="middle"
        scroll={TABLE_SCROLL}
        rowKey={rowKey}
        loading={loading}
        columns={withSortOrder(columns, sort)}
        dataSource={rows as T[]}
        rowSelection={rowSelection}
        pagination={pagination === false ? false : paginationOf(paging, pagination, labels)}
        locale={{
          emptyText: empty ?? <EmptyState size="compact" title={labels.empty} data-test-id={`${testId}-empty`} />,
          triggerAsc: labels.sortAsc,
          triggerDesc: labels.sortDesc,
        }}
        onChange={(nextPagination, filters, sorter, extra) => {
          if (extra.action === "paginate") {
            setPaging({ page: nextPagination.current ?? 1, pageSize: nextPagination.pageSize ?? paging.pageSize });
            return;
          }
          if (extra.action === "sort") {
            // 表头排序也写进这一份状态,受控的 sortOrder 才不会把表头点击冻住。
            setSort(sorterSort(sorter));
            return;
          }
          if (extra.action !== "filter") return;
          filtered(filterPatch(filters));
        }}
      />
    </div>
  );
}

/**
 * 把这一层持有的排序写成受控的 `sortOrder`。
 *
 * 没有排序时原样返回列定义(不复制、不接管,和这个特性上线前完全一致);一旦排过序,
 * 每个可排序列都显式给出 `sortOrder`,antd 就按它排行、画箭头 —— 于是手机卡片上选的排序
 * 转回桌面仍然成立,表头点击也继续可用(点击回写这份状态)。
 *
 * 列组要下钻:排序写在叶子列上,只扫一层的话「分组里的可排序列」在卡片上排得好好的,
 * 一转回表格就散了(卡片那边本来就是把列组拍平来读的)。
 */
function withSortOrder<T extends object>(columns: ColumnsType<T>, sort: TableCardsSort | null): ColumnsType<T> {
  if (!sort) return columns;
  return columns.map((column) => {
    const entry = column as MobileColumn<T> & { children?: ColumnsType<T> };
    if (entry.children && entry.children.length > 0) {
      return { ...entry, children: withSortOrder(entry.children, sort) } as ColumnsType<T>[number];
    }
    if (!entry.sorter) return column;
    const matched = sortKeyOf(entry) === sort.key;
    const order: SortOrder = matched ? (sort.order === "asc" ? "ascend" : "descend") : null;
    return { ...entry, sortOrder: order };
  });
}

/** Where the pager sits: bottom-right, compact, and gone entirely on a single page. */
function paginationOf(
  paging: ClientPaging,
  pagination: ClientTablePagination,
  labels: DataTableLabels,
): TablePaginationConfig {
  return {
    current: paging.page,
    pageSize: paging.pageSize,
    showSizeChanger: pagination.showSizeChanger ?? true,
    pageSizeOptions: [...PAGE_SIZE_OPTIONS],
    size: "small",
    hideOnSinglePage: true,
    // antd 6 把 `position` 换成了 `placement`,用旧名每次渲染都会打一条弃用警告。
    placement: ["bottomEnd"],
    locale: { items_per_page: labels.pageSize },
  };
}

function pageSizeOf(pagination: false | ClientTablePagination): number {
  if (pagination === false) return DEFAULT_PAGE_SIZE;
  return pagination.pageSize ?? DEFAULT_PAGE_SIZE;
}

interface ClientPaging {
  page: number;
  pageSize: number;
}

/** Separators that cannot occur inside a filter value, so the key stays unambiguous. */
const VALUE_SEPARATOR = "\u0000";
const COLUMN_SEPARATOR = "\u0001";

/**
 * Which rows are on screen: the controlled header filters of every column.
 *
 * A `filterColumn` / `clientSearchColumn` carries its current selection as
 * `filteredValue`, so a change here means antd is about to show a different
 * subset — even though `rows` itself did not move.
 */
function filtersKey<T extends object>(columns: ColumnsType<T>): string {
  const values = columns.map((column) => ((column as ColumnType<T>).filteredValue ?? []).join(VALUE_SEPARATOR));
  return values.join(COLUMN_SEPARATOR);
}

/**
 * Page index + page size, reset to page 1 whenever the visible set changes.
 *
 * Adjusting state during render (React's own "derive state from props" recipe)
 * rather than in an effect: page 3 of a list that just shrank to one page would
 * otherwise paint empty for a frame before the effect corrected it.
 */
function useClientPaging<T extends object>(rows: readonly T[], columns: ColumnsType<T>, pageSize: number) {
  const filters = filtersKey(columns);
  const [paging, setPaging] = useState<ClientPaging>({ page: 1, pageSize });
  const [seen, setSeen] = useState({ rows, filters, pageSize });
  if (seen.rows !== rows || seen.filters !== filters || seen.pageSize !== pageSize) {
    // 调用方改了默认页大小才跟着回到默认值,用户在分页器里选的档位不能被普通重渲染吞掉。
    const resized = seen.pageSize !== pageSize;
    setSeen({ rows, filters, pageSize });
    setPaging((current) => ({ page: 1, pageSize: resized ? pageSize : current.pageSize }));
  }
  return [paging, setPaging] as const;
}
