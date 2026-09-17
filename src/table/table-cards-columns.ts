/**
 * 卡片模式下对「列定义」的解读 —— 纯函数,不碰 React 状态,也不产生 JSX。
 *
 * 手机上没有表头,可列定义仍然是唯一的事实来源:标题/正文取哪几列、动作放哪里、
 * 哪些列参与检索与排序、in-memory 表格的 `onFilter` / `sorter` 怎么落地,全部从
 * `ColumnType` 上读出来。这样宿主一份列定义同时长出表格与卡片两种形态,不用写第二遍。
 */

import { isValidElement, type Key, type ReactNode } from "react";
import type { ColumnType, ColumnsType, TableProps } from "antd/es/table";
import type { CompareFn } from "antd/es/table/interface";

import type { MobileColumn } from "./table-columns";
import type { TableSortOrder } from "./table-query";

/** 动作列默认的列 key(`DataTable` 的 `actions` 生成的就是它)。 */
export const DEFAULT_ACTIONS_KEY = "actions";

/** 卡片当前的排序:列的排序 key + 方向,与 `TableSort` 同构。 */
export interface TableCardsSort {
  key: string;
  order: TableSortOrder;
}

/** 列定义拆成卡片的三块:标题行、定义列表、底部动作行。 */
export interface CardColumns<T> {
  title: MobileColumn<T> | null;
  fields: readonly MobileColumn<T>[];
  actions: MobileColumn<T> | null;
}

/** antd 的 `ColumnsType` 含列组;卡片只认平铺的数据列,列组按普通列读(没有 render 就自然被跳过)。 */
function plainColumns<T>(columns: ColumnsType<T>): readonly MobileColumn<T>[] {
  return columns as readonly MobileColumn<T>[];
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
  const actions = all.find((column) => isActionsColumn(column, actionsKey)) ?? null;
  const data = all.filter(
    (column) => column !== actions && column.mobile !== "hidden" && !isActionsColumn(column, actionsKey),
  );
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

/** 单元格内容:和表格里完全一样的 `render(value, record, index)` 调用。 */
export function cellOf<T>(column: MobileColumn<T>, record: T, index: number): ReactNode {
  const value = readCell(record, column.dataIndex);
  if (!column.render) return value as ReactNode;
  return renderedNode(column.render(value, record, index));
}

/** 空单元格不占卡片的一行(桌面表格里是留白,手机上是一条纯噪声的定义项)。 */
export function isEmptyCell(node: ReactNode): boolean {
  return node === null || node === undefined || node === "" || node === false;
}

/** 受控筛选列:`filteredValue` 有定义(装饰器无选择时给 `null`,不是 `undefined`)。 */
function filteredColumns<T>(columns: ColumnsType<T>): readonly MobileColumn<T>[] {
  return plainColumns(columns).filter((column) => column.filteredValue !== undefined);
}

/** 表头检索列(`searchColumn` / `clientSearchColumn` 产出的 `filterDropdown`)。 */
export function searchColumnsOf<T>(columns: ColumnsType<T>): readonly MobileColumn<T>[] {
  return plainColumns(columns).filter((column) => column.filterDropdown !== undefined);
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

/** 行 key:与 antd `rowKey` 同一口径(函数 / 字段名 / 默认 `key` 字段)。 */
export function rowKeyOf<T extends object>(rowKey: TableProps<T>["rowKey"], record: T, index: number): Key {
  if (typeof rowKey === "function") return rowKey(record, index);
  const field = typeof rowKey === "string" ? rowKey : "key";
  const value = (record as Record<string, unknown>)[field];
  if (typeof value === "string" || typeof value === "number") return value;
  return index;
}
