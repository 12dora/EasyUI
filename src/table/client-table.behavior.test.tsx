// @vitest-environment happy-dom
/**
 * User risk: the in-memory table is what API-key lists, import results and
 * picker dialogs render. It has to keep the same conventions as `DataTable`
 * (header-only search, shared empty state), page a long array locally without
 * putting pager chrome under a short one, and hand the submitted keyword back
 * to the caller, since filtering the rows is the caller's job.
 */
import { afterEach, describe, expect, it } from "vitest";

import { byTestId, click, fill, mount, type MountedView } from "../enterprise/behavior-test-utils";
import { ClientTable, type ClientTableProps } from "./client-table";
import type { DataTableLabels } from "./data-table";
import { clientSearchColumn } from "./table-columns";

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

interface Row {
  id: string;
  name: string;
}

const ROWS: Row[] = [
  { id: "a", name: "Registry" },
  { id: "b", name: "Portal" },
];

/** `count` distinct rows — enough of them to cross the default page size. */
function manyRows(count: number, prefix = "row"): Row[] {
  return Array.from({ length: count }, (_, index) => ({ id: `${prefix}-${index}`, name: `${prefix} ${index}` }));
}

/** One array identity, so a rerender only changes the keyword. */
const LONG_ROWS = manyRows(25);

function rowCount(host: ParentNode): number {
  return host.querySelectorAll("tbody tr[data-row-key]").length;
}

let view: MountedView | null = null;
let searched: Record<string, string[]>[] = [];

afterEach(async () => {
  await view?.unmount();
  view = null;
  searched = [];
});

interface Options {
  keyword?: string;
  rows?: readonly Row[];
  pagination?: ClientTableProps<Row>["pagination"];
  /** Let antd filter the rows itself (the people-column contract), instead of the caller. */
  filterRows?: boolean;
}

async function renderTable({ keyword = "", rows = ROWS, pagination, filterRows }: Options = {}) {
  const node = (
    <ClientTable<Row>
      testId="client-table"
      rowKey="id"
      labels={LABELS}
      rows={rows}
      pagination={pagination}
      columns={[
        clientSearchColumn<Row>(
          { title: "Name", dataIndex: "name" },
          {
            param: "q",
            value: keyword,
            labels: LABELS,
            testId: "row-search",
            ...(filterRows ? { subject: (row: Row) => ({ name: row.name }) } : {}),
          },
        ),
      ]}
      onFilters={(filters) => {
        searched.push(filters);
      }}
    />
  );
  if (view) await view.rerender(node);
  else view = await mount(node);
  return view;
}

describe("ClientTable", () => {
  it("renders a short list whole, with no pager and a dim header search icon", async () => {
    const mounted = await renderTable();
    expect(rowCount(mounted.host)).toBe(2);
    expect(mounted.host.querySelector(".ant-pagination")).toBeNull();
    expect(byTestId(mounted.host, "row-search-icon").getAttribute("data-active")).toBe("false");
  });

  it("keeps the pager away from a list that fits on one page", async () => {
    const mounted = await renderTable({ rows: manyRows(10) });
    expect(rowCount(mounted.host)).toBe(10);
    expect(mounted.host.querySelector(".ant-pagination")).toBeNull();
  });

  it("pages a long list at 20 rows and shows the pager", async () => {
    const mounted = await renderTable({ rows: manyRows(25) });
    expect(rowCount(mounted.host)).toBe(20);
    expect(mounted.host.querySelector(".ant-pagination")).not.toBeNull();
    expect(mounted.host.querySelectorAll(".ant-pagination-item")).toHaveLength(2);
  });

  it("honours a custom page size", async () => {
    const mounted = await renderTable({ rows: manyRows(25), pagination: { pageSize: 10 } });
    expect(rowCount(mounted.host)).toBe(10);
    expect(mounted.host.querySelector(".ant-pagination")).not.toBeNull();
  });

  it("renders every row and no pager with pagination={false}", async () => {
    const mounted = await renderTable({ rows: manyRows(25), pagination: false });
    expect(rowCount(mounted.host)).toBe(25);
    expect(mounted.host.querySelector(".ant-pagination")).toBeNull();
  });

  it("returns to page 1 when the rows prop changes", async () => {
    const mounted = await renderTable({ rows: manyRows(25) });
    await click(mounted.host.querySelector<HTMLElement>(".ant-pagination-item-2")!);
    expect(rowCount(mounted.host)).toBe(5);
    expect(mounted.host.querySelector(".ant-pagination-item-active")?.textContent).toBe("2");

    await renderTable({ rows: manyRows(25, "next") });
    expect(rowCount(mounted.host)).toBe(20);
    expect(mounted.host.querySelector(".ant-pagination-item-active")?.textContent).toBe("1");
  });

  it("returns to page 1 when a header filter changes the visible set", async () => {
    const mounted = await renderTable({ rows: LONG_ROWS, filterRows: true });
    await click(mounted.host.querySelector<HTMLElement>(".ant-pagination-item-2")!);
    expect(mounted.host.querySelector(".ant-pagination-item-active")?.textContent).toBe("2");

    // 同一个 rows 数组,只换关键字:过滤由 antd 做,页码照样要回到第一页。
    await renderTable({ rows: LONG_ROWS, filterRows: true, keyword: "row" });
    expect(rowCount(mounted.host)).toBe(20);
    expect(mounted.host.querySelector(".ant-pagination-item-active")?.textContent).toBe("1");
  });

  it("falls back to the shared empty state", async () => {
    const mounted = await renderTable({ rows: [] });
    expect(byTestId(mounted.host, "client-table-empty").textContent).toContain("Nothing here yet");
  });

  it("marks the search icon as active while a keyword is applied", async () => {
    const mounted = await renderTable({ keyword: "Registry" });
    expect(byTestId(mounted.host, "row-search-icon").getAttribute("data-active")).toBe("true");
  });

  it("hands a submitted keyword back to the caller, trimmed", async () => {
    const mounted = await renderTable();
    await click(mounted.host.querySelector<HTMLElement>(".ant-table-filter-trigger")!);
    // antd renders the dropdown in a portal on document.body.
    await fill(byTestId(document.body, "row-search-input") as HTMLInputElement, "  Registry  ");
    await click(byTestId(document.body, "row-search-submit"));
    expect(searched).toEqual([{ q: ["Registry"] }]);
  });
});
