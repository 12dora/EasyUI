/**
 * EasyUI table query — the one state a list page keeps.
 *
 * Search, column filters, sort and paging all live in a single `TableQueryState`
 * that round-trips through a query string: a deep link, a refresh and the
 * browser's back/forward button all restore the same screen. Pages never build
 * query strings themselves — `toListParams()` produces the parameter bag their
 * own fetch layer sends (sort is serialised as `sort=<key>:<asc|desc>`).
 *
 * Everything in this module is **pure** (no React, no antd, no router): the
 * hooks that bind it to component state live in `use-table-query.ts`, and the
 * column decorators that render it live in `table-columns.tsx`.
 */

export type TableSortOrder = "asc" | "desc";

/** Server-side sort. `key` must be on the endpoint's backend whitelist. */
export interface TableSort {
  key: string;
  order: TableSortOrder;
}

/**
 * Standard list envelope — the shape `DataTable` paginates against.
 *
 * `total` is the server's total row count, not the number of rows on screen:
 * the pager has to know about pages the current response does not contain.
 */
export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

/**
 * Query parameters for a list request. The kit only *produces* these — issuing
 * the request stays with the host's own API layer.
 */
export type ListParams = Record<string, string | number | boolean | undefined>;

/** Page-size options every list page offers. */
export const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 20;
/**
 * Largest page size the kit will honour from a URL (the biggest entry in
 * `PAGE_SIZE_OPTIONS`). A hand-edited `?pageSize=5000` falls back to the
 * default instead of asking a backend for the whole table.
 */
const MAX_PAGE_SIZE = 100;

export interface TableQueryState {
  /**
   * Current header search / filter values, keyed by query parameter name.
   * A keyword search (`searchColumn`) is a one-entry array; a multi-select
   * filter (`filterColumn`) holds several.
   */
  filters: Readonly<Record<string, string[]>>;
  /** `filters.q[0]` — nearly every table has a keyword box, so it is surfaced. */
  q: string;
  sort: TableSort | null;
  page: number;
  pageSize: number;
  /**
   * The filter defaults this table declared (`config.defaults.filters`).
   *
   * Column decorators read it to decide whether the user is *actually*
   * filtering: a default value is still sent to the backend and still ticked in
   * the funnel, but it is not a condition the user added, so the funnel icon
   * must not sit permanently highlighted.
   */
  defaultFilters?: Readonly<Record<string, readonly string[]>>;
}

export interface TableQueryDefaults {
  pageSize?: number;
  /** Default sort; it stays out of the URL but is still sent to the backend. */
  sort?: TableSort;
  /** Default filter values; values equal to these stay out of the URL. */
  filters?: Readonly<Record<string, readonly string[]>>;
}

export interface TableQueryConfig {
  /** Search / filter parameter names this table owns — only these are parsed, serialised and cleared. */
  keys: readonly string[];
  defaults?: TableQueryDefaults;
  /**
   * Sort keys the endpoint accepts (the backend whitelist).
   *
   * When declared, a wild sort key from an old bookmark or a hand-edited URL is
   * dropped *before* the request and falls back to the default sort, instead of
   * letting the backend reject it and replacing the whole table with an error.
   * Undeclared means "do not validate".
   */
  sortKeys?: readonly string[];
  /**
   * Accepted values per enum filter parameter (the backend whitelist).
   *
   * Same idea: `?status=foo` is dropped at parse time and that parameter falls
   * back to its default. Only declare the ones worth validating — free text
   * (`q`) and id-shaped parameters (`examId`) do not belong here.
   */
  filterOptions?: Readonly<Record<string, readonly string[]>>;
  /**
   * Day-valued parameters (`dateRangeColumn`'s `fromKey` / `toKey`): each holds
   * one inclusive `YYYY-MM-DD` day.
   *
   * Parsing keeps only the first well-formed calendar day, so a hand-edited
   * `?submittedFrom=yesterday` or a repeated key never reaches the backend (as
   * garbage or as a comma-joined pair) — the parameter just falls back to its
   * default. Undeclared means "do not validate".
   */
  dateKeys?: readonly string[];
}

/** One header action often changes a filter *and* the page, so changes land together. */
export interface TableQueryPatch {
  /** Merged by parameter name; an empty array clears that condition. */
  filters?: Readonly<Record<string, readonly string[]>>;
  sort?: TableSort | null;
  page?: number;
  pageSize?: number;
  /** Reset every filter to its default first, then merge `filters`. */
  clearFilters?: boolean;
}

export interface TableQuery {
  query: TableQueryState;
  /** Any non-default search/filter active (empty states use it to offer "clear filters"). */
  filtered: boolean;
  /** Memoised `toListParams()` result — safe to put straight into a `useCallback` dependency list. */
  listParams: ListParams;
  setSearch: (param: string, value: string) => void;
  setFilter: (param: string, values: readonly string[]) => void;
  setSort: (key: string | null, order: TableSortOrder | null) => void;
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
  /** Land several changes at once (the table header uses this so one action is one history write). */
  apply: (patch: TableQueryPatch) => void;
  /** Clear every search/filter back to its default and return to page 1; sort and page size survive. */
  reset: () => void;
  toListParams: () => ListParams;
}

/** `<key>:<asc|desc>` → sort. A missing direction means descending (newest first is the list norm). */
export function parseSort(raw: string | null | undefined): TableSort | null {
  if (!raw) return null;
  const [key, direction] = raw.split(":");
  if (!key) return null;
  return { key, order: direction === "asc" ? "asc" : "desc" };
}

/** Sort → `<key>:<asc|desc>`. */
export function formatSort(sort: TableSort | null): string {
  return sort ? `${sort.key}:${sort.order}` : "";
}

function positiveInt(raw: string | null, fallback: number, max?: number): number {
  const value = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(value) || value < 1) return fallback;
  return max !== undefined && value > max ? fallback : value;
}

function defaultFilters(config: TableQueryConfig, param: string): string[] {
  const values = config.defaults?.filters?.[param];
  return values && values.length > 0 ? [...values] : [];
}

/**
 * Query string → per-parameter values.
 *
 * A repeated parameter name means multi-select (`status=draft&status=published`)
 * so that a comma inside a search term is never mistaken for a separator.
 * Parameters absent from the URL fall back to their declared defaults.
 */
function parseFilters(params: URLSearchParams, config: TableQueryConfig): Record<string, string[]> {
  const filters: Record<string, string[]> = {};
  for (const key of config.keys) {
    const allowed = config.filterOptions?.[key];
    const accepted = params
      .getAll(key)
      .filter((value) => value !== "")
      .filter((value) => !allowed || allowed.includes(value));
    const values = config.dateKeys?.includes(key) ? accepted.filter(isIsoDay).slice(0, 1) : accepted;
    const resolved = values.length > 0 ? values : defaultFilters(config, key);
    if (resolved.length > 0) filters[key] = resolved;
  }
  return filters;
}

/**
 * A real calendar day written as `YYYY-MM-DD` (the date-range filters' URL and
 * request format). `2026-02-30` is rejected, not rolled over into March.
 */
export function isIsoDay(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/**
 * Two bounds → the filter patch for both keys. An open bound clears its key
 * (`[]`, the kit's "cleared" value); reversed bounds are swapped, so the
 * backend never sees `from > to` (it answers that with a 422).
 */
export function dateRangeFilters(
  fromKey: string,
  toKey: string,
  from: string,
  to: string,
): Record<string, string[]> {
  const [start, end] = from && to && from > to ? [to, from] : [from, to];
  return { [fromKey]: start ? [start] : [], [toKey]: end ? [end] : [] };
}

/** With a whitelist declared, a wild sort key is dropped: a bad bookmark must not break the table. */
function parseSortKey(raw: string | null, config: TableQueryConfig): TableSort | null {
  const sort = parseSort(raw);
  if (sort && config.sortKeys && !config.sortKeys.includes(sort.key)) return null;
  return sort;
}

/**
 * Query string → query state. Defaults (filters, sort, first page) are filled in
 * here, so a page always receives a complete state.
 */
export function parseTableQuery(raw: string, config: TableQueryConfig): TableQueryState {
  const params = new URLSearchParams(raw);
  const filters = parseFilters(params, config);
  return {
    filters,
    q: filters.q?.[0] ?? "",
    sort: parseSortKey(params.get("sort"), config) ?? config.defaults?.sort ?? null,
    page: positiveInt(params.get("page"), 1),
    pageSize: positiveInt(params.get("pageSize"), config.defaults?.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    defaultFilters: config.defaults?.filters,
  };
}

/** Two filter selections equal? (Order-sensitive; values come back in declaration order.) */
export function sameFilterValues(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameSort(left: TableSort | null, right: TableSort | null | undefined): boolean {
  if (!left || !right) return left === null && !right;
  return left.key === right.key && left.order === right.order;
}

/** Does this parameter hold a value that differs from its default? */
function isCustomFilter(state: TableQueryState, config: TableQueryConfig, key: string): boolean {
  const values = state.filters[key] ?? [];
  return values.length > 0 && !sameFilterValues(values, defaultFilters(config, key));
}

/** Non-default search/filter conditions go into the query string; multi-select repeats the name. */
function appendFilterParams(params: URLSearchParams, state: TableQueryState, config: TableQueryConfig) {
  for (const key of config.keys) {
    if (!isCustomFilter(state, config, key)) continue;
    for (const value of state.filters[key] ?? []) params.append(key, value);
  }
}

/** Query state → query string. Values equal to the defaults are omitted so links stay clean. */
export function serialiseTableQuery(state: TableQueryState, config: TableQueryConfig): string {
  const params = new URLSearchParams();
  appendFilterParams(params, state, config);
  const defaults = config.defaults;
  if (state.sort && !sameSort(state.sort, defaults?.sort)) params.set("sort", formatSort(state.sort));
  if (state.page > 1) params.set("page", String(state.page));
  if (state.pageSize !== (defaults?.pageSize ?? DEFAULT_PAGE_SIZE)) params.set("pageSize", String(state.pageSize));
  return params.toString();
}

/** The parameter names this table owns: its declared keys plus paging and sort. */
function ownedKeys(config: TableQueryConfig): Set<string> {
  return new Set<string>([...config.keys, "sort", "page", "pageSize"]);
}

/**
 * Current query string + new query state → new query string.
 *
 * A table only owns the keys it declared, so the string can never be rewritten
 * wholesale: other parameters live on the same address (most often `?tab=`),
 * and wiping one with a filter change would throw the user onto another tab.
 */
export function mergeTableQueryParams(raw: string, state: TableQueryState, config: TableQueryConfig): string {
  const owned = ownedKeys(config);
  const merged = new URLSearchParams();
  for (const [key, value] of new URLSearchParams(raw)) {
    if (!owned.has(key)) merged.append(key, value);
  }
  for (const [key, value] of new URLSearchParams(serialiseTableQuery(state, config))) {
    merged.append(key, value);
  }
  return merged.toString();
}

/**
 * Query state → list request parameters. Multi-select values are comma-joined
 * into one parameter; single-valued ones (a keyword, a date-range bound) go out
 * as the plain string.
 */
export function tableListParams(state: TableQueryState): ListParams {
  const params: Record<string, string | number> = {};
  for (const [key, values] of Object.entries(state.filters)) {
    if (values.length > 0) params[key] = values.join(",");
  }
  if (state.sort) params.sort = formatSort(state.sort);
  params.page = state.page;
  params.pageSize = state.pageSize;
  return params;
}

/** Any non-default search / filter condition active? */
export function hasTableFilters(state: TableQueryState, config: TableQueryConfig): boolean {
  return config.keys.some((key) => isCustomFilter(state, config, key));
}

/** Every parameter back to its default ("clear filters"). */
function resetFilters(config: TableQueryConfig): Record<string, string[]> {
  const filters: Record<string, string[]> = {};
  for (const key of config.keys) {
    const values = defaultFilters(config, key);
    if (values.length > 0) filters[key] = values;
  }
  return filters;
}

/** Merge a filter patch; an empty array clears that condition (its default does not come back). */
function mergeFilters(
  state: TableQueryState,
  patch: TableQueryPatch,
  config: TableQueryConfig,
): Record<string, string[]> {
  const filters: Record<string, string[]> = patch.clearFilters ? resetFilters(config) : { ...state.filters };
  for (const [key, values] of Object.entries(patch.filters ?? {})) {
    if (values.length > 0) filters[key] = [...values];
    else delete filters[key];
  }
  return filters;
}

/** Anything but a plain page turn resets to page 1 (page 3 of a filtered result usually does not exist). */
function nextPage(state: TableQueryState, patch: TableQueryPatch): number {
  if (patch.page !== undefined) return patch.page;
  const touched =
    patch.filters !== undefined ||
    patch.clearFilters === true ||
    patch.sort !== undefined ||
    patch.pageSize !== undefined;
  return touched ? 1 : state.page;
}

/** Apply one patch. */
export function applyTableQueryPatch(
  state: TableQueryState,
  patch: TableQueryPatch,
  config: TableQueryConfig,
): TableQueryState {
  const filters = mergeFilters(state, patch, config);
  return {
    filters,
    q: filters.q?.[0] ?? "",
    sort: patch.sort === undefined ? state.sort : patch.sort,
    page: nextPage(state, patch),
    pageSize: patch.pageSize ?? state.pageSize,
    defaultFilters: state.defaultFilters,
  };
}

/**
 * Assemble a `TableQuery`. Both hooks differ only in *where* a change lands;
 * every other semantic has to stay identical, so they share this.
 */
export function tableQueryOf(
  state: TableQueryState,
  listParams: ListParams,
  apply: (patch: TableQueryPatch) => void,
  config: TableQueryConfig,
): TableQuery {
  return {
    query: state,
    filtered: hasTableFilters(state, config),
    listParams,
    apply,
    setSearch: (param, value) => apply({ filters: { [param]: value ? [value] : [] } }),
    setFilter: (param, values) => apply({ filters: { [param]: values } }),
    setSort: (key, order) => apply({ sort: key ? { key, order: order ?? "desc" } : null }),
    setPage: (page) => apply({ page }),
    setPageSize: (pageSize) => apply({ pageSize, page: 1 }),
    reset: () => apply({ clearFilters: true, page: 1 }),
    toListParams: () => listParams,
  };
}
