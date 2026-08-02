"use client";

import { useEffect, useState, type ReactNode } from "react";
import { DURATION } from "../motion";

const EXIT_MS = Math.round(DURATION.page * 1000);

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Two-way disclosure: fades + expands height on enter, and reverses on exit.
 * Height animates via CSS `grid-template-rows: 0fr → 1fr` (theme.css
 * `.easy-collapse-*`) so this primitive stays off the `motion/react` critical
 * path (FE-PERF-04). Timing uses `--duration-page` (MOTION.route / DURATION.page).
 * `prefers-reduced-motion` is handled by the global theme media query.
 * Closed children unmount after exit by default, matching the former
 * AnimatePresence lifecycle. Pass `keepMounted` only when preserving child
 * state/effects while closed is intentional.
 */
export function CollapseReveal({
  open,
  children,
  className,
  keepMounted = false,
  "data-test-id": testId,
}: {
  open: boolean;
  children: ReactNode;
  className?: string;
  /** Keep closed children mounted and inert. Defaults to false (legacy lifecycle). */
  keepMounted?: boolean;
  "data-test-id"?: string;
}) {
  const [retainPresence, setRetainPresence] = useState(open || keepMounted);
  const present = open || keepMounted || retainPresence;

  useEffect(() => {
    let cancelled = false;
    if (open || keepMounted) {
      if (!retainPresence) {
        void Promise.resolve().then(() => {
          if (!cancelled) setRetainPresence(true);
        });
      }
      return () => {
        cancelled = true;
      };
    }
    if (!retainPresence) return;
    if (prefersReducedMotion()) {
      void Promise.resolve().then(() => {
        if (!cancelled) setRetainPresence(false);
      });
      return () => {
        cancelled = true;
      };
    }
    const timer = window.setTimeout(() => setRetainPresence(false), EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [keepMounted, open, retainPresence]);

  if (!present) return null;

  return (
    <div
      data-test-id={testId}
      className={`easy-collapse ${open ? "easy-collapse-open" : "easy-collapse-closed"} ${className ?? ""}`.trim()}
      data-open={open ? "true" : "false"}
      aria-hidden={open ? undefined : true}
      // Keep exit/opt-in content mounted, but block focus whenever closed.
      {...(!open ? { inert: true as const } : {})}
    >
      <div className="easy-collapse-inner">{children}</div>
    </div>
  );
}
