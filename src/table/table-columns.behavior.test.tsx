// @vitest-environment happy-dom
/**
 * User risk: the decorators are the only place a list page gets header search,
 * filtering and sorting. Three things have to hold or the header lies about the
 * query: the column echoes the current state as controlled `filteredValue` /
 * `sortOrder`, submit/reset go through antd's own `confirm` / `clearFilters`,
 * and the funnel lights up exactly when the user is actually filtering.
 */
import type { ColumnType } from "antd/es/table";
import type { FilterDropdownProps } from "antd/es/table/interface";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { byTestId, click, fill, mount, type MountedView } from "../enterprise/behavior-test-utils";
import {
  clientQueryState,
  clientSearchColumn,
  filterColumn,
  searchColumn,
  sortColumn,
  sortOrderFor,
  withClientSort,
  withEllipsis,
  type TableHeaderLabels,
} from "./table-columns";
import { parseTableQuery, type TableQueryConfig } from "./table-query";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LABELS: TableHeaderLabels = { search: "Search", reset: "Reset", filter: "Filter" };
const CONFIG: TableQueryConfig = { keys: ["q", "status"], defaults: { sort: { key: "updatedAt", order: "desc" } } };
/** A table with a declared default filter (a bank list showing only active banks). */
const DEFAULTED: TableQueryConfig = { ...CONFIG, defaults: { ...CONFIG.defaults, filters: { status: ["active"] } } };
const COLUMN: ColumnType<{ name: string }> = { title: "Name", dataIndex: "name" };

let view: MountedView | null = null;

afterEach(async () => {
  await view?.unmount();
  view = null;
});

async function show(node: ReactNode) {
  if (view) await view.rerender(<>{node}</>);
  else view = await mount(<>{node}</>);
  return view;
}

function dropdownProps(overrides: Partial<FilterDropdownProps> = {}): FilterDropdownProps {
  return {
    prefixCls: "ant-table-filter-dropdown",
    setSelectedKeys: vi.fn(),
    selectedKeys: [],
    confirm: vi.fn(),
    clearFilters: vi.fn(),
    filters: [],
    visible: true,
    close: vi.fn(),
    ...overrides,
  } as unknown as FilterDropdownProps;
}

async function openDropdown(column: ColumnType<{ name: string }>, props: FilterDropdownProps) {
  const render = column.filterDropdown as (props: FilterDropdownProps) => ReactNode;
  return show(render(props));
}

function query(raw: string) {
  return parseTableQuery(raw, CONFIG);
}

describe("searchColumn", () => {
  it("binds the column to its query param and reflects the current value", () => {
    const column = searchColumn(COLUMN, { param: "q", query: query("q=fire"), labels: LABELS, testId: "bank-search" });
    expect(column.key).toBe("q");
    expect(column.filteredValue).toEqual(["fire"]);
    // `dataIndex` is left alone — sortColumn needs it as the server sort key.
    expect(column.dataIndex).toBe("name");
    expect(searchColumn(COLUMN, { param: "q", query: query(""), labels: LABELS }).filteredValue).toBeNull();
  });

  it("submits the trimmed value through antd's confirm, on the button and on Enter", async () => {
    const column = searchColumn(COLUMN, {
      param: "q",
      query: query(""),
      labels: LABELS,
      placeholder: "Search banks",
      testId: "bank-search",
    });
    const props = dropdownProps();
    const mounted = await openDropdown(column, props);

    const input = byTestId(mounted.host, "bank-search-input") as HTMLInputElement;
    expect(input.placeholder).toBe("Search banks");
    await fill(input, "  fire  ");
    await click(byTestId(mounted.host, "bank-search-submit"));
    // Surrounding whitespace must not become part of the condition.
    expect(props.setSelectedKeys).toHaveBeenCalledWith(["fire"]);
    expect(props.confirm).toHaveBeenCalled();

    const enter = dropdownProps();
    const again = await openDropdown(column, enter);
    const field = byTestId(again.host, "bank-search-input") as HTMLInputElement;
    await fill(field, "fire");
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(enter.setSelectedKeys).toHaveBeenCalledWith(["fire"]);
    expect(enter.confirm).toHaveBeenCalled();
  });

  it("never submits an enclosing form: buttons are type=button and Enter is consumed", async () => {
    const column = searchColumn(COLUMN, { param: "q", query: query(""), labels: LABELS, testId: "bank-search" });
    const props = dropdownProps();
    const mounted = await openDropdown(column, props);
    expect((byTestId(mounted.host, "bank-search-submit") as HTMLButtonElement).type).toBe("button");
    expect((byTestId(mounted.host, "bank-search-reset") as HTMLButtonElement).type).toBe("button");
    const field = byTestId(mounted.host, "bank-search-input") as HTMLInputElement;
    await fill(field, "fire");
    const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    field.dispatchEvent(enter);
    // A table inside a host <form>: Enter applies the header filter only.
    expect(enter.defaultPrevented).toBe(true);
    expect(props.confirm).toHaveBeenCalled();
  });

  it("empties the input and clears the filter on reset", async () => {
    const column = searchColumn(COLUMN, { param: "q", query: query("q=fire"), labels: LABELS, testId: "bank-search" });
    const props = dropdownProps({ selectedKeys: ["fire"] });
    const mounted = await openDropdown(column, props);
    await click(byTestId(mounted.host, "bank-search-reset"));
    expect(props.clearFilters).toHaveBeenCalled();
    expect(props.confirm).toHaveBeenCalled();
    expect((byTestId(mounted.host, "bank-search-input") as HTMLInputElement).value).toBe("");
  });

  it("marks the icon active only while the column has a value, and names the glyph", async () => {
    const column = searchColumn(COLUMN, { param: "q", query: query(""), labels: LABELS, testId: "bank-search" });
    const icon = column.filterIcon as (filtered: boolean) => ReactNode;
    let mounted = await show(icon(true));
    expect(byTestId(mounted.host, "bank-search-icon").getAttribute("data-active")).toBe("true");
    // The glyph is EasyUI's own inline SVG — @ant-design/icons is not a peer.
    expect(mounted.host.querySelector("svg")?.getAttribute("aria-label")).toBe("Search");
    mounted = await show(icon(false));
    expect(byTestId(mounted.host, "bank-search-icon").getAttribute("data-active")).toBe("false");
  });
});

describe("filterColumn", () => {
  const options = [
    { value: "active", text: "Active" },
    { value: "archived", text: "Archived" },
  ];

  it("feeds antd's filters and mirrors the selected values", () => {
    const column = filterColumn(COLUMN, { param: "status", query: query("status=archived"), options, labels: LABELS });
    expect(column.key).toBe("status");
    expect(column.filters).toEqual([
      { text: "Active", value: "active" },
      { text: "Archived", value: "archived" },
    ]);
    expect(column.filterMultiple).toBe(false);
    expect(column.filteredValue).toEqual(["archived"]);
  });

  it("supports multi-select, an empty selection and tree options", () => {
    const column = filterColumn(COLUMN, { param: "status", query: query(""), options, multiple: true });
    expect(column.filterMultiple).toBe(true);
    expect(column.filteredValue).toBeNull();

    const tree = filterColumn(COLUMN, {
      param: "status",
      query: query(""),
      options: [{ value: "root", text: "Root", children: [{ value: "leaf", text: "Leaf" }] }],
      filterMode: "tree",
      filterSearch: true,
    });
    expect(tree.filterMode).toBe("tree");
    expect(tree.filterSearch).toBe(true);
    expect(tree.filters).toEqual([{ text: "Root", value: "root", children: [{ text: "Leaf", value: "leaf" }] }]);
  });

  it("does not light the funnel up for the table's default value", async () => {
    // The default selection is still ticked and still sent to the backend, but
    // it is not a condition the user added — a pristine page covered in
    // highlights makes "am I filtering?" unreadable.
    const defaulted = filterColumn(COLUMN, {
      param: "status",
      query: parseTableQuery("", DEFAULTED),
      options,
      labels: LABELS,
    });
    expect(defaulted.filteredValue).toEqual(["active"]);
    expect(await activeOf(defaulted)).toBe("false");

    const custom = filterColumn(COLUMN, {
      param: "status",
      query: parseTableQuery("status=archived", DEFAULTED),
      options,
      labels: LABELS,
    });
    expect(await activeOf(custom)).toBe("true");

    // An explicit default beats the one carried by the query state.
    const explicit = filterColumn(COLUMN, {
      param: "status",
      query: query("status=archived"),
      options,
      defaults: ["archived"],
    });
    expect(await activeOf(explicit)).toBe("false");
  });

  it("names the funnel per column when asked, and falls back to the generic label", async () => {
    const named = filterColumn(COLUMN, {
      param: "status",
      query: query(""),
      options,
      labels: LABELS,
      filterLabel: "Filter by status",
    });
    let mounted = await show((named.filterIcon as () => ReactNode)());
    expect(mounted.host.querySelector("svg")?.getAttribute("aria-label")).toBe("Filter by status");
    const generic = filterColumn(COLUMN, { param: "status", query: query(""), options, labels: LABELS });
    mounted = await show((generic.filterIcon as () => ReactNode)());
    expect(mounted.host.querySelector("svg")?.getAttribute("aria-label")).toBe("Filter");
  });
});

/** Is the funnel currently marked "filtering"? */
async function activeOf(column: ColumnType<{ name: string }>): Promise<string | null> {
  const mounted = await show((column.filterIcon as () => ReactNode)());
  return byTestId(mounted.host, "status-filter-icon").getAttribute("data-active");
}

describe("sortColumn", () => {
  it("wires a controlled server-side sorter with no third state", () => {
    const column = sortColumn(COLUMN, "name", query("sort=name:asc"));
    expect(column.sorter).toBe(true);
    expect(column.sortOrder).toBe("ascend");
    expect(column.sortDirections).toEqual(["ascend", "descend"]);
    expect(sortColumn(COLUMN, "name", query("sort=name:desc")).sortOrder).toBe("descend");
    // Another column is sorted: this one shows no arrow.
    expect(sortColumn(COLUMN, "name", query("sort=updatedAt:desc")).sortOrder).toBeNull();
  });

  it("falls back to the sort key as dataIndex so antd reports the right field", () => {
    expect(sortColumn({ title: "Questions" }, "questionCount", query("")).dataIndex).toBe("questionCount");
    expect(sortColumn(COLUMN, "name", query("")).dataIndex).toBe("name");
  });

  it("reads the order straight off the query state", () => {
    expect(sortOrderFor(query("sort=updatedAt:desc"), "updatedAt")).toBe("descend");
    expect(sortOrderFor(query("sort=updatedAt:desc"), "name")).toBeNull();
  });
});

describe("withEllipsis / withClientSort / clientSearchColumn", () => {
  it("sets a target width with a single-line ellipsis", () => {
    expect(withEllipsis(COLUMN, 240)).toMatchObject({ width: 240, ellipsis: true, dataIndex: "name" });
  });

  it("keeps an in-memory comparator as the sorter", () => {
    const compare = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
    expect(withClientSort(COLUMN, compare).sorter).toBe(compare);
  });

  it("binds the same funnel to a bare keyword for in-memory tables", () => {
    expect(clientQueryState("q", "  fire  ")).toEqual({
      filters: { q: ["fire"] },
      q: "",
      sort: null,
      page: 1,
      pageSize: 0,
    });
    expect(clientQueryState("q", "   ").filters).toEqual({});
    const column = clientSearchColumn(COLUMN, { param: "q", value: "fire", labels: LABELS });
    expect(column.key).toBe("q");
    expect(column.filteredValue).toEqual(["fire"]);
  });
});
