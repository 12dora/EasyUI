"use client";

/**
 * `TableCards` —— 列表表格在手机上的第二种形态。
 *
 * 手机屏放不下一张横向表格:`TABLE_SCROLL` 让列保持宽度、横向滚动,于是标题列被裁掉、
 * 右侧固定的动作列压着内容,一屏只剩四行。卡片模式把**同一份列定义**换个排法:
 * 第一列(或 `mobile: "title"` 的列)当标题,其余列变成两列定义表,动作列落到卡片底部,
 * 表头上的检索 / 筛选 / 排序搬进上方工具条。宿主什么都不用改,列定义原样复用。
 *
 * 状态契约和表头完全一致:筛选走 `onFilters`(一次改动带上全部受控筛选列),服务端排序
 * 走 `onSort`;`ClientTable` / `DataTable` 把它们接到自己原有的那条路上,所以手机上的
 * 一次操作与桌面表头的一次操作在 URL、请求、回退键上不可区分。
 *
 * 行过滤与行排序在客户端模式下由这里做(表格模式下是 antd 干的):列上有 `onFilter` /
 * `sorter` 函数就照用,`sorter: true` 的服务端列则原样保留后端给的顺序。
 */

import { Checkbox, Pagination } from "antd";
import type { ColumnsType, TableProps } from "antd/es/table";
import type { RowSelectMethod } from "antd/es/table/interface";
import { Fragment, useState, type Key, type ReactNode } from "react";

import { EmptyState } from "../primitives/empty-state";
import type { DataTableLabels } from "./data-table";
import {
  DEFAULT_ACTIONS_KEY,
  cellOf,
  cellText,
  columnKeyOf,
  columnSort,
  columnTitleNode,
  filterRows,
  isEmptyCell,
  rowKeyOf,
  sortRows,
  splitColumns,
  type CardColumns,
  type CardRowKey,
  type TableCardsSort,
} from "./table-cards-columns";
import { DEFAULT_TABLE_CARDS_LABELS, TableCardsToolbar } from "./table-cards-toolbar";

export { DEFAULT_TABLE_CARDS_LABELS, type TableCardsLabels } from "./table-cards-toolbar";
export type { TableCardsSort } from "./table-cards-columns";

/**
 * 卡片分页。
 *
 * 给了 `total` 就是服务端分页:`rows` 已经是当前页,卡片不再本地切片。不给 `total` 时
 * `rows` 是全量,卡片按 `current` / `pageSize` 自己切(`ClientTable` 的本地分页)。
 */
export interface TableCardsPagination {
  current: number;
  pageSize: number;
  total?: number;
  onChange: (page: number, pageSize: number) => void;
}

export interface TableCardsProps<T extends object> {
  /** 表格根的 test id;卡片根是 `<testId>-cards`,空状态仍是 `<testId>-empty`。 */
  testId: string;
  columns: ColumnsType<T>;
  rows: readonly T[];
  rowKey: TableProps<T>["rowKey"];
  labels: DataTableLabels;
  loading?: boolean;
  /** 空节点;默认与表格共用的 `EmptyState`。 */
  empty?: ReactNode;
  /** 动作列的 key,默认 `"actions"`;`fixed: "right"` 的列同样算动作列。 */
  actionsKey?: string;
  rowSelection?: TableProps<T>["rowSelection"];
  /** 检索 / 筛选改动:与 antd 表头 `onChange` 同一口径(按 param 给出全部受控筛选列)。 */
  onFilters?: (filters: Record<string, string[]>) => void;
  /**
   * 受控排序的当前值,和 `onSort` 一起给。
   *
   * 省略时(但给了 `onSort`)从列上的 `sortOrder` 读 —— 服务端表格的排序本来就写在列上。
   * `ClientTable` 则把状态提到自己那一层再传下来,于是手机转桌面时排序不会丢。
   */
  sort?: TableCardsSort | null;
  /** 排序改动;不给就由卡片自己记一份(独立使用 `TableCards` 时)。 */
  onSort?: (sort: TableCardsSort | null) => void;
  /**
   * 排序下拉是否保留"未排序"这一项,默认 `true`。
   *
   * `DataTable` 传 `false`:URL 没有"显式未排序"这个槽位,清掉排序下次刷新又会被默认排序
   * 顶回来(与表头"第三次点击 = 翻向"同一条规矩)。
   */
  sortClearable?: boolean;
  pagination?: false | TableCardsPagination;
}

export function TableCards<T extends object>({
  testId,
  columns,
  rows,
  rowKey,
  labels,
  loading = false,
  empty,
  actionsKey = DEFAULT_ACTIONS_KEY,
  rowSelection,
  onFilters,
  sort,
  onSort,
  sortClearable = true,
  pagination = false,
}: TableCardsProps<T>) {
  const cardsId = `${testId}-cards`;
  const cardColumns = splitColumns(columns, actionsKey);
  const cardLabels = { ...DEFAULT_TABLE_CARDS_LABELS, ...labels.cards };
  const [localSort, setLocalSort] = useState<TableCardsSort | null>(null);
  // 受控排序看调用方给的值(没给就从列上的 sortOrder 读);没人接管就自己记一份。
  const active = onSort ? (sort === undefined ? columnSort(columns) : sort) : localSort;
  const visible = sortRows(filterRows(rows, columns), columns, active);
  const paged = pageRows(visible, pagination);
  const keys = new Map<T, CardRowKey>(rows.map((row, index) => [row, rowKeyOf(rowKey, row, index)]));
  const selection = selectionOf(rowSelection, rows, keys);
  return (
    <div data-test-id={cardsId} aria-busy={loading} className={loading ? "opacity-60" : undefined}>
      <TableCardsToolbar
        testId={cardsId}
        columns={columns}
        labels={labels}
        cardLabels={cardLabels}
        onFilters={onFilters}
        sort={active}
        clearable={sortClearable}
        onSortChange={(next) => {
          setLocalSort(next);
          onSort?.(next);
        }}
      />
      <SelectAllRow label={cardLabels.selectAll} testId={cardsId} rows={paged} keys={keys} selection={selection} />
      <CardsBody
        testId={testId}
        cardsId={cardsId}
        rows={paged}
        keys={keys}
        columns={cardColumns}
        selection={selection}
        selectLabel={cardLabels.select}
        emptyLabel={labels.empty}
        empty={empty}
        loading={loading}
      />
      <CardsPager testId={cardsId} pagination={pagination} visible={visible.length} />
    </div>
  );
}

interface BodyProps<T extends object> {
  testId: string;
  cardsId: string;
  rows: readonly T[];
  keys: Map<T, CardRowKey>;
  columns: CardColumns<T>;
  selection: CardsSelection<T> | null;
  selectLabel: string;
  emptyLabel: string;
  empty?: ReactNode;
  loading: boolean;
}

/**
 * 卡片流本身。空列表落到与表格共用的那个空状态(test id 也还是 `<testId>-empty`),但
 * **正在加载时不许出空状态** —— 首屏还没拿到数据就告诉用户"暂无数据"是假话,表格那边
 * antd 也是用 loading 遮罩盖住的。
 */
function CardsBody<T extends object>({
  testId,
  cardsId,
  rows,
  keys,
  columns,
  selection,
  selectLabel,
  emptyLabel,
  empty,
  loading,
}: BodyProps<T>) {
  if (rows.length === 0 && loading) return <CardsSkeleton testId={cardsId} />;
  if (rows.length === 0) {
    return empty ?? <EmptyState size="compact" title={emptyLabel} data-test-id={`${testId}-empty`} />;
  }
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {rows.map((record, index) => (
        <TableCard
          key={String(keys.get(record) ?? index)}
          record={record}
          index={index}
          rowKeyValue={keys.get(record) ?? index}
          columns={columns}
          testId={cardsId}
          selection={selection}
          selectLabel={selectLabel}
        />
      ))}
    </ul>
  );
}

/** 加载占位:三张空卡,和真实卡片一样高,避免列表在加载结束时整块跳动。 */
function CardsSkeleton({ testId }: { testId: string }) {
  return (
    <div className="flex flex-col gap-2" data-test-id={`${testId}-loading`} aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <div key={index} className="paper-card p-3">
          <div className="animate-shimmer h-4 w-1/2 rounded-[3px]" />
          <div className="animate-shimmer mt-2 h-3 w-3/4 rounded-[3px]" />
        </div>
      ))}
    </div>
  );
}

interface CardProps<T extends object> {
  record: T;
  index: number;
  rowKeyValue: CardRowKey;
  columns: CardColumns<T>;
  testId: string;
  selection: CardsSelection<T> | null;
  selectLabel: string;
}

/** 一行 = 一张卡:标题行(可带选择框)、定义表、底部动作行。 */
function TableCard<T extends object>({
  record,
  index,
  rowKeyValue,
  columns,
  testId,
  selection,
  selectLabel,
}: CardProps<T>) {
  const fields = columns.fields
    .map((column) => ({ column, cell: cellOf(column, record, index) }))
    .filter((entry) => !isEmptyCell(entry.cell));
  const actions = columns.actions
    .map((column) => ({ column, cell: cellOf(column, record, index) }))
    .filter((entry) => !isEmptyCell(entry.cell));
  const titleCell = columns.title ? cellOf(columns.title, record, index) : null;
  return (
    <li className="paper-card p-3" data-row-key={String(rowKeyValue)} data-test-id={`${testId}-card`}>
      <div className="flex items-start gap-2">
        {selection && (
          <Checkbox
            checked={selection.keys.includes(rowKeyValue)}
            disabled={selection.disabled(record)}
            // 一屏几十个同样的方框,读屏必须能说出勾的是哪一行。
            aria-label={`${selectLabel} ${cellText(titleCell) ?? String(rowKeyValue)}`}
            data-test-id={`${testId}-select-${String(rowKeyValue)}`}
            onChange={(event) => selection.toggle(record, event.target.checked)}
          />
        )}
        <div className="min-w-0 flex-1 text-[14px] leading-5 font-medium break-words text-ink">{titleCell}</div>
      </div>
      {fields.length > 0 && (
        <dl className="mt-2 mb-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          {fields.map(({ column, cell }) => (
            <Fragment key={columnKeyOf(column)}>
              <dt className="text-[12px] leading-5 text-ink-faint">{columnTitleNode(column)}</dt>
              <dd className="m-0 min-w-0 text-[13px] leading-5 break-words text-ink">{cell}</dd>
            </Fragment>
          ))}
        </dl>
      )}
      {actions.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
          {actions.map((entry) => (
            <Fragment key={columnKeyOf(entry.column)}>{entry.cell}</Fragment>
          ))}
        </div>
      )}
    </li>
  );
}

interface SelectAllProps<T extends object> {
  label: string;
  testId: string;
  rows: readonly T[];
  keys: Map<T, CardRowKey>;
  selection: CardsSelection<T> | null;
}

/**
 * 本页全选 —— 表格里是表头那一格,卡片里就得单独有一行。
 *
 * 只数**可选**的行:被 `getCheckboxProps` 禁用的行既不该被全选勾上,也不该让"全选"永远
 * 停在半选态。`hideSelectAll` 与表格一样直接把这一行藏掉。
 */
function SelectAllRow<T extends object>({ label, testId, rows, keys, selection }: SelectAllProps<T>) {
  if (!selection || selection.hideSelectAll) return null;
  const selectable = rows.filter((row) => !selection.disabled(row));
  if (selectable.length === 0) return null;
  const pageKeys = selectable.map((row, index) => keys.get(row) ?? index);
  const selected = pageKeys.filter((key) => selection.keys.includes(key));
  return (
    <div className="mb-2 flex items-center gap-2 text-[12px] text-ink-soft">
      <Checkbox
        checked={selected.length > 0 && selected.length === pageKeys.length}
        indeterminate={selected.length > 0 && selected.length < pageKeys.length}
        data-test-id={`${testId}-select-all`}
        onChange={(event) => selection.toggleAll(selectable, event.target.checked)}
      >
        {label}
      </Checkbox>
    </div>
  );
}

interface PagerProps {
  testId: string;
  pagination: false | TableCardsPagination;
  /** 本地可见行数,服务端分页(带 `total`)时用不到。 */
  visible: number;
}

/**
 * 底部居中的简版分页。
 *
 * 本地分页(没有 `total`)时一页放得下就整个不出现,和 `ClientTable` 的 `hideOnSinglePage`
 * 同义;服务端分页(有 `total`)则始终显示 —— 桌面的 `DataTable` 也从不隐藏分页器,页码是
 * 那张表的状态的一部分。
 */
function CardsPager({ testId, pagination, visible }: PagerProps) {
  if (!pagination) return null;
  const server = pagination.total !== undefined;
  const total = pagination.total ?? visible;
  if (!server && total <= pagination.pageSize) return null;
  return (
    <div className="mt-3 flex justify-center" data-test-id={`${testId}-pagination`}>
      <Pagination
        size="small"
        simple
        current={pagination.current}
        pageSize={pagination.pageSize}
        total={total}
        onChange={(page, pageSize) => pagination.onChange(page, pageSize)}
      />
    </div>
  );
}

interface CardsSelection<T extends object> {
  keys: Key[];
  toggle: (record: T, checked: boolean) => void;
  toggleAll: (records: readonly T[], checked: boolean) => void;
  disabled: (record: T) => boolean;
  hideSelectAll: boolean;
}

/** `rowSelection` 的读写两端:选中集合来自 `selectedRowKeys`,改动原样喂回 `onChange`。 */
function selectionOf<T extends object>(
  rowSelection: TableProps<T>["rowSelection"],
  rows: readonly T[],
  keys: Map<T, CardRowKey>,
): CardsSelection<T> | null {
  if (!rowSelection) return null;
  const selected = [...(rowSelection.selectedRowKeys ?? [])];
  const emit = (next: Key[], type: RowSelectMethod) => {
    const chosen = new Set<Key>(next);
    rowSelection.onChange?.(
      next,
      rows.filter((row) => {
        const key = keys.get(row);
        return key !== undefined && chosen.has(key);
      }),
      { type },
    );
  };
  const disabled = (record: T) => rowSelection.getCheckboxProps?.(record)?.disabled === true;
  return {
    keys: selected,
    disabled,
    hideSelectAll: rowSelection.hideSelectAll === true,
    toggle: (record, checked) => {
      const key = keys.get(record);
      if (key === undefined) return;
      emit(checked ? [...selected, key] : selected.filter((entry) => entry !== key), "single");
    },
    toggleAll: (records, checked) => {
      const pageKeys = records.filter((record) => !disabled(record)).flatMap((record) => keys.get(record) ?? []);
      const onPage = new Set<Key>(pageKeys);
      const rest = selected.filter((key) => !onPage.has(key));
      emit(checked ? [...rest, ...pageKeys] : rest, "all");
    },
  };
}

/** 本地分页的那一刀;服务端分页(带 `total`)时 `rows` 已经是当前页。 */
function pageRows<T>(rows: readonly T[], pagination: false | TableCardsPagination): readonly T[] {
  if (!pagination || pagination.total !== undefined) return rows;
  const start = Math.max(0, (pagination.current - 1) * pagination.pageSize);
  return rows.slice(start, start + pagination.pageSize);
}
