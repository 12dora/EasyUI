# Easy Enterprise UI — design rules

Layer-by-layer rules for the package sources. For what the package is, how hosts
mount it and how to develop it, see the repo-root `README.md`.

It is the single implementation source for the visual language, application shell
and reusable account/settings surfaces shared by EasyTrade, EasyCustoms and the
deployable blank enterprise app.

> Tables ship behind their own entry point: `@easy-enterprise/ui/table` wraps
> **antd ≥ 6.5** (`DataTableShell` server-pagination boundary + `useAnimatedExpand`
> tree-row animation; import `@easy-enterprise/ui/table.css` alongside). antd stays
> an *optional* peer — hosts that bring their own table (TanStack, AG Grid…) simply
> never import that entry. The same applies to
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
  enterprise/               ← complete login, security, Login & Permissions, footer,
                              notification and upstream-health surfaces
  table/                    ← antd Table boundary (DataTableShell, useAnimatedExpand,
                              table.css) — separate entry, antd ≥ 6.5 optional peer
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
   `@easy-enterprise/ui/enterprise` — plus `@easy-enterprise/ui/table` /
   `@easy-enterprise/ui/enterprise-local-accounts` if you want the antd-backed
   surfaces (they are not in the barrel).
4. **Peer deps.** `react` / `react-dom` ≥ 19, and [`motion`](https://motion.dev) ≥ 12
   (framer-motion successor) for the animated primitives/shell. The shell takes
   your router's `Link` + active-path as props, so it stays framework-agnostic.
5. **Toasts (optional).** Mount `<Toaster />` once at your root, then call
   `toast.success("…")` anywhere.

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
