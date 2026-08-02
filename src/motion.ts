/**
 * EasyUI — motion tokens
 *
 * Single source of truth for durations and easing curves used by both:
 * - JS-driven animation (when a surface still uses motion/framer), and
 * - CSS classes in `theme.css` via custom properties of the same names.
 *
 * CSS custom properties (defined in `theme.css` `:root`):
 *   --duration-fast / --duration-base / --duration-dialog /
 *   --duration-page / --duration-slow
 *   --ease-out-paper / --ease-press / --ease-pop
 *
 * Prefer the semantic `MOTION.*` bundles for new work:
 * - `MOTION.state`  — async loading ↔ ready ↔ empty crossfades
 * - `MOTION.list`  — list item enter / exit / reorder
 * - `MOTION.tab`   — tab panel swaps
 * - `MOTION.route` — route / page panel fades
 * - `MOTION.dialog`— dialog overlay + panel presence
 *
 * When changing a duration, edit `DURATION` here **and** the matching
 * `--duration-*` custom property in `theme.css` (the kit-motion-tokens test
 * asserts they stay equal). CSS classes must use `var(--duration-*)`, never
 * raw `0.3s` literals.
 */

export type CubicBezier = readonly [number, number, number, number];

/** Decelerating "settle" curve — matches `--ease-out-paper`. Default for enters. */
export const EASE_OUT_PAPER: CubicBezier = [0.16, 1, 0.3, 1];

/** Symmetric press/switch curve — matches `--ease-press`. */
export const EASE_PRESS: CubicBezier = [0.4, 0, 0.2, 1];

/** Popover pop curve — matches `--ease-pop`. */
export const EASE_POP: CubicBezier = [0.22, 1, 0.36, 1];

/**
 * Common durations (seconds). Keep in lockstep with `:root` in `theme.css`:
 * `--duration-fast` … `--duration-slow`.
 */
export const DURATION = {
  fast: 0.16,
  base: 0.2,
  /** Dialog panel presence — slightly longer than base for a readable settle. */
  dialog: 0.28,
  page: 0.3,
  slow: 0.4,
} as const;

/** CSS custom-property names that mirror `DURATION` keys (for tests / docs). */
export const DURATION_CSS_VAR = {
  fast: "--duration-fast",
  base: "--duration-base",
  dialog: "--duration-dialog",
  page: "--duration-page",
  slow: "--duration-slow",
} as const satisfies Record<keyof typeof DURATION, string>;

export type MotionPreset = {
  readonly duration: number;
  readonly ease: CubicBezier;
};

/**
 * Semantic transition presets composed from `DURATION` + easing curves.
 * App lanes should replace hard-coded `0.12` / `0.16` / `0.28` literals with these.
 */
export const MOTION = {
  /** Async surface state swaps (loading → ready / empty). */
  state: { duration: DURATION.fast, ease: EASE_OUT_PAPER },
  /** List item enter / exit / reorder. */
  list: { duration: DURATION.fast, ease: EASE_OUT_PAPER },
  /** Tab panel content swaps. */
  tab: { duration: DURATION.fast, ease: EASE_OUT_PAPER },
  /** Route / page-level panel fades. */
  route: { duration: DURATION.page, ease: EASE_OUT_PAPER },
  /** Dialog overlay + panel presence. */
  dialog: { duration: DURATION.dialog, ease: EASE_POP },
} as const satisfies Record<string, MotionPreset>;

/** Milliseconds for CSS/JS timers that must match `MOTION.state`. */
export const MOTION_STATE_MS = {
  in: Math.round(DURATION.fast * 1000),
  out: Math.round((DURATION.fast * 1000) / 2),
} as const;
