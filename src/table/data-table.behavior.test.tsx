// @vitest-environment happy-dom
/**
 * User risk: `DataTable` is the single list surface hosts standardise on. Three
 * things must hold or every list page breaks at once: the pager is bound to the
 * server envelope (not to the rows on screen), every header action becomes one
 * patch handed to the query hook (no second copy of the state inside the table),
 * and an out-of-range page is pulled back instead of showing an empty table
 * under a pager parked on page 99.
 */
import type { ColumnsType } from "antd/es/table";
import type { FilterValue, SorterResult, TableCurrentDataSource } from "antd/es/table/interface";
import { afterEach, describe, expect, it } from "vitest";

import { click, mount, type MountedView } from "../enterprise/behavior-test-utils";
import { DataTable, changePatch, filterPatch, sorterSort, type DataTableLabels } from "./data-table";
import { sortColumn } from "./table-columns";
import {
  parseTableQuery,
  tableListParams,
  type Page,
  type TableQuery,
  type TableQueryConfig,
  type TableQueryPatch,
} from "./table-query";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LABELS: DataTableLabels = {
  search: "Search",
  reset: "Reset",
  filter: "Filter",
  sortAsc: "Ascending",
  sortDesc: "Descending",
  empty: "Nothing here yet",
  pageSize: "/ page",
};

const CONFIG: TableQueryConfig = { keys: ["q"], defaults: { sort: { key: "updatedAt", order: "desc" } } };

interface Row {
  id: string;
  name: string;
}

const PAGE: Page<Row> = {
  items: [
    { id: "b1", name: "Safety" },
    { id: "b2", name: "Fire" },
  ],
  page: 1,
  pageSize: 20,
  total: 42,
};

const COLUMNS: ColumnsType<Row> = [{ title: "Name", dataIndex: "name", key: "name" }];

let view: MountedView | null = null;
let applied: TableQueryPatch[] = [];

afterEach(async () => {
  await view?.unmount();
  view = null;
  applied = [];
});

/** A query stand-in that only records patches: the table must not interpret them itself. */
function stubQuery(raw = ""): TableQuery {
  const state = parseTableQuery(raw, CONFIG);
  const noop = () => undefined;
  const apply = (patch: TableQueryPatch) => {
    applied.push(patch);
  };
  return {
    query: state,
    filtered: false,
    listParams: tableListParams(state),
    apply,
    setSearch: noop,
    setFilter: noop,
    setSort: noop,
    // In the real hook `setPage` is just an `apply`, so clamping stays observable.
    setPage: (page) => apply({ page }),
    setPageSize: noop,
    reset: noop,
    toListParams: () => tableListParams(state),
  };
}

type Overrides = Partial<Parameters<typeof DataTable<Row>>[0]>;

async function renderTable(overrides: Overrides = {}) {
  const query = overrides.query ?? stubQuery();
  const node = (
    <DataTable<Row>
      testId="bank-table"
      rowKey="id"
      columns={COLUMNS}
      page={PAGE}
      query={query}
      labels={LABELS}
      {...overrides}
    />
  );
  if (view) await view.rerender(node);
  else view = await mount(node);
  return query;
}

function el(selector: string): HTMLElement | null {
  return view!.host.querySelector<HTMLElement>(selector);
}

describe("DataTable", () => {
  it("renders the rows under one test id and keeps column widths instead of squeezing them", async () => {
    await renderTable();
    expect(view!.host.querySelectorAll('[data-test-id="bank-table"]')).toHaveLength(1);
    expect(view!.host.querySelectorAll('[data-test-id="bank-table"] tbody tr.ant-table-row')).toHaveLength(2);
    // `x: true` would make the table width auto, so ellipsis columns and the
    // fixed actions column start crushing each other.
    expect(el(".ant-table-content table")?.getAttribute("style")).toContain("max-content");
  });

  it("pulls a stale page back to the last one, and only once", async () => {
    // Out-of-range pages only come from outside (an old `?page=99` bookmark).
    const query = await renderTable({ page: { items: [], page: 99, pageSize: 20, total: 2 }, query: stubQuery("page=99") });
    expect(applied).toEqual([{ page: 1 }]);
    // The same out-of-range state re-rendered (new query object) must not
    // correct again, or it ping-pongs with the router.
    await renderTable({ page: { items: [], page: 99, pageSize: 20, total: 2 }, query: stubQuery("page=99") });
    expect(applied).toEqual([{ page: 1 }]);
    expect(query.query.page).toBe(99);
  });

  it("leaves a page inside the range alone, including an empty first page", async () => {
    await renderTable({ page: { items: [], page: 1, pageSize: 20, total: 0 } });
    await renderTable({ page: { items: [], page: 3, pageSize: 20, total: 42 }, query: stubQuery("page=3") });
    expect(applied).toEqual([]);
  });

  it("takes a page-size option list and a pagination override (dialogs start smaller)", async () => {
    await renderTable({ page: { ...PAGE, pageSize: 10 }, query: stubQuery("pageSize=10"), pageSizeOptions: [10, 20, 50] });
    // Without 10 in the list, the first page-size change would jump from 10 to 20.
    expect(el(".ant-pagination-options")?.textContent).toContain("10");
    await renderTable({ pagination: { showSizeChanger: false } });
    expect(el(".ant-pagination-options")).toBeNull();
  });

  it("binds pagination to the server envelope, not to the rows on screen", async () => {
    await renderTable();
    // total 42 / pageSize 20 → 3 pages, even though this page holds 2 rows.
    expect(view!.host.querySelectorAll(".ant-pagination-item")).toHaveLength(3);
    expect(el(".ant-pagination-options")).not.toBeNull();
  });

  it("turns a page turn into a page patch", async () => {
    await renderTable();
    await click(el(".ant-pagination-item-2 a")!);
    expect(applied).toEqual([{ page: 2 }]);
  });

  it("maps a header sort onto the server sort key", async () => {
    await renderTable({
      columns: [sortColumn<Row>({ title: "Name", dataIndex: "name" }, "name", parseTableQuery("", CONFIG))],
    });
    const header = el("th.ant-table-column-has-sorters");
    expect(header).not.toBeNull();
    await click(header!);
    expect(applied).toEqual([{ sort: { key: "name", order: "asc" } }]);
  });

  it("shows the shared empty state when the page has no rows, and lets the caller replace it", async () => {
    await renderTable({ page: { items: [], page: 1, pageSize: 20, total: 0 } });
    expect(el('[data-test-id="bank-table-empty"]')?.textContent).toContain("Nothing here yet");
    await renderTable({
      page: { items: [], page: 1, pageSize: 20, total: 0 },
      empty: <span data-test-id="bank-empty">No matches</span>,
    });
    expect(el('[data-test-id="bank-empty"]')?.textContent).toBe("No matches");
    expect(el('[data-test-id="bank-table-empty"]')).toBeNull();
  });

  it("appends the host's actions as the last column", async () => {
    await renderTable({
      actions: {
        title: "Actions",
        testId: "bank-actions",
        render: (row) => <button data-test-id={`bank-open-${row.id}`}>Open</button>,
      },
    });
    expect(el('[data-test-id="bank-open-b1"]')).not.toBeNull();
    expect(view!.host.querySelectorAll('[data-test-id="bank-actions"]')).toHaveLength(2);
    // `fixed: "right"` pins it by measuring widths, which happy-dom cannot do —
    // so only the column order is asserted here.
    const headers = [...view!.host.querySelectorAll("thead th")].map((cell) => cell.textContent);
    expect(headers.at(-1)).toBe("Actions");
  });
});

describe("changePatch", () => {
  const query = stubQuery();
  const extra = (action: "paginate" | "filter" | "sort" | undefined) =>
    ({ action, currentDataSource: [] }) as TableCurrentDataSource<Row>;
  const noSorter = {} as SorterResult<Row>;

  it("separates a page turn from a page-size change (a new size goes back to page 1)", () => {
    expect(changePatch<Row>(query, { current: 3, pageSize: 20 }, {}, noSorter, extra("paginate"))).toEqual({ page: 3 });
    expect(changePatch<Row>(query, { current: 3, pageSize: 50 }, {}, noSorter, extra("paginate"))).toEqual({
      pageSize: 50,
      page: 1,
    });
  });

  it("routes filter and sort actions, and ignores anything else", () => {
    expect(changePatch<Row>(query, {}, { q: ["fire"] }, noSorter, extra("filter"))).toEqual({
      filters: { q: ["fire"] },
    });
    expect(
      changePatch<Row>(query, {}, {}, { field: "name", order: "ascend" } as SorterResult<Row>, extra("sort")),
    ).toEqual({ sort: { key: "name", order: "asc" } });
    expect(changePatch<Row>(query, {}, {}, noSorter, extra(undefined))).toBeNull();
  });
});

describe("filterPatch / sorterSort", () => {
  it("collects every filterable column, clearing the ones with no selection", () => {
    const filters: Record<string, FilterValue | null> = { q: ["fire"], status: null, visibility: ["company", "subtree"] };
    expect(filterPatch(filters)).toEqual({ q: ["fire"], status: [], visibility: ["company", "subtree"] });
  });

  it("takes the one active sorter and prefers the column's field", () => {
    expect(sorterSort<Row>({ field: "name", columnKey: "q", order: "ascend" } as SorterResult<Row>)).toEqual({
      key: "name",
      order: "asc",
    });
    expect(sorterSort<Row>({ columnKey: "updatedAt", order: "descend" } as SorterResult<Row>)).toEqual({
      key: "updatedAt",
      order: "desc",
    });
    expect(sorterSort<Row>({ field: "name" } as SorterResult<Row>)).toBeNull();
    expect(sorterSort<Row>([{ field: "name" }, { field: "updatedAt", order: "descend" }] as SorterResult<Row>[])).toEqual(
      { key: "updatedAt", order: "desc" },
    );
  });

  it("turns antd's third click (clear sort) into a direction flip", () => {
    // The URL has no "explicitly unsorted" slot — an absent `sort` *is* the
    // default sort, so clearing would come back on the next refresh. On a clear
    // antd does not even report the column; with single-column sort it can only
    // be the current one.
    const cancelled = { column: undefined, order: undefined, field: undefined, columnKey: undefined } as SorterResult<Row>;
    expect(sorterSort<Row>(cancelled, { key: "submittedAt", order: "desc" })).toEqual({
      key: "submittedAt",
      order: "asc",
    });
    expect(sorterSort<Row>(cancelled, { key: "submittedAt", order: "asc" })).toEqual({
      key: "submittedAt",
      order: "desc",
    });
    // With no sort to begin with, a clear is still no sort.
    expect(sorterSort<Row>(cancelled, null)).toBeNull();
  });
});
