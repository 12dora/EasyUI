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
`eslint` ≥ 9 and `typescript` ≥ 5 for the code-smell gate (see below), plus `antd` ^6.5.2 *only*
if it imports the table or local-accounts entries (declared optional).

## Development

There is no standalone dev server — you develop this package from inside a host workspace
(e.g. EasyFrame's `frontend/`, where `pnpm --dir frontend blank:dev` picks up the sources live)
and typecheck it through the host (`pnpm --dir frontend blank:typecheck`).

Gates: `pnpm lint` runs the shared code-smell ratchet (`easyui-check-smells`: eslint complexity /
function-size / file-size rules + a shrink-only JSON baseline). The rule fragment
(`@easy-enterprise/ui/eslint-smells`) and the bin are both consumed by host repos — thresholds,
host wiring and the ratchet rule are documented in [`docs/GATES.md`](docs/GATES.md).

`easyui-check-smells` judges **only the smell rules it tracks** (complexity, function/file size,
`no-explicit-any`, `no-console`, `no-warning-comments`). Everything else your eslint config
reports — `react-hooks/*`, unused vars, import order, a11y — is invisible to it, by design: the
ratchet must not turn a host's whole lint run into one shrink-only baseline. Hosts therefore keep
their own `eslint` (or `next lint`) step next to this one; a green ratchet is not a green lint.
The one thing it never swallows: if eslint fails to parse a file, the CLI exits 2 rather than
counting the file as clean.

The gate needs `eslint` ≥ 9 (flat config) and `typescript` ≥ 5 from the host — both are declared
as peer deps, since the rule fragment and the SLOC scanner load them out of the host's tree.

Tests run standalone: `pnpm install && pnpm exec vitest run` (root is this package; `happy-dom`
is a declared devDependency; JSX uses the automatic runtime via `vitest.config.ts`). Two behavior
suites (`timestamp-consumer`, `overflow`) import EasyCustoms host pages and are excluded here —
they only run inside the host monorepo; see the `exclude` note in `vitest.config.ts`.

## License

[Apache License 2.0](LICENSE) — free to use, modify and redistribute, commercially included,
with an explicit patent grant. Redistributions must keep the license and copyright notice and
state any changes made. The reference host [EasyFrame](https://github.com/12dora/EasyFrame) is
published under the same license.
