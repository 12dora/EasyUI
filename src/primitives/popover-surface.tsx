"use client";

import { forwardRef, useCallback, useLayoutEffect, useRef } from "react";
import type { ComponentPropsWithoutRef, ReactNode, Ref } from "react";
import { MOTION, MOTION_STATE_MS } from "../motion";

/**
 * The shared popover enter convention. Timing matches MOTION.state
 * (`DURATION.fast` / `EASE_OUT_PAPER`) via CSS class `.easy-popover-enter`
 * (see theme.css — `--duration-fast`). No `motion/react` import so shell
 * language / notification menus do not pull the animation runtime onto the
 * global critical path (FE-PERF-04).
 *
 * The caller owns open/close mounting. On unmount, the primitive retains an
 * inert visual clone for the CSS exit keyframe so conditional callers keep the
 * former opacity/translate exit without importing a motion runtime.
 */
export const POPOVER_MOTION = {
  initial: { opacity: 0, y: -6, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -4, scale: 0.98 },
  transition: { duration: MOTION.state.duration, ease: MOTION.state.ease },
} as const;

type PopoverSurfaceProps = ComponentPropsWithoutRef<"div"> & {
  children: ReactNode;
};

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function setForwardedRef(ref: Ref<HTMLDivElement>, node: HTMLDivElement | null): void {
  if (typeof ref === "function") {
    ref(node);
  } else if (ref) {
    ref.current = node;
  }
}

function stageExit(node: HTMLDivElement): void {
  if (prefersReducedMotion()) return;
  const parent = node.parentElement;
  if (!parent) return;
  const clone = node.cloneNode(true) as HTMLDivElement;
  clone.classList.remove("easy-popover-enter");
  clone.classList.add("easy-popover-exit");
  clone.setAttribute("aria-hidden", "true");
  clone.setAttribute("inert", "");
  clone.setAttribute("data-popover-exit", "true");
  clone.removeAttribute("data-test-id");
  for (const child of clone.querySelectorAll("[id], [data-test-id]")) {
    child.removeAttribute("id");
    child.removeAttribute("data-test-id");
  }

  // Layout-effect cleanup also runs once during React Strict Mode's mount
  // probe. Wait until that commit finishes and retain a clone only when the
  // original node was actually removed.
  queueMicrotask(() => {
    if (node.isConnected || !parent.isConnected) return;
    parent.appendChild(clone);
    const timer = window.setTimeout(() => clone.remove(), MOTION_STATE_MS.in);
    const finish = (event: AnimationEvent) => {
      if (event.target !== clone) return;
      window.clearTimeout(timer);
      clone.removeEventListener("animationend", finish);
      clone.remove();
    };
    clone.addEventListener("animationend", finish);
  });
}

// forwardRef so callers that measure/position the popover node (e.g. the
// remote-search listbox) can attach a ref to the DOM element.
export const PopoverSurface = forwardRef(function PopoverSurface(
  { children, className = "", ...rest }: PopoverSurfaceProps,
  ref: Ref<HTMLDivElement>,
) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const attachRef = useCallback(
    (node: HTMLDivElement | null) => {
      nodeRef.current = node;
      setForwardedRef(ref, node);
    },
    [ref],
  );

  useLayoutEffect(() => {
    const node = nodeRef.current;
    return () => {
      if (node) stageExit(node);
    };
  }, []);

  return (
    <div
      ref={attachRef}
      className={`easy-popover-enter ${className}`.trim()}
      data-animation="popover-surface"
      {...rest}
    >
      {children}
    </div>
  );
});
