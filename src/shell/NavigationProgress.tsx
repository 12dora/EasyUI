"use client";

import { useEffect, useState } from "react";

/**
 * 客户端导航进行中的进度条:内容列顶边一条 2px 琥珀色细轨。
 *
 * 只在导航"慢到能被感知"时才出现(延迟 `NAV_PROGRESS_DELAY_MS`),所以本地/已预取的
 * 秒开导航永远不会闪一下;内容本身保持上一页不动(不要为此重新引入 route 级 loading.tsx
 * 或 <Suspense> —— 见 easyframe/docs/SHELL_PERCEIVED_LOADING.md 与 React ~300ms 的
 * Suspense 揭示节流)。
 *
 * 动效全走 CSS 关键帧(theme.css 里的 `easyNavProgress*`),shell 关键路径上不引
 * motion/react(FE-PERF-04);`prefers-reduced-motion` 由 theme.css 的全局兜底中和成
 * 纯显示/隐藏。
 */

/** 进入延迟:pending 持续这么久之后进度条才显形。 */
export const NAV_PROGRESS_DELAY_MS = 150;
/** 收尾时长:pending 结束后补满 + 淡出,与 `.easy-nav-progress-done` 的动画对齐。 */
const NAV_PROGRESS_EXIT_MS = 200;

type Phase = "idle" | "running" | "done";

export interface NavigationProgressProps {
  /** 有一次客户端导航在途。 */
  pending: boolean;
  /** 本地化的状态文案(视觉隐藏,只读给读屏)。 */
  label?: string;
}

export function NavigationProgress({ pending, label }: NavigationProgressProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [lastPending, setLastPending] = useState(pending);

  // 渲染期间调整 state:
  //   pending 抬起 —— 一律回到 idle,150ms 的延迟窗口必须从"没显形"重新算起,
  //     否则上一次导航还在收尾(done)时紧接着的第二次导航会顶着一条正在淡出的死线;
  //   pending 落下 —— 已显形的补满淡出(done),没显形过的直接回 idle。
  if (lastPending !== pending) {
    setLastPending(pending);
    setPhase((current) => {
      if (pending) return "idle";
      return current === "running" ? "done" : "idle";
    });
  }

  useEffect(() => {
    if (!pending) return undefined;
    const timer = setTimeout(() => setPhase("running"), NAV_PROGRESS_DELAY_MS);
    return () => clearTimeout(timer);
  }, [pending]);

  useEffect(() => {
    if (pending || phase !== "done") return undefined;
    const timer = setTimeout(() => setPhase("idle"), NAV_PROGRESS_EXIT_MS);
    return () => clearTimeout(timer);
  }, [pending, phase]);

  const visible = phase !== "idle";

  return (
    <div
      data-test-id="nav-progress"
      data-state={phase}
      role={visible ? "status" : undefined}
      aria-hidden={visible ? undefined : true}
      className="pointer-events-none absolute inset-x-0 top-0 z-20"
    >
      {/* 2px 的可视细轨:纯视觉,overflow-hidden 只裁它自己 —— 状态文案放在它外面,
          免得读屏文本被这 2px 的裁剪盒子夹住。 */}
      <div className="h-[2px] overflow-hidden">
        {visible ? (
          <span
            data-test-id="nav-progress-bar"
            className={`block h-full w-full ${
              phase === "done" ? "easy-nav-progress-done" : "easy-nav-progress-grow"
            }`}
          />
        ) : null}
      </div>
      {visible && label ? <span className="easy-visually-hidden">{label}</span> : null}
    </div>
  );
}
