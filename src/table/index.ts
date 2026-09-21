/**
 * EasyUI table kit — the antd-backed list-table conventions.
 *
 * antd is an **optional peer** of this package, so the table lives behind its
 * own entry point instead of the main barrel: hosts without antd never load it.
 * Consume via
 *
 *   import { DataTable, useLocalTableQuery, searchColumn } from "@easy-enterprise/ui/table";
 *
 * and import `@easy-enterprise/ui/table.css` once from the host stylesheet
 * (next to theme.css) for the header-nowrap rule and the tree-row animations.
 *
 * Three layers, pick what you need:
 *   - `DataTable` / `ClientTable` — the conventions (size, scroll, labels,
 *     pagination, empty state, actions column) on top of antd Table;
 *   - `DataTableShell` — the lower-level boundary, for hosts that want the
 *     third "sort cleared" state or their own pagination chrome;
 *   - the query functions + column decorators, usable with either;
 *   - `matchesPersonQuery` — the shared person / pinyin matcher for in-memory
 *     lists (pure, no antd, no React).
 *
 * The antd `ConfigProvider` that themes all of this is a separate entry:
 * `@easy-enterprise/ui/antd`.
 */

export {
  DataTableShell,
  type DataTableShellProps,
  type DataTablePagination,
} from "./data-table-shell";
export {
  useAnimatedExpand,
  ANIMATED_EXPAND_DURATION_MS,
  type AnimatedExpand,
  type UseAnimatedExpandOptions,
} from "./animated-expand";

export {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  applyTableQueryPatch,
  dateRangeFilters,
  formatSort,
  hasTableFilters,
  isIsoDay,
  mergeTableQueryParams,
  parseSort,
  parseTableQuery,
  sameFilterValues,
  serialiseTableQuery,
  tableListParams,
  tableQueryOf,
  type ListParams,
  type Page,
  type TableQuery,
  type TableQueryConfig,
  type TableQueryDefaults,
  type TableQueryPatch,
  type TableQueryState,
  type TableSort,
  type TableSortOrder,
} from "./table-query";

export { useLocalTableQuery, useTableQueryWith, type TableHistory } from "./use-table-query";

export {
  TABLE_SCROLL,
  clientQueryState,
  clientSearchColumn,
  filterColumn,
  searchColumn,
  sortColumn,
  sortOrderFor,
  withClientSort,
  withEllipsis,
  type ClientSearchOptions,
  type FilterColumnOptions,
  type HeaderFilterOption,
  type MobileColumn,
  type MobileColumnRole,
  type SearchColumnOptions,
  type TableHeaderLabels,
} from "./table-columns";

export {
  DATE_RANGE_DAY_FORMAT,
  DATE_RANGE_LABELS_EN,
  DEFAULT_DATE_RANGE_LABELS,
  dateRangeColumn,
  dateRangeLabelsOf,
  type DateRangeColumnOptions,
  type DateRangeFilter,
  type DateRangeLabels,
} from "./date-range-column";

export {
  DEFAULT_TABLE_DENSITY,
  TableDensityProvider,
  tableSizeOf,
  useTableDensity,
  type TableDensity,
  type TableDensityProviderProps,
  type TableDensityValue,
} from "./table-density";

export {
  TableCards,
  DEFAULT_TABLE_CARDS_LABELS,
  type TableCardsLabels,
  type TableCardsPagination,
  type TableCardsProps,
  type TableCardsSort,
} from "./table-cards";

export {
  DataTable,
  changePatch,
  filterPatch,
  sorterSort,
  type DataTableActions,
  type DataTableLabels,
  type DataTableProps,
} from "./data-table";

export { ClientTable, type ClientTableProps, type ClientTablePagination } from "./client-table";

export { matchesPersonQuery, normalizeQuery, type PersonQuerySubject } from "./person-query";
