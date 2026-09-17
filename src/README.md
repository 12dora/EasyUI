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
  shell/                    ← AppShell, Sidebar (drill-down + mobile drawer), Topbar,
                              useNavIntent + NavigationProgress (导航即时反馈)
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

## 导航即时反馈 (nav intent + 进度条)

App Router 的 `usePathname()` 只在导航**提交**之后才翻页(布局 force-dynamic、刻意没有
route 级 `loading.tsx`、侧栏链接靠 hover 意图预取)。远端访问时点击到内容切换之间有
300~1500ms,侧栏标记和内容一起跳 —— 用户看到的是"侧栏不跟手"。

shell 给的解法是两件小东西,**不要**为此重新引入 route 级 `loading.tsx` / `<Suspense>`
(React 对 Suspense 揭示有 ~300ms 节流,加回来反而更慢更闪):

| 导出 | 作用 |
| --- | --- |
| `useNavIntent(pathname): NavIntent` | 记下用户刚选中的目标路径,`nav.path` 在路由提交前就能拿来算选中态 |
| `intentPathOf(href)` | 纯函数:取 href 的路径部分(剥掉 `?query` / `#hash`,不做 locale 改写) |
| `NAV_INTENT_TIMEOUT_MS` (8000) | 导航中止/出错时的安全超时,标记弹回真实路由 |
| `NavigationProgress` / `NAV_PROGRESS_DELAY_MS` (150) | 内容列顶边 2px 琥珀细轨,迟到 150ms 才显形,落地时补满淡出 |

`NavIntent` 的语义:`onIntent(href)` 同步记下意图 → `pending` 为真,直到 `pathname` 发生
**任何**变化(导航落地,可能落在重定向目标上)或超时;点当前页不产生 pending,并撤销尚未
落地的旧意图(以最后一次点击为准 —— Next 的 router.push 也是最后一次赢);pending 期间点
别的目标就换目标并重置计时。钩子纯前端、与路由库无关,初始状态只由 `pathname`
推导,不会造成水合不一致。

进度条由 `AppShell` 自己挂:它在 `<main>` 外面的 relative 包裹层里(贴内容列顶边,不随内容
滚动),`pending` 时 `<main>` 还会挂上 `aria-busy`。动效是 theme.css 里的 CSS 关键帧
(`easyNavProgress*`,shell 关键路径不引 motion/react),`prefers-reduced-motion` 下退化成
纯显示/隐藏;`pendingLabel` 以视觉隐藏文本放进 `role="status"`。

### Host wiring

```tsx
const pathname = usePathname();
const nav = useNavIntent(pathname);

// 所有原本从 pathname 推导「选中」的地方改用 nav.path
const isActive = (href: string) => nav.path === href;

// 链接:在 onClick 里、onNavigate() 之前同步记意图(预取逻辑保持不变)
renderLink={({ href, onNavigate, children, ...rest }) => (
  <Link
    href={href}
    onClick={() => {
      nav.onIntent(href);
      onNavigate();
    }}
    {...rest}
  >
    {children}
  </Link>
)}

// 抽屉/面板项:push 之前先记意图
const openPanel = (next: NavPanel) => {
  nav.onIntent(next.firstHref);
  setPanel(next.id);
  router.push(next.firstHref);
};

// 框架:把 pending 交给 AppShell / EnterpriseAppFrame
<EnterpriseAppFrame pending={nav.pending} pendingLabel={t.shell.loading} footer={<AppFooter />}>
  {children}
</EnterpriseAppFrame>
```

只有**视觉上的选中计算**搬到 `nav.path`。继续用真实 `pathname` 的地方:`MobileNav` 的
`pathKey`(抽屉要在路由真的变了以后才关)、topbar 的 `pathKey`、身份刷新、语言切换,以及
任何发请求的逻辑。

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
| Types | `Page<T>` (`{ items, page, pageSize, total }`), `ListParams`, `TableSort`, `TableSortOrder`, `TableQueryState`, `TableQueryConfig`, `TableQueryDefaults`, `TableQueryPatch`, `TableQuery`, `TableHistory`, `DataTableLabels`, `TableHeaderLabels`, `HeaderFilterOption`, `ClientTablePagination` |
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
- **`ClientTable` pages locally too.** An in-memory list is still a list: the
  default is `{ pageSize: DEFAULT_PAGE_SIZE, showSizeChanger: true }`, rendered
  bottom-right at `size="small"` with `PAGE_SIZE_OPTIONS`, and `hideOnSinglePage`
  means a ten-row table shows no pager chrome at all. The page index is the
  component's own state (there is no query string for an in-memory table) and
  returns to 1 whenever the visible set changes — a new `rows` array, or a header
  filter whose `filteredValue` moved (with `subject`, antd filters the rows and
  the pager counts the *filtered* ones). `pagination={false}` renders every row,
  which is what a picker inside a scrolling dialog usually wants.
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

## 移动端 (phones, < md)

口径:**手机 = Tailwind 的 `md` 以下(< 768px)**。所有移动端适配一律走 `max-md:` /
`md:` 断点或 `(max-width: 767px)` 媒体查询,**md+ 的视觉一个像素都不变** —— 改的永远是
响应式对子里的手机那一半,不是桌面那一半。

### 一条头部栏

手机上原来是 `Topbar`(57px)+ `MobileNav` 分区栏(57px)两条,正文要到 114px 之后才开始。
新写法把汉堡按钮塞进 `Topbar` 自己的 `leading` 插槽,分区栏整条去掉:

```tsx
<AppShell
  topbar={
    <Topbar
      testId="admin-topbar"
      leading={<MobileNav variant="trigger" footer={<EnterpriseConfiguredFooter />} {...navProps} />}
      brand={<EnterpriseBrandSlot … />}
      actions={<EnterpriseTopbarActions … />}
    />
  }
  sidebar={<Sidebar … />}
  /* 不再传 mobileNav */
  footer={<EnterpriseConfiguredFooter />}
>
```

`MobileNav` 的两种形态共用同一份抽屉实现(`useDrawerController` + `NavDrawer`),所以下钻、
`pathKey` 变化关闭并重置、焦点陷阱、Esc、断点关闭这些行为在两种形态下完全一致:

| prop | 说明 |
| ---- | ---- |
| `variant="bar"` | 默认,旧行为:汉堡 + 当前分区标题的独立顶栏(`data-test-id="admin-mobile-nav"`)。 |
| `variant="trigger"` | 只渲染汉堡按钮(`admin-mobile-nav-trigger`,自带 `md:hidden`)+ 抽屉 portal。 |
| `footer` | 抽屉底部内容(`admin-mobile-nav-footer`),手机上页脚文案的落点。 |

### 各组件的手机侧改动

| 组件 | 手机 (< md) | 桌面 (md+) |
| ---- | ----------- | ---------- |
| `Topbar` | `px-3` / `gap-2`,高度仍是 `h-14` | `md:px-5` / `md:gap-4`,原值 |
| `AppShell` | `APP_SHELL_MAIN_PADDING` 竖向留白 `py-4`;`footer` 包裹层 `hidden md:block`(页脚改由抽屉承载) | `md:px-10 md:py-12 2xl:px-12 3xl:px-16`,原值 |
| `PageHeader` | `max-md:mb-4 max-md:pb-3`、行间距 `max-md:gap-2`、eyebrow `max-md:hidden`、副标题 `max-md:text-[12px]` | `mb-6 pb-5 gap-4`,原值;H1 仍是 22 → `sm:text-[26px]` |
| `EnterpriseBrandSlot` | 只剩 logo + 标题(标题 `truncate`),副标题 `hidden … md:block` | 原值 |
| `EnterpriseTopbarActions` | 语言切换整组移进用户菜单(`topbar-user-menu-language`,选项仍是 `topbar-language-option-<code>` + `role="menuitemradio"`);头像按钮 `max-md:h-10 max-md:min-w-10` | 语言仍是顶栏上的独立入口,菜单里没有它 |
| 表格 | 切成卡片列表(`TableCards`,见 `table/`) | 仍是表格 |

`EnterpriseTopbarActions` 的视口判定用 `useSyncExternalStore`,服务端 / 首帧快照固定为
`false`(桌面形态),hydration 之后才切 —— 这样 SSR 与客户端首帧一致,不会闪。

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
