/**
 * User risk: the table query is the URL contract of every list page in every
 * host — if state and query string stop round-tripping, deep links, refresh and
 * back/forward all silently show a different screen than the one that was shared.
 *
 * Two things have to hold: state ⇄ URL loses nothing, and defaults stay out of
 * the URL while still being sent to the backend (otherwise "sorted by updatedAt
 * desc by default" quietly becomes "whatever the backend sorts by").
 */
import { describe, expect, it } from "vitest";

import {
  applyTableQueryPatch,
  dateRangeFilters,
  formatSort,
  hasTableFilters,
  isIsoDay,
  mergeTableQueryParams,
  parseSort,
  parseTableQuery,
  sameFilterValues,
  serialiseTableQuery,
  tableListParams,
  type TableQueryConfig,
} from "./table-query";

const CONFIG: TableQueryConfig = {
  keys: ["q", "visibility", "status"],
  defaults: { sort: { key: "updatedAt", order: "desc" }, filters: { status: ["active"] } },
};

/** A table with no defaults — proves "nothing filled in" is still a complete state. */
const BARE: TableQueryConfig = { keys: ["q"] };

/** A table that declares the backend whitelists: wild sort keys and filter values must not go out. */
const GUARDED: TableQueryConfig = {
  keys: ["q", "status", "examId"],
  defaults: { sort: { key: "updatedAt", order: "desc" }, filters: { status: ["active"] } },
  sortKeys: ["name", "updatedAt"],
  filterOptions: { status: ["active", "archived"] },
};

describe("parseSort / formatSort", () => {
  it("round-trips <key>:<order> and defaults a missing direction to desc", () => {
    expect(parseSort("name:asc")).toEqual({ key: "name", order: "asc" });
    expect(parseSort("updatedAt:desc")).toEqual({ key: "updatedAt", order: "desc" });
    expect(parseSort("questionCount")).toEqual({ key: "questionCount", order: "desc" });
    expect(parseSort("")).toBeNull();
    expect(parseSort(null)).toBeNull();
    expect(formatSort({ key: "name", order: "asc" })).toBe("name:asc");
    expect(formatSort(null)).toBe("");
  });
});

describe("parseTableQuery", () => {
  it("fills in the declared defaults when the URL is clean", () => {
    const state = parseTableQuery("", CONFIG);
    expect(state).toEqual({
      filters: { status: ["active"] },
      q: "",
      sort: { key: "updatedAt", order: "desc" },
      page: 1,
      pageSize: 20,
      // Column decorators read this to tell "filtering" from "the table's default".
      defaultFilters: { status: ["active"] },
    });
    expect(hasTableFilters(state, CONFIG)).toBe(false);
  });

  it("reads search, multi-value filters, sort and paging out of the query string", () => {
    const state = parseTableQuery(
      "q=fire&status=archived&visibility=company&visibility=subtree&sort=name:asc&page=3&pageSize=50",
      CONFIG,
    );
    expect(state.q).toBe("fire");
    expect(state.filters).toEqual({ q: ["fire"], status: ["archived"], visibility: ["company", "subtree"] });
    expect(state.sort).toEqual({ key: "name", order: "asc" });
    expect(state.page).toBe(3);
    expect(state.pageSize).toBe(50);
    expect(hasTableFilters(state, CONFIG)).toBe(true);
  });

  it("ignores undeclared params, empty values and out-of-range paging", () => {
    const state = parseTableQuery("tab=settings&q=&page=0&pageSize=500", BARE);
    expect(state.filters).toEqual({});
    expect(state.q).toBe("");
    expect(state.sort).toBeNull();
    expect(state.page).toBe(1);
    expect(state.pageSize).toBe(20);
  });

  it("keeps a comma inside a search term (multi-value is repeated params, not a comma list)", () => {
    expect(parseTableQuery("q=a%2Cb", CONFIG).filters.q).toEqual(["a,b"]);
  });

  it("leading ? or not, a search string parses the same", () => {
    // Hosts hand over `useSearchParams().toString()` (no ?) or `location.search` (with ?).
    expect(parseTableQuery("?page=2", CONFIG)).toEqual(parseTableQuery("page=2", CONFIG));
  });
});

describe("parseTableQuery with the backend whitelists", () => {
  it("drops an unknown sort key and falls back to the default sort", () => {
    // Only an old bookmark or a hand-edited URL can produce this (the header
    // only ever emits whitelisted keys), and a bad link must not replace the
    // whole table with a 422.
    expect(parseTableQuery("sort=progress:asc", GUARDED).sort).toEqual({ key: "updatedAt", order: "desc" });
    expect(parseTableQuery("sort=name:asc", GUARDED).sort).toEqual({ key: "name", order: "asc" });
    // A table without a declared whitelist is still not validated.
    expect(parseTableQuery("sort=progress:asc", CONFIG).sort).toEqual({ key: "progress", order: "asc" });
  });

  it("drops invalid filter tokens and falls back to that param's default", () => {
    expect(parseTableQuery("status=foo", GUARDED).filters.status).toEqual(["active"]);
    expect(parseTableQuery("status=archived", GUARDED).filters.status).toEqual(["archived"]);
    // Only the legal members of a multi-select survive.
    expect(parseTableQuery("status=foo&status=archived", GUARDED).filters.status).toEqual(["archived"]);
    // Params with no declared options (free text, ids) pass through untouched.
    expect(parseTableQuery("q=fire&examId=e-1", GUARDED).filters).toMatchObject({ q: ["fire"], examId: ["e-1"] });
  });

  it("never sends a rejected value to the backend", () => {
    expect(tableListParams(parseTableQuery("sort=progress:asc&status=foo", GUARDED))).toEqual({
      status: "active",
      sort: "updatedAt:desc",
      page: 1,
      pageSize: 20,
    });
  });
});

describe("date-range keys (dateRangeColumn)", () => {
  const DATED: TableQueryConfig = {
    keys: ["q", "submittedFrom", "submittedTo"],
    dateKeys: ["submittedFrom", "submittedTo"],
  };

  it("sends both bounds to the backend as plain YYYY-MM-DD strings", () => {
    const state = parseTableQuery("submittedFrom=2026-09-01&submittedTo=2026-09-15", DATED);
    expect(tableListParams(state)).toEqual({
      submittedFrom: "2026-09-01",
      submittedTo: "2026-09-15",
      page: 1,
      pageSize: 20,
    });
    expect(hasTableFilters(state, DATED)).toBe(true);
  });

  it("keeps one well-formed day per key: no comma-joined pair, no garbage", () => {
    // A repeated key would otherwise go out as "2026-09-01,2026-09-02".
    expect(parseTableQuery("submittedFrom=2026-09-01&submittedFrom=2026-09-02", DATED).filters).toEqual({
      submittedFrom: ["2026-09-01"],
    });
    expect(parseTableQuery("submittedFrom=yesterday&submittedTo=2026-02-30", DATED).filters).toEqual({});
    // Without `dateKeys` the kit does not validate.
    expect(parseTableQuery("submittedFrom=yesterday", { keys: ["submittedFrom"] }).filters).toEqual({
      submittedFrom: ["yesterday"],
    });
  });

  it("writes and clears both keys in one patch, back to page 1", () => {
    const start = parseTableQuery("submittedFrom=2026-09-01&submittedTo=2026-09-15&page=4", DATED);
    const range = (from: string, to: string) => ({
      filters: dateRangeFilters("submittedFrom", "submittedTo", from, to),
    });
    const cleared = applyTableQueryPatch(start, range("", ""), DATED);
    expect(cleared.filters).toEqual({});
    expect(cleared.page).toBe(1);
    expect(serialiseTableQuery(cleared, DATED)).toBe("");

    const open = applyTableQueryPatch(start, range("2026-09-03", ""), DATED);
    expect(serialiseTableQuery(open, DATED)).toBe("submittedFrom=2026-09-03");
  });

  it("builds the two-key patch, swapping reversed bounds", () => {
    expect(dateRangeFilters("from", "to", "2026-09-15", "2026-09-01")).toEqual({
      from: ["2026-09-01"],
      to: ["2026-09-15"],
    });
    expect(dateRangeFilters("from", "to", "", "2026-09-01")).toEqual({ from: [], to: ["2026-09-01"] });
  });

  it("accepts only real calendar days", () => {
    expect(isIsoDay("2024-02-29")).toBe(true);
    expect(isIsoDay("2026-02-29")).toBe(false);
    expect(isIsoDay("2026-9-1")).toBe(false);
    expect(isIsoDay("")).toBe(false);
  });
});

describe("mergeTableQueryParams", () => {
  it("rewrites only the keys this table owns and keeps everyone else's", () => {
    const state = applyTableQueryPatch(
      parseTableQuery("tab=stats&status=archived&page=3", CONFIG),
      { filters: { q: ["fire"] } },
      CONFIG,
    );
    // `tab` is not one of the table's keys: filtering must not throw the user onto another tab.
    expect(mergeTableQueryParams("tab=stats&status=archived&page=3", state, CONFIG)).toBe(
      "tab=stats&q=fire&status=archived",
    );
  });

  it("drops the owned keys that went back to their defaults", () => {
    const state = parseTableQuery("", CONFIG);
    expect(mergeTableQueryParams("tab=stats&q=fire&sort=name%3Aasc&pageSize=50", state, CONFIG)).toBe("tab=stats");
    expect(mergeTableQueryParams("", state, CONFIG)).toBe("");
  });
});

describe("sameFilterValues", () => {
  it("compares filter values so a default selection does not count as filtering", () => {
    expect(sameFilterValues(["active"], ["active"])).toBe(true);
    expect(sameFilterValues(["active"], ["archived"])).toBe(false);
    expect(sameFilterValues(["active", "archived"], ["active"])).toBe(false);
    expect(sameFilterValues([], [])).toBe(true);
  });
});

describe("serialiseTableQuery", () => {
  it("drops defaults and the first page, and repeats multi-value filters", () => {
    const state = parseTableQuery("status=archived&visibility=company&visibility=subtree", CONFIG);
    // Parameter order follows `keys`, so the same screen is always the same URL.
    expect(serialiseTableQuery(state, CONFIG)).toBe("visibility=company&visibility=subtree&status=archived");
    expect(serialiseTableQuery(parseTableQuery("", CONFIG), CONFIG)).toBe("");
    expect(serialiseTableQuery(parseTableQuery("page=1&pageSize=20", CONFIG), CONFIG)).toBe("");
  });

  it("round-trips every non-default field", () => {
    const raw = "q=fire&status=archived&sort=name%3Aasc&page=2&pageSize=100";
    const state = parseTableQuery(raw, CONFIG);
    expect(parseTableQuery(serialiseTableQuery(state, CONFIG), CONFIG)).toEqual(state);
  });
});

describe("tableListParams", () => {
  it("always sends the effective sort and paging, and joins multi-value filters", () => {
    expect(tableListParams(parseTableQuery("visibility=company&visibility=subtree", CONFIG))).toEqual({
      status: "active",
      visibility: "company,subtree",
      sort: "updatedAt:desc",
      page: 1,
      pageSize: 20,
    });
  });

  it("omits sort when the table has none", () => {
    expect(tableListParams(parseTableQuery("", BARE))).toEqual({ page: 1, pageSize: 20 });
  });
});

describe("applyTableQueryPatch", () => {
  const base = parseTableQuery("page=3", CONFIG);

  it("merges filters and resets the page, but a plain page turn keeps the filters", () => {
    const filtered = applyTableQueryPatch(base, { filters: { q: ["fire"] } }, CONFIG);
    expect(filtered.q).toBe("fire");
    expect(filtered.filters.status).toEqual(["active"]);
    expect(filtered.page).toBe(1);

    const turned = applyTableQueryPatch(filtered, { page: 4 }, CONFIG);
    expect(turned.page).toBe(4);
    expect(turned.filters).toEqual(filtered.filters);
  });

  it("clears one condition with an empty array and all of them back to the defaults", () => {
    const filtered = applyTableQueryPatch(base, { filters: { q: ["fire"], status: ["archived"] } }, CONFIG);
    expect(applyTableQueryPatch(filtered, { filters: { q: [] } }, CONFIG).filters).toEqual({
      q: undefined,
      status: ["archived"],
    });
    const cleared = applyTableQueryPatch(filtered, { clearFilters: true }, CONFIG);
    expect(cleared.filters).toEqual({ status: ["active"] });
    expect(hasTableFilters(cleared, CONFIG)).toBe(false);
    // "Clear filters" must not also reset the sort the user chose.
    expect(cleared.sort).toEqual(base.sort);
  });

  it("changes and clears the sort, and resets the page when the page size changes", () => {
    expect(applyTableQueryPatch(base, { sort: { key: "name", order: "asc" } }, CONFIG).sort).toEqual({
      key: "name",
      order: "asc",
    });
    expect(applyTableQueryPatch(base, { sort: null }, CONFIG).sort).toBeNull();
    const resized = applyTableQueryPatch(base, { pageSize: 50 }, CONFIG);
    expect(resized.pageSize).toBe(50);
    expect(resized.page).toBe(1);
  });
});
