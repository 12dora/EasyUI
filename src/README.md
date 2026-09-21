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
| Density | `TableDensityProvider`, `useTableDensity`, `tableSizeOf`, `DEFAULT_TABLE_DENSITY`, `TableDensity`(见下文「表格密度」) |
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

## 表格密度 (table density + 外观设置页)

行高是一份**跨页面的账号偏好**,不是某一张表的 prop:同一个人在列表页之间来回切,
行高必须处处一致。所以密度走上下文,宿主在外壳上挂一次,两种表格各自读它。

| 导出 | 出处 | 作用 |
| --- | --- | --- |
| `TableDensity` | `@easy-enterprise/ui/table` | `"compact"` / `"comfortable"` |
| `DEFAULT_TABLE_DENSITY` | 同上 | 全局默认 `"compact"` |
| `TableDensityProvider` | 同上 | 受控:`value` + `onChange`(+ `saving`) |
| `useTableDensity()` | 同上 | `{ density, setDensity, saving }` |
| `tableSizeOf(density)` | 同上 | 档位 → antd `size`(`small` / `middle`) |
| `EnterpriseAppearanceSettingsSurface` | `@easy-enterprise/ui/enterprise` | 「外观」设置页,「视觉效果」分表格行高与表单行距两行 |

约定,不是选项:

- **Provider 是受控的,套件不碰存储。** 偏好存在用户账号里(服务端),换台机器也一致;
  套件自己读写 localStorage 只会造出第二个事实源。宿主负责乐观更新、失败回滚与提示,
  `saving` 回传给设置页显示状态。
- **没挂 Provider 时是 `"compact"`。** 没接这套偏好的宿主拿到的是全站默认观感,
  而不是 antd 的 `middle`。
- **`density` prop 压过上下文。** 极少数必须固定一档的表(对账矩阵一类)才用它。
- **设置页不持有自己的 state。** `EnterpriseAppearanceSettingsSurface` 读写的就是那份
  上下文,所以「设置页改完」与「列表页行高」天然同源。文案按本包惯例从 props 注入
  (`EnterpriseAppearanceSettingsLabels`,`createEnterpriseLabelCatalog` 里有 zh / en)。

宿主怎么接(EasyLearning 的口径):

```tsx
// 外壳:身份里带着账号偏好,写回走 PATCH /auth/preferences
<TableDensityProvider value={identity.tableDensity} saving={saving} onChange={saveDensity}>
  {children}
</TableDensityProvider>

// 设置页 /app/settings/appearance
<EnterpriseAppearanceSettingsSurface labels={t.appearanceSettings} />
```

## 侧栏分组标题 (NavGroup `label`)

`NavGroup` 除了 `divider` 还有一个可选的 `label`:给分组一行小标题,桌面侧栏与手机抽屉
同时生效(两端都走 `NavGroupList`)。两块业务只靠一条线隔开时,用户读不出线的上下是
两回事 —— 有名字的分区就给名字,`divider` 留给"同一类里再断一下"。

```ts
{ key: "manage", label: t.nav.groupManage, nodes: [...] }
```

标题渲染成条目列表上方的一行 eyebrow,条目仍在原来的 `<ol>` 里(选中标记与内边距不变);
分隔线画在标题**之上**,不会夹在标题与它的条目之间。没给 `label` 的分组 DOM 一个字不变。

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
      leading={
        <MobileNav
          variant="trigger"
          /* 抽屉里用 bare:抽屉本身是 role="dialog",再嵌一个 <footer> 会多出一个 contentinfo 地标 */
          footer={<EnterpriseConfiguredFooter bare html={footerHtml} fallback={t.footer} />}
          {...navProps}
        />
      }
      brand={<EnterpriseBrandSlot … />}
      actions={<EnterpriseTopbarActions … />}
    />
  }
  sidebar={<Sidebar … />}
  /* 不再传 mobileNav */
  footer={<EnterpriseConfiguredFooter html={footerHtml} fallback={t.footer} />}
>
```

> **页脚要传两遍。** `AppShell` 的页脚包裹层是 `hidden md:block`,手机上不显示;传了
> `AppShell footer` 的宿主**必须**把同一份文案再传给 `MobileNav footer`(`bar` / `trigger`
> 两种形态都渲染这个插槽),否则手机上页脚整条消失。抽屉里那份加 `bare`,test id 变成
> `app-footer-html-inline` / `app-footer-fallback-inline`,便于与页面底部那份分别断言。
> 抽屉的页脚槽(`admin-mobile-nav-footer`)只是一个透明的 `shrink-0` 布局容器,分隔线与
> 内边距属于抽屉自己,排版由传进来的节点带。

`MobileNav` 的两种形态共用同一份抽屉实现(`useDrawerController` + `NavDrawer`),所以下钻、
`pathKey` 变化关闭并重置、焦点陷阱、Esc、断点关闭这些行为在两种形态下完全一致:

| prop | 说明 |
| ---- | ---- |
| `variant="bar"` | 默认,旧行为:汉堡 + 当前分区标题的独立顶栏(`data-test-id="admin-mobile-nav"`)。 |
| `variant="trigger"` | 只渲染汉堡按钮(`admin-mobile-nav-trigger`,自带 `md:hidden`)+ 抽屉 portal。 |
| `footer` | 抽屉底部内容(`admin-mobile-nav-footer`),手机上页脚文案的落点;两种 variant 都渲染。 |

### 各组件的手机侧改动

| 组件 | 手机 (< md) | 桌面 (md+) |
| ---- | ----------- | ---------- |
| `Topbar` | `px-3` / `gap-2`;行高 `h-12`(48px,两端同值) | `md:px-5` / `md:gap-4`;行高同样 48px(原 56px)。行内按 48px 配平:图标按钮 36px(`h-9 w-9`)、logo 32px(`h-8`)、头像 32px(`UserAvatar size="xs"`,按钮 36px 命中区)、汉堡 36px |
| `AppShell` | `APP_SHELL_MAIN_PADDING` 顶部留白 12px、底部 `pb-4`;`footer` 包裹层 `hidden md:block`(页脚改由抽屉承载,宿主必须同时传 `MobileNav footer`) | 顶部留白 16px、底部 `md:pb-8`,`md:px-10 2xl:px-12 3xl:px-16`(顶栏与首行内容之间的白带收紧:手机 16 → 12、桌面 32 → 16;底部与横向原值)。顶部留白由 `--app-shell-main-pt` 驱动,见下文「内容区顶部留白」 |
| `PageHeader` | `max-md:mb-4 max-md:pb-3`、行间距 `max-md:gap-2`、eyebrow `max-md:hidden`、副标题 `max-md:text-[12px]` | `mb-5 pb-4 gap-4`(mb-6 / pb-5 各收一档)、eyebrow `mb-1`;H1 全站同一档 `text-[22px]`(不再 `sm:text-[26px]`) |
| `EnterpriseBrandSlot` | 只剩 logo + 标题(标题 `truncate`),副标题 `hidden … md:block` | 原值 |
| `Dialog` | 整屏 sheet 贴边之后 24px 留白太贵:标题行 `max-md:px-4 max-md:pt-4`(底部本来就是 `pb-4`)、正文 `max-md:px-4 max-md:py-4`、页脚 `max-md:px-4`(`py-4` 已经够) | `px-6` / `py-5` / `pb-4 pt-5`,原值 |
| `ActionRow` | `max-md:flex-wrap`,长标签的提交按钮不会被挤出 360px 的 sheet | 单行,原值 |
| `EnterpriseTopbarActions` | 有 `user` 时语言切换整组移进用户菜单(`topbar-user-menu-language`,选项仍是 `topbar-language-option-<code>` + `role="menuitemradio"`);**没有 `user` 就保留顶栏上的独立入口**,否则语言无处可切。头像按钮 `h-9 max-md:min-w-9`。两个弹层改成相对视口定位 `max-md:fixed max-md:left-auto max-md:right-3 max-md:top-12`(48px 顶栏正下方),通知宽度 `max-md:w-[min(300px,calc(100vw-24px))]`、用户菜单 `max-md:max-w-[calc(100vw-24px)]` —— 锚点是按钮那层 `relative` 而不是视口右缘,只放宽宽度会把左边推出屏幕 | 语言是顶栏上的独立入口;弹层是 `absolute right-0 top-10`(36px 按钮 + 4px)+ 定宽 `w-[300px]` |
| 表格 | 切成卡片列表(`TableCards`,见 `table/`) | 仍是表格 |

### 内容区顶部留白

`APP_SHELL_MAIN_PADDING` 的顶部留白是 **12px(手机)/ 16px(md+)**,底部 16 / 32px 不变。
顶部这一档不是写死的 `pt-*`,而是 CSS 变量 `--app-shell-main-pt`,由同一串 class 定义在
`<main>` 上(`[--app-shell-main-pt:12px] md:[--app-shell-main-pt:16px] pt-[var(--app-shell-main-pt)]`),
`<main>` 里的所有节点都能继承到。需要与之对齐的吸顶页头(例如用 `before:` 伪元素盖住顶部留白带、
或 `top` 取负的留白)直接读变量,不要再抄一对断点值:

```tsx
<div className="sticky top-0 before:absolute before:inset-x-0 before:bottom-full before:h-[var(--app-shell-main-pt)] before:bg-paper">
```

JS 侧同值导出:`APP_SHELL_MAIN_PADDING_TOP_PX`(`{ base: 12, md: 16 }`)与变量名
`APP_SHELL_MAIN_PADDING_TOP_VAR`。自己拼 `<main>` 的宿主照抄 `APP_SHELL_MAIN_PADDING` 即可同时拿到变量。

视口判定统一走 `primitives/use-media-query` 的 `useIsPhone()`(`useMediaQuery` +
`PHONE_MEDIA_QUERY = "(max-width: 767px)"`):`useSyncExternalStore` 订阅 `MediaQueryList`,
服务端 / 首帧快照固定为 `false`(桌面形态),hydration 之后才切 —— 这样 SSR 与客户端首帧
一致,不会闪。`EnterpriseTopbarActions` 的语言项归属与表格的卡片/表格切换都以它为准。

## 页头的内联返回 (PageHeader `back`)

详情页的「返回上一层」**不占独立一行**:传 `back={{ href, label, testId? }}`,`PageHeader`
会在 h1 左边内联一个圆形图标按钮(手机 28px / 桌面 32px 命中区,左向尖角是内联 SVG),
文案落到 `aria-label` 与 `title`,标题行高度一点没变。单独一条「← 返回 X」白占 20 来像素,
再叠上外壳那圈上内边距,桌面首屏顶部就是一大块空白 —— 这条 prop 就是为了消掉它。

```tsx
<PageHeader
  title={exam.name}
  back={{ href: `/${locale}/app/exams`, label: t.backToExams, testId: "exam-detail-back" }}
  renderLink={({ href, className, ariaLabel, title, testId, children }) => (
    <Link href={href} className={className} aria-label={ariaLabel} title={title} data-test-id={testId}>
      {children}
    </Link>
  )}
/>
```

`renderLink` 是可选的(与 shell 的 `RenderNavLink`、enterprise 的 `EnterpriseLinkRenderer`
同一套路):不传就渲染普通 `<a href>`,EasyUI 自己不 import 任何框架的 `Link`。想在别处
(比如宿主自己的详情页页眉)复用同一个控件,直接用导出的 `<PageBackLink back renderLink />`。

有 `back` 时 h1 会 `truncate`(它与控件抢同一行的宽度);没有 `back` 时标题照旧换行。

## Design tokens (theme.css)

| Group    | Tokens |
| -------- | ------ |
| Surfaces | `--paper`, `--paper-deep`, `--paper-soft` |
| Text     | `--ink`, `--ink-soft`, `--ink-faint` |
| Borders  | `--hairline`, `--hairline-strong`, `--hairline-soft` |
| Accents  | `--amber` (primary/blue) + `--amber-soft`, `--signal` (danger/red fills, icons, required marks) + `--signal-ink` (red **text**: errors, notices, status words), `--bond` (indigo), `--evergreen` (success) |
| Status   | `--status-draft/pending/active/stop/archive` (fills, borders, icon glyphs) + `--status-pending-ink` (amber **text**: warning notices, `Badge tone="pending"` — the fill amber is 3.19:1 and fails AA) |
| Motion   | `--ease-out-paper`, `--ease-press`, `--ease-pop`; `--duration-fast/base/slow/page/dialog` (mirrored in `motion.ts`) |
| Type     | `--font-sans`, `--font-mono`, `--font-display` |
| Spacing  | `--ui-field-gap`, `--ui-gap-sm/md/lg`, `--ui-section-gap` —— 竖向行距刻度,见下一节 |

All colors are stored as space-separated RGB channels so you can apply any
opacity: `rgb(var(--ink) / 0.06)`.

## 竖向行距 (vertical rhythm)

整个套件只有**一把竖向刻度**,定义在 `theme.css`,跟着用户的「行距」偏好(紧凑 / 宽松)
整体收紧或放宽。**不要再手写 `space-y-4` 这类一次性间距** —— 一个文件写死一个值,正是
「每页松紧不一样」的来源,而且它不会跟着偏好动。

| 变量 | 紧凑 | 宽松 | 没挂 theme.css 时的兜底 | 管什么 |
| --- | --- | --- | --- | --- |
| `--ui-field-gap` | 2px | 6px | 4px | 标签 → 控件(`Field` 自己用) |
| `--ui-gap-sm` | 8px | 12px | 12px | 同一组里挨得更紧的行 |
| `--ui-gap-md` | 12px | 20px | 16px | 表单 / 卡片正文里的字段之间 |
| `--ui-gap-lg` | 16px | 24px | 20px | 页面上一张张卡片之间 |
| `--ui-section-gap` | 32px | 44px | 40px | `Section` 与 `Section` 之间 |

三个纯 CSS 类(同样在 `theme.css`,`> * + *` 加 `margin-top`),直接替掉原来的 Tailwind
`space-y-*`:

| 写这个 | 不要再写 | 步长 |
| --- | --- | --- |
| `ui-stack` | `space-y-4` | `--ui-gap-md` |
| `ui-stack-sm` | `space-y-3` | `--ui-gap-sm` |
| `ui-stack-lg` | `space-y-5` / `space-y-6` | `--ui-gap-lg` |

不用 `space-y-*` 的场合:

- 竖向 flex 的表单容器写 `gap-[var(--ui-gap-sm,12px)]` / `gap-[var(--ui-gap-md,16px)]`
  (替掉 `flex flex-col gap-3` / `gap-4`);
- 纯粹用来隔开表单行 / 卡片的 `mt-4` / `mb-4` 写 `mt-[var(--ui-gap-md,16px)]` /
  `mb-[var(--ui-gap-md,16px)]`;
- `FormGrid` 的行列间距与 `Field` 的标签间距已经在组件里读这几个变量,调用方什么都不用传;
- `Dialog` 正文(`.ui-stack`)与 `Section` 的尾部外边距(`--ui-section-gap`)也已经接好。

**刻度不管的东西,别顺手改:**`space-y-1` / `space-y-2`(标题 + 一行说明、徽章簇、正文段落)
是排版不是行距;所有横向间距(`gap-x-*`、`flex-row` 里的 gap、工具条、`gap-1`/`gap-2` 的行内簇)、
所有 padding(`p-4`、`px-*`、`py-*`)、控件高度与圆角、表格内部(`src/table/`)都不归它管 ——
在紧凑档把这些一起收掉,页面会直接看起来是坏的。

## How EasyTrade consumes it

> Host-side note — lives in the EasyTrade repo, not verifiable from here; re-check
> before relying on it.

`@/components/ui` is kept as a **thin re-export facade** over the shared package, so the
app's existing `import { Button } from "@/components/ui"` call sites are
unchanged (the older `@easy-ui` aliases serve the same migration purpose).
App-specific, business-coupled components (data grids, currency inputs,
remote-search selects, money formatting) stay under `@/components/ui`
and are **not** part of the shared package.

## 移动端卡片列表 (table cards)

手机上一张横向表格是读不了的:`TABLE_SCROLL` 让每列保住宽度、整张表横向滚动,于是标题列
被裁掉、右侧固定的动作列压在内容上,390px 宽的屏幕一屏只剩四行。所以 `ClientTable` 与
`DataTable` 在手机(`< 768px`,和 Tailwind `md` 同一个断点)上**默认换成卡片列表**:

```tsx
// 宿主什么都不用改 —— 同一份列定义,两种形态
<ClientTable testId="keys" rowKey="id" columns={columns} rows={rows} labels={t.table} />

// 需要保留表格(个位数窄列、或行与行必须对齐着比的对账表)时显式退出:
<DataTable … mobile="table" />
```

| 导出 | 作用 |
| --- | --- |
| `useMediaQuery(query)` / `useIsPhone()` / `PHONE_MEDIA_QUERY` | `@easy-enterprise/ui` 主包。`useSyncExternalStore` 订阅 `matchMedia`,**服务端快照恒为 `false`** |
| `TableCards` | 卡片列表本体,`ClientTable` / `DataTable` 之外也能单用 |
| `MobileColumn` / `MobileColumnRole` | 列定义的 `mobile?: "hidden" \| "title"` 扩展 |
| `TableCardsLabels` / `DEFAULT_TABLE_CARDS_LABELS` | 卡片专有文案(排序 / 全部 / 全选本页 / 选择);`labels.cards` 收 `Partial`,只覆盖给出的那几句 |
| `mobile?: "cards" \| "table"` | `ClientTable` / `DataTable` 的形态开关,默认 `"cards"` |

一张卡怎么排:

- **标题行** = 第一列数据列,或任何标记了 `mobile: "title"` 的列(排序后的第一列未必还是
  那个"名字",所以标记优先),14px medium;
- **定义表** = 其余数据列,两列网格(`dt` 列名 12px 弱化,`dd` 单元格 13px)。`render` 收到
  与表格里完全一样的 `(value, record, index)`;**渲染结果为空的列整行不出现**(桌面上的留白
  在手机上是纯噪声);标了 `mobile: "hidden"` 的列同样不出现(ID、创建人这类列);
- **动作行** = `actionsKey`(默认 `"actions"`,即 `DataTable` 的 `actions` 生成的那一列)或任何
  `fixed: "right"` 的列,右对齐贴在卡片底部,宿主的 `RowActions` 原样渲染;
- **选择** = `rowSelection` 给了就在标题行左边出复选框,外加一行"全选本页",读写的都是
  `selectedRowKeys` / `onChange`(含 `getCheckboxProps` 的禁用态);
- **工具条** = 表头上的能力搬到卡片上方:`searchColumn` / `clientSearchColumn` 每列一个检索框
  (回车或失焦提交,placeholder = 列名,或列上的 `searchPlaceholder`),单选 `filterColumn`
  变成下拉、**多选 `filterColumn`(`multiple: true`)变成一排可换行的开关芯片**(外加一个
  「全部」芯片清空;原生 `<select multiple>` 在手机上会被压成两行的列表框,按不动),
  可排序列合成一个「排序」下拉(列 × 升/降);
- **分页** = 底部居中的 antd `Pagination size="small" simple`。本地分页(`ClientTable`)一页
  放得下就整个不出现;服务端分页(`DataTable`)始终显示,与桌面一致 —— 页码是那张表状态的一部分;
- **加载中** = 还没有行时给三张占位卡,**不出空状态**:首屏没拿到数据就说"暂无数据"是假话;
- **读屏** = 每个行选择框的名字是「选择 + 该行标题」,全选行只统计可选行。

契约要点 —— 这些是约定,不是选项:

- **状态只有一份。** 卡片工具条的一次改动走的是表头那条**同一条**通路:`ClientTable` 回调
  `onFilters`(带上全部受控筛选列,没选的给空数组),`DataTable` 交给查询钩子一个 patch
  (`{ filters }` / `{ sort }` / `{ page }`)。所以 URL、请求、回退键分不出这次操作来自表头
  还是卡片,横竖屏来回切也不会丢关键字或页码(分页共用 `ClientTable` 的本地页码状态)。
- **行的过滤与排序照旧由列定义决定。** 表格模式下这是 antd 干的活,卡片模式没有 antd Table,
  于是由 `TableCards` 按同样语义补上:列上有 `onFilter`(`clientSearchColumn` 的 `subject`
  会生成)就用它筛行,有 `sorter` 比较函数就用它排序;`sorter: true` 的服务端列不本地排序,
  顺序仍由后端给。
- **首帧是桌面形态。** `useIsPhone()` 的服务端快照恒为 `false`:服务器上没有视口,猜错会让
  hydration 前后不一致、整棵子树重渲染。手机在 hydration 之后的第一次订阅里立刻切成卡片 ——
  多一帧表格,换一个不会在 SSR 上出错的钩子。
- **排序清空看形态。** `ClientTable` 的「排序」下拉留着"未排序"一项(状态在组件里,清了就是
  清了);`DataTable` 不留:URL 没有"显式未排序"的槽位,清掉下次刷新会被默认排序顶回来,
  这与表头"第三次点击 = 翻向"是同一条规矩。手机上选的排序转回桌面表格继续生效
  (`ClientTable` 把排序提到自己那一层,写成受控的 `sortOrder`;表头点击同样回写这份状态)。
- **下拉用原生 `<select>`(多选除外)。** 卡片工具条里的单选筛选与排序刻意不用 antd Select:手机上原生下拉
  会拉起系统选择器(滚轮 / 全屏列表),比浮层里的虚拟列表好按,也不用再往卡片流里塞一层
  portal。选择框与分页器仍是 antd,和表格保持同一套视觉。
- **卡片不读表格的分页外观参数。** `DataTable` 的 `pageSizeOptions` / `pagination`(
  `showSizeChanger`、`items_per_page` 之类)、`ClientTable` 的 `showSizeChanger` 都只作用于
  桌面表格:手机上是 `simple` 分页,只有上一页 / 下一页,页大小不在手机上改。`pagination={false}`
  仍然有效(两种形态都不分页)。
- **列组会被拍平。** 卡片没有两层表头:列组(`children`)直接展开成它的子列;`fixed: "right"`
  的列**每一列**都进底部动作行,`mobile: "hidden"` 的列两种形态都能标。
- **桌面像素不变。** 整个特性只在 `(max-width: 767px)` 命中时生效,`md` 及以上一行样式都没动。
