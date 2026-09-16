"use client";

/**
 * React bindings for `table-query.ts`.
 *
 * Two hooks, one contract: `useTableQueryWith` mirrors the state into the
 * address bar (deep links, refresh, back/forward), `useLocalTableQuery` keeps it
 * in component state only (dialogs, in-memory pickers). Both return the exact
 * same `TableQuery`, so a column decorator cannot tell them apart.
 *
 * EasyUI never imports a router. The URL hook takes a `TableHistory` the host
 * fills in from whatever it uses — in Next that is a ten-line wrapper around
 * `usePathname()` / `useSearchParams()` / `useRouter()`.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import {
  applyTableQueryPatch,
  mergeTableQueryParams,
  parseTableQuery,
  tableListParams,
  tableQueryOf,
  type TableQuery,
  type TableQueryConfig,
  type TableQueryPatch,
} from "./table-query";

/**
 * The host's router, reduced to the three things the table needs.
 *
 * `search` may carry a leading `?` or not — both parse the same. `replace`
 * receives a complete href and should replace (not push) the entry, without
 * scrolling: a filter change is not a navigation the back button should have to
 * step through twice.
 */
export interface TableHistory {
  pathname: string;
  search: string;
  replace: (href: string) => void;
}

/**
 * Header query state mirrored into the URL.
 *
 * `replace` is asynchronous while the controlled header widgets (funnel ticks,
 * sort arrows) have to change in the very frame they were clicked — so the state
 * is mirrored locally first and the address bar takes over once it catches up
 * (synchronised during render, never `setState` from an effect).
 *
 * `config` must be referentially stable (a module constant or `useMemo`): it
 * feeds the memo that keeps the returned object identical between renders, and
 * columns are built from that object.
 */
export function useTableQueryWith(config: TableQueryConfig, history: TableHistory): TableQuery {
  const raw = history.search;
  const parsed = parseTableQuery(raw, config);
  const [state, setState] = useState(parsed);
  const [seenRaw, setSeenRaw] = useState(raw);
  if (seenRaw !== raw) {
    setSeenRaw(raw);
    setState(parsed);
  }
  const listParams = useMemo(() => tableListParams(state), [state]);

  // Latest-value ref rather than a dependency: hosts build `history` inline, so
  // depending on the object (or on `replace`) would hand back a new TableQuery
  // every render — and columns are memoised on that object, so antd would treat
  // every render as a new table and close the open funnel.
  const latest = useRef(history);
  latest.current = history;

  const apply = useCallback(
    (patch: TableQueryPatch) => {
      const next = applyTableQueryPatch(state, patch, config);
      setState(next);
      const { pathname, replace } = latest.current;
      const query = mergeTableQueryParams(raw, next, config);
      replace(query ? `${pathname}?${query}` : pathname);
    },
    [config, raw, state],
  );

  return useMemo(() => tableQueryOf(state, listParams, apply, config), [apply, config, listParams, state]);
}

/**
 * Header query state that never touches the URL.
 *
 * Same state and the same `toListParams()` as `useTableQueryWith`, for tables
 * that are a temporary sub-surface of their host page (a question picker
 * dialog): writing their search / filter / page into the URL would pollute the
 * host's deep link and leave dead parameters behind once the dialog closes.
 */
export function useLocalTableQuery(config: TableQueryConfig): TableQuery {
  const [state, setState] = useState(() => parseTableQuery("", config));
  const listParams = useMemo(() => tableListParams(state), [state]);

  const apply = useCallback(
    (patch: TableQueryPatch) => {
      setState((current) => applyTableQueryPatch(current, patch, config));
    },
    [config],
  );

  return useMemo(() => tableQueryOf(state, listParams, apply, config), [apply, config, listParams, state]);
}
