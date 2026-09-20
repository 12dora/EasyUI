"use client";

import type { ReactNode } from "react";

/**
 * 盒子正文:所属开关关着时整体变灰、不接事件、不可选中,并且整棵子树退出可达范围。
 *
 * 用在「这一整块功能开不开」的卡片里:开关挂在标题行右端(`Section` 的 `actions`),
 * 正文用本组件包起来。开关自己在正文之外,所以关掉之后照样能再打开。
 *
 * 关着的一整块用 `inert`:`aria-disabled` 挂在一个不是控件的 `<div>` 上读屏并不会当真,
 * 而 `pointer-events-none` 只挡指针,Tab 照样走得进去。`inert` 两样都管,还顺带把里面的
 * 文本从无障碍树里摘掉。字段各自的 `disabled` 仍然保留(调用方原来的只读判断):它是
 * 视觉与语义上的「这项现在不算数」,也是 `inert` 还没落地的浏览器上的那道门。
 */
export function GatedBody({ off, className, children }: { off: boolean; className?: string; children: ReactNode }) {
  return (
    <div inert={off || undefined} className={`${className ?? ""}${off ? " select-none opacity-50 pointer-events-none" : ""}`}>
      {children}
    </div>
  );
}
