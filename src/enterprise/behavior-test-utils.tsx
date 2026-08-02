import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

export interface MountedView {
  host: HTMLDivElement;
  root: Root;
  rerender(node: ReactNode): Promise<void>;
  unmount(): Promise<void>;
}

export async function mount(node: ReactNode): Promise<MountedView> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(node));
  return {
    host,
    root,
    async rerender(next) {
      await act(async () => root.render(next));
    },
    async unmount() {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

export async function settle(ms = 10): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, ms));
  });
}

export async function click(element: Element): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

export async function input(element: HTMLInputElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(element, value);
  await act(async () => {
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

export function byTestId(host: ParentNode, testId: string): HTMLElement {
  const element = host.querySelector(`[data-test-id='${testId}']`);
  if (!(element instanceof HTMLElement)) throw new Error(`Missing [data-test-id='${testId}']`);
  return element;
}

export function installReducedMotion(matches = true): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: matches && query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}
