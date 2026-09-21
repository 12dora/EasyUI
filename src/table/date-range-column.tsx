"use client";

/**
 * Header date-range filter — the fourth column decorator, next to
 * `searchColumn` / `filterColumn` / `sortColumn`.
 *
 * A range is **two** URL keys (`submittedFrom` / `submittedTo`), while antd's
 * header filter channel (`filteredValue` → `onChange(filters)`) carries one
 * value list per column key. Squeezing both bounds into one key would leak a
 * made-up parameter into the request, so this decorator writes through the
 * `TableQuery` it is given (one `apply` = one history write, page back to 1)
 * and keeps antd's own channel empty (`filteredValue: null`, a synthetic
 * column key). The funnel state is driven by antd's `filtered` flag instead.
 *
 * Both bounds are inclusive days in `YYYY-MM-DD`; either may be left open.
 * The phone cards toolbar reads the `dateRange` marker this puts on the column
 * and renders two native date inputs for it (see `table-cards-toolbar.tsx`).
 */

import { DatePicker } from "antd";
import type { FilterDropdownProps } from "antd/es/table/interface";
import dayjs, { type Dayjs } from "dayjs";
import { useState, type KeyboardEvent } from "react";

import { Button } from "../primitives/button";
import type { MobileColumn, TableHeaderLabels } from "./table-columns";
import { dateRangeFilters, isIsoDay, sameFilterValues, type TableQuery, type TableQueryState } from "./table-query";

/** The day format of the URL, the request and the picker. */
export const DATE_RANGE_DAY_FORMAT = "YYYY-MM-DD";

/** Copy for the range dropdown and its phone-toolbar twin. */
export interface DateRangeLabels {
  /** Apply button (确定). */
  confirm: string;
  /** Clear button (重置) — removes both bounds. */
  reset: string;
  /** Start input placeholder / accessible name (开始日期). */
  start: string;
  /** End input placeholder / accessible name (结束日期). */
  end: string;
  /** Accessible name of the header icon. */
  filter: string;
}

/** 中文缺省文案(中文宿主直接用)。 */
export const DEFAULT_DATE_RANGE_LABELS: DateRangeLabels = {
  confirm: "确定",
  reset: "重置",
  start: "开始日期",
  end: "结束日期",
  filter: "按日期筛选",
};

/** English copy — English hosts pass it as `labels.dateRange` (usually inside their table catalogue). */
export const DATE_RANGE_LABELS_EN: DateRangeLabels = {
  confirm: "OK",
  reset: "Reset",
  start: "Start date",
  end: "End date",
  filter: "Filter by date",
};

/**
 * What a date-range column carries for the phone cards toolbar: which keys it
 * owns, the applied bounds (`""` = open) and its resolved copy.
 */
export interface DateRangeFilter {
  fromKey: string;
  toKey: string;
  from: string;
  to: string;
  labels: DateRangeLabels;
}

export interface DateRangeColumnOptions {
  /** URL / request key of the inclusive start day (e.g. `submittedFrom`). Declare it in the table's `keys`. */
  fromKey: string;
  /** URL / request key of the inclusive end day (e.g. `submittedTo`). Declare it in the table's `keys`. */
  toKey: string;
  /**
   * The whole `TableQuery` (the hook's return value, not `.query`): a range
   * writes two keys in one `apply`, which antd's one-key filter channel cannot.
   */
  table: TableQuery;
  /**
   * The same table catalogue `searchColumn` gets (`t.common.table`): `reset`
   * and `filter` are taken from it, `labels.dateRange` overrides the rest.
   * Anything missing falls back to `DEFAULT_DATE_RANGE_LABELS` (中文).
   */
  labels?: Partial<TableHeaderLabels>;
  /** Dropdown test id, default `<fromKey>-range`; picker `-picker`, buttons `-submit` / `-reset`, icon `-icon`. */
  testId?: string;
}

/** Table catalogue → resolved range copy (default ← host `reset` / `filter` ← host `dateRange`). */
export function dateRangeLabelsOf(labels?: Partial<TableHeaderLabels>): DateRangeLabels {
  return {
    ...DEFAULT_DATE_RANGE_LABELS,
    ...(labels?.reset ? { reset: labels.reset } : {}),
    ...(labels?.filter ? { filter: labels.filter } : {}),
    ...labels?.dateRange,
  };
}

/** The column key antd files this column under — never a real query key. */
function dateRangeColumnKey(fromKey: string, toKey: string): string {
  return `${fromKey}..${toKey}`;
}

/** Applied day of one key (`""` when open or malformed). */
function dayOf(state: TableQueryState, key: string): string {
  const value = state.filters[key]?.[0] ?? "";
  return isIsoDay(value) ? value : "";
}

/** A bound the user set — a declared default for the key does not count (same rule as `filterColumn`). */
function isCustomDay(state: TableQueryState, key: string): boolean {
  const values = state.filters[key] ?? [];
  return values.length > 0 && !sameFilterValues(values, state.defaultFilters?.[key] ?? []);
}

/**
 * Header date-range filter: an antd `RangePicker` plus reset / confirm inside
 * the funnel, writing `fromKey` / `toKey` as `YYYY-MM-DD`.
 *
 * The icon lights up when either bound is set; reset removes both keys; every
 * change goes back to page 1 (it is an ordinary filter patch).
 */
export function dateRangeColumn<T>(column: MobileColumn<T>, options: DateRangeColumnOptions): MobileColumn<T> {
  const { fromKey, toKey, table } = options;
  const state = table.query;
  const labels = dateRangeLabelsOf(options.labels);
  const testId = options.testId ?? `${fromKey}-range`;
  const from = dayOf(state, fromKey);
  const to = dayOf(state, toKey);
  const active = isCustomDay(state, fromKey) || isCustomDay(state, toKey);
  const apply = (nextFrom: string, nextTo: string) =>
    table.apply({ filters: dateRangeFilters(fromKey, toKey, nextFrom, nextTo) });
  return {
    ...column,
    key: dateRangeColumnKey(fromKey, toKey),
    dateRange: { fromKey, toKey, from, to, labels },
    // antd's filter channel stays empty on purpose (see the file header):
    // the synthetic key only ever reports `[]`, which clears nothing real.
    filteredValue: null,
    filtered: active,
    filterOnClose: false,
    filterDropdown: (props: FilterDropdownProps) => (
      <DateRangeDropdown close={props.close} from={from} to={to} labels={labels} testId={testId} onApply={apply} />
    ),
    filterIcon: () => (
      <span
        data-test-id={`${testId}-icon`}
        data-active={active ? "true" : "false"}
        className={active ? "text-bond" : "text-ink-faint"}
      >
        <CalendarGlyph label={labels.filter} />
      </span>
    ),
  };
}

interface DropdownProps {
  close: () => void;
  from: string;
  to: string;
  labels: DateRangeLabels;
  testId: string;
  onApply: (from: string, to: string) => void;
}

/**
 * RangePicker `onChange` day strings → draft. antd hands over `null` (not a
 * pair) when the clear icon wipes both ends, so this must not index blindly.
 */
export function rangeDraftOf(days: readonly [string, string] | null | undefined): [string, string] {
  return [days?.[0] ?? "", days?.[1] ?? ""];
}

/**
 * Where the calendar panel mounts: inside the filter dropdown itself. antd
 * portals it to `document.body` by default, where a click on a day counts as
 * an outside click and closes the header dropdown before anything is picked.
 */
export function rangePopupContainer(trigger: HTMLElement): HTMLElement {
  return trigger.closest<HTMLElement>(".ant-table-filter-dropdown") ?? trigger.parentElement ?? document.body;
}

/**
 * Enter in a date input must not submit the host's outer `<form>` (tables often
 * sit inside one) — same guard as the keyword dropdown / cards search box.
 * The picker still sees the key first (React bubbles inner → outer).
 */
export function swallowEnter(event: KeyboardEvent<HTMLElement>): void {
  if (event.key === "Enter") event.preventDefault();
}

function toDay(value: string): Dayjs | null {
  // dayjs reads a bare `YYYY-MM-DD` as a local calendar day (no UTC shift), which is what the picker shows.
  return value ? dayjs(value) : null;
}

/**
 * The funnel body. The picked range is a local draft until 确定 — same rule as
 * the keyword dropdown (writing the URL on every click floods the back button).
 * The draft follows the applied range when it changes from outside.
 */
function DateRangeDropdown({ close, from, to, labels, testId, onApply }: DropdownProps) {
  const applied = `${from}|${to}`;
  const [seen, setSeen] = useState(applied);
  const [draft, setDraft] = useState<[string, string]>([from, to]);
  if (seen !== applied) {
    setSeen(applied);
    setDraft([from, to]);
  }
  const apply = () => {
    onApply(draft[0], draft[1]);
    close();
  };
  const reset = () => {
    setDraft(["", ""]);
    onApply("", "");
    close();
  };
  return (
    <div className="space-y-2 p-2" data-test-id={testId}>
      <div data-test-id={`${testId}-picker`} onKeyDown={swallowEnter}>
        <DatePicker.RangePicker
          value={[toDay(draft[0]), toDay(draft[1])]}
          format={DATE_RANGE_DAY_FORMAT}
          // Open-ended ranges: "since the 1st" / "up to the 15th" are real questions.
          allowEmpty={[true, true]}
          placeholder={[labels.start, labels.end]}
          getPopupContainer={rangePopupContainer}
          onChange={(_dates, days) => setDraft(rangeDraftOf(days as [string, string] | null))}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="outline" onClick={reset} data-test-id={`${testId}-reset`}>
          {labels.reset}
        </Button>
        <Button type="button" size="sm" variant="primary" onClick={apply} data-test-id={`${testId}-submit`}>
          {labels.confirm}
        </Button>
      </div>
    </div>
  );
}

/** Calendar glyph — same size and accessible-name treatment as the funnel / magnifier. */
function CalendarGlyph({ label }: { label?: string }) {
  return (
    <svg
      aria-label={label}
      role={label ? "img" : "presentation"}
      viewBox="0 0 12 12"
      className="h-3 w-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
    >
      <rect x="1.5" y="2.5" width="9" height="8" rx="1" />
      <path d="M1.5 5h9M4 1.25v2.5M8 1.25v2.5" strokeLinecap="round" />
    </svg>
  );
}
