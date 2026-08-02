"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

// useEffect 仍用于 ToastCard 的自动消失定时器
import { createPortal } from "react-dom";
import { MOTION_STATE_MS } from "../motion";
import { toastBus, type ToastItem, type ToastVariant } from "../toast";

/**
 * 全站 Toast 渲染器 (7.0.1).
 *
 * 挂载在根 layout 一次即可; 之后任何代码调用 `toast.success("…")` 都会在
 * 屏幕右下角 portal 渲染一个通知.
 *
 * - CSS enter animation (no motion/react) so the toaster is not on the global critical path
 * - 通过 createPortal 直接挂 body, 不受任何容器 overflow 影响
 * - 设计语言: 纯白底 + 细边框 + 状态色细条, 不喧宾夺主
 * - 状态色: success=evergreen / error=signal / warning=琥珀 / info=blue
 *
 * 无障碍:
 * - error 走 role=alert / aria-live=assertive, 15 秒可暂停倒计时, 并且随时可以手动关闭 ——
 *   失败要被读屏立刻播报, 也要给足阅读时间, 不能像成功提示那样 3 秒就溜走.
 * - 其余 variant 走 role=status / aria-live=polite, 3 秒后自动消失.
 * - `duration <= 0` 的 toast 常驻, 只能手动关闭(逃生舱, 留给必须人工确认的失败).
 * - 关闭按钮的可访问名称按文档语言给出中英两版(与 Dialog 关闭按钮同一约定),
 *   宿主也可以用 `dismissLabel` 显式覆盖.
 */

const VARIANT_LIVE: Record<ToastVariant, { role: "alert" | "status"; live: "assertive" | "polite" }> = {
  success: { role: "status", live: "polite" },
  info: { role: "status", live: "polite" },
  warning: { role: "status", live: "polite" },
  error: { role: "alert", live: "assertive" },
};

/** 关闭按钮可访问名称的兜底: 跟随 <html lang>, 与 Dialog 的关闭按钮保持一致。 */
function defaultDismissLabel(): string {
  if (typeof document === "undefined") return "Dismiss notification";
  return document.documentElement.lang.startsWith("zh") ? "关闭通知" : "Dismiss notification";
}

const VARIANT_STYLES: Record<ToastVariant, { bar: string; ring: string; text: string }> = {
  success: {
    bar: "bg-[rgb(var(--evergreen))]",
    ring: "border-[rgb(var(--evergreen))]/40",
    text: "text-[rgb(var(--evergreen))]",
  },
  error: {
    bar: "bg-[rgb(var(--signal))]",
    ring: "border-[rgb(var(--signal))]/40",
    text: "text-[rgb(var(--signal))]",
  },
  warning: {
    bar: "bg-amber-500",
    ring: "border-amber-400/50",
    text: "text-amber-700",
  },
  info: {
    bar: "bg-[rgb(var(--amber))]",
    ring: "border-[rgb(var(--amber))]/40",
    text: "text-[rgb(var(--amber))]",
  },
};

// 稳定的 dismiss 引用:内联闭包每次 Toaster 重渲染都换标识,会让每张已存在 toast 的
// 自动消失 effect(依赖 onDismiss)重置计时——新 toast 一来,旧 toast 计时全部重置、迟迟不消失。
const dismissToast = (id: string) => toastBus.dismiss(id);

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function ToastCard({ item, onDismiss, dismissLabel }: { item: ToastItem; onDismiss: (id: string) => void; dismissLabel: string }) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [pointerOver, setPointerOver] = useState(false);
  const [focusInside, setFocusInside] = useState(false);
  const [exitingItem, setExitingItem] = useState<ToastItem | null>(null);
  const exitingItemRef = useRef<ToastItem | null>(null);
  const exitTimerRef = useRef<number | null>(null);
  const paused = pointerOver || focusInside;
  const exiting = exitingItem === item;

  const requestDismiss = useCallback(() => {
    if (exitingItemRef.current === item) return;
    exitingItemRef.current = item;

    if (prefersReducedMotion()) {
      onDismiss(item.id);
      return;
    }

    setExitingItem(item);
    // Keep the item in toastBus until CSS exit presence completes. It therefore
    // remains visible in the bus accounting invariant while this card exits.
    exitTimerRef.current = window.setTimeout(() => {
      exitTimerRef.current = null;
      // A stable-id replacement occupies the same React card. Only the exact
      // item that armed this exit may be removed; a replacement gets its own
      // complete lifetime and eventual exit schedule.
      if (toastBus.getSnapshot().includes(item)) onDismiss(item.id);
    }, MOTION_STATE_MS.in);
  }, [item, onDismiss]);

  useEffect(
    () => () => {
      if (exitTimerRef.current !== null) {
        window.clearTimeout(exitTimerRef.current);
        exitTimerRef.current = null;
      }
      if (exitingItemRef.current === item) exitingItemRef.current = null;
    },
    [item],
  );

  // 悬停判定走几何而不是 mouseenter:卡片是 pointer-events-none(见下方注释),
  // 拿不到 hover 事件,只能从 document 的 pointermove 里比坐标。
  useEffect(() => {
    if (item.duration <= 0) return;
    const onPointerMove = (event: PointerEvent) => {
      const rect = cardRef.current?.getBoundingClientRect();
      if (!rect) return;
      const inside =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;
      setPointerOver((current) => (current === inside ? current : inside));
    };
    document.addEventListener("pointermove", onPointerMove);
    return () => document.removeEventListener("pointermove", onPointerMove);
  }, [item.duration]);

  // 剩余时长放 ref:暂停时把已过去的时间扣掉,恢复时接着走,而不是从头重数。
  const remainingRef = useRef(item.duration);
  const resumedAtRef = useRef(0);
  useEffect(() => {
    // The bus creates a new item object for every replacement, so even two
    // pushes in the same millisecond restart from the replacement's duration.
    remainingRef.current = item.duration;
  }, [item]);

  useEffect(() => {
    if (item.duration <= 0) return; // 逃生舱:常驻,只能手动关闭
    if (paused) return;
    resumedAtRef.current = Date.now();
    const handle = window.setTimeout(requestDismiss, remainingRef.current);
    return () => {
      window.clearTimeout(handle);
      remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - resumedAtRef.current));
    };
  }, [item, paused, requestDismiss]);

  const styles = VARIANT_STYLES[item.variant];
  const live = VARIANT_LIVE[item.variant];

  // 卡片本体不吃指针事件:error toast 会在屏幕上停留十几秒(悬停时更久), 若整张卡可点
  // 就会挡住右下角的界面(典型如 Dialog 页脚的主操作按钮)。只有关闭按钮需要 pointer-events。
  return (
    <div
      ref={cardRef}
      role={live.role}
      aria-live={live.live}
      onFocusCapture={() => setFocusInside(true)}
      onBlurCapture={() => setFocusInside(false)}
      data-test-toast
      data-toast-variant={item.variant}
      className={`${exiting ? "easy-toast-exit" : "easy-toast-enter"} pointer-events-none relative flex items-start gap-3 overflow-hidden rounded-[3px] border ${styles.ring} bg-paper px-3.5 py-2.5 pr-8 shadow-md min-w-[260px] max-w-[420px]`}
    >
      <span className={`absolute left-0 top-0 h-full w-[3px] ${styles.bar}`} aria-hidden />
      <ToastVariantMark variant={item.variant} className={styles.text} />
      <div className="flex-1 text-[13px] leading-5 text-ink whitespace-pre-line">{item.message}</div>
      <ToastDismissButton onDismiss={requestDismiss} label={dismissLabel} />
    </div>
  );
}

function ToastVariantMark({ variant, className }: { variant: ToastVariant; className: string }) {
  const text = { success: "OK", error: "!", warning: "△", info: "i" }[variant];
  return (
    <div aria-hidden className={`text-[12px] font-medium leading-5 ${className} mt-px shrink-0 uppercase tracking-wide`}>
      {text}
    </div>
  );
}

function ToastDismissButton({ onDismiss, label }: { onDismiss: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onDismiss}
      className="pointer-events-auto absolute right-1.5 top-1.5 text-ink-faint hover:text-ink text-[14px] leading-none"
    >
      ×
    </button>
  );
}

export function Toaster({ dismissLabel }: { dismissLabel?: string } = {}) {
  // Unmount only invokes the subscription cleanup. Toast ownership remains in
  // toastBus, so route/layout remounts cannot silently clear visible or queued
  // notifications; the next renderer receives the same snapshot.
  const items = useSyncExternalStore(
    toastBus.subscribe,
    toastBus.getSnapshot,
    toastBus.getServerSnapshot,
  );

  // SSR 阶段 + 首次 hydration 都返回 null, mounted 之后再挂 portal —
  // 避免 server 树("无 portal")与 client 第一帧("有 portal")不一致触发
  // React 19 hydration mismatch. 这是 React 文档推荐的 deferred-portal 范式,
  // useEffect 里 setState 是必需的, lint 规则在这里需要静音。
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const resolvedDismissLabel = dismissLabel ?? defaultDismissLabel();

  return createPortal(
    <div data-toaster className="pointer-events-none fixed bottom-4 right-4 z-[1100] flex flex-col items-end gap-2">
      {items.map((it) => (
        <ToastCard key={it.id} item={it} onDismiss={dismissToast} dismissLabel={resolvedDismissLabel} />
      ))}
    </div>,
    document.body,
  );
}
