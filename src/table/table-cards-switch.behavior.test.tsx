// @vitest-environment happy-dom
/**
 * User risk: 手机上的形态切换是自动的 —— 宿主只传一份列定义,`ClientTable` / `DataTable`
 * 自己按视口决定渲染表格还是卡片。所以这里盯三件事:断点判定(< 768px 才换)、`mobile="table"`
 * 的退出开关,以及**切换不能丢状态** —— 卡片与表格共用同一份页码和同一条筛选 / 排序通路。
 */
import type { ColumnsType } from "antd/es/table";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { byTestId, change, fill, mount, type MountedView } from "../enterprise/behavior-test-utils";
import { ClientTable } from "./client-table";
import { DataTable, type DataTableLabels } from "./data-table";
import { clientSearchColumn, searchColumn, sortColumn, withClientSort } from "./table-columns";
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
  search: "检索",
  reset: "重置",
  filter: "筛选",
  sortAsc: "升序",
  sortDesc: "降序",
  empty: "暂无数据",
  pageSize: "条/页",
};

const CONFIG: TableQueryConfig = { keys: ["q"], sortKeys: ["name"] };

interface Row {
  id: string;
  name: string;
}

const ROWS: Row[] = [
  { id: "a", name: "Registry" },
  { id: "b", name: "Portal" },
];

type Listener = (event: { matches: boolean; media: string }) => void;

const listeners = new Set<{ query: string; handler: Listener }>();
/** 环境自带的 matchMedia,afterEach 要原样放回去(别的用例还指着它)。 */
const REAL_MATCH_MEDIA = Object.getOwnPropertyDescriptor(window, "matchMedia");
let phone = false;

/** 视口桩:`useIsPhone` 订阅的就是它,`setPhone` 现场翻转并通知订阅者。 */
function installViewport(initial: boolean): void {
  phone = initial;
  listeners.clear();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      get matches() {
        return phone && query.includes("max-width: 767px");
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, handler: Listener) => listeners.add({ query, handler }),
      removeEventListener: (_type: string, handler: Listener) => {
        for (const entry of listeners) if (entry.handler === handler) listeners.delete(entry);
      },
      dispatchEvent: () => false,
    }),
  });
}

/** 只通知手机断点的订阅者 —— antd 自己也订 matchMedia,替它乱发事件会炸在库里。 */
async function setPhone(next: boolean): Promise<void> {
  phone = next;
  await act(async () => {
    for (const { query, handler } of listeners) {
      if (query.includes("max-width: 767px")) handler({ matches: next, media: query });
    }
  });
}

let view: MountedView | null = null;
let filters: Record<string, string[]>[] = [];
let applied: TableQueryPatch[] = [];

afterEach(async () => {
  await view?.unmount();
  view = null;
  filters = [];
  applied = [];
  listeners.clear();
  if (REAL_MATCH_MEDIA) Object.defineProperty(window, "matchMedia", REAL_MATCH_MEDIA);
  else Reflect.deleteProperty(window, "matchMedia");
});

function cardsRoot(): HTMLElement | null {
  return view!.host.querySelector<HTMLElement>("[data-test-id='list-cards']");
}

function tableRoot(): HTMLElement | null {
  return view!.host.querySelector<HTMLElement>(".ant-table");
}

function cardCount(): number {
  return view!.host.querySelectorAll("[data-test-id='list-cards-card']").length;
}

function rowCount(): number {
  return view!.host.querySelectorAll("tbody tr[data-row-key]").length;
}

async function pick(select: HTMLSelectElement, value: string): Promise<void> {
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(select, value);
  await change(select);
}

async function pressEnter(element: Element): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
}

async function tap(element: Element): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

/** `count` 行,够翻页。 */
function manyRows(count: number): Row[] {
  return Array.from({ length: count }, (_, index) => ({ id: `r${index}`, name: `行 ${index}` }));
}

const CLIENT_COLUMNS: ColumnsType<Row> = [
  withClientSort<Row>(
    clientSearchColumn<Row>({ title: "名称", dataIndex: "name" }, { param: "q", value: "", labels: LABELS }),
    (left, right) => left.name.localeCompare(right.name),
  ),
];

/** 表格体里每一行第一格的文字。 */
function tableNames(): string[] {
  return Array.from(view!.host.querySelectorAll("tbody tr[data-row-key] td:first-child"), (cell) => cell.textContent ?? "");
}

async function renderClient(overrides: Partial<Parameters<typeof ClientTable<Row>>[0]> = {}) {
  const node = (
    <ClientTable<Row>
      testId="list"
      rowKey="id"
      labels={LABELS}
      columns={CLIENT_COLUMNS}
      rows={ROWS}
      onFilters={(next) => filters.push(next)}
      {...overrides}
    />
  );
  if (view) await view.rerender(node);
  else view = await mount(node);
}

/** 只记 patch 的查询桩:表格自己不许解释它们。 */
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
    setPage: (page) => apply({ page }),
    setPageSize: noop,
    reset: noop,
    toListParams: () => tableListParams(state),
  };
}

const PAGE: Page<Row> = { items: ROWS, page: 1, pageSize: 20, total: 42 };

async function renderServer(overrides: Partial<Parameters<typeof DataTable<Row>>[0]> = {}) {
  const query = overrides.query ?? stubQuery();
  const node = (
    <DataTable<Row>
      testId="list"
      rowKey="id"
      labels={LABELS}
      columns={[
        sortColumn<Row>(
          searchColumn<Row>({ title: "名称" }, { param: "q", query: query.query, labels: LABELS }),
          "name",
          query.query,
        ),
      ]}
      page={PAGE}
      query={query}
      {...overrides}
    />
  );
  if (view) await view.rerender(node);
  else view = await mount(node);
}

describe("ClientTable 的手机形态", () => {
  it("手机上换成卡片,桌面上保持表格", async () => {
    installViewport(false);
    await renderClient();
    expect(tableRoot()).not.toBeNull();
    expect(cardsRoot()).toBeNull();

    await setPhone(true);
    expect(cardsRoot()).not.toBeNull();
    expect(tableRoot()).toBeNull();
    expect(cardCount()).toBe(2);
  });

  it("mobile=\"table\" 在手机上仍然渲染表格", async () => {
    installViewport(true);
    await renderClient({ mobile: "table" });
    expect(tableRoot()).not.toBeNull();
    expect(cardsRoot()).toBeNull();
  });

  it("卡片里的检索与表头同一条回调", async () => {
    installViewport(true);
    await renderClient();
    const input = byTestId(view!.host, "list-cards-search-q") as HTMLInputElement;
    await fill(input, "Portal");
    await pressEnter(input);
    expect(filters).toEqual([{ q: ["Portal"] }]);
  });

  it("手机上选的排序,切回桌面的表格仍然成立", async () => {
    installViewport(true);
    await renderClient();
    await pick(byTestId(view!.host, "list-cards-sort") as HTMLSelectElement, "name:asc");
    expect(view!.host.querySelector("[data-test-id='list-cards-card']")?.textContent).toContain("Portal");

    await setPhone(false);
    expect(tableNames()[0]).toBe("Portal");
    expect(tableNames()[1]).toBe("Registry");
  });

  it("手机上翻到第 2 页,切回桌面还在第 2 页", async () => {
    installViewport(true);
    await renderClient({ rows: manyRows(25) });
    expect(cardCount()).toBe(20);
    await tap(view!.host.querySelector(".ant-pagination-next")!);
    expect(cardCount()).toBe(5);

    await setPhone(false);
    expect(rowCount()).toBe(5);
    expect(view!.host.querySelector(".ant-pagination-item-active")?.textContent).toBe("2");
  });
});

describe("DataTable 的手机形态", () => {
  it("手机上换成卡片,mobile=\"table\" 退出", async () => {
    installViewport(true);
    await renderServer();
    expect(cardsRoot()).not.toBeNull();
    expect(cardCount()).toBe(2);

    await renderServer({ mobile: "table" });
    expect(tableRoot()).not.toBeNull();
    expect(cardsRoot()).toBeNull();
  });

  it("卡片的检索 / 排序 / 翻页都变成同一个查询 patch", async () => {
    installViewport(true);
    await renderServer();
    const input = byTestId(view!.host, "list-cards-search-q") as HTMLInputElement;
    await fill(input, "Portal");
    await pressEnter(input);
    expect(applied).toEqual([{ filters: { q: ["Portal"] } }]);

    applied = [];
    await pick(byTestId(view!.host, "list-cards-sort") as HTMLSelectElement, "name:desc");
    expect(applied).toEqual([{ sort: { key: "name", order: "desc" } }]);

    applied = [];
    await tap(view!.host.querySelector(".ant-pagination-next")!);
    expect(applied).toEqual([{ page: 2 }]);
  });

  it("排序下拉不给清空:选空值不写 patch,已排序时连空选项都没有", async () => {
    installViewport(true);
    await renderServer();
    const select = byTestId(view!.host, "list-cards-sort") as HTMLSelectElement;
    await pick(select, "");
    expect(applied).toEqual([]);

    await renderServer({ query: stubQuery("sort=name%3Aasc") });
    const sorted = byTestId(view!.host, "list-cards-sort") as HTMLSelectElement;
    expect(Array.from(sorted.options).some((option) => option.value === "")).toBe(false);
  });

  it("受控排序从列上的 sortOrder 读回来", async () => {
    installViewport(true);
    await renderServer({ query: stubQuery("sort=name%3Aasc") });
    expect((byTestId(view!.host, "list-cards-sort") as HTMLSelectElement).value).toBe("name:asc");
  });
});
