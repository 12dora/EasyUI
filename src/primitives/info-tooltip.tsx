"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

interface InfoTooltipProps {
  readonly label: string;
  readonly children: ReactNode;
  readonly testId?: string;
}

/** 字段/区块旁的轻量说明:支持 hover、键盘 focus、触屏点击与 Escape 关闭。 */
export function InfoTooltip({ label, children, testId }: InfoTooltipProps) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    setOpen(false);
  }

  return (
    <span
      ref={rootRef}
      className="group/info relative inline-flex shrink-0 align-middle"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={tooltipId}
        aria-describedby={open ? tooltipId : undefined}
        className="inline-flex size-6 items-center justify-center rounded-full text-ink-faint outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-[rgb(var(--amber))]/45"
        onClick={() => setOpen(true)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
        data-test-id={testId}
      >
        <span
          aria-hidden="true"
          className="inline-flex size-4 items-center justify-center rounded-full border border-ink/25 font-mono text-[10px] font-semibold leading-none"
        >
          i
        </span>
      </button>
      <span
        id={tooltipId}
        role="tooltip"
        hidden={!open}
        className="absolute left-0 top-full z-50 mt-1.5 w-max max-w-[min(18rem,calc(100vw-2rem))] rounded-[2px] border border-ink/10 bg-paper px-3 py-2 text-left text-[12px] font-normal normal-case leading-5 tracking-normal text-ink-soft shadow-lg sm:left-1/2 sm:-translate-x-1/2"
        data-test-id={testId ? `${testId}-content` : undefined}
      >
        {children}
      </span>
    </span>
  );
}
