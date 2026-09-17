"use client";

/**
 * 卡片列表的工具条 —— 手机上没有表头,检索 / 筛选 / 排序得有地方站。
 *
 * 它不持有任何状态:每个控件的当前值都从列定义上读(`filteredValue` / `sortOrder`),
 * 改动原样交给 `onFilters` / `onSortChange`,也就是表头那条一模一样的契约。宿主因此
 * 分不出这次改动来自表头还是卡片,URL、请求、回退键的行为完全一致。
 *
 * 下拉用的是 EasyUI 自己的原生 `Select` 而不是 antd Select:手机上原生下拉会拉起系统
 * 选择器(滚轮 / 全屏列表),比浮层里的虚拟列表好按,也不用再把一层 portal 塞进卡片流。
 */

import { useState, type ReactNode } from "react";
import type { ColumnsType } from "antd/es/table";
import type { ColumnFilterItem } from "antd/es/table/interface";

import { Input, Select } from "../primitives/field";
import type { DataTableLabels } from "./data-table";
import {
  columnKeyOf,
  columnTitleText,
  filterPatchOf,
  filterValuesOf,
  optionColumnsOf,
  searchColumnsOf,
  sortColumnsOf,
  sortKeyOf,
  type TableCardsSort,
} from "./table-cards-columns";
import type { MobileColumn } from "./table-columns";

/** 卡片列表自己的几句文案(表格里没有对应控件,所以不在 `DataTableLabels` 的必填集里)。 */
export interface TableCardsLabels {
  /** 排序下拉的名字与"未排序"选项。 */
  sort: string;
  /** 枚举筛选的"不限"选项。 */
  all: string;
  /** 本页全选复选框。 */
  selectAll: string;
  /** 单行选择框的读屏名字前缀(后面接这一行的标题)。 */
  select: string;
}

// 宿主只需要覆盖自己关心的那几句:`DataTableLabels.cards` 收的是 `Partial<TableCardsLabels>`,
// 由 `TableCards` 与缺省文案合并。以后往这里加一句文案,也就不会把所有宿主一起编译坏。

/** 缺省文案(中文宿主直接用,双语宿主通过 `labels.cards` 覆盖)。 */
export const DEFAULT_TABLE_CARDS_LABELS: TableCardsLabels = {
  sort: "排序",
  all: "全部",
  selectAll: "全选本页",
  select: "选择",
};

const CONTROL_CLASS = "min-w-28 flex-1 text-[13px]";

interface ToolbarProps<T extends object> {
  /** 已经是卡片根的 test id(`<testId>-cards`)。 */
  testId: string;
  columns: ColumnsType<T>;
  labels: DataTableLabels;
  cardLabels: TableCardsLabels;
  onFilters?: (filters: Record<string, string[]>) => void;
  sort: TableCardsSort | null;
  /** 排序下拉是否保留"未排序"这一项。 */
  clearable: boolean;
  onSortChange: (sort: TableCardsSort | null) => void;
}

export function TableCardsToolbar<T extends object>({
  testId,
  columns,
  labels,
  cardLabels,
  onFilters,
  sort,
  clearable,
  onSortChange,
}: ToolbarProps<T>) {
  const searches = onFilters ? searchColumnsOf(columns) : [];
  const options = onFilters ? optionColumnsOf(columns) : [];
  const sortable = sortColumnsOf(columns);
  if (searches.length === 0 && options.length === 0 && sortable.length === 0) return null;
  const applyFilter = (param: string, values: readonly string[]) => onFilters?.(filterPatchOf(columns, param, values));
  return (
    <div className="mb-3 flex flex-col gap-2" data-test-id={`${testId}-toolbar`}>
      {searches.map((column) => (
        <CardsSearch
          key={columnKeyOf(column)}
          applied={filterValuesOf(column)[0] ?? ""}
          // 输入框自己就是"检索"这件事的可见形态,名字该是被检索的那一列(或列自带的提示语)。
          placeholder={column.searchPlaceholder ?? columnTitleText(column)}
          testId={`${testId}-search-${columnKeyOf(column)}`}
          onApply={(value) => applyFilter(columnKeyOf(column), value ? [value] : [])}
        />
      ))}
      {(options.length > 0 || sortable.length > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          {options.map((column) => (
            <CardsFilter
              key={columnKeyOf(column)}
              column={column}
              all={cardLabels.all}
              testId={`${testId}-filter-${columnKeyOf(column)}`}
              onChange={(values) => applyFilter(columnKeyOf(column), values)}
            />
          ))}
          {sortable.length > 0 && (
            <CardsSort
              columns={sortable}
              labels={labels}
              sortLabel={cardLabels.sort}
              testId={`${testId}-sort`}
              sort={sort}
              clearable={clearable}
              onChange={onSortChange}
            />
          )}
        </div>
      )}
    </div>
  );
}

interface SearchProps {
  applied: string;
  placeholder: string;
  testId: string;
  onApply: (value: string) => void;
}

/**
 * 一列一个检索框。输入是本地草稿,回车或失焦才提交 —— 和表头漏斗里的输入框同一条规矩
 * (每敲一个字就写一次 URL 会把回退键淹掉)。已应用值被外部改掉时草稿跟随重置。
 */
function CardsSearch({ applied, placeholder, testId, onApply }: SearchProps) {
  const [draft, setDraft] = useState(applied);
  const [seen, setSeen] = useState(applied);
  if (seen !== applied) {
    setSeen(applied);
    setDraft(applied);
  }
  const apply = () => {
    const value = draft.trim();
    if (value !== applied) onApply(value);
  };
  return (
    <Input
      type="search"
      value={draft}
      placeholder={placeholder}
      aria-label={placeholder}
      data-test-id={testId}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={apply}
      onKeyDown={(event) => {
        // 表格常落在宿主的 <form> 里:回车只提交检索,不能顺带把外层表单交出去。
        if (event.key !== "Enter") return;
        event.preventDefault();
        apply();
      }}
    />
  );
}

interface FilterProps<T extends object> {
  column: MobileColumn<T>;
  all: string;
  testId: string;
  onChange: (values: string[]) => void;
}

/** 枚举筛选:单选给一个"不限"选项,多选列退化成原生多选列表。 */
function CardsFilter<T extends object>({ column, all, testId, onChange }: FilterProps<T>) {
  const values = filterValuesOf(column);
  const multiple = column.filterMultiple === true;
  const items = flattenFilters(column.filters ?? []);
  const title = columnTitleText(column);
  return (
    <Select
      className={CONTROL_CLASS}
      multiple={multiple}
      {...(multiple ? { size: Math.min(items.length, 4) } : {})}
      value={multiple ? values : (values[0] ?? "")}
      aria-label={title}
      data-test-id={testId}
      onChange={(event) => onChange(selectedValues(event.target, multiple))}
    >
      {!multiple && <option value="">{`${title}:${all}`}</option>}
      {items.map((item) => (
        <option key={item.value} value={item.value}>
          {item.label}
        </option>
      ))}
    </Select>
  );
}

interface SortProps<T extends object> {
  columns: readonly MobileColumn<T>[];
  labels: DataTableLabels;
  sortLabel: string;
  testId: string;
  sort: TableCardsSort | null;
  clearable: boolean;
  onChange: (sort: TableCardsSort | null) => void;
}

/**
 * 一个下拉盖住全部可排序列 × 两个方向。
 *
 * "未排序"这一项只在 `clearable` 时保留(或者当前压根没排序 —— 那它就是下拉的占位):
 * `DataTable` 的排序不许清,URL 里没有"显式未排序"的槽位,清掉下次刷新就被默认排序顶回来。
 */
function CardsSort<T extends object>({ columns, labels, sortLabel, testId, sort, clearable, onChange }: SortProps<T>) {
  // 当前排序键可能压根不在这几列里(后端默认排序的列没做成表头排序列):那就显示"未排序",
  // 而不是让原生下拉停在一个不存在的选项上(渲染成空白)。
  const known = sort ? columns.some((column) => sortKeyOf(column) === sort.key) : false;
  const active = sort !== null && known;
  return (
    <Select
      className={CONTROL_CLASS}
      value={active ? `${sort.key}:${sort.order}` : ""}
      aria-label={sortLabel}
      data-test-id={testId}
      onChange={(event) => onChange(parseSortValue(event.target.value))}
    >
      {(clearable || !active) && <option value="">{sortLabel}</option>}
      {columns.flatMap((column) => sortOptionsOf(column, labels))}
    </Select>
  );
}

/** 一列 → 升/降两个选项。 */
function sortOptionsOf<T extends object>(column: MobileColumn<T>, labels: DataTableLabels): ReactNode[] {
  const key = sortKeyOf(column);
  const title = columnTitleText(column);
  return [
    <option key={`${key}:asc`} value={`${key}:asc`}>{`${title} · ${labels.sortAsc}`}</option>,
    <option key={`${key}:desc`} value={`${key}:desc`}>{`${title} · ${labels.sortDesc}`}</option>,
  ];
}

/** `<key>:<asc|desc>` → 排序;空串或无法识别的值都当"未排序"。 */
function parseSortValue(raw: string): TableCardsSort | null {
  const cut = raw.lastIndexOf(":");
  if (cut <= 0) return null;
  const order = raw.slice(cut + 1);
  if (order !== "asc" && order !== "desc") return null;
  return { key: raw.slice(0, cut), order };
}

function selectedValues(select: HTMLSelectElement, multiple: boolean): string[] {
  if (multiple) return Array.from(select.selectedOptions, (option) => option.value);
  return select.value ? [select.value] : [];
}

interface FilterItem {
  value: string;
  label: string;
}

/** antd 的 `filters`(可嵌套)拍平成原生 `<option>`;非字符串的 `text` 退回 value。 */
function flattenFilters(items: readonly ColumnFilterItem[]): FilterItem[] {
  const flat: FilterItem[] = [];
  for (const item of items) {
    const value = String(item.value ?? "");
    if (item.children?.length) {
      flat.push(...flattenFilters(item.children));
      continue;
    }
    flat.push({ value, label: typeof item.text === "string" ? item.text : value });
  }
  return flat;
}
