# Easy Enterprise UI

The reusable workspace package shared by EasyTrade and the deployable blank
enterprise app. It is the single implementation source for the visual language,
application shell and reusable account/settings surfaces.

> Tables ship behind their own entry point: `@easy-enterprise/ui/table` wraps
> **antd ≥ 6.5** (`DataTableShell` server-pagination boundary + `useAnimatedExpand`
> tree-row animation; import `@easy-enterprise/ui/table.css` alongside). antd stays
> an *optional* peer — hosts that bring their own table (TanStack, AG Grid…) simply
> never import that entry. The package core remains the theme, the shell
> (sidebar / topbar / app frame) and the form + action primitives that make
> everything else look consistent.

## What's inside

```
packages/easy-enterprise/src/
  theme.css            ← design tokens + base resets + animation utilities
  motion.ts            ← easing curves / durations (TS mirror of theme.css)
  toast.ts             ← headless toast bus + `toast.success(...)` API
  primitives/          ← Button, Field/Input/Select, Checkbox, Dialog, Badge,
                         PageHeader, EmptyState, InlineNotice, Section, Avatar,
                         SegmentedToggle, Toaster, …  (visual, business-free)
  shell/               ← AppShell, Sidebar (drill-down + mobile drawer), Topbar
  enterprise/          ← complete login, security, Login & Permissions, footer,
                         notification and upstream-health surfaces
  table/               ← antd Table boundary (DataTableShell, useAnimatedExpand,
                         table.css) — separate entry, antd ≥ 6.5 optional peer
  index.ts             ← barrel — import only what you need
```

Each layer is independent: you can take just `theme.css`, or the theme + a few
primitives, or the whole shell.

`EnterpriseSecurityWorkspace` and `EnterpriseAccessSettingsSurface` own their
complete page hierarchy and are consumed directly by both EasyTrade and the blank
host. Hosts inject API/session operations through adapters or render callbacks;
they must not fork the page structure in host code.

## Consuming the workspace package

1. Add `"@easy-enterprise/ui": "workspace:*"` to the app dependencies.
2. **Wire the theme.** The package targets **Tailwind CSS v4**. In your global
   stylesheet, import the theme and make Tailwind scan the workspace source (adjust
   the relative path for the host app):
   ```css
   @import "tailwindcss";
   @source "../../../packages/easy-enterprise/src";
   @import "@easy-enterprise/ui/theme.css";
   ```
   That gives you the color tokens (`bg-paper`, `text-ink`, `text-ink-soft`,
   `border-hairline`, `text-[rgb(var(--amber))]`, …), the base resets (focus
   rings, native form styling, scrollbars) and the animation utilities
   (`animate-fade-up`, `animate-shimmer`, `animate-tree-row-in`).
3. Import from `@easy-enterprise/ui`, `@easy-enterprise/ui/shell`, or
   `@easy-enterprise/ui/enterprise`. EasyTrade keeps `@easy-ui` aliases only as
   a migration-compatible facade for older call sites.
4. **Peer deps.** `react`, `react-dom`, and [`motion`](https://motion.dev)
   (framer-motion successor) for the animated primitives/shell. The shell takes
   your router's `Link` + active-path as props, so it stays framework-agnostic.
5. **Toasts (optional).** Mount `<Toaster />` once at your root, then call
   `toast.success("…")` anywhere.

## Design tokens (theme.css)

| Group    | Tokens |
| -------- | ------ |
| Surfaces | `--paper`, `--paper-deep`, `--paper-soft` |
| Text     | `--ink`, `--ink-soft`, `--ink-faint` |
| Borders  | `--hairline`, `--hairline-strong`, `--hairline-soft` |
| Accents  | `--amber` (primary/blue), `--signal` (danger/red), `--bond` (indigo), `--evergreen` (success) |
| Status   | `--status-draft/pending/active/stop/archive` |
| Motion   | `--ease-out-paper`, `--ease-press` (mirrored in `motion.ts`) |
| Type     | `--font-sans`, `--font-mono`, `--font-display` |

All colors are stored as space-separated RGB channels so you can apply any
opacity: `rgb(var(--ink) / 0.06)`.

## How EasyTrade consumes it

`@/components/ui` is kept as a **thin re-export facade** over the shared package, so the
app's existing `import { Button } from "@/components/ui"` call sites are
unchanged. App-specific, business-coupled components (data grids, currency
inputs, remote-search selects, money formatting) stay under `@/components/ui`
and are **not** part of the shared package.
