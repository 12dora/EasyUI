// @vitest-environment happy-dom
/**
 * User risk: 手机上列表页是靠卡片读的。四件事错一件,整批列表页就废了 ——
 * 卡片必须用**同一份列定义**长出来(标题、定义表、动作、隐藏列都按标记走),
 * 工具条上的检索 / 筛选 / 排序必须落到与表头一模一样的那条状态通路上(否则 URL 与请求
 * 会分叉),选择要真的写回 `rowSelection`,分页要和桌面共用页码。
 */
import type { ColumnsType } from "antd/es/table";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { byTestId, change, fill, mount, type MountedView } from "../enterprise/behavior-test-utils";
import { TableCards } from "./table-cards";
import type { DataTableLabels } from "./data-table";
import { clientSearchColumn, filterColumn, withClientSort, type MobileColumn } from "./table-columns";
import { clientQueryState } from "./table-columns";

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

interface Row {
  id: string;
  name: string;
  owner: string;
  note: string;
}

const ROWS: Row[] = [
  { id: "a", name: "Registry", owner: "Ann", note: "" },
  { id: "b", name: "Portal", owner: "Bob", note: "备注" },
];

interface ColumnOptions {
  keyword?: string;
  status?: string;
  titleOnOwner?: boolean;
  placeholder?: string;
}

/** 一份"什么都有"的列定义:检索列、普通列、空值列、隐藏列、可排序列、右固定动作列。 */
function columnsOf({ keyword = "", status = "", titleOnOwner = false, placeholder }: ColumnOptions = {}): ColumnsType<Row> {
  const owner: MobileColumn<Row> = { title: "负责人", dataIndex: "owner", key: "owner" };
  return [
    clientSearchColumn<Row>(
      { title: "名称", dataIndex: "name" },
      { param: "q", value: keyword, labels: LABELS, placeholder, subject: (row) => ({ name: row.name }) },
    ),
    withClientSort<Row>(titleOnOwner ? { ...owner, mobile: "title" } : owner, (left, right) =>
      left.owner.localeCompare(right.owner),
    ),
    { title: "备注", dataIndex: "note", key: "note" },
    { title: "编号", dataIndex: "id", key: "id", mobile: "hidden" } as MobileColumn<Row>,
    filterColumn<Row>(
      { title: "状态", dataIndex: "status" },
      {
        param: "status",
        query: clientQueryState("status", status),
        options: [
          { text: "启用", value: "on" },
          { text: "停用", value: "off" },
        ],
        labels: LABELS,
      },
    ),
    { title: "操作", key: "actions", fixed: "right", render: (_value, row: Row) => <span>{`编辑 ${row.id}`}</span> },
  ];
}

let view: MountedView | null = null;
let filters: Record<string, string[]>[] = [];
let selected: unknown[][] = [];

afterEach(async () => {
  await view?.unmount();
  view = null;
  filters = [];
  selected = [];
});

type Overrides = Partial<Parameters<typeof TableCards<Row>>[0]>;

async function renderCards(overrides: Overrides = {}) {
  const node = (
    <TableCards<Row>
      testId="list"
      rowKey="id"
      labels={LABELS}
      columns={columnsOf()}
      rows={ROWS}
      onFilters={(next) => filters.push(next)}
      {...overrides}
    />
  );
  if (view) await view.rerender(node);
  else view = await mount(node);
  return view;
}

function cards(): HTMLElement[] {
  return Array.from(view!.host.querySelectorAll<HTMLElement>("[data-test-id='list-cards-card']"));
}

/** 一张卡的「字段名 → 字段值」。 */
function definitions(card: HTMLElement): Record<string, string> {
  const terms = Array.from(card.querySelectorAll("dt"), (node) => node.textContent ?? "");
  const values = Array.from(card.querySelectorAll("dd"), (node) => node.textContent ?? "");
  return Object.fromEntries(terms.map((term, index) => [term, values[index] ?? ""]));
}

function title(card: HTMLElement): string {
  return card.querySelector("div")?.textContent ?? "";
}

function inputOf(testId: string): HTMLInputElement {
  const node = byTestId(view!.host, testId);
  const input = node instanceof HTMLInputElement ? node : node.querySelector("input");
  if (!input) throw new Error(`No input under ${testId}`);
  return input;
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

async function toggle(element: Element): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("TableCards", () => {
  it("每行一张卡:第一列当标题,其余列排成定义表", async () => {
    await renderCards();
    expect(cards()).toHaveLength(2);
    expect(title(cards()[0]!)).toBe("Registry");
    expect(cards()[0]!.getAttribute("data-row-key")).toBe("a");
    expect(definitions(cards()[1]!)).toMatchObject({ 负责人: "Bob", 备注: "备注" });
  });

  it("跳过空单元格与 mobile:\"hidden\" 的列", async () => {
    await renderCards();
    const first = definitions(cards()[0]!);
    // 第一行 note 是空串:桌面上是留白,卡片里不占一行。
    expect(first).not.toHaveProperty("备注");
    expect(first).not.toHaveProperty("编号");
    expect(first.负责人).toBe("Ann");
  });

  it("mobile:\"title\" 抢下标题位,原标题列退回定义表", async () => {
    await renderCards({ columns: columnsOf({ titleOnOwner: true }) });
    expect(title(cards()[0]!)).toBe("Ann");
    expect(definitions(cards()[0]!)).toMatchObject({ 名称: "Registry" });
  });

  it("动作列渲染在卡片底部,不混进定义表", async () => {
    await renderCards();
    expect(cards()[0]!.textContent).toContain("编辑 a");
    expect(definitions(cards()[0]!)).not.toHaveProperty("操作");
  });

});

describe("TableCards 的选择、工具条与分页", () => {
  it("勾选卡片把 key 与行原样写回 rowSelection", async () => {
    await renderCards({
      rowSelection: {
        selectedRowKeys: [],
        onChange: (keys, rows) => selected.push([keys, rows]),
      },
    });
    await toggle(inputOf("list-cards-select-b"));
    expect(selected).toEqual([[["b"], [ROWS[1]]]]);
  });

  it("本页全选勾上当前页的每一行,取消则清空", async () => {
    await renderCards({
      rowSelection: { selectedRowKeys: ["a", "b"], onChange: (keys) => selected.push([keys]) },
    });
    const all = inputOf("list-cards-select-all");
    expect(all.checked).toBe(true);
    await toggle(all);
    expect(selected).toEqual([[[]]]);
  });

  it("工具条检索按表头同一份契约提交(带上全部受控筛选列)", async () => {
    await renderCards();
    await fill(inputOf("list-cards-search-q"), "  Registry  ");
    await pressEnter(inputOf("list-cards-search-q"));
    expect(filters).toEqual([{ q: ["Registry"], status: [] }]);
  });

  it("枚举筛选走同一个 patch", async () => {
    await renderCards();
    await pick(byTestId(view!.host, "list-cards-filter-status") as HTMLSelectElement, "off");
    expect(filters).toEqual([{ q: [], status: ["off"] }]);
  });

  it("已应用的检索词过滤行(列自带 onFilter 时由卡片执行)", async () => {
    await renderCards({ columns: columnsOf({ keyword: "Portal" }) });
    expect(cards()).toHaveLength(1);
    expect(title(cards()[0]!)).toBe("Portal");
  });

  it("排序下拉按列的 sorter 函数重排卡片", async () => {
    await renderCards();
    const sort = byTestId(view!.host, "list-cards-sort") as HTMLSelectElement;
    await pick(sort, "owner:desc");
    expect(cards().map(title)).toEqual(["Portal", "Registry"]);
    await pick(sort, "owner:asc");
    expect(cards().map(title)).toEqual(["Registry", "Portal"]);
  });

  it("本地分页只渲染当前页,一页装得下就没有分页器", async () => {
    const many = Array.from({ length: 25 }, (_, index) => ({
      id: `r${index}`,
      name: `行 ${index}`,
      owner: "Ann",
      note: "",
    }));
    let page = 1;
    await renderCards({
      rows: many,
      columns: [{ title: "名称", dataIndex: "name", key: "name" }],
      pagination: { current: page, pageSize: 20, onChange: (next) => (page = next) },
    });
    expect(cards()).toHaveLength(20);
    expect(byTestId(view!.host, "list-cards-pagination")).toBeTruthy();

    await toggle(view!.host.querySelector(".ant-pagination-next")!);
    expect(page).toBe(2);
    await renderCards({
      rows: many,
      columns: [{ title: "名称", dataIndex: "name", key: "name" }],
      pagination: { current: page, pageSize: 20, onChange: (next) => (page = next) },
    });
    expect(cards()).toHaveLength(5);
  });

  it("服务端分页(带 total)不再本地切片", async () => {
    await renderCards({ pagination: { current: 2, pageSize: 2, total: 40, onChange: () => undefined } });
    expect(cards()).toHaveLength(2);
    expect(byTestId(view!.host, "list-cards-pagination")).toBeTruthy();
  });


});

describe("TableCards 的列解读与加载态", () => {
  it("列组拍平成定义项,不会整片消失", async () => {
    await renderCards({
      columns: [
        { title: "名称", dataIndex: "name", key: "name" },
        { title: "归属", children: [{ title: "负责人", dataIndex: "owner", key: "owner" }] },
      ],
    });
    expect(definitions(cards()[0]!)).toMatchObject({ 负责人: "Ann" });
  });

  it("多个右固定列都落进动作行,一个都不丢", async () => {
    await renderCards({
      columns: [
        { title: "名称", dataIndex: "name", key: "name" },
        { title: "状态", key: "state", fixed: "right", render: () => <span>已启用</span> },
        { title: "操作", key: "actions", fixed: "right", render: (_value, row: Row) => <span>{`编辑 ${row.id}`}</span> },
      ],
    });
    expect(cards()[0]!.textContent).toContain("已启用");
    expect(cards()[0]!.textContent).toContain("编辑 a");
    expect(definitions(cards()[0]!)).not.toHaveProperty("状态");
  });

  it("加载中且还没有行时给占位卡,而不是空状态", async () => {
    await renderCards({ rows: [], loading: true });
    expect(byTestId(view!.host, "list-cards-loading")).toBeTruthy();
    expect(view!.host.querySelector("[data-test-id='list-empty']")).toBeNull();
  });

  it("全选只数可选的行,禁用行既不勾也不让它半选", async () => {
    await renderCards({
      rowSelection: {
        selectedRowKeys: ["a"],
        getCheckboxProps: (row: Row) => ({ disabled: row.id === "b" }),
        onChange: (keys) => selected.push([keys]),
      },
    });
    const all = inputOf("list-cards-select-all");
    expect(inputOf("list-cards-select-b").disabled).toBe(true);
    expect(all.checked).toBe(true);
    expect(all.getAttribute("aria-checked")).not.toBe("mixed");
    await toggle(all);
    expect(selected).toEqual([[[]]]);
  });

  it("hideSelectAll 把整行全选藏掉", async () => {
    await renderCards({ rowSelection: { selectedRowKeys: [], hideSelectAll: true, onChange: () => undefined } });
    expect(view!.host.querySelector("[data-test-id='list-cards-select-all']")).toBeNull();
  });

  it("行选择框的读屏名字带上这一行的标题", async () => {
    await renderCards({ rowSelection: { selectedRowKeys: [], onChange: () => undefined } });
    expect(inputOf("list-cards-select-a").getAttribute("aria-label")).toBe("选择 Registry");
  });

  it("检索框的名字就是列名,列自带 placeholder 时用它", async () => {
    await renderCards();
    expect(inputOf("list-cards-search-q").getAttribute("placeholder")).toBe("名称");
    await renderCards({ columns: columnsOf({ placeholder: "名称或编号" }) });
    expect(inputOf("list-cards-search-q").getAttribute("placeholder")).toBe("名称或编号");
  });

  it("空列表落到与表格同一个空状态", async () => {
    await renderCards({ rows: [] });
    expect(byTestId(view!.host, "list-empty").textContent).toContain("暂无数据");
  });
});
