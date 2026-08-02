"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { MOTION_STATE_MS } from "../motion";

/**
 * Crossfade between keyed async states without pulling `motion/react` into the
 * global critical path (FE-FB-11 + FE-PERF-04).
 *
 * States: `loading` | `ready` | `empty`. There is intentionally **no** `error`
 * slot — transient failures are toast-only (DECISIONS.md).
 *
 * Timing matches `MOTION.state` / `DURATION.fast` via CSS classes in `theme.css`
 * (`--duration-fast`) and `MOTION_STATE_MS`. Under `prefers-reduced-motion`,
 * the target state renders immediately with no opacity travel.
 */
export type AsyncSurfaceState = "loading" | "ready" | "empty";

export interface AsyncStateTransitionProps {
  state: AsyncSurfaceState;
  loading: ReactNode;
  ready: ReactNode;
  empty?: ReactNode;
  /** Holds layout height across state swaps (number → px, or any CSS length). */
  minHeight?: number | string;
  className?: string;
  /** Test id on the outer wrapper. */
  "data-test-id"?: string;
}

function contentFor(
  state: AsyncSurfaceState,
  slots: Pick<AsyncStateTransitionProps, "loading" | "ready" | "empty">,
): ReactNode {
  if (state === "loading") return slots.loading;
  if (state === "empty") return slots.empty ?? null;
  return slots.ready;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

const OUT_MS = MOTION_STATE_MS.out;
const IN_MS = MOTION_STATE_MS.in;

/**
 * Crossfades `loading | ready | empty` content while holding a minimum height.
 * Uses a CSS opacity crossfade (not motion/react) so app shells can import it
 * without paying the animation-runtime tax on every route.
 */
export function AsyncStateTransition({
  state,
  loading,
  ready,
  empty,
  minHeight,
  className = "",
  "data-test-id": testId,
}: AsyncStateTransitionProps) {
  const reduceMotion = usePrefersReducedMotion();
  const [displayed, setDisplayed] = useState(state);
  const [phase, setPhase] = useState<"in" | "out" | "steady">("steady");
  const displayedRef = useRef(displayed);
  displayedRef.current = displayed;

  useEffect(() => {
    let cancelled = false;
    let outTimer: number | undefined;
    let inTimer: number | undefined;

    if (reduceMotion) {
      setDisplayed(state);
      setPhase("steady");
      return;
    }

    // A target can return to the content that is still displayed while an
    // interrupted exit has already made it transparent. The previous effect's
    // cleanup cancels that exit timer; explicitly settling here makes `steady`
    // the terminal phase instead of stranding the surface in `out`.
    if (state === displayedRef.current) {
      setPhase("steady");
      return;
    }

    setPhase("out");
    outTimer = window.setTimeout(() => {
      if (cancelled) return;
      setDisplayed(state);
      setPhase("in");
      inTimer = window.setTimeout(() => {
        if (cancelled) return;
        setPhase("steady");
      }, IN_MS);
    }, OUT_MS);

    return () => {
      cancelled = true;
      if (outTimer !== undefined) window.clearTimeout(outTimer);
      if (inTimer !== undefined) window.clearTimeout(inTimer);
    };
  }, [state, reduceMotion]);

  const style: CSSProperties | undefined =
    minHeight === undefined
      ? undefined
      : { minHeight: typeof minHeight === "number" ? `${minHeight}px` : minHeight };

  const phaseClass =
    reduceMotion || phase === "steady"
      ? "easy-async-state-steady"
      : phase === "out"
        ? "easy-async-state-out"
        : "easy-async-state-in";

  return (
    <div
      className={`easy-async-state ${phaseClass} ${className}`.trim()}
      style={style}
      data-test-id={testId}
      data-async-state={displayed}
      data-async-phase={reduceMotion ? "steady" : phase}
    >
      {contentFor(displayed, { loading, ready, empty })}
    </div>
  );
}
