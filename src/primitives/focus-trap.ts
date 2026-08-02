import { useEffect } from "react";

export const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * 打开的模态/抽屉容器内聚焦管理:进入即把焦点移到容器(不在按钮上画焦点环)、
 * Tab 在容器内环绕、关闭(卸载/active 转 false)恢复到打开前的焦点。
 * Dialog 与移动端抽屉共用,避免焦点在打开/下钻后落到 BODY 逃逸到背景。
 */
export function useFocusTrap(container: HTMLElement | null, active: boolean) {
  useEffect(() => {
    if (!container || !active) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusables = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
    container.focus();

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
  }, [container, active]);
}
