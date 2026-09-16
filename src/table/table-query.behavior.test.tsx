// @vitest-environment happy-dom
/**
 * User risk: the header widgets are controlled by this hook. If the local mirror
 * regresses, every funnel and sort arrow snaps back to its old value for the
 * frame it takes the router to catch up; if the returned object stops being
 * memoised, antd sees a brand-new table on every render and closes the funnel
 * the user just opened.
 */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { mount, type MountedView } from "../enterprise/behavior-test-utils";
import type { TableQuery, TableQueryConfig } from "./table-query";
import { useLocalTableQuery, useTableQueryWith, type TableHistory } from "./use-table-query";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CONFIG: TableQueryConfig = {
  keys: ["q", "status"],
  defaults: { sort: { key: "updatedAt", order: "desc" }, filters: { status: ["active"] } },
};

const PATHNAME = "/zh-CN/app/question-banks";

let view: MountedView | null = null;
let replaced: string[] = [];
/** Every `TableQuery` this render pass produced — columns are memoised on it. */
let seen: TableQuery[] = [];

beforeEach(() => {
  replaced = [];
  seen = [];
});

afterEach(async () => {
  await view?.unmount();
  view = null;
});

function history(search: string): TableHistory {
  // Hosts build this inline from useRouter()/usePathname(): a fresh object every
  // render, which the hook must not treat as a change.
  return { pathname: PATHNAME, search, replace: (href) => replaced.push(href) };
}

function Harness({ search, config = CONFIG }: { search: string; config?: TableQueryConfig }) {
  const table = useTableQueryWith(config, history(search));
  seen.push(table);
  return <Probe table={table} />;
}

function LocalHarness({ config }: { config: TableQueryConfig }) {
  const table = useLocalTableQuery(config);
  seen.push(table);
  return <Probe table={table} />;
}

function Probe({ table }: { table: TableQuery }) {
  return (
    <div>
      <span data-test-id="state">
        {JSON.stringify({
          q: table.query.q,
          status: table.query.filters.status ?? null,
          sort: table.query.sort,
          page: table.query.page,
          pageSize: table.query.pageSize,
        })}
      </span>
      <span data-test-id="filtered">{String(table.filtered)}</span>
      <span data-test-id="params">{JSON.stringify(table.listParams)}</span>
      <button type="button" data-test-id="search" onClick={() => table.setSearch("q", "fire")} />
      <button type="button" data-test-id="archived" onClick={() => table.setFilter("status", ["archived"])} />
      <button type="button" data-test-id="sort-default" onClick={() => table.setSort("updatedAt", "desc")} />
      <button type="button" data-test-id="sort-name" onClick={() => table.setSort("name", "asc")} />
      <button type="button" data-test-id="size" onClick={() => table.setPageSize(50)} />
      <button type="button" data-test-id="page" onClick={() => table.setPage(2)} />
      <button type="button" data-test-id="reset" onClick={() => table.reset()} />
    </div>
  );
}

async function render(search = "") {
  if (view) await view.rerender(<Harness search={search} />);
  else view = await mount(<Harness search={search} />);
}

function click(testId: string) {
  act(() => {
    view!.host.querySelector<HTMLButtonElement>(`[data-test-id="${testId}"]`)!.click();
  });
}

function read(testId: string): string {
  return view!.host.querySelector(`[data-test-id="${testId}"]`)?.textContent ?? "";
}

function state() {
  return JSON.parse(read("state")) as {
    q: string;
    status: string[] | null;
    sort: { key: string; order: string } | null;
    page: number;
    pageSize: number;
  };
}

describe("useTableQueryWith", () => {
  it("mirrors a change locally in the same frame and writes it to the URL", async () => {
    await render();
    expect(state().sort).toEqual({ key: "updatedAt", order: "desc" });
    expect(read("filtered")).toBe("false");

    click("search");
    // `replace` is asynchronous: the controlled header value must already have
    // changed, otherwise the input snaps back to the old one.
    expect(state().q).toBe("fire");
    expect(read("filtered")).toBe("true");
    expect(replaced.at(-1)).toBe(`${PATHNAME}?q=fire`);
    expect(JSON.parse(read("params"))).toMatchObject({ q: "fire", status: "active", page: 1 });
  });

  it("re-reads the URL when it changes underneath (back / forward)", async () => {
    await render("status=archived");
    expect(state().status).toEqual(["archived"]);

    await render("q=fire");
    expect(state()).toMatchObject({ q: "fire", status: ["active"] });
  });

  it("drops the path's query string entirely once nothing is left", async () => {
    await render("q=fire");
    click("reset");
    expect(state().q).toBe("");
    expect(replaced.at(-1)).toBe(PATHNAME);
  });

  it("keeps sort and page size out of the URL while they equal the defaults", async () => {
    await render();
    click("sort-default");
    expect(replaced.at(-1)).toBe(PATHNAME);
    click("sort-name");
    expect(replaced.at(-1)).toBe(`${PATHNAME}?sort=name%3Aasc`);
    click("size");
    expect(replaced.at(-1)).toBe(`${PATHNAME}?sort=name%3Aasc&pageSize=50`);
  });

  it("keeps another owner's params (a tab) while rewriting its own", async () => {
    await render("tab=stats&status=archived");
    click("search");
    expect(replaced.at(-1)).toBe(`${PATHNAME}?tab=stats&q=fire&status=archived`);
  });

  it("returns the same object while nothing changed, even though `history` is rebuilt each render", async () => {
    await render();
    await render();
    expect(seen.length).toBeGreaterThan(1);
    expect(seen.at(-1)).toBe(seen[0]);
    click("archived");
    expect(seen.at(-1)).not.toBe(seen[0]);
  });

  it("keeps the page in the URL and out of the way of the other conditions", async () => {
    await render();
    click("page");
    expect(state().page).toBe(2);
    expect(replaced.at(-1)).toBe(`${PATHNAME}?page=2`);
    click("search");
    // A new filter condition goes back to page 1.
    expect(state().page).toBe(1);
  });
});

describe("useLocalTableQuery", () => {
  const config: TableQueryConfig = { keys: ["q", "type"], defaults: { pageSize: 10 } };

  it("keeps the same list params as the URL hook but never navigates", async () => {
    view = await mount(<LocalHarness config={config} />);
    const before = window.location.search;
    expect(JSON.parse(read("params"))).toEqual({ page: 1, pageSize: 10 });

    click("search");
    expect(JSON.parse(read("params"))).toEqual({ q: "fire", page: 1, pageSize: 10 });
    expect(read("filtered")).toBe("true");

    click("page");
    expect(JSON.parse(read("params"))).toMatchObject({ page: 2 });
    click("sort-name");
    // Changing the sort goes back to page 1, same as the URL hook.
    expect(JSON.parse(read("params"))).toMatchObject({ sort: "name:asc", page: 1 });

    click("reset");
    expect(JSON.parse(read("params"))).toEqual({ sort: "name:asc", page: 1, pageSize: 10 });
    expect(replaced).toEqual([]);
    expect(window.location.search).toBe(before);
  });
});
