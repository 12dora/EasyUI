// @vitest-environment happy-dom
/**
 * 用户风险:行距是一份跨页面的观感偏好,却最容易退化成"某一张表自己的 prop" ——
 * 那样设置页改完只有一张表跟着变。这里钉住四件事:没有 Provider 时全站默认紧凑、
 * 挂上 Provider 后两种表格一起跟随、显式 `density` 仍然压得过上下文,以及档位要
 * 发布到 `<html data-ui-density>` —— 那是表单侧(`--ui-gap-*`)唯一的传输层,漏写
 * 的话设置页改完表格跟着变、表单还是老样子。
 */
import { afterEach, describe, expect, it } from "vitest";

import { byTestId, click, mount, type MountedView } from "../enterprise/behavior-test-utils";
import { ClientTable } from "./client-table";
import { DataTable, type DataTableLabels } from "./data-table";
import { DEFAULT_TABLE_DENSITY, TableDensityProvider, tableSizeOf, useTableDensity } from "./table-density";
import { parseTableQuery, tableListParams, type Page, type TableQuery, type TableQueryConfig } from "./table-query";

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

const ROWS: Row[] = [{ id: "a", name: "Registry" }];
const PAGE: Page<Row> = { items: ROWS, page: 1, pageSize: 20, total: 1 };
const COLUMNS = [{ title: "Name", dataIndex: "name", key: "name" }];

const CONFIG: TableQueryConfig = { keys: [] };

/** 查询状态在这份用例里无关紧要:只记录不解释。 */
function stubQuery(): TableQuery {
  const state = parseTableQuery("", CONFIG);
  const noop = () => undefined;
  return {
    query: state,
    filtered: false,
    listParams: tableListParams(state),
    apply: noop,
    setSearch: noop,
    setFilter: noop,
    setSort: noop,
    setPage: noop,
    setPageSize: noop,
    reset: noop,
    toListParams: () => tableListParams(state),
  };
}

const QUERY = stubQuery();

let view: MountedView | null = null;

afterEach(async () => {
  await view?.unmount();
  view = null;
  document.documentElement.removeAttribute("data-ui-density");
});

/** antd 把档位写成根节点的 class(middle 落成 `ant-table-medium`),所以"密度生效了吗"看得见。 */
function tableSizeClass(host: ParentNode): "small" | "middle" | "large" {
  const table = host.querySelector(".ant-table");
  if (!table) throw new Error("no table rendered");
  if (table.classList.contains("ant-table-small")) return "small";
  if (table.classList.contains("ant-table-medium")) return "middle";
  return "large";
}

describe("表格密度", () => {
  it("档位映射:紧凑 → small,宽松 → middle", () => {
    expect(DEFAULT_TABLE_DENSITY).toBe("compact");
    expect(tableSizeOf("compact")).toBe("small");
    expect(tableSizeOf("comfortable")).toBe("middle");
  });

  it("没有 Provider 时两种表格都按全局默认(紧凑)渲染", async () => {
    view = await mount(
      <>
        <ClientTable<Row> testId="client" columns={COLUMNS} rows={ROWS} rowKey="id" labels={LABELS} />
        <DataTable<Row> testId="server" columns={COLUMNS} page={PAGE} query={QUERY} rowKey="id" labels={LABELS} />
      </>,
    );
    expect(tableSizeClass(byTestId(view.host, "client"))).toBe("small");
    expect(tableSizeClass(byTestId(view.host, "server"))).toBe("small");
  });

  it("挂上 Provider 后两种表格一起跟随账号偏好", async () => {
    view = await mount(
      <TableDensityProvider value="comfortable" onChange={() => undefined}>
        <ClientTable<Row> testId="client" columns={COLUMNS} rows={ROWS} rowKey="id" labels={LABELS} />
        <DataTable<Row> testId="server" columns={COLUMNS} page={PAGE} query={QUERY} rowKey="id" labels={LABELS} />
      </TableDensityProvider>,
    );
    expect(tableSizeClass(byTestId(view.host, "client"))).toBe("middle");
    expect(tableSizeClass(byTestId(view.host, "server"))).toBe("middle");
  });

  it("显式 density 压过上下文", async () => {
    view = await mount(
      <TableDensityProvider value="comfortable" onChange={() => undefined}>
        <ClientTable<Row> testId="client" columns={COLUMNS} rows={ROWS} rowKey="id" labels={LABELS} density="compact" />
      </TableDensityProvider>,
    );
    expect(tableSizeClass(byTestId(view.host, "client"))).toBe("small");
  });

  it("把档位发布到 <html data-ui-density>,改档时跟着改", async () => {
    // CSS 侧靠这个属性换 `--ui-gap-*` / `--ui-field-gap`,表单的松紧全挂在它上面。
    view = await mount(
      <TableDensityProvider value="comfortable" onChange={() => undefined}>
        <ClientTable<Row> testId="client" columns={COLUMNS} rows={ROWS} rowKey="id" labels={LABELS} />
      </TableDensityProvider>,
    );
    expect(document.documentElement.getAttribute("data-ui-density")).toBe("comfortable");

    await view.rerender(
      <TableDensityProvider value="compact" onChange={() => undefined}>
        <ClientTable<Row> testId="client" columns={COLUMNS} rows={ROWS} rowKey="id" labels={LABELS} />
      </TableDensityProvider>,
    );
    expect(document.documentElement.getAttribute("data-ui-density")).toBe("compact");
    expect(tableSizeClass(byTestId(view.host, "client"))).toBe("small");
  });

  it("消费者拿到的写回口就是宿主传进来的那一个", async () => {
    const changed: string[] = [];
    function Consumer() {
      const { density, setDensity, saving } = useTableDensity();
      return (
        <button type="button" data-test-id="toggle" data-density={density} data-saving={String(saving)} onClick={() => void setDensity("comfortable")}>
          {density}
        </button>
      );
    }
    view = await mount(
      <TableDensityProvider value="compact" saving onChange={(next) => { changed.push(next); }}>
        <Consumer />
      </TableDensityProvider>,
    );
    const button = byTestId(view.host, "toggle");
    expect(button.getAttribute("data-density")).toBe("compact");
    expect(button.getAttribute("data-saving")).toBe("true");
    await click(button);
    expect(changed).toEqual(["comfortable"]);
  });
});
