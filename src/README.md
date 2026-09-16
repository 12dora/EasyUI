# Easy Enterprise UI — design rules

Layer-by-layer rules for the package sources. For what the package is, how hosts
mount it and how to develop it, see the repo-root `README.md`.

It is the single implementation source for the visual language, application shell
and reusable account/settings surfaces shared by EasyTrade, EasyCustoms and the
deployable blank enterprise app.

> Tables ship behind their own entry point: `@easy-enterprise/ui/table` wraps
> **antd ≥ 6.5** (the `DataTable` / `ClientTable` list conventions, the header
> search / filter / sort decorators, the query state, the `DataTableShell`
> server-pagination boundary and the `useAnimatedExpand` tree-row animation;
> import `@easy-enterprise/ui/table.css` alongside). The antd `ConfigProvider`
> that themes them is a second antd entry, `@easy-enterprise/ui/antd`. antd stays
> an *optional* peer — hosts that bring their own table (TanStack, AG Grid…) simply
> never import those entries. The same applies to
> `@easy-enterprise/ui/enterprise-local-accounts`. The package core remains the
> theme, the shell (sidebar / topbar / app frame) and the form + action primitives
> that make everything else look consistent.

## What's inside

```
src/
  theme.css                 ← design tokens + base resets + animation utilities
  motion.ts                 ← easing curves / durations (TS mirror of theme.css)
  toast.ts                  ← headless toast bus + `toast.success(...)` API
  control-tokens.ts         ← form-control geometry contract (height / radius)
  primitives/               ← Button, Field/Input/Select, Checkbox, Dialog, Badge,
                              PageHeader, EmptyState, InlineNotice, Section, Avatar,
                              SegmentedToggle, TabList/TabPanel, Toaster,
                              UnsavedChangesProvider, …  (visual, business-free)
  shell/                    ← AppShell, Sidebar (drill-down + mobile drawer), Topbar
  enterprise/               ← complete login, security, Login & Permissions, general
                              settings (brand / logo / footer), brand slot, app frame,
                              notification and upstream-health surfaces
  table/                    ← antd table kit (DataTable/ClientTable, column
                              decorators, table query, DataTableShell,
                              useAnimatedExpand, table.css) — separate entry,
                              antd ≥ 6.5 optional peer
  antd/                     ← the shared antd ConfigProvider + theme token —
                              separate entry, antd ≥ 6.5 optional peer
  enterprise-local-accounts/ ← local-account admin surface (antd) — separate entry
  index.ts                  ← barrel — import only what you need
```

Each layer is independent: you can take just `theme.css`, or the theme + a few
primitives, or the whole shell.

**No host imports.** Nothing here may import `@/…`, `next/…` or any other host-owned
module — the package has to stay usable from any React host. The shell takes your
router's `Link` + active path as props precisely for that reason.

`EnterpriseAccountSecuritySurface` and `EnterpriseAccessSettingsSurface` own their
complete page hierarchy and are consumed directly by both EasyTrade and the blank
host. Hosts inject API/session operations through adapters or render callbacks;
they must not fork the page structure in host code.

## Consuming the workspace package

1. Add `"@easy-enterprise/ui": "workspace:*"` to the app dependencies.
2. **Wire the theme.** The package targets **Tailwind CSS v4** (`theme.css` consumes
   `@theme inline`). In your global stylesheet, import the theme and make Tailwind
   scan the workspace source (adjust the relative path for the host app):
   ```css
   @import "tailwindcss";
   @source "../../../packages/easy-enterprise/src";
   @import "@easy-enterprise/ui/theme.css";
   ```
   That gives you the color tokens (`bg-paper`, `text-ink`, `text-ink-soft`,
   `border-hairline`, `text-[rgb(var(--amber))]`, …), the base resets (focus
   rings, native form styling, scrollbars) and the animation utilities
   (`animate-fade-up`, `animate-shimmer`, `animate-tree-row-in`; all of them are
   neutralised under `prefers-reduced-motion`).
3. Import from `@easy-enterprise/ui`, `@easy-enterprise/ui/shell`, or
   `@easy-enterprise/ui/enterprise` — plus `@easy-enterprise/ui/table`,
   `@easy-enterprise/ui/antd` and `@easy-enterprise/ui/enterprise-local-accounts`
   if you want the antd-backed surfaces (none of them is in the barrel).
4. **Peer deps.** `react` / `react-dom` ≥ 19, and [`motion`](https://motion.dev) ≥ 12
   (framer-motion successor) for the animated primitives/shell. The shell takes
   your router's `Link` + active-path as props, so it stays framework-agnostic.
5. **Toasts (optional).** Mount `<Toaster />` once at your root, then call
   `toast.success("…")` anywhere.

## Form actions in a dialog footer

`Form` + `DialogFormActions submitType="submit"` is what makes "type the last field, press
Enter" work. It relies on the submit button belonging to the `<form>` — and a `Dialog` whose
`footer` holds the action row renders that row **outside** the `children` where the form
body lives, so DOM nesting alone cannot connect the two. Give the form an id and hand the
same id to the action row; the button then claims the form through the native `form`
attribute, which also makes it the form's default submit button (the one Enter activates):

```tsx
const FORM_ID = "task-form";

<Dialog
  open={open}
  onClose={close}
  title={t("newTask")}
  footer={
    <DialogFormActions
      submitType="submit"
      submitFormId={FORM_ID}
      cancelLabel={t("cancel")}
      submitLabel={t("save")}
      onCancel={close}
      onSubmit={save}
      submitting={saving}
      blockedReason={invalid ? t("fillRequired") : undefined}
    />
  }
>
  <Form id={FORM_ID} onSubmit={save} busy={saving}>
    …fields…
  </Form>
</Dialog>
```

`submitFormId` is only needed for that split layout — when the action row sits inside the
`<form>`, `submitType="submit"` is enough on its own. `blockedReason` keeps working either
way: the blocked button calls `preventDefault()`, so the native submit does not get through.

## Unsaved-changes guard

`src/primitives/unsaved-changes.tsx` turns "you have unsaved changes — leave anyway?"
into four framework-agnostic pieces. The package knows nothing about your router:
components declare that they are dirty, the provider decides whether to ask, and the
host wires the answer into its own navigation.

| Export | Purpose |
| --- | --- |
| `UnsavedChangesProvider` | Holds the registry of dirty sources, owns the confirmation `Dialog` and the single `beforeunload` listener |
| `useUnsavedChanges(dirty, { id? })` | Registers a dirty source while `dirty` is true; unregisters on `false` and on unmount |
| `useLeaveConfirmation()` | `{ hasUnsavedChanges, confirmLeave }` for router / link / dialog-close wrappers |
| `useDirtyState(initial, current, isEqual?)` | Boolean from two snapshots, using `structuralEqual` by default |
| `structuralEqual(a, b)` | JSON-safe deep compare — key order ignored, missing key == explicit `undefined` |

`confirmLeave()` resolves `true` immediately when nothing is dirty (no dialog, no extra
click), otherwise it opens one dialog and resolves with the user's choice. Concurrent
calls share that dialog and all resolve together. **Escape, the backdrop and the header
close button all mean "stay"** — discarding a draft always takes an explicit click on the
destructive button.

Three guarantees the host can rely on, so `await confirmLeave()` is always safe to put in
front of a navigation:

- **It always settles.** If the provider unmounts while a confirmation is still open, every
  pending caller resolves `false` (stay) rather than hanging forever; `onLeaveConfirmed`
  does not fire, because nobody confirmed anything.
- **One answer per question.** The first choice wins — the dialog stays mounted through its
  exit animation, but its buttons are disabled from that moment on, and a late or repeated
  click cannot re-settle a confirmation or fire `onLeaveConfirmed` a second time.
- **Focus comes back.** The safe button is focused on open (via `Dialog`'s `initialFocusRef`,
  never React's `autoFocus` — that one moves focus before the focus trap has recorded where
  it came from), and choosing "stay" returns focus to the button or link the user pressed.

Mount the provider once, above everything that can hold a draft, and pass localized
copy (the built-in `DEFAULT_UNSAVED_CHANGES_LABELS` are English fallbacks only):

```tsx
<UnsavedChangesProvider
  labels={{
    title: t("unsavedTitle"),
    description: t("unsavedDescription"),
    stay: t("keepEditing"),
    leave: t("discardChanges"),
  }}
>
  {children}
</UnsavedChangesProvider>
```

Inside a form, declare dirtiness — that is the whole component-side contract:

```tsx
const [draft, setDraft] = useState(initial);
useUnsavedChanges(useDirtyState(initial, draft));
```

### Host wiring

The guard only fires where the host asks it to. There are three places to cover, and
missing any one of them leaves a hole a user can walk a draft out of.

**1. Router pushes.** Wrap `push` / `replace` once and use the wrapper everywhere:

```tsx
function useGuardedRouter() {
  const router = useRouter();               // host-owned (next/navigation, react-router, …)
  const { confirmLeave } = useLeaveConfirmation();
  return useMemo(
    () => ({
      push: async (href: string) => {
        if (await confirmLeave()) router.push(href);
      },
      replace: async (href: string) => {
        if (await confirmLeave()) router.replace(href);
      },
    }),
    [router, confirmLeave],
  );
}
```

**2. Links.** A `<Link>` navigates before any promise settles, so intercept the click the
way a back-link does — `preventDefault()` first, navigate only after the answer, and keep
the real `href` so middle-click / "open in new tab" / hover preview still work:

```tsx
<Link
  href={href}
  onClick={async (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    if (await confirmLeave()) router.push(href);
  }}
>
  {label}
</Link>
```

**3. Dialogs that host a form.** Closing the dialog destroys the draft just as surely as
navigating, so route its `onClose` through the same gate:

```tsx
<Dialog
  open={open}
  onClose={async () => {
    if (await confirmLeave()) setOpen(false);
  }}
>
  <OrderForm />
</Dialog>
```

An inline `onClose` like that one is fine even though it is a new function on every render:
`Dialog` registers itself in the Escape stack on its open lifecycle only, so a parent that
re-renders while the confirmation is up does not climb above it — Escape keeps dismissing
the topmost dialog.

Full-page unloads (tab close, reload, external links) are already covered: the provider
installs one `beforeunload` listener while any source is dirty and removes it as soon as
everything is clean.

## 表格 (tables)

Everything a list page needs lives in `@easy-enterprise/ui/table`, and the antd
`ConfigProvider` that themes it in `@easy-enterprise/ui/antd`. Both are antd-only
entries kept off the barrel. The rule downstream: **a host app does not wire antd
Table, ConfigProvider, URL query state or column conventions itself** — it imports
them here and supplies only its router, its copy and its row actions.

### The kit API

| Layer | Exports |
| --- | --- |
| Constants | `TABLE_SCROLL` (`{ x: "max-content" }`), `PAGE_SIZE_OPTIONS` (`[20, 50, 100]`), `DEFAULT_PAGE_SIZE` (20) |
| Types | `Page<T>` (`{ items, page, pageSize, total }`), `ListParams`, `TableSort`, `TableSortOrder`, `TableQueryState`, `TableQueryConfig`, `TableQueryDefaults`, `TableQueryPatch`, `TableQuery`, `TableHistory`, `DataTableLabels`, `TableHeaderLabels`, `HeaderFilterOption` |
| Query (pure) | `parseSort`, `formatSort`, `parseTableQuery`, `serialiseTableQuery`, `mergeTableQueryParams`, `tableListParams`, `hasTableFilters`, `applyTableQueryPatch`, `sameFilterValues`, `tableQueryOf` |
| Query (hooks) | `useTableQueryWith(config, history)`, `useLocalTableQuery(config)` |
| Columns | `searchColumn`, `filterColumn`, `sortColumn`, `withEllipsis`, `withClientSort`, `clientSearchColumn`, `clientQueryState`, `sortOrderFor` |
| People (pure) | `matchesPersonQuery`, `normalizeQuery`, `PersonQuerySubject` |
| Tables | `DataTable`, `ClientTable`, `DataTableShell`, `useAnimatedExpand` |
| onChange helpers | `changePatch`, `filterPatch`, `sorterSort` |
| Provider | `EasyAntdProvider`, `EasyAntdProviderZh`, `EasyAntdProviderEn`, `EasyAntdConfig`, `EASY_ANTD_THEME_TOKEN`, `createEasyAntdTheme` |

Contract highlights — these are conventions, not options:

- **One state, in the URL.** `keys` declares the parameters a table owns; every
  other parameter on the address (a `?tab=`) survives a filter change untouched.
  Values equal to the declared defaults stay out of the query string but are still
  sent to the backend. Multi-select is a repeated parameter name (so a comma may
  live inside a search term); `toListParams()` comma-joins them for the request.
  Sort travels as `sort=<key>:<asc|desc>`.
- **Backend whitelists.** `sortKeys` / `filterOptions` drop wild values from an old
  bookmark before the request, instead of letting the endpoint reject them and
  replacing the whole table with an error.
- **Header only.** Search, filter and sort UI live in the column header — nothing
  above the table. The funnel lights up only when a selection differs from the
  table's default.
- **Sort never clears.** antd's third click flips direction instead: the URL has no
  "explicitly unsorted" slot, so clearing would silently come back on refresh.
  A host that wants the third state uses `DataTableShell` directly.
- **The kit ships no row menu.** `actions` is `{ title, width?, render, testId? }` —
  a fixed-right column the host fills with its own menu or links.
- **Empty state** defaults to EasyUI's `EmptyState` with `labels.empty`, under
  `${testId}-empty`; pass `empty` to distinguish "nothing yet" from "no matches".
- **People search means pinyin.** The directory ships `namePinyin` (full pinyin,
  lowercase, no separators) and `namePinyinInitials` next to every person's and
  department's `name`. Server-backed lists search those columns in the backend;
  in-memory lists use `matchesPersonQuery(keyword, subject)` — a pure function
  (no antd, no React) shared by every host, so「hyq」「huyuqin」「玉琴」all find
  胡玉琴 while a CJK keyword never reaches the pinyin columns and a row missing
  them still matches by name. A people column in a `ClientTable` gets it for free
  by handing `clientSearchColumn` a `subject` mapper — the column then carries an
  `onFilter` and antd filters the rows; without `subject` nothing changes and
  filtering the rows stays the caller's:

  ```tsx
  clientSearchColumn<Person>(
    { title: t.columns.user, render: (_, row) => row.name },
    { param: "q", value: keyword, labels: t.common.table, subject: (row) => row },
  )
  ```

### Host wiring

**1. `globals.css`, in this order.** `table.css` carries the rules antd tokens
cannot express (header nowrap, tree-row motion), so it comes after the theme and
before any host overlay:

```css
@import "tailwindcss";
@source "../../../packages/easy-enterprise/src";   /* so the dropdown utilities exist */
@import "@easy-enterprise/ui/theme.css";
@import "@easy-enterprise/ui/table.css";
/* host overlays last */
```

**2. The provider, mounted once.** Around the app content (the protected shell plus
any public page that renders antd) — and **never nest a second `cssVar`
`ConfigProvider` inside it**: antd would inject its `--ant-*` custom properties
twice and the two copies fight. Page-level theming goes through `token` /
`components`.

```tsx
<EasyAntdProvider locale={locale === "en" ? "en" : "zh-CN"}>{children}</EasyAntdProvider>
```

`withApp` (antd's `<App component={false}>`) is opt-in: combined with `cssVar`,
antd warns about it on every render. Hosts that need a different geometry pass
`token={createEasyAntdTheme({ borderRadius: 10 })}`. To keep only the active
locale pack in the bundle, code-split the single-locale components instead:
`dynamic(() => import("@easy-enterprise/ui/antd/provider-zh").then((m) => m.EasyAntdProviderZh), { ssr: true })`.

**3. The Next adapter.** EasyUI imports no router, so the URL hook takes a
`TableHistory`. In Next that is the whole wrapper:

```tsx
"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTableQueryWith, type TableQuery, type TableQueryConfig } from "@easy-enterprise/ui/table";

export function useTableQuery(config: TableQueryConfig): TableQuery {
  const pathname = usePathname();
  const router = useRouter();
  const search = useSearchParams().toString();
  return useTableQueryWith(config, {
    pathname,
    search,
    replace: (href) => router.replace(href, { scroll: false }),
  });
}
```

Rebuilding that object every render is fine — the hook keeps the latest one in a
ref. `config`, on the other hand, **must be stable** (a module constant or
`useMemo`): the returned `TableQuery` is memoised on it, and columns are memoised
on the `TableQuery`, so an inline config would rebuild the columns every render
and antd would close the funnel the user just opened.

**4. A page.**

```tsx
const CONFIG = { keys: ["q", "status"], sortKeys: ["name", "updatedAt"],
                 defaults: { sort: { key: "updatedAt", order: "desc" } } } as const satisfies TableQueryConfig;

const table = useTableQuery(CONFIG);
const columns = useMemo(() => [
  sortColumn(searchColumn({ title: t.name }, { param: "q", query: table.query, labels: t.table }), "name", table.query),
  filterColumn({ title: t.status }, { param: "status", query: table.query, options, labels: t.table }),
], [table]);

<DataTable testId="bank-table" rowKey="id" columns={columns} page={page} query={table} labels={t.table}
           actions={{ title: t.actions, render: (row) => <RowMenu row={row} /> }} />
```

## Design tokens (theme.css)

| Group    | Tokens |
| -------- | ------ |
| Surfaces | `--paper`, `--paper-deep`, `--paper-soft` |
| Text     | `--ink`, `--ink-soft`, `--ink-faint` |
| Borders  | `--hairline`, `--hairline-strong`, `--hairline-soft` |
| Accents  | `--amber` (primary/blue) + `--amber-soft`, `--signal` (danger/red fills, icons, required marks) + `--signal-ink` (red **text**: errors, notices, status words), `--bond` (indigo), `--evergreen` (success) |
| Status   | `--status-draft/pending/active/stop/archive` (fills, borders, icon glyphs) + `--status-pending-ink` (amber **text**: warning notices — the fill amber is 3.19:1 and fails AA) |
| Motion   | `--ease-out-paper`, `--ease-press`, `--ease-pop`; `--duration-fast/base/slow/page/dialog` (mirrored in `motion.ts`) |
| Type     | `--font-sans`, `--font-mono`, `--font-display` |

All colors are stored as space-separated RGB channels so you can apply any
opacity: `rgb(var(--ink) / 0.06)`.

## How EasyTrade consumes it

> Host-side note — lives in the EasyTrade repo, not verifiable from here; re-check
> before relying on it.

`@/components/ui` is kept as a **thin re-export facade** over the shared package, so the
app's existing `import { Button } from "@/components/ui"` call sites are
unchanged (the older `@easy-ui` aliases serve the same migration purpose).
App-specific, business-coupled components (data grids, currency inputs,
remote-search selects, money formatting) stay under `@/components/ui`
and are **not** part of the shared package.
