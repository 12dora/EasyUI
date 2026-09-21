// @vitest-environment happy-dom
/**
 * User risk: a date range is the only header filter that owns **two** URL keys.
 * If the decorator gets it wrong the header lies (icon dim while the list is
 * narrowed), reset leaves half a range behind, or a made-up key / a reversed
 * range reaches the backend (422 replaces the whole table). And on phones the
 * column must not turn into a keyword box that searches "submittedAt" for text.
 */
import { Table } from "antd";
import type { ColumnType } from "antd/es/table";
import type { FilterDropdownProps } from "antd/es/table/interface";
import { act, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { byTestId, click, mount, settle, type MountedView } from "../enterprise/behavior-test-utils";
import {
  DATE_RANGE_LABELS_EN,
  DEFAULT_DATE_RANGE_LABELS,
  dateRangeColumn,
  dateRangeLabelsOf,
  rangeDraftOf,
} from "./date-range-column";
import {
  applyTableQueryPatch,
  parseTableQuery,
  serialiseTableQuery,
  tableListParams,
  tableQueryOf,
  type TableQueryConfig,
  type TableQueryPatch,
} from "./table-query";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Row {
  id: string;
  submittedAt: string;
}

const CONFIG: TableQueryConfig = {
  keys: ["q", "submittedFrom", "submittedTo"],
  dateKeys: ["submittedFrom", "submittedTo"],
};
const COLUMN: ColumnType<Row> = { title: "提交时间", dataIndex: "submittedAt" };

let view: MountedView | null = null;
let patches: TableQueryPatch[] = [];

afterEach(async () => {
  await view?.unmount();
  view = null;
  patches = [];
});

/** A real `TableQuery` over `raw` whose `apply` only records the patch. */
function tableOf(raw: string, config: TableQueryConfig = CONFIG) {
  const state = parseTableQuery(raw, config);
  const record = (patch: TableQueryPatch) => {
    patches.push(patch);
  };
  return tableQueryOf(state, tableListParams(state), record, config);
}

function columnOf(raw: string, config: TableQueryConfig = CONFIG) {
  return dateRangeColumn<Row>(COLUMN, {
    fromKey: "submittedFrom",
    toKey: "submittedTo",
    table: tableOf(raw, config),
    testId: "submitted",
  });
}

async function show(node: ReactNode) {
  if (view) await view.rerender(<>{node}</>);
  else view = await mount(<>{node}</>);
  return view;
}

function dropdownProps(): FilterDropdownProps {
  return {
    prefixCls: "ant-table-filter-dropdown",
    setSelectedKeys: vi.fn(),
    selectedKeys: [],
    confirm: vi.fn(),
    clearFilters: vi.fn(),
    filters: [],
    visible: true,
    close: vi.fn(),
  } as unknown as FilterDropdownProps;
}

async function openDropdown(column: ColumnType<Row>, props = dropdownProps()) {
  const render = column.filterDropdown as (props: FilterDropdownProps) => ReactNode;
  return show(render(props));
}

async function activeOf(column: ColumnType<Row>): Promise<string | null> {
  const mounted = await show((column.filterIcon as () => ReactNode)());
  return byTestId(mounted.host, "submitted-icon").getAttribute("data-active");
}

describe("dateRangeColumn", () => {
  it("keeps antd's single-key filter channel empty and marks the column as a range", () => {
    const column = columnOf("submittedFrom=2026-09-01&submittedTo=2026-09-15");
    // Neither real key is the column key: antd's onChange must never write them as one value list.
    expect(column.key).not.toBe("submittedFrom");
    expect(column.key).not.toBe("submittedTo");
    expect(column.filteredValue).toBeNull();
    expect(column.filtered).toBe(true);
    expect(column.dataIndex).toBe("submittedAt");
    expect(column.dateRange).toEqual({
      fromKey: "submittedFrom",
      toKey: "submittedTo",
      from: "2026-09-01",
      to: "2026-09-15",
      labels: DEFAULT_DATE_RANGE_LABELS,
    });
  });

  it("lights the icon up when either bound is set, and only then", async () => {
    expect(await activeOf(columnOf(""))).toBe("false");
    expect(await activeOf(columnOf("submittedFrom=2026-09-01"))).toBe("true");
    expect(await activeOf(columnOf("submittedTo=2026-09-15"))).toBe("true");
    expect(columnOf("").filtered).toBe(false);
  });

  it("does not count a declared default range as filtering", async () => {
    const defaulted: TableQueryConfig = { ...CONFIG, defaults: { filters: { submittedFrom: ["2026-01-01"] } } };
    expect(await activeOf(columnOf("", defaulted))).toBe("false");
    expect(await activeOf(columnOf("submittedFrom=2026-09-01", defaulted))).toBe("true");
  });

  it("confirm writes both URL keys as YYYY-MM-DD in one patch and closes the dropdown", async () => {
    const props = dropdownProps();
    const mounted = await openDropdown(columnOf("submittedFrom=2026-09-01&submittedTo=2026-09-15"), props);
    await click(byTestId(mounted.host, "submitted-submit"));
    expect(patches).toEqual([{ filters: { submittedFrom: ["2026-09-01"], submittedTo: ["2026-09-15"] } }]);
    expect(props.close).toHaveBeenCalled();
    // antd's own confirm is not the channel: it could only carry one key.
    expect(props.confirm).not.toHaveBeenCalled();
  });

  it("keeps an open-ended range open", async () => {
    const mounted = await openDropdown(columnOf("submittedTo=2026-09-15"));
    await click(byTestId(mounted.host, "submitted-submit"));
    expect(patches).toEqual([{ filters: { submittedFrom: [], submittedTo: ["2026-09-15"] } }]);
  });

  it("reset removes both keys, back to page 1, and nothing is left in the URL", async () => {
    const raw = "submittedFrom=2026-09-01&submittedTo=2026-09-15&page=3";
    const props = dropdownProps();
    const mounted = await openDropdown(columnOf(raw), props);
    await click(byTestId(mounted.host, "submitted-reset"));
    expect(patches).toEqual([{ filters: { submittedFrom: [], submittedTo: [] } }]);
    expect(props.close).toHaveBeenCalled();
    const next = applyTableQueryPatch(parseTableQuery(raw, CONFIG), patches[0]!, CONFIG);
    expect(next.page).toBe(1);
    expect(serialiseTableQuery(next, CONFIG)).toBe("");
    expect(tableListParams(next)).toEqual({ page: 1, pageSize: 20 });
  });

  it("renders a range picker seeded from the URL with the start / end placeholders, buttons type=button", async () => {
    const mounted = await openDropdown(columnOf("submittedFrom=2026-09-01"));
    const inputs = Array.from(byTestId(mounted.host, "submitted-picker").querySelectorAll("input"));
    expect(inputs).toHaveLength(2);
    expect(inputs.map((node) => node.placeholder)).toEqual(["开始日期", "结束日期"]);
    expect(inputs[0]!.value).toBe("2026-09-01");
    expect(inputs[1]!.value).toBe("");
    expect(byTestId(mounted.host, "submitted-submit").textContent).toBe("确定");
    expect((byTestId(mounted.host, "submitted-submit") as HTMLButtonElement).type).toBe("button");
    expect(byTestId(mounted.host, "submitted-reset").textContent).toBe("重置");
    expect((byTestId(mounted.host, "submitted-reset") as HTMLButtonElement).type).toBe("button");
  });

  it("ignores a malformed day in the state instead of showing Invalid Date", () => {
    const state = { filters: { submittedFrom: ["yesterday"] }, q: "", sort: null, page: 1, pageSize: 20 };
    const table = tableQueryOf(state, tableListParams(state), () => undefined, CONFIG);
    const column = dateRangeColumn<Row>(COLUMN, { fromKey: "submittedFrom", toKey: "submittedTo", table });
    expect(column.dateRange?.from).toBe("");
  });
});

describe("dateRangeLabelsOf", () => {
  it("defaults to Chinese, takes reset / filter from the table catalogue, then the dateRange overrides", () => {
    expect(dateRangeLabelsOf()).toEqual(DEFAULT_DATE_RANGE_LABELS);
    expect(dateRangeLabelsOf({ search: "Search", reset: "Clear", filter: "Filter" })).toEqual({
      ...DEFAULT_DATE_RANGE_LABELS,
      reset: "Clear",
      filter: "Filter",
    });
    expect(dateRangeLabelsOf({ reset: "Clear", dateRange: DATE_RANGE_LABELS_EN })).toEqual(DATE_RANGE_LABELS_EN);
  });

  it("puts English copy on the dropdown when the host passes it", async () => {
    const column = dateRangeColumn<Row>(COLUMN, {
      fromKey: "submittedFrom",
      toKey: "submittedTo",
      table: tableOf(""),
      labels: { search: "Search", reset: "Reset", filter: "Filter", dateRange: DATE_RANGE_LABELS_EN },
      testId: "submitted",
    });
    const mounted = await openDropdown(column);
    const inputs = Array.from(byTestId(mounted.host, "submitted-picker").querySelectorAll("input"));
    expect(inputs.map((node) => node.placeholder)).toEqual(["Start date", "End date"]);
    expect(byTestId(mounted.host, "submitted-submit").textContent).toBe("OK");
  });
});

describe("the picker inside the header dropdown", () => {
  it("turns the picker's day strings into the draft, and survives antd's clear (null)", () => {
    expect(rangeDraftOf(["2026-09-01", "2026-09-15"])).toEqual(["2026-09-01", "2026-09-15"]);
    // Open end: RangePicker with allowEmpty reports "" for the missing side.
    expect(rangeDraftOf(["", "2026-09-15"])).toEqual(["", "2026-09-15"]);
    // The clear icon: antd calls onChange(null, null) — must not throw.
    expect(rangeDraftOf(null)).toEqual(["", ""]);
    expect(rangeDraftOf(undefined)).toEqual(["", ""]);
  });

  it("swallows Enter so a host <form> around the table is not submitted", async () => {
    const mounted = await openDropdown(columnOf(""));
    const input = byTestId(mounted.host, "submitted-picker").querySelector("input")!;
    const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    await act(async () => {
      input.dispatchEvent(enter);
    });
    expect(enter.defaultPrevented).toBe(true);
    expect(patches).toEqual([]);
  });

  it("inside a real antd Table: picking days keeps the funnel open, 确定 writes both keys and closes it", async () => {
    const mounted = await show(
      <Table<Row> rowKey="id" columns={[columnOf("submittedFrom=2026-09-01")]} dataSource={[]} pagination={false} />,
    );
    expect(byTestId(mounted.host, "submitted-icon").getAttribute("data-active")).toBe("true");

    await press(mounted.host.querySelector(".ant-table-filter-trigger")!);
    expect(funnelOpen()).toBe(true);
    const start = byTestId(document.body, "submitted-picker").querySelector("input")!;
    expect(start.value).toBe("2026-09-01");

    // Open the calendar: its panel portals to document.body, outside the funnel's DOM.
    await act(async () => start.focus());
    await press(start);
    const panel = document.body.querySelector<HTMLElement>(".ant-picker-dropdown");
    expect(panel).not.toBeNull();
    expect(panel!.closest(".ant-table-filter-dropdown")).toBeNull();

    // Day clicks inside that panel are not "outside clicks" for the funnel.
    await press(dayCell(panel!, "3"));
    expect(funnelOpen()).toBe(true);
    await press(dayCell(panel!, "10"));
    expect(funnelOpen()).toBe(true);
    expect(patches).toEqual([]);

    await press(byTestId(document.body, "submitted-submit"));
    expect(patches).toEqual([{ filters: { submittedFrom: ["2026-09-03"], submittedTo: ["2026-09-10"] } }]);
    expect(funnelOpen()).toBe(false);
  });

  it("inside a real antd Table: a real outside click (calendar closed) still closes the funnel", async () => {
    const mounted = await show(
      <Table<Row> rowKey="id" columns={[columnOf("")]} dataSource={[]} pagination={false} />,
    );
    await press(mounted.host.querySelector(".ant-table-filter-trigger")!);
    expect(funnelOpen()).toBe(true);
    await press(document.body);
    expect(funnelOpen()).toBe(false);
    expect(patches).toEqual([]);
  });
});

/** A full pointer sequence — rc-trigger decides "outside" on mousedown, rc-picker selects on click. */
async function press(element: Element) {
  await act(async () => {
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      element.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
    }
  });
  await settle(50);
}

/** Is the header funnel (antd Dropdown holding our dropdown body) currently shown? */
function funnelOpen(): boolean {
  const popup = document.body.querySelector("[data-test-id='submitted']")?.closest(".ant-dropdown");
  // happy-dom 里 antd 的离场动画不会走完:处在 leave 阶段即视为已关闭。
  if (!popup) return false;
  return !popup.classList.contains("ant-dropdown-hidden") && !popup.className.includes("-leave");
}

/** A day of the first (left) month panel, by its number. */
function dayCell(panel: HTMLElement, day: string): HTMLElement {
  const cells = Array.from(panel.querySelectorAll<HTMLElement>(".ant-picker-cell-in-view"));
  const cell = cells.find((node) => node.textContent?.trim() === day);
  if (!cell) throw new Error(`No day ${day} in the calendar`);
  return cell;
}
