"use client";

import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { DURATION } from "../motion";
import { useFocusTrap } from "./focus-trap";

// 标题行右侧插槽:body 里的内容组件(常常才持有数据)可把补充信息渲染到标题同一行,
// 不必为一行小字把数据获取提升到 Dialog 调用方。不在 Dialog 内时原地渲染兜底。
const HeaderAsideContext = createContext<HTMLElement | null>(null);

export function DialogHeaderAside({ children }: { children: ReactNode }) {
  const slot = useContext(HeaderAsideContext);
  if (!slot) return <>{children}</>;
  return createPortal(children, slot);
}

interface Props {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  eyebrow?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  /** Localized aria-label for the overlay + header close controls. Shared enterprise surfaces always pass it. */
  closeLabel?: string;
  /** 提交进行中置 true:Esc/遮罩/关闭按钮全部禁用,防止请求在途时误关。默认 false,不影响既有调用方。 */
  busy?: boolean;
}

const SIZES = {
  sm: "max-w-md",
  md: "max-w-xl",
  lg: "max-w-3xl",
  xl: "max-w-5xl",
};

/** Exit animation length (ms) — matches `--duration-dialog` / MOTION.dialog. */
const EXIT_MS = Math.round(DURATION.dialog * 1000);

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Modal dialog with CSS enter/exit (no motion/react — FE-PERF-04).
 * Presence stays mounted through the exit class so the panel can fade out
 * before unmount, matching the previous AnimatePresence behaviour.
 */
export function Dialog({ open, onClose, title, eyebrow, children, footer, size = "md", closeLabel, busy = false }: Props) {
  const titleId = useId();
  const [retainPresence, setRetainPresence] = useState(open);
  const present = open || retainPresence;
  useDialogEffects(open, onClose, busy);

  useEffect(() => {
    let cancelled = false;
    if (open) {
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
    // CSS removes the visual exit under reduced motion, so presence must leave
    // in the same task too; otherwise an invisible portal retains focus/scroll.
    if (prefersReducedMotion()) {
      void Promise.resolve().then(() => {
        if (!cancelled) setRetainPresence(false);
      });
      return () => {
        cancelled = true;
      };
    }
    const t = window.setTimeout(() => setRetainPresence(false), EXIT_MS);
    return () => window.clearTimeout(t);
  }, [open, retainPresence]);

  if (typeof document === "undefined" || !present) return null;
  const resolvedCloseLabel = closeLabel ?? (document.documentElement.lang.startsWith("zh") ? "关闭" : "Close");
  const exit = !open;
  return createPortal(
    <DialogFrame
      onClose={onClose}
      title={title}
      eyebrow={eyebrow}
      footer={footer}
      size={size}
      titleId={titleId}
      closeLabel={resolvedCloseLabel}
      busy={busy}
      exiting={exit}
    >
      {children}
    </DialogFrame>,
    document.body,
  );
}

// 已打开 Dialog 的层叠栈:Esc 只关最顶层,嵌套时一次 Esc 不再连关父层草稿。
const dialogStack: symbol[] = [];

function useDialogEffects(open: boolean, onClose: () => void, busy: boolean) {
  const idRef = useRef<symbol | null>(null);
  if (idRef.current === null) idRef.current = Symbol("dialog");
  // 用 ref 读取 busy:提交进行中屏蔽 Esc,而不必在每次 busy 翻转时重挂监听(保持 dialogStack 栈顶判定)。
  // ref 的写入放进 effect(不在渲染期写),满足 react-hooks/refs。
  const busyRef = useRef(busy);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);
  useEffect(() => {
    if (!open) return;
    const id = idRef.current as symbol;
    dialogStack.push(id);
    const onKey = (e: KeyboardEvent) => {
      // defaultPrevented:子层(如 combobox 弹层)已消费 Esc 时不再连带关 Dialog。
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (busyRef.current) return; // 提交进行中不允许 Esc 关闭
      if (dialogStack[dialogStack.length - 1] !== id) return;
      onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      const index = dialogStack.indexOf(id);
      if (index >= 0) dialogStack.splice(index, 1);
    };
  }, [open, onClose]);
}

function DialogFrame({
  onClose,
  title,
  eyebrow,
  children,
  footer,
  size,
  titleId,
  closeLabel,
  busy,
  exiting,
}: Omit<Props, "open" | "closeLabel"> & {
  size: NonNullable<Props["size"]>;
  titleId: string;
  closeLabel: string;
  busy: boolean;
  exiting: boolean;
}) {
  const [panel, setPanel] = useState<HTMLDivElement | null>(null);
  const [headerAside, setHeaderAside] = useState<HTMLElement | null>(null);
  useFocusTrap(panel, !exiting);
  // 提交进行中禁用一切 dismiss 入口(遮罩 / 关闭按钮)。
  const handleDismiss = busy || exiting ? undefined : onClose;
  // 滚动锁绑定到本组件挂载/卸载:退出动画完成后 present=false 才卸载,期间背景不滚动。
  useEffect(() => {
    lockDialogScroll();
    return () => unlockDialogScroll();
  }, []);
  const overlayClass = exiting ? "easy-dialog-overlay-exit" : "easy-dialog-overlay-enter";
  const panelClass = exiting ? "easy-dialog-panel-exit" : "easy-dialog-panel-enter";
  return (
    <div
      className={`fixed inset-0 z-[1000] flex items-stretch justify-center overflow-y-auto p-0 sm:items-start sm:px-4 sm:py-10 ${overlayClass}`}
      data-dialog-phase={exiting ? "exit" : "enter"}
    >
      <button
        type="button"
        aria-label={closeLabel}
        onClick={handleDismiss}
        disabled={busy || exiting}
        aria-disabled={busy || exiting || undefined}
        data-test-id="app-dialog-overlay"
        className="fixed inset-0 cursor-default bg-ink/40 backdrop-blur-[2px]"
      />
      {/* Near full-screen on phones (edge-to-edge, dvh height); a centered card from sm up.
          Header + footer stay pinned while only the body scrolls. */}
      <div
        ref={setPanel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={`relative z-10 flex max-h-[100dvh] w-full flex-col paper-card ${SIZES[size]} rounded-none p-0 focus:outline-none sm:max-h-[90vh] sm:rounded-[3px] ${panelClass}`}
      >
        <DialogHeader
          eyebrow={eyebrow}
          title={title}
          onClose={handleDismiss}
          titleId={titleId}
          closeLabel={closeLabel}
          busy={busy || exiting}
          asideRef={setHeaderAside}
        />
        <HeaderAsideContext.Provider value={headerAside}>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        </HeaderAsideContext.Provider>
        {footer ? <DialogFooter>{footer}</DialogFooter> : null}
      </div>
    </div>
  );
}

function DialogHeader({
  eyebrow,
  title,
  onClose,
  titleId,
  closeLabel,
  busy,
  asideRef,
}: {
  eyebrow?: ReactNode;
  title?: ReactNode;
  onClose?: () => void;
  titleId: string;
  closeLabel: string;
  busy?: boolean;
  asideRef?: (el: HTMLElement | null) => void;
}) {
  return (
    <div className="flex shrink-0 items-start justify-between gap-4 border-b border-ink/12 px-6 pb-4 pt-5">
      <div className="min-w-0 flex-1">
        {eyebrow ? <div className="eyebrow mb-1.5">{eyebrow}</div> : null}
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 id={titleId} className="font-semibold text-[22px] leading-tight text-ink">
            {title}
          </h3>
          <div ref={asideRef} className="min-w-0" data-test-id="app-dialog-header-aside" />
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        disabled={busy}
        aria-disabled={busy || undefined}
        className="text-ink-soft hover:text-ink text-lg leading-none -mr-1 disabled:opacity-40 disabled:cursor-default"
        aria-label={closeLabel}
        data-test-id="app-dialog-close"
      >
        ×
      </button>
    </div>
  );
}

function DialogFooter({ children }: { children: ReactNode }) {
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-ink/12 px-6 py-4 bg-paper-deep/30">
      {children}
    </div>
  );
}

let scrollLockDepth = 0;
let scrollSnapshot: {
  htmlOverflow: string;
  bodyOverflow: string;
  main: HTMLElement | null;
  mainOverflow: string;
  mainOverscrollBehavior: string;
} | null = null;

function lockDialogScroll() {
  scrollLockDepth += 1;
  if (scrollLockDepth > 1) return;
  const main = document.querySelector('main[class*="overflow-y-auto"]') as HTMLElement | null;
  scrollSnapshot = {
    htmlOverflow: document.documentElement.style.overflow,
    bodyOverflow: document.body.style.overflow,
    main,
    mainOverflow: main?.style.overflow ?? "",
    mainOverscrollBehavior: main?.style.overscrollBehavior ?? "",
  };
  document.documentElement.style.overflow = "hidden";
  document.body.style.overflow = "hidden";
  if (main) {
    main.style.overflow = "hidden";
    main.style.overscrollBehavior = "contain";
  }
}

function unlockDialogScroll() {
  scrollLockDepth = Math.max(0, scrollLockDepth - 1);
  if (scrollLockDepth > 0 || !scrollSnapshot) return;
  document.documentElement.style.overflow = scrollSnapshot.htmlOverflow;
  document.body.style.overflow = scrollSnapshot.bodyOverflow;
  if (scrollSnapshot.main) {
    scrollSnapshot.main.style.overflow = scrollSnapshot.mainOverflow;
    scrollSnapshot.main.style.overscrollBehavior = scrollSnapshot.mainOverscrollBehavior;
  }
  scrollSnapshot = null;
}
