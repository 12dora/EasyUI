/**
 * EasyUI table — antd-backed data table boundary.
 *
 * antd is an **optional peer** of this package, so the table lives behind its
 * own entry point instead of the main barrel: hosts without antd never load
 * it. Consume via
 *
 *   import { DataTableShell, useAnimatedExpand } from "@easy-enterprise/ui/table";
 *
 * and import `@easy-enterprise/ui/table.css` once from the host stylesheet
 * (next to theme.css) for the tree-row animations.
 */

export {
  DataTableShell,
  type DataTableShellProps,
  type DataTablePagination,
} from "./data-table-shell";
export {
  useAnimatedExpand,
  ANIMATED_EXPAND_DURATION_MS,
  type AnimatedExpand,
  type UseAnimatedExpandOptions,
} from "./animated-expand";
