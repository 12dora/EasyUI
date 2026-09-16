// @vitest-environment happy-dom
/**
 * User risk: the unpaginated table is what API-key lists, import results and
 * picker dialogs render. It has to keep the same conventions as `DataTable`
 * (header-only search, shared empty state, no pager) and hand the submitted
 * keyword back to the caller, since filtering the rows is the caller's job.
 */
import { afterEach, describe, expect, it } from "vitest";

import { byTestId, click, fill, mount, type MountedView } from "../enterprise/behavior-test-utils";
import { ClientTable } from "./client-table";
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

let view: MountedView | null = null;
let searched: Record<string, string[]>[] = [];

afterEach(async () => {
  await view?.unmount();
  view = null;
  searched = [];
});

async function renderTable(keyword = "", rows: readonly Row[] = ROWS) {
  const node = (
    <ClientTable<Row>
      testId="client-table"
      rowKey="id"
      labels={LABELS}
      rows={rows}
      columns={[
        clientSearchColumn<Row>(
          { title: "Name", dataIndex: "name" },
          { param: "q", value: keyword, labels: LABELS, testId: "row-search" },
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
  it("renders the rows with no pagination and a dim header search icon", async () => {
    const mounted = await renderTable();
    expect(mounted.host.querySelectorAll("tbody tr[data-row-key]")).toHaveLength(2);
    expect(mounted.host.querySelector(".ant-pagination")).toBeNull();
    expect(byTestId(mounted.host, "row-search-icon").getAttribute("data-active")).toBe("false");
  });

  it("falls back to the shared empty state", async () => {
    const mounted = await renderTable("", []);
    expect(byTestId(mounted.host, "client-table-empty").textContent).toContain("Nothing here yet");
  });

  it("marks the search icon as active while a keyword is applied", async () => {
    const mounted = await renderTable("Registry");
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
