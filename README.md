# EasyUI (`@easy-enterprise/ui`)

Shared enterprise UI kit for the Easy* application family (EasyTrade, EasyCustoms, EasyFrame):
the design tokens, the app shell and the ready-made account/settings surfaces that make every
Easy* app look and behave the same.

Extracted from the EasyTrade monorepo (`frontend/packages/easy-enterprise`, EasyTrade @ `bd8616a3`).
Consumed by host repos as a **git submodule** mounted at `frontend/packages/easy-enterprise`
(the pnpm workspace resolves it via `"@easy-enterprise/ui": "workspace:*"`, so no publish step is
needed). It is not published to a registry and has no build step — hosts compile the TypeScript
sources directly.

## Layout

- `src/primitives/` — base primitives (Button, inputs, …)
- `src/shell/` — data-driven app shell (Sidebar / MobileNav / Topbar)
- `src/enterprise/` — enterprise surfaces (auth controller, security / access / settings workspaces)
- `src/table/` — antd-backed data table boundary (`DataTableShell`, `useAnimatedExpand`; antd ≥ 6.5 optional peer, own entry `@easy-enterprise/ui/table` + `table.css`)
- `src/enterprise-local-accounts/` — local-account admin surface (`EnterpriseLocalAccountsSurface`), also antd-backed, own entry `@easy-enterprise/ui/enterprise-local-accounts`
- `src/theme.css` — design tokens
- `src/control-tokens.ts`, `src/motion.ts`, `src/toast.ts`

`src/index.ts` re-exports control-tokens / motion / toast / primitives / shell / enterprise. The two
antd-backed entries are **deliberately left out of the barrel** so hosts that bring their own table
never pull antd into their bundle — import them from their own subpath. The authoritative entry list
is the `exports` map in `package.json`.

**Import boundary:** nothing under `src/` may import host code (no `@/…`, no `next/…`) — the
package has to stay usable from any React host. See `src/README.md` for the theme wiring, the
token table and the per-layer design rules.

## Consuming hosts

Update flow for hosts: `git submodule update --remote frontend/packages/easy-enterprise`,
then commit the pointer bump in the host repo.

Peer deps the host must provide: `react` / `react-dom` ≥ 19, [`motion`](https://motion.dev) ≥ 12,
plus `antd` ^6.5.2 *only* if it imports the table or local-accounts entries (declared optional).

## Development

There is no standalone dev server — you develop this package from inside a host workspace
(e.g. EasyFrame's `frontend/`, where `pnpm --dir frontend blank:dev` picks up the sources live)
and typecheck it through the host (`pnpm --dir frontend blank:typecheck`).

Tests: `vitest.config.ts` currently points its `root` at `../../apps/customs` and the DOM behavior
tests rely on `happy-dom`, which this package does not declare. Both are only satisfied inside the
EasyCustoms host checkout — `pnpm vitest run` from a bare EasyUI clone (or from a host without an
`apps/customs`) fails to resolve them. Note also that the config's `include` only covers
`**/*.behavior.test.{ts,tsx}` under `src/enterprise/` and `src/table/`, so the plain unit tests
(`relative-time.test.ts`, `label-builders.test.ts`, `format-timestamp.test.ts`) are not run by it.
