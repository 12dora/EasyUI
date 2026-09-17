"use client";

/**
 * 视口断点订阅 —— 组件按媒体查询分叉渲染时用它,而不是各自 `useEffect` + `useState`。
 *
 * 用 `useSyncExternalStore`:订阅的是浏览器的 `MediaQueryList`,React 自己负责在并发渲染
 * 里取一致的快照,不会出现"先按桌面渲染一帧、effect 跑完再跳成手机"的双次布局。
 *
 * **服务端快照固定为 `false`**。服务器上没有视口,任何猜测都会让 hydration 前后不一致
 * (React 会把整棵子树丢掉重渲染)。所以 SSR 与首帧一律走"非手机"分支,真正的手机在
 * hydration 之后的第一次订阅里立刻切过去 —— 这是刻意的取舍:宁可手机上多一帧桌面版式,
 * 也不要一个会在服务端渲染出错误结果的 hook。
 *
 * 没有 `window` / `matchMedia`(SSR、老环境、被裁剪的测试 DOM)时同样返回 `false`,
 * 并且订阅退化成空操作,不抛错。
 */

import { useCallback, useSyncExternalStore } from "react";

/** 手机断点:与 Tailwind `md` 对齐(`md` 是 min-width 768px,所以手机是 767px 及以下)。 */
export const PHONE_MEDIA_QUERY = "(max-width: 767px)";

function mediaList(query: string): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null;
  return window.matchMedia(query);
}

/** 订阅一个媒体查询的变化;老版本 Safari 只有 `addListener`,所以两条路都留着。 */
function listen(query: string, onChange: () => void): () => void {
  const list = mediaList(query);
  if (!list) return () => undefined;
  if (typeof list.addEventListener === "function") {
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }
  if (typeof list.addListener === "function") {
    list.addListener(onChange);
    return () => list.removeListener?.(onChange);
  }
  return () => undefined;
}

/** 当前视口是否命中 `query`;服务端与无 `matchMedia` 的环境恒为 `false`。 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback((onStoreChange: () => void) => listen(query, onStoreChange), [query]);
  const snapshot = useCallback(() => mediaList(query)?.matches ?? false, [query]);
  return useSyncExternalStore(subscribe, snapshot, () => false);
}

/** 手机视口(< 768px)。表格切卡片、壳层收起侧栏都以它为准。 */
export function useIsPhone(): boolean {
  return useMediaQuery(PHONE_MEDIA_QUERY);
}
