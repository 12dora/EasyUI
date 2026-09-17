"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * EasyUI shell —— 导航意图(nav intent)。
 *
 * App Router 里 `usePathname()` 只在导航 **提交** 之后才翻页:布局 force-dynamic、
 * 没有 route 级 loading.tsx,远端访问时点击到内容切换之间有 300~1500ms,侧栏的选中标记
 * 就"跟不上手指"。这个钩子把用户刚刚选中的目标路径记下来,让侧栏在路由提交之前就能把它
 * 画成选中态;真实路由落地(或安全超时)后自动让位给 `pathname`。
 *
 * 纯逻辑、与路由库无关(EasyUI 不引 next/*):宿主把自己的 `usePathname()` 传进来。
 */

/** 意图的安全超时:导航被中止 / 出错时,标记最多停在目标上这么久就弹回真实路由。 */
export const NAV_INTENT_TIMEOUT_MS = 8000;

export interface NavIntent {
  /** 用来算 `active` 的路径:有意图未落地时是意图路径,否则就是真实 `pathname`。 */
  path: string;
  /** 从 `onIntent(href)` 起,到 `pathname` 发生任何变化(或超时)为止为真。 */
  pending: boolean;
  /** 在导航链接的 click 处理里同步调用(面板项则在 `router.push` 之前调用)。 */
  onIntent: (href: string) => void;
}

/**
 * 取 href 的路径部分:丢掉 `?query` 与 `#hash`,其余原样保留。
 *
 * 不做 locale 改写 —— 宿主传进来的 href 已经是本地化过的路径。
 */
export function intentPathOf(href: string): string {
  const cut = href.search(/[?#]/);
  return cut === -1 ? href : href.slice(0, cut);
}

interface IntentState {
  /** 意图的目标路径(已剥掉 query / hash)。 */
  readonly target: string;
  /** 记录意图那一刻的真实 `pathname`,用来判断导航有没有落地。 */
  readonly from: string;
  /** 单调递增,给超时定时器做身份判断(第二次点击会换目标、换定时器)。 */
  readonly token: number;
}

export function useNavIntent(pathname: string): NavIntent {
  const [intent, setIntent] = useState<IntentState | null>(null);

  // 「渲染期间调整 state」:`pathname` 一旦不再等于记意图那刻的值,说明导航落地了
  // (也可能落在重定向目标上),立刻丢弃意图。这里刻意不用 useEffect + setState:
  // effect 要等提交后才跑,会多出一帧旧标记;而且陈旧的意图留在 state 里,用户按
  // 浏览器后退回到 `from` 时会被"复活"成选中态。初始 state 只由 `pathname` 决定,
  // 不会造成水合不一致。
  if (intent !== null && intent.from !== pathname) {
    setIntent(null);
  }

  const active = intent !== null && intent.from === pathname ? intent : null;
  const token = active?.token ?? 0;

  useEffect(() => {
    if (token === 0) return undefined;
    const timer = setTimeout(() => {
      setIntent((current) => (current !== null && current.token === token ? null : current));
    }, NAV_INTENT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [token]);

  const onIntent = useCallback(
    (href: string) => {
      const target = intentPathOf(href);
      setIntent((current) => {
        // 点当前页不产生 pending(顺带撤掉还没落地的旧意图:那次导航的目标已经不是它了)。
        if (target === pathname) return null;
        return { target, from: pathname, token: (current?.token ?? 0) + 1 };
      });
    },
    [pathname],
  );

  return { path: active?.target ?? pathname, pending: active !== null, onIntent };
}
