/**
 * 卡片模式下对「列定义」的解读 —— 纯函数,不碰 React 状态,也不产生 JSX。
 *
 * 手机上没有表头,可列定义仍然是唯一的事实来源:标题/正文取哪几列、动作放哪里、
 * 哪些列参与检索与排序、in-memory 表格的 `onFilter` / `sorter` 怎么落地,全部从
 * `ColumnType` 上读出来。这样宿主一份列定义同时长出表格与卡片两种形态,不用写第二遍。
 */

import { isValidElement, type ReactNode } from "react";
import type { ColumnType, ColumnsType, TableProps } from "antd/es/table";
import type { CompareFn } from "antd/es/table/interface";

import type { DateRangeFilter } from "./date-range-column";
import type { MobileColumn } from "./table-columns";
import { dateRangeFilters, type TableSortOrder } from "./table-query";

/** 动作列默认的列 key(`DataTable` 的 `actions` 生成的就是它)。 */
export const DEFAULT_ACTIONS_KEY = "actions";

/** 卡片当前的排序:列的排序 key + 方向,与 `TableSort` 同构。 */
export interface TableCardsSort {
  key: string;
  order: TableSortOrder;
}

/** 列定义拆成卡片的三块:标题行、定义列表、底部动作行(动作列可能不止一列)。 */
export interface CardColumns<T> {
  title: MobileColumn<T> | null;
  fields: readonly MobileColumn<T>[];
  actions: readonly MobileColumn<T>[];
}

/**
 * antd 的 `ColumnsType` 含列组(`children`),卡片里没有两层表头这回事:直接把列组拍平成
 * 它的子列,否则那一组的数据在手机上会整片消失(列组自己既没有 `dataIndex` 也没有 `render`)。
 */
function plainColumns<T>(columns: ColumnsType<T>): readonly MobileColumn<T>[] {
  const flat: MobileColumn<T>[] = [];
  for (const column of columns as readonly (MobileColumn<T> & { children?: ColumnsType<T> })[]) {
    if (column.children && column.children.length > 0) flat.push(...plainColumns(column.children));
    else flat.push(column);
  }
  return flat;
}

/** 动作列 = 约定的 `actionsKey`,或任何钉在右侧的列(表格里 `fixed: "right"` 就是动作列的写法)。 */
function isActionsColumn<T>(column: MobileColumn<T>, actionsKey: string): boolean {
  return column.key === actionsKey || column.fixed === "right";
}

/**
 * 标题列 = 显式 `mobile: "title"` 的列,否则第一列可见数据列。
 *
 * 选择列不在 `columns` 里(antd 的 `rowSelection` 自己生成),所以这里不用排除它。
 */
export function splitColumns<T>(columns: ColumnsType<T>, actionsKey: string): CardColumns<T> {
  const all = plainColumns(columns);
  // 动作列可以有好几列(一个 `fixed: "right"` 的状态列 + 一个操作列):全部收进底部那一行,
  // 丢掉任何一列都等于在手机上藏掉一个入口。
  const actions = all.filter((column) => isActionsColumn(column, actionsKey));
  const data = all.filter((column) => column.mobile !== "hidden" && !isActionsColumn(column, actionsKey));
  const title = data.find((column) => column.mobile === "title") ?? data[0] ?? null;
  return { title, fields: data.filter((column) => column !== title), actions };
}

/** 筛选参数名:列装饰器把 `key` 强制成 `param`,所以筛选回写也按 `key` 走。 */
export function columnKeyOf<T>(column: MobileColumn<T>): string {
  return String(column.key ?? sortKeyOf(column));
}

/** 排序 key:`dataIndex` 优先(服务端排序列的 key 就写在 `dataIndex` 上),否则列 `key`。 */
export function sortKeyOf<T>(column: MobileColumn<T>): string {
  const index = column.dataIndex;
  if (Array.isArray(index)) return index.join(".");
  if (index !== undefined && index !== null) return String(index);
  return String(column.key ?? "");
}

/** 列标题的纯文本(下拉选项、输入框 placeholder 用);标题是渲染函数时退回列 key。 */
export function columnTitleText<T>(column: MobileColumn<T>): string {
  const { title } = column;
  if (typeof title === "string" || typeof title === "number") return String(title);
  return columnKeyOf(column);
}

/** 列标题节点(卡片里的 `dt`);渲染函数形态的标题拿不到表头上下文,退回纯文本。 */
export function columnTitleNode<T>(column: MobileColumn<T>): ReactNode {
  const { title } = column;
  if (typeof title === "function") return columnTitleText(column);
  return title as ReactNode;
}

/** `dataIndex` 取值,支持 `["a","b"]` 这种路径写法。 */
function readCell<T>(record: T, dataIndex: ColumnType<T>["dataIndex"]): unknown {
  if (dataIndex === undefined || dataIndex === null) return record;
  const path = Array.isArray(dataIndex) ? dataIndex : [dataIndex];
  let cursor: unknown = record;
  for (const step of path) {
    if (cursor === null || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[String(step)];
  }
  return cursor;
}

/**
 * `render` 允许返回 `{ children, props }`(合并单元格)而不是节点;卡片里只要 children。
 * 这里按结构判断而不是 import antd 内部的 `RenderedCell`(它住在 `@rc-component/table`,
 * 是 antd 的传递依赖,直接引会把私有路径焊进来)。
 */
function renderedNode(rendered: unknown): ReactNode {
  if (rendered !== null && typeof rendered === "object" && !isValidElement(rendered) && "children" in rendered) {
    return (rendered as { children?: ReactNode }).children ?? null;
  }
  return rendered as ReactNode;
}

/**
 * 只放 React 真的画得出来的东西:基本类型、React 元素,以及整条都合法的数组。
 *
 * 别的(普通对象、Date、Map……)一律当空。卡片里这些值本来就没有展示形态,而直接塞给 React
 * 会当场抛 "Objects are not valid as a React child" —— 整页白屏,只因为某一列多了个没
 * `render` 的对象字段。rc-table 在表格那边也是同样的保守做法。
 */
function renderableNode(value: unknown): ReactNode {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (isValidElement(value)) return value;
  if (Array.isArray(value)) return value.every(isRenderable) ? (value as ReactNode) : null;
  return null;
}

function isRenderable(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "object") return isValidElement(value) || (Array.isArray(value) && value.every(isRenderable));
  return typeof value !== "function" && typeof value !== "symbol";
}

/**
 * 单元格内容:和表格里完全一样的 `render(value, record, index)` 调用。
 *
 * 既没有 `dataIndex` 也没有 `render` 的列(占位列、只声明 `width` 的列)什么都不画 ——
 * 否则 `dataIndex` 缺省取的是**整行记录**,卡片会拿一个对象去渲染。
 */
export function cellOf<T>(column: MobileColumn<T>, record: T, index: number): ReactNode {
  const hasDataIndex = column.dataIndex !== undefined && column.dataIndex !== null;
  if (!hasDataIndex && !column.render) return null;
  const value = readCell(record, column.dataIndex);
  if (!column.render) return renderableNode(value);
  return renderableNode(renderedNode(column.render(value, record, index)));
}

/** 单元格的纯文本(给 aria-label 用);渲染成节点时拿不到文本,返回 `null`。 */
export function cellText(node: ReactNode): string | null {
  if (typeof node === "string" && node.trim()) return node;
  if (typeof node === "number") return String(node);
  return null;
}

/** 空单元格不占卡片的一行(桌面表格里是留白,手机上是一条纯噪声的定义项)。 */
export function isEmptyCell(node: ReactNode): boolean {
  return node === null || node === undefined || node === "" || node === false;
}

/**
 * 受控筛选列:`filteredValue` 有定义(装饰器无选择时给 `null`,不是 `undefined`)。
 *
 * 日期区间列不算:它的列 key 是合成的、不是查询参数,两个真正的 key 由 `dateRangePatchOf` 写。
 */
function filteredColumns<T>(columns: ColumnsType<T>): readonly MobileColumn<T>[] {
  return plainColumns(columns).filter((column) => column.filteredValue !== undefined && !column.dateRange);
}

/**
 * 表头检索列(`searchColumn` / `clientSearchColumn` 产出的 `filterDropdown`)。
 *
 * 日期区间列(`dateRangeColumn`)同样有 `filterDropdown`,但它不是关键词:带 `dateRange`
 * 标记的列不算检索列,由 `dateRangeColumnsOf` 另行接走。
 */
export function searchColumnsOf<T>(columns: ColumnsType<T>): readonly MobileColumn<T>[] {
  return plainColumns(columns).filter((column) => column.filterDropdown !== undefined && !column.dateRange);
}

/** 日期区间列(`dateRangeColumn` 产出、带 `dateRange` 标记)的区间状态,附上列标题的纯文本。 */
export function dateRangesOf<T>(columns: ColumnsType<T>): readonly (DateRangeFilter & { title: string })[] {
  return plainColumns(columns).flatMap((column) =>
    column.dateRange ? [{ ...column.dateRange, title: columnTitleText(column) }] : [],
  );
}

/** 枚举筛选列(`filterColumn` 产出的 `filters`)。 */
export function optionColumnsOf<T>(columns: ColumnsType<T>): readonly MobileColumn<T>[] {
  return plainColumns(columns).filter((column) => column.filters !== undefined && !column.filterDropdown);
}

/** 可排序列(客户端 `sorter` 函数或服务端 `sorter: true`)。 */
export function sortColumnsOf<T>(columns: ColumnsType<T>): readonly MobileColumn<T>[] {
  return plainColumns(columns).filter((column) => Boolean(column.sorter));
}

/**
 * 一次筛选改动 → 一份完整的 patch。
 *
 * 和 antd `onChange` 的 `filters` 同一口径:带上**每一个**受控筛选列的当前值(没选的给
 * 空数组,表示清空),只把被改动的那一列换成新值。宿主因此不需要区分改动来自表头还是卡片。
 */
export function filterPatchOf<T>(
  columns: ColumnsType<T>,
  param: string,
  values: readonly string[],
): Record<string, string[]> {
  const patch: Record<string, string[]> = {};
  for (const column of filteredColumns(columns)) {
    patch[columnKeyOf(column)] = (column.filteredValue ?? []).map((value) => String(value));
  }
  patch[param] = [...values];
  return patch;
}

/**
 * 一次日期区间改动 → 一份完整的 patch:其余受控筛选列照旧带上(与 `filterPatchOf` 同一口径),
 * 区间的两个 key 一起写(开放的一端给空数组,即清掉)。
 */
export function dateRangePatchOf<T>(
  columns: ColumnsType<T>,
  range: DateRangeFilter,
  from: string,
  to: string,
): Record<string, string[]> {
  return { ...filterPatchOf(columns, range.fromKey, []), ...dateRangeFilters(range.fromKey, range.toKey, from, to) };
}

/** 某列当前的检索/筛选值。 */
export function filterValuesOf<T>(column: MobileColumn<T>): string[] {
  return (column.filteredValue ?? []).map((value) => String(value));
}

/** 受控排序(服务端表格):列上的 `sortOrder` 就是当前排序。 */
export function columnSort<T>(columns: ColumnsType<T>): TableCardsSort | null {
  for (const column of plainColumns(columns)) {
    if (!column.sortOrder) continue;
    return { key: sortKeyOf(column), order: column.sortOrder === "ascend" ? "asc" : "desc" };
  }
  return null;
}

/** 客户端比较函数;`sorter: true`(服务端排序)返回 `null`。 */
function compareOf<T>(column: MobileColumn<T>): CompareFn<T> | null {
  const { sorter } = column;
  if (typeof sorter === "function") return sorter as CompareFn<T>;
  if (sorter && typeof sorter === "object" && typeof sorter.compare === "function") return sorter.compare;
  return null;
}

/**
 * 表头筛选的行过滤 —— 表格模式下这是 antd 干的活(`onFilter`),卡片模式没有 antd Table,
 * 所以在这里按同样的语义补上:每一列都要命中,列内多选是"命中任意一个"。
 * 没有 `onFilter` 的列(服务端筛选)不参与,行由后端给。
 */
export function filterRows<T>(rows: readonly T[], columns: ColumnsType<T>): readonly T[] {
  const active = plainColumns(columns)
    .map((column) => ({ values: filterValuesOf(column), onFilter: column.onFilter }))
    .filter((entry) => entry.onFilter !== undefined && entry.values.length > 0);
  if (active.length === 0) return rows;
  return rows.filter((row) => active.every(({ values, onFilter }) => values.some((value) => onFilter?.(value, row))));
}

/** 客户端排序;服务端排序列(`sorter: true`)直接返回原序,行由后端排好。 */
export function sortRows<T>(rows: readonly T[], columns: ColumnsType<T>, sort: TableCardsSort | null): readonly T[] {
  if (!sort) return rows;
  const column = plainColumns(columns).find((entry) => sortKeyOf(entry) === sort.key);
  const compare = column ? compareOf(column) : null;
  if (!compare) return rows;
  const order = sort.order === "asc" ? "ascend" : "descend";
  const direction = sort.order === "asc" ? 1 : -1;
  return [...rows].sort((left, right) => compare(left, right, order) * direction);
}

/**
 * 行 key 的收窄类型。
 *
 * antd 的 `rowKey` 可以回 `PropertyKey`(symbol / bigint 也在里面),而 React 的 `Key` 只认
 * 字符串与数字 —— 直接把 antd 的口径透出去,宿主开 strict 的 tsc 就会在 `Map<T, Key>` 上炸。
 * 所以这一层统一收窄:非数字一律 `String()`。
 */
export type CardRowKey = string | number;

/** 行 key:与 antd `rowKey` 同一口径(函数 / 字段名 / 默认 `key` 字段),但收窄到 React 认的类型。 */
export function rowKeyOf<T extends object>(
  rowKey: TableProps<T>["rowKey"],
  record: T,
  index: number,
): CardRowKey {
  if (typeof rowKey === "function") return narrowKey(rowKey(record, index), index);
  const field = typeof rowKey === "string" ? rowKey : "key";
  return narrowKey((record as Record<string, unknown>)[field], index);
}

function narrowKey(value: unknown, index: number): CardRowKey {
  if (typeof value === "string" || typeof value === "number") return value;
  if (value === undefined || value === null) return index;
  return String(value);
}
