/**
 * Shared form-control geometry contract (FE-UXA-02 / FE-UXB-02 / FE-UXA-12).
 *
 * Both the enterprise kit and the host antd theme must agree on these numbers so
 * that a form control, a form-control button, and a lookup trigger in one row
 * share identical rendered box height and corner radius.
 *
 * Chosen values (compact form density):
 * | Role              | px  | Tailwind / antd key                          |
 * |-------------------|-----|----------------------------------------------|
 * | Form control      | 36  | `h-9` / antd `controlHeight`                 |
 * | Toolbar compact   | 28  | `h-7` / antd `controlHeightSM`               |
 * | Large             | 44  | `h-11`                                       |
 * | Control radius    | 2   | `rounded-[2px]` / antd `borderRadius` (+SM)  |
 * | Surface radius    | 8   | cards/dialogs — antd `borderRadiusLG`        |
 *
 * App code must import these tokens (or the Tailwind classes below) instead of
 * inventing one-off `h-[34px]` / `min-h-10` overrides.
 */

/** Numeric geometry — safe for antd theme, inline styles, and tests. */
export const CONTROL = {
  /** Primary form-control height (px). */
  height: 36,
  /** Compact / toolbar height (px). */
  heightSM: 28,
  /** Large control height (px). */
  heightLG: 44,
  /** Shared corner radius for form controls (px). */
  radius: 2,
  /** Larger radius for cards, dialogs, and other surfaces (px). */
  surfaceRadius: 8,
} as const;

/**
 * Default resolved colours for hosts whose CSS theme uses the values from
 * `theme.css`. Native enterprise fields continue to consume the host's
 * `--paper-soft`, `--ink`, and `--amber` variables through Tailwind classes;
 * this resolved palette is only the default adapter for antd's JS theme API.
 */
export const CONTROL_STATE = {
  background: "#FFFFFF",
  border: "rgba(15, 23, 42, 0.15)",
  borderSecondary: "rgba(15, 23, 42, 0.10)",
  hoverBorder: "rgba(15, 23, 42, 0.30)",
  focusBorder: "#2563EB",
  /** antd Input/Select `activeBorderColor` derives from `colorPrimary`. */
  activeBorder: "#2563EB",
  /** Pressed primary actions, distinct from a focused/active field border. */
  primaryActionActive: "#1D4ED8",
} as const;

/** Host-themed CSS values retained for opt-in native-control adapters. */
export const CONTROL_STATE_STYLE = {
  "--control-border-hover": "rgb(var(--ink) / 0.30)",
  "--control-border-focus": "rgb(var(--amber))",
  "--control-border-active": "rgb(var(--amber))",
} as const;

/** Theme-aware class fragments preserving the enterprise field default. */
export const CONTROL_STATE_CLASS = {
  hoverBorder: "hover:border-ink/30",
  focusBorder: "focus:border-[rgb(var(--amber))]",
} as const;

/**
 * Tailwind class fragments that match `CONTROL`. Prefer these over raw pixel
 * strings so page lanes stay in lockstep with the kit.
 */
export const CONTROL_CLASS = {
  /** Form-control height — inputs, form-control buttons, lookup triggers. */
  height: "h-9",
  heightSM: "h-7",
  heightLG: "h-11",
  /** Form-control corner radius. */
  radius: "rounded-[2px]",
  /**
   * Full native field box: height + radius + soft surface fill used by
   * enterprise Input/Select/Textarea. Pair with antd controls that use the
   * same height/radius via the host theme bridge.
   */
  fieldBox:
    "h-9 rounded-[2px] bg-paper-soft border border-ink/15 px-2.5 text-[13px] leading-5",
  /** Button size class for buttons that sit beside antd form controls. */
  buttonControl: "h-9 px-4 text-[13px] tracking-wide",
} as const;

/**
 * antd `ConfigProvider` theme.token fragment. Host apps spread this into their
 * antd theme so control height/radius match the enterprise kit.
 *
 * Example (customs):
 * ```ts
 * token: { ...ANTD_CONTROL_TOKEN, colorPrimary: "#2563EB", ... }
 * ```
 */
export const ANTD_CONTROL_TOKEN = {
  controlHeight: CONTROL.height,
  controlHeightSM: CONTROL.heightSM,
  controlHeightLG: CONTROL.heightLG,
  borderRadius: CONTROL.radius,
  borderRadiusSM: CONTROL.radius,
  borderRadiusLG: CONTROL.surfaceRadius,
  borderRadiusXS: CONTROL.radius,
} as const;

export interface ControlStatePalette {
  background: string;
  border: string;
  borderSecondary: string;
  hoverBorder: string;
  focusBorder: string;
  primaryActionActive: string;
}

/**
 * Adapt one host's resolved enterprise palette to antd. Hosts that override
 * the CSS theme variables pass their matching resolved colours here.
 */
export function createAntdControlStateToken(palette: ControlStatePalette) {
  return {
    colorBgContainer: palette.background,
    colorBorder: palette.border,
    colorBorderSecondary: palette.borderSecondary,
    colorPrimaryHover: palette.hoverBorder,
    colorPrimary: palette.focusBorder,
    colorPrimaryActive: palette.primaryActionActive,
  } as const;
}

/** antd adapter matching the default enterprise `theme.css` palette. */
export const ANTD_CONTROL_STATE_TOKEN = createAntdControlStateToken(CONTROL_STATE);
