import { useEffect, type RefObject } from "react";

export const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * 打开的模态/抽屉容器内聚焦管理:进入即把焦点移到容器(不在按钮上画焦点环)、
 * Tab 在容器内环绕、关闭(卸载/active 转 false)恢复到打开前的焦点。
 * Dialog 与移动端抽屉共用,避免焦点在打开/下钻后落到 BODY 逃逸到背景。
 *
 * `initialFocusRef` 让调用方把首个焦点指到容器内某个控件上(例如确认框那个安全按钮)。
 * 这条路子必须走这里,不能在按钮上写 React 的 `autoFocus`:`autoFocus` 在 commit 阶段
 * 就把焦点移走了,早于本 effect,于是下面记录的「打开前的焦点」记成那个按钮自己,
 * 关闭时焦点被还回正在退场的弹层里,而不是真正的触发者。
 */
export function useFocusTrap(
  container: HTMLElement | null,
  active: boolean,
  initialFocusRef?: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!container || !active) return;
    // 先记住打开前的焦点,再移动焦点 —— 顺序不能反。
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusables = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
    (initialFocusRef?.current ?? container).focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const activeEl = document.activeElement;
      if (event.shiftKey && (activeEl === first || activeEl === container)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeEl === last) {
        event.preventDefault();
        first.focus();
      }
    };

    container.addEventListener("keydown", onKeyDown);
    return () => {
      container.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [container, active, initialFocusRef]);
}
