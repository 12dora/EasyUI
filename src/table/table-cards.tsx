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
  columnKeyOf,
  columnSort,
  columnTitleNode,
  filterRows,
  isEmptyCell,
  rowKeyOf,
  sortRows,
  splitColumns,
  type CardColumns,
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
  /** 受控排序(服务端):给了就由列上的 `sortOrder` 决定当前值,改动交回调用方落到查询里。 */
  onSort?: (sort: TableCardsSort | null) => void;
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
  onSort,
  pagination = false,
}: TableCardsProps<T>) {
  const cardsId = `${testId}-cards`;
  const cardColumns = splitColumns(columns, actionsKey);
  const cardLabels = labels.cards ?? DEFAULT_TABLE_CARDS_LABELS;
  const [localSort, setLocalSort] = useState<TableCardsSort | null>(null);
  // 服务端排序是受控的(列上带 sortOrder);客户端排序没人替我们记,所以自己记一份。
  const sort = onSort ? columnSort(columns) : localSort;
  const visible = sortRows(filterRows(rows, columns), columns, sort);
  const paged = pageRows(visible, pagination);
  const keys = new Map(rows.map((row, index) => [row, rowKeyOf(rowKey, row, index)]));
  const selection = selectionOf(rowSelection, rows, keys);
  return (
    <div data-test-id={cardsId} aria-busy={loading} className={loading ? "opacity-60" : undefined}>
      <TableCardsToolbar
        testId={cardsId}
        columns={columns}
        labels={labels}
        cardLabels={cardLabels}
        onFilters={onFilters}
        sort={sort}
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
        emptyLabel={labels.empty}
        empty={empty}
      />
      <CardsPager testId={cardsId} pagination={pagination} visible={visible.length} />
    </div>
  );
}

interface BodyProps<T extends object> {
  testId: string;
  cardsId: string;
  rows: readonly T[];
  keys: Map<T, Key>;
  columns: CardColumns<T>;
  selection: CardsSelection<T> | null;
  emptyLabel: string;
  empty?: ReactNode;
}

/** 卡片流本身;空列表落到与表格共用的那个空状态(test id 也还是 `<testId>-empty`)。 */
function CardsBody<T extends object>({
  testId,
  cardsId,
  rows,
  keys,
  columns,
  selection,
  emptyLabel,
  empty,
}: BodyProps<T>) {
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
        />
      ))}
    </ul>
  );
}

interface CardProps<T extends object> {
  record: T;
  index: number;
  rowKeyValue: Key;
  columns: CardColumns<T>;
  testId: string;
  selection: CardsSelection<T> | null;
}

/** 一行 = 一张卡:标题行(可带选择框)、定义表、底部动作行。 */
function TableCard<T extends object>({ record, index, rowKeyValue, columns, testId, selection }: CardProps<T>) {
  const fields = columns.fields
    .map((column) => ({ column, cell: cellOf(column, record, index) }))
    .filter((entry) => !isEmptyCell(entry.cell));
  const actions = columns.actions ? cellOf(columns.actions, record, index) : null;
  return (
    <li className="paper-card p-3" data-row-key={String(rowKeyValue)} data-test-id={`${testId}-card`}>
      <div className="flex items-start gap-2">
        {selection && (
          <Checkbox
            checked={selection.keys.includes(rowKeyValue)}
            disabled={selection.disabled(record)}
            data-test-id={`${testId}-select-${String(rowKeyValue)}`}
            onChange={(event) => selection.toggle(record, event.target.checked)}
          />
        )}
        <div className="min-w-0 flex-1 text-[14px] leading-5 font-medium break-words text-ink">
          {columns.title ? cellOf(columns.title, record, index) : null}
        </div>
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
      {!isEmptyCell(actions) && <div className="mt-2 flex justify-end">{actions}</div>}
    </li>
  );
}

interface SelectAllProps<T extends object> {
  label: string;
  testId: string;
  rows: readonly T[];
  keys: Map<T, Key>;
  selection: CardsSelection<T> | null;
}

/** 本页全选 —— 表格里是表头那一格,卡片里就得单独有一行。没有选择或没有行时整行不出现。 */
function SelectAllRow<T extends object>({ label, testId, rows, keys, selection }: SelectAllProps<T>) {
  if (!selection || rows.length === 0) return null;
  const pageKeys = rows.map((row, index) => keys.get(row) ?? index);
  const selected = pageKeys.filter((key) => selection.keys.includes(key));
  return (
    <div className="mb-2 flex items-center gap-2 text-[12px] text-ink-soft">
      <Checkbox
        checked={selected.length > 0 && selected.length === pageKeys.length}
        indeterminate={selected.length > 0 && selected.length < pageKeys.length}
        data-test-id={`${testId}-select-all`}
        onChange={(event) => selection.toggleAll(rows, event.target.checked)}
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

/** 底部居中的简版分页;一页放得下就整个不出现(与表格的 `hideOnSinglePage` 同义)。 */
function CardsPager({ testId, pagination, visible }: PagerProps) {
  if (!pagination) return null;
  const total = pagination.total ?? visible;
  if (total <= pagination.pageSize) return null;
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
}

/** `rowSelection` 的读写两端:选中集合来自 `selectedRowKeys`,改动原样喂回 `onChange`。 */
function selectionOf<T extends object>(
  rowSelection: TableProps<T>["rowSelection"],
  rows: readonly T[],
  keys: Map<T, Key>,
): CardsSelection<T> | null {
  if (!rowSelection) return null;
  const selected = [...(rowSelection.selectedRowKeys ?? [])];
  const emit = (next: Key[], type: RowSelectMethod) => {
    const chosen = new Set(next);
    rowSelection.onChange?.(
      next,
      rows.filter((row) => chosen.has(keys.get(row) as Key)),
      { type },
    );
  };
  return {
    keys: selected,
    disabled: (record) => rowSelection.getCheckboxProps?.(record)?.disabled === true,
    toggle: (record, checked) => {
      const key = keys.get(record) as Key;
      emit(checked ? [...selected, key] : selected.filter((entry) => entry !== key), "single");
    },
    toggleAll: (records, checked) => {
      const pageKeys = records.map((record) => keys.get(record) as Key);
      const rest = selected.filter((key) => !pageKeys.includes(key));
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
