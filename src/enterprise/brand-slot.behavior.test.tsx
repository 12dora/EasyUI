// @vitest-environment happy-dom
/**
 * User risk: the brand slot sits in every topbar. A logo `<img>` rendered with
 * an empty `src` shows a broken-image glyph on hosts that never uploaded one.
 */
import { afterEach, describe, expect, it } from "vitest";

import { EnterpriseBrandSlot } from "./brand-slot";
import { mount, type MountedView } from "./behavior-test-utils";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let view: MountedView | null = null;

afterEach(async () => {
  await view?.unmount();
  view = null;
});

describe("EnterpriseBrandSlot", () => {
  it("renders text only when no logo is configured", async () => {
    view = await mount(<EnterpriseBrandSlot href="/app" title="学习工作台" testId="brand" />);
    expect(view.host.querySelector("[data-test-id='brand-logo']")).toBeNull();
    expect(view.host.querySelector("[data-test-id='brand-subtitle']")).toBeNull();
    expect(view.host.querySelector("[data-test-id='brand-title']")?.textContent).toBe("学习工作台");
    expect(view.host.querySelector("[data-test-id='brand']")?.getAttribute("href")).toBe("/app");
  });

  it("renders a decorative logo and the optional subtitle when both are supplied", async () => {
    view = await mount(
      <EnterpriseBrandSlot
        href="/app"
        title="EasyLearning"
        subtitle="Enterprise learning"
        logoSrc="data:image/png;base64,AAAA"
        testId="brand"
      />,
    );
    const logo = view.host.querySelector("[data-test-id='brand-logo']") as HTMLImageElement | null;
    expect(logo?.getAttribute("src")).toBe("data:image/png;base64,AAAA");
    // The product name is the link's visible text, so the logo must not repeat it.
    expect(logo?.getAttribute("alt")).toBe("");
    expect(logo?.getAttribute("aria-hidden")).toBe("true");
    expect(view.host.querySelector("[data-test-id='brand-subtitle']")?.textContent).toBe("Enterprise learning");
  });

  it("hands href and class to a host router link", async () => {
    view = await mount(
      <EnterpriseBrandSlot
        href="/zh-CN/app"
        title="学习工作台"
        testId="brand"
        renderLink={({ href, className, children, testId }) => (
          <span data-host-link={href} className={className} data-test-id={testId}>
            {children}
          </span>
        )}
      />,
    );
    const link = view.host.querySelector("[data-test-id='brand']");
    expect(link?.tagName).toBe("SPAN");
    expect(link?.getAttribute("data-host-link")).toBe("/zh-CN/app");
    expect(link?.className).toContain("min-w-0");
    expect(view.host.querySelector("[data-test-id='brand-title']")?.textContent).toBe("学习工作台");
  });
});
