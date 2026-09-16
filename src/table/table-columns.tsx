"use client";

/**
 * Header search / filter / sort decorators.
 *
 * List pages add header capability only through these: the column renders the
 * current query (`filteredValue` / `sortOrder`) and nothing else, while writes
 * go through `DataTable`'s `onChange` into the query hook. That is what keeps
 * back/forward and the header UI from drifting apart.
 *
 * The glyphs are inline SVG on purpose — `@ant-design/icons` would become a
 * second optional peer for two 12px shapes.
 */

import { useState } from "react";
import type { ColumnType } from "antd/es/table";
import type { ColumnFilterItem, FilterDropdownProps, SortOrder } from "antd/es/table/interface";

import { Button } from "../primitives/button";
import { Input } from "../primitives/field";
import { matchesPersonQuery, type PersonQuerySubject } from "./person-query";
import { sameFilterValues, type TableQueryState } from "./table-query";

export interface HeaderFilterOption {
  text: string;
  value: string;
  /** Hierarchical options (pair with `filterMode: "tree"`). */
  children?: readonly HeaderFilterOption[];
}

/**
 * Horizontal scrolling for every list table.
 *
 * Without `scroll.x` antd uses `table-layout: auto`: columns get squeezed below
 * their `width` and both headers and cells start wrapping. `max-content` lets
 * each column hold its width and scrolls horizontally when they do not fit —
 * which is also why list tables never turn into cards on a narrow screen.
 */
export const TABLE_SCROLL = { x: "max-content" } as const;

/** Copy for the header dropdowns — a subset of `DataTableLabels`. */
export interface TableHeaderLabels {
  search: string;
  reset: string;
  filter: string;
}

interface KeywordLabels {
  search: string;
  reset: string;
  placeholder?: string;
}

/**
 * Long-text column (a question stem, a description): one line with an ellipsis,
 * antd supplies the native `title` tooltip on hover.
 *
 * `width` is the column's target width (other `max-content` columns can still
 * push it). Short fields should just declare an explicit px `width` instead.
 */
export function withEllipsis<T>(column: ColumnType<T>, width: number): ColumnType<T> {
  return { ...column, width, ellipsis: true };
}

/** In-memory sort for a small table whose rows are all loaded. */
export function withClientSort<T>(column: ColumnType<T>, compare: (a: T, b: T) => number): ColumnType<T> {
  return { ...column, sorter: compare };
}

function KeywordFilterDropdown({
  labels,
  testId,
  selectedKeys,
  setSelectedKeys,
  confirm,
  clearFilters,
}: FilterDropdownProps & { labels: KeywordLabels; testId: string }) {
  const [draft, setDraft] = useState(String(selectedKeys[0] ?? ""));
  const apply = () => {
    setSelectedKeys(draft.trim() ? [draft.trim()] : []);
    confirm();
  };
  const reset = () => {
    setDraft("");
    clearFilters?.();
    confirm();
  };
  return (
    <div className="w-64 space-y-2 p-2" data-test-id={testId}>
      <Input
        autoFocus
        value={draft}
        placeholder={labels.placeholder}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          // 表格常落在宿主的 <form> 里:回车只提交表头检索,不能顺带把外层表单交出去。
          if (event.key !== "Enter") return;
          event.preventDefault();
          apply();
        }}
        data-test-id={`${testId}-input`}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="outline" onClick={reset} data-test-id={`${testId}-reset`}>
          {labels.reset}
        </Button>
        <Button type="button" size="sm" variant="primary" onClick={apply} data-test-id={`${testId}-submit`}>
          {labels.search}
        </Button>
      </div>
    </div>
  );
}

export interface SearchColumnOptions {
  /** Query parameter name (usually `q`); also the column's key in antd's `onChange`. */
  param: string;
  query: TableQueryState;
  labels: TableHeaderLabels;
  placeholder?: string;
  /** Dropdown test id, default `<param>-search`; input `-input`, buttons `-submit` / `-reset`, icon `-icon`. */
  testId?: string;
}

/**
 * Header keyword search: one input plus search / reset inside the funnel, Enter submits.
 *
 * The column's `key` is forced to `param` so antd reports the filter under that
 * name; `dataIndex` is left to sorting (`sortColumn` uses it as the server sort key).
 */
export function searchColumn<T>(column: ColumnType<T>, options: SearchColumnOptions): ColumnType<T> {
  const { param, query, labels, placeholder } = options;
  const testId = options.testId ?? `${param}-search`;
  const value = query.filters[param]?.[0] ?? "";
  return {
    ...column,
    key: param,
    filteredValue: value ? [value] : null,
    filterDropdown: (props: FilterDropdownProps) => (
      <KeywordFilterDropdown
        {...props}
        labels={{ search: labels.search, reset: labels.reset, placeholder }}
        testId={testId}
      />
    ),
    filterIcon: (filtered: boolean) => (
      <span
        data-test-id={`${testId}-icon`}
        data-active={filtered ? "true" : "false"}
        className={filtered ? "text-bond" : "text-ink-faint"}
      >
        <SearchGlyph label={labels.search} />
      </span>
    ),
  };
}

export interface FilterColumnOptions {
  param: string;
  query: TableQueryState;
  options: readonly HeaderFilterOption[];
  /** Multi-select (the backend splits on commas); single-select by default. */
  multiple?: boolean;
  labels?: TableHeaderLabels;
  /**
   * This column's default selection; falls back to the one carried by the query
   * state (`defaults.filters`). A selection equal to the default does not count
   * as filtering, so the funnel stays dim.
   */
  defaults?: readonly string[];
  /** Accessible name for the funnel; defaults to the generic "filter" label. */
  filterLabel?: string;
  /** antd's native filter presentation; pass `"tree"` for hierarchical `options`. */
  filterMode?: "menu" | "tree";
  /** Give the funnel a search box (required once the option list is long). */
  filterSearch?: boolean;
  testId?: string;
}

/**
 * Header enum filter (antd `filters` + controlled `filteredValue`).
 *
 * A declared default (a bank list showing only active banks) is still ticked and
 * still sent to the backend, but it is not a condition the user added: the
 * funnel lights up only when the selection differs from the default, otherwise
 * a pristine page is covered in highlights and "am I filtering?" is unreadable.
 */
export function filterColumn<T>(column: ColumnType<T>, config: FilterColumnOptions): ColumnType<T> {
  const { param, query, labels } = config;
  const values = query.filters[param] ?? [];
  const active = isFiltering(values, config);
  const testId = config.testId ?? `${param}-filter`;
  return {
    ...column,
    key: param,
    ...nativeFilterProps<T>(config),
    filteredValue: values.length > 0 ? [...values] : null,
    filterIcon: () => (
      <span
        data-test-id={`${testId}-icon`}
        data-active={active ? "true" : "false"}
        className={active ? "text-bond" : "text-ink-faint"}
      >
        <FilterGlyph label={config.filterLabel ?? labels?.filter} />
      </span>
    ),
  };
}

/** antd's native filter props: options (possibly nested), presentation, search box, single/multi. */
function nativeFilterProps<T>(
  config: FilterColumnOptions,
): Pick<ColumnType<T>, "filters" | "filterMode" | "filterSearch" | "filterMultiple"> {
  const { options, multiple, filterMode, filterSearch } = config;
  return {
    filters: filterItems(options),
    ...(filterMode ? { filterMode } : {}),
    ...(filterSearch ? { filterSearch } : {}),
    filterMultiple: multiple ?? false,
  };
}

/** Should the funnel light up? Only with a selection that differs from this column's default. */
function isFiltering(values: readonly string[], config: FilterColumnOptions): boolean {
  const defaults = config.defaults ?? config.query.defaultFilters?.[config.param] ?? [];
  return values.length > 0 && !sameFilterValues(values, defaults);
}

/** Options → antd `filters`; nested options keep their `children` (only `filterMode: "tree"` reads them). */
function filterItems(options: readonly HeaderFilterOption[]): ColumnFilterItem[] {
  return options.map((option) => ({
    text: option.text,
    value: option.value,
    ...(option.children ? { children: filterItems(option.children) } : {}),
  }));
}

/** Funnel glyph — antd's own icon carries no accessible name, this one does. */
function FilterGlyph({ label }: { label?: string }) {
  return (
    <svg
      aria-label={label}
      role={label ? "img" : "presentation"}
      viewBox="0 0 12 12"
      className="h-3 w-3"
      fill="currentColor"
    >
      <path d="M1 2h10L7 6.6V11L5 9.6V6.6z" />
    </svg>
  );
}

/** Magnifier glyph — same size and accessible-name treatment as the funnel. */
function SearchGlyph({ label }: { label?: string }) {
  return (
    <svg
      aria-label={label}
      role={label ? "img" : "presentation"}
      viewBox="0 0 12 12"
      className="h-3 w-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <circle cx="5" cy="5" r="3.25" />
      <path d="M7.5 7.5 10.5 10.5" strokeLinecap="round" />
    </svg>
  );
}

/** Controlled `sortOrder` for one server sort key under the current query. */
export function sortOrderFor(query: TableQueryState, key: string): SortOrder {
  if (query.sort?.key !== key) return null;
  return query.sort.order === "asc" ? "ascend" : "descend";
}

/**
 * Add server-side sorting. `key` must be on the endpoint's backend whitelist.
 *
 * `dataIndex` defaults to `key`: antd reports the sorted column through `field`
 * (i.e. `dataIndex`), and the same column may already have given its `key` to
 * `searchColumn` — so the sort key and `dataIndex` have to agree.
 */
export function sortColumn<T>(column: ColumnType<T>, key: string, query: TableQueryState): ColumnType<T> {
  return {
    ...column,
    dataIndex: column.dataIndex ?? key,
    sorter: true,
    sortOrder: sortOrderFor(query, key),
    sortDirections: ["ascend", "descend"],
  };
}

/**
 * Minimal query state for an in-memory table: no paging, no server sort.
 *
 * Unpaginated tables (API keys, import results) have no `useTableQueryWith` —
 * the caller holds the keyword and filters the rows itself — but the header is
 * still the only place search lives, so the same funnel binds to a bare string.
 */
export function clientQueryState(param: string, value: string): TableQueryState {
  const trimmed = value.trim();
  return { filters: trimmed ? { [param]: [trimmed] } : {}, q: "", sort: null, page: 1, pageSize: 0 };
}

export interface ClientSearchOptions<T = unknown> {
  /** Query key (also the key antd reports this column under). */
  param: string;
  /** Current keyword (the caller's state). */
  value: string;
  labels: TableHeaderLabels;
  placeholder?: string;
  testId?: string;
  /**
   * People column: the row's name + directory pinyin, and antd filters the rows
   * itself through `matchesPersonQuery` (contract: directory pinyin) — so「hyq」
   * 「huyuqin」「玉琴」all find 胡玉琴 without the host writing a matcher.
   *
   * Omit it and the column behaves exactly as before: no `onFilter`, so
   * filtering the rows stays the caller's job.
   */
  subject?: (record: T) => PersonQuerySubject;
}

/** Header keyword search for an in-memory table — same funnel, value owned by the caller. */
export function clientSearchColumn<T>(column: ColumnType<T>, options: ClientSearchOptions<T>): ColumnType<T> {
  const { param, value, subject, ...rest } = options;
  const searchable = searchColumn<T>(column, { ...rest, param, query: clientQueryState(param, value) });
  if (!subject) return searchable;
  return {
    ...searchable,
    onFilter: (filterValue, record: T) => matchesPersonQuery(String(filterValue), subject(record)),
  };
}
