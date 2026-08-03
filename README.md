# EasyUI (`@easy-enterprise/ui`)

Shared enterprise UI kit for the Easy* application family (EasyTrade, EasyCustoms, EasyFrame).

Extracted from the EasyTrade monorepo (`frontend/packages/easy-enterprise`, EasyTrade @ `bd8616a3`).
Consumed by host repos as a **git submodule** mounted at `frontend/packages/easy-enterprise`
(the pnpm workspace resolves it via `"@easy-enterprise/ui": "workspace:*"`, so no publish step is needed).

## Layout

- `src/primitives/` — base primitives (Button, inputs, …)
- `src/shell/` — data-driven app shell (Sidebar / MobileNav / Topbar)
- `src/enterprise/` — enterprise surfaces (auth controller, security / access / settings workspaces)
- `src/table/` — antd-backed data table boundary (`DataTableShell`, `useAnimatedExpand`; antd ≥ 6.5 optional peer, own entry `@easy-enterprise/ui/table` + `table.css`)
- `src/theme.css` — design tokens
- `src/control-tokens.ts`, `src/motion.ts`, `src/toast.ts`

See `src/README.md` for design rules (import boundaries: this package must never import host code).

## Consuming hosts

Update flow for hosts: `git submodule update --remote frontend/packages/easy-enterprise`,
then commit the pointer bump in the host repo.

## Development

```bash
pnpm install
pnpm vitest run
```
