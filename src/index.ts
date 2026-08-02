/**
 * Shared Easy Enterprise UI workspace package.
 *
 * EasyTrade and the blank host both consume this workspace package directly.
 * Import the visual language via `@easy-enterprise/ui/theme.css`, then select
 * the primitives, shell and enterprise surfaces required by the host.
 *
 *   - control geometry tokens (form-control height / radius contract)
 *   - motion tokens (easing curves / durations / MOTION.* presets)
 *   - toast bus + `toast.*` API
 *   - primitives/ (Button, Field, Badge, Dialog, PageHeader, …)
 *   - shell/ (AppShell, Sidebar, Topbar)
 */

export * from "./control-tokens";
export * from "./motion";
export * from "./toast";
export * from "./primitives";
export * from "./shell";
export * from "./enterprise";
