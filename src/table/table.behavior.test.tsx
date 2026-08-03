// @vitest-environment node
/**
 * User risk: the table shell is the single antd Table boundary for hosts —
 * if the pagination envelope, empty state or test hooks regress, every list
 * page in every consuming host regresses at once.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DataTableShell } from "./data-table-shell";

interface Row {
  id: string;
  name: string;
}

const columns = [{ title: "Name", dataIndex: "name", key: "name" }];
const rows: Row[] = [
  { id: "r1", name: "Alpha" },
  { id: "r2", name: "Beta" },
];

describe("DataTableShell antd boundary contract", () => {
  it("renders columns, rows and the data-test-id hook", () => {
    const markup = renderToStaticMarkup(
      <DataTableShell<Row>
        columns={columns}
        dataSource={rows}
        rowKey={(r) => r.id}
        data-test-id="example-table"
      />,
    );
    expect(markup).toContain('data-test-id="example-table"');
    expect(markup).toContain("Name");
    expect(markup).toContain("Alpha");
    expect(markup).toContain("Beta");
  });

  it("maps the pagination envelope onto antd pagination (page starts at 1)", () => {
    const markup = renderToStaticMarkup(
      <DataTableShell<Row>
        columns={columns}
        dataSource={rows}
        rowKey={(r) => r.id}
        pagination={{ page: 2, pageSize: 10, totalItems: 57, totalPages: 6 }}
      />,
    );
    // 57 items / 10 per page → 6 pages, current page 2 marked active.
    expect(markup).toContain('title="6"');
    expect(markup).toMatch(/ant-pagination-item-active[^>]*title="2"|title="2"[^>]*ant-pagination-item-active/);
  });

  it("omits pagination entirely when no envelope is given", () => {
    const markup = renderToStaticMarkup(
      <DataTableShell<Row> columns={columns} dataSource={rows} rowKey={(r) => r.id} />,
    );
    expect(markup).not.toContain("ant-pagination");
  });

  it("shows the host-provided empty text for an empty dataSource", () => {
    const markup = renderToStaticMarkup(
      <DataTableShell<Row>
        columns={columns}
        dataSource={[]}
        rowKey={(r) => r.id}
        emptyText="Nothing here yet"
      />,
    );
    expect(markup).toContain("Nothing here yet");
  });
});
