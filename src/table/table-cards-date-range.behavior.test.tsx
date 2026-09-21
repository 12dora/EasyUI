// @vitest-environment happy-dom
/**
 * User risk: 手机上没有表头,日期区间列(`dateRangeColumn`)如果被当成关键词检索,用户就会
 * 对着一个"提交时间"检索框敲字;如果工具条不给它控件,这个筛选在手机上就彻底够不着。
 * 工具条上的改动还必须与表头同一条契约:两个 key 一起写、开放一端清掉、倒挂对调。
 */
import type { ColumnsType } from "antd/es/table";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { byTestId, click, fill, mount, type MountedView } from "../enterprise/behavior-test-utils";
import type { DataTableLabels } from "./data-table";
import { DATE_RANGE_LABELS_EN, dateRangeColumn } from "./date-range-column";
import { TableCards } from "./table-cards";
import { searchColumnsOf } from "./table-cards-columns";
import { clientSearchColumn } from "./table-columns";
import { parseTableQuery, tableListParams, tableQueryOf, type TableQueryConfig } from "./table-query";

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
  note: string;
}

const ROWS: Row[] = [{ id: "a", name: "Registry", note: "2026-09-02" }];

let view: MountedView | null = null;
let filters: Record<string, string[]>[] = [];

afterEach(async () => {
  await view?.unmount();
  view = null;
  filters = [];
});

async function renderCards(columns: ColumnsType<Row>) {
  const node = (
    <TableCards<Row>
      testId="list"
      rowKey="id"
      labels={LABELS}
      columns={columns}
      rows={ROWS}
      onFilters={(next) => filters.push(next)}
    />
  );
  if (view) await view.rerender(node);
  else view = await mount(node);
  return view;
}

function inputOf(testId: string): HTMLInputElement {
  return byTestId(view!.host, testId) as HTMLInputElement;
}

/** 检索列 + 日期区间列(`dateRangeColumn`,真实 URL 状态 `raw`)。 */
const RANGE_CONFIG: TableQueryConfig = {
  keys: ["q", "submittedFrom", "submittedTo"],
  dateKeys: ["submittedFrom", "submittedTo"],
};

function rangeColumnsOf(raw = "", labels: DataTableLabels = LABELS): ColumnsType<Row> {
  const state = parseTableQuery(raw, RANGE_CONFIG);
  const table = tableQueryOf(state, tableListParams(state), () => undefined, RANGE_CONFIG);
  return [
    clientSearchColumn<Row>({ title: "名称", dataIndex: "name" }, { param: "q", value: "", labels }),
    dateRangeColumn<Row>(
      { title: "提交时间", dataIndex: "note" },
      { fromKey: "submittedFrom", toKey: "submittedTo", table, labels },
    ),
  ];
}

describe("TableCards 的日期区间筛选", () => {
  it("日期区间列不算关键词检索列,工具条给它两个日期输入", async () => {
    const columns = rangeColumnsOf();
    expect(searchColumnsOf(columns).map((column) => column.key)).toEqual(["q"]);
    await renderCards(columns);
    expect(view!.host.querySelectorAll("input[type='search']")).toHaveLength(1);
    expect(inputOf("list-cards-range-submittedFrom-from").type).toBe("date");
    expect(inputOf("list-cards-range-submittedFrom-to").type).toBe("date");
    expect(inputOf("list-cards-range-submittedFrom-from").getAttribute("aria-label")).toBe("提交时间 开始日期");
    expect(inputOf("list-cards-range-submittedFrom-to").getAttribute("aria-label")).toBe("提交时间 结束日期");
  });

  it("选一端就提交两个 key(另一端保持开放),其余受控筛选列照旧带上", async () => {
    await renderCards(rangeColumnsOf("submittedTo=2026-09-15"));
    expect(inputOf("list-cards-range-submittedFrom-to").value).toBe("2026-09-15");
    await fill(inputOf("list-cards-range-submittedFrom-from"), "2026-09-03");
    expect(filters).toEqual([{ q: [], submittedFrom: ["2026-09-03"], submittedTo: ["2026-09-15"] }]);
  });

  it("倒挂的区间交出去之前两端对调", async () => {
    await renderCards(rangeColumnsOf("submittedTo=2026-09-01"));
    await fill(inputOf("list-cards-range-submittedFrom-from"), "2026-09-15");
    expect(filters).toEqual([{ q: [], submittedFrom: ["2026-09-01"], submittedTo: ["2026-09-15"] }]);
  });

  it("重置同时清掉两个 key;没有值时不给重置按钮", async () => {
    await renderCards(rangeColumnsOf());
    expect(view!.host.querySelector("[data-test-id='list-cards-range-submittedFrom-reset']")).toBeNull();
    await renderCards(rangeColumnsOf("submittedFrom=2026-09-01&submittedTo=2026-09-15"));
    await click(byTestId(view!.host, "list-cards-range-submittedFrom-reset"));
    expect(filters).toEqual([{ q: [], submittedFrom: [], submittedTo: [] }]);
  });

  it("英文文案跟着表格文案里的 dateRange 走", async () => {
    const labels = { ...LABELS, dateRange: DATE_RANGE_LABELS_EN };
    await renderCards(rangeColumnsOf("submittedFrom=2026-09-01", labels));
    expect(inputOf("list-cards-range-submittedFrom-from").getAttribute("aria-label")).toBe("提交时间 Start date");
    expect(byTestId(view!.host, "list-cards-range-submittedFrom-reset").textContent).toBe("Reset");
  });

  it("日期输入里回车不会提交宿主外层的 <form>", async () => {
    await renderCards(rangeColumnsOf());
    const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    await act(async () => {
      inputOf("list-cards-range-submittedFrom-from").dispatchEvent(enter);
    });
    expect(enter.defaultPrevented).toBe(true);
  });
});
