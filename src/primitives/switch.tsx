"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

interface SwitchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "type" | "role"> {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Visible text rendered beside the track. When set, the button is wrapped in a
   *  <label> so the text becomes the accessible name *and* a click target. Omit it
   *  when the control is captioned elsewhere and pass `aria-label` instead. */
  label?: ReactNode;
  /** Which side of the track the `label` sits on. `"end"` (default) keeps the control-first
   *  order (track, then text); `"start"` prints the text first and puts the track on its
   *  right — for settings rows that read "what it is → on/off". Ignored without `label`. */
  labelPlacement?: "start" | "end";
}

/**
 * Geometry is sized to the 13px control text, not to iOS: 32×18 track, 14px thumb
 * (the same box as Checkbox's `size-3.5`), 2px inset — so the thumb travels
 * 32 - 14 - 2*2 = 14px. The track keeps the pill radius because a switch *reads* as a
 * pill; everything else stays flat like the rest of the kit — no drop shadow on the
 * thumb, just a hairline `ring-1 ring-ink/10`.
 *
 * Colour comes from the existing tokens only: the off track is a neutral ink alpha
 * (same family as Button's `border-ink/30` / `bg-ink/[0.04]`), the on track is navy
 * `bg-ink` — the same fill as the primary Button, so "on" reads as the site's action colour —
 * and the focus ring is byte-for-byte Checkbox's.
 *
 * Motion uses the kit tokens (`--duration-fast` / `--ease-out-paper`) rather than a raw
 * literal; `prefers-reduced-motion` is neutralised by the global rule in `theme.css`
 * (it zeroes `transition-duration`, not `transform`, so the thumb still lands in the
 * right place — no second media query needed here).
 */
const trackClass =
  "relative inline-flex h-[18px] w-8 shrink-0 items-center rounded-full p-0.5 " +
  "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out-paper)] " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgb(var(--amber))]/50 " +
  "disabled:cursor-not-allowed disabled:opacity-50";

const thumbClass =
  "size-3.5 rounded-full bg-paper ring-1 ring-ink/10 " +
  "transition-transform duration-[var(--duration-fast)] ease-[var(--ease-out-paper)]";

export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(function Switch(
  { checked, onChange, disabled, label, labelPlacement = "end", className = "", ...rest },
  ref,
) {
  const control = (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      {...rest}
      onClick={(event) => {
        rest.onClick?.(event);
        if (!disabled) onChange(!checked);
      }}
      className={`${trackClass} ${checked ? "bg-ink" : "bg-ink/[0.14]"} ${className}`}
    >
      <span className={`${thumbClass} ${checked ? "translate-x-[14px]" : "translate-x-0"}`} />
    </button>
  );
  if (label === undefined) return control;
  return (
    <label
      className={`inline-flex min-h-9 items-center gap-2 text-[13px] text-ink ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
    >
      {labelPlacement === "start" ? (
        <>
          <span>{label}</span>
          {control}
        </>
      ) : (
        <>
          {control}
          <span>{label}</span>
        </>
      )}
    </label>
  );
});
