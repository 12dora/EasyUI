/**
 * The shared antd 6 theme token.
 *
 * Geometry comes from `control-tokens`, so antd's Input / Select / DatePicker /
 * InputNumber end up the same height (36px) and the same radius (2px) as the
 * kit's own Field / Button; the colours are the resolved values of `theme.css`
 * (antd's JS theme API cannot read CSS variables), so an antd table and a
 * native EasyUI page look like one set of controls.
 *
 * This module imports no antd code — a host can spread it into its own
 * `ConfigProvider` without going through `EasyAntdProvider`, and can reach it
 * without loading antd at all via `@easy-enterprise/ui/antd/theme`.
 */

import { ANTD_CONTROL_STATE_TOKEN, ANTD_CONTROL_TOKEN } from "../control-tokens";

/** Arbitrary antd theme token overrides; kept loose so hosts are not gated on antd's type exports. */
export type EasyAntdToken = Record<string, string | number | boolean>;

export const EASY_ANTD_THEME_TOKEN = {
  ...ANTD_CONTROL_TOKEN,
  ...ANTD_CONTROL_STATE_TOKEN,
  colorError: "#DC2626",
  colorSuccess: "#059669",
  colorInfo: "#4F46E5",
  colorText: "#0F172A",
  colorTextSecondary: "#475569",
  colorTextTertiary: "#64748B",
  fontFamily: "var(--font-sans)",
} as const;

/**
 * The kit token with host overrides merged on top — the object a host hands to
 * `EasyAntdProvider`'s `token` prop (or to its own `ConfigProvider`).
 *
 * Use it for a deliberate, documented divergence, e.g. EasyCustoms' rounded
 * look: `createEasyAntdTheme({ borderRadius: 10, borderRadiusSM: 10 })`. The
 * control *heights* stay shared — the r3 unification was about height, not radius.
 */
export function createEasyAntdTheme(overrides: EasyAntdToken = {}): EasyAntdToken {
  return { ...EASY_ANTD_THEME_TOKEN, ...overrides };
}
