// @vitest-environment happy-dom
/**
 * User risk: the browser tab is the one place the configured logo shows while the user is
 * in another tab. It must follow the logo 设置 → 通用 uploads, survive two brand slots
 * mounted at once, and hand the page its own icon back once nothing claims it any more.
 */
import { afterEach, describe, expect, it } from "vitest";

import { EnterpriseBrandSlot } from "./brand-slot";
import { mount, type MountedView } from "./behavior-test-utils";
import { useEnterpriseFavicon } from "./use-enterprise-favicon";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LOGO = "data:image/png;base64,AAAA";
const OTHER_LOGO = "data:image/webp;base64,BBBB";

const views: MountedView[] = [];

async function mountView(node: Parameters<typeof mount>[0]): Promise<MountedView> {
  const view = await mount(node);
  views.push(view);
  return view;
}

function Probe({ logo, fallback }: { logo: string | null; fallback?: string }) {
  useEnterpriseFavicon(logo, fallback);
  return null;
}

function icons(): HTMLLinkElement[] {
  return [...document.head.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')];
}

afterEach(async () => {
  while (views.length) await views.pop()?.unmount();
  for (const link of icons()) link.remove();
});

describe("useEnterpriseFavicon", () => {
  it("creates an icon link when the page has none and removes it on unmount", async () => {
    const view = await mountView(<Probe logo={LOGO} />);

    expect(icons()).toHaveLength(1);
    expect(icons()[0]?.getAttribute("href")).toBe(LOGO);

    await view.unmount();
    views.pop();
    expect(icons()).toHaveLength(0);
  });

  it("repoints the page's own icon and restores href / type / sizes afterwards", async () => {
    const original = document.createElement("link");
    original.rel = "icon";
    original.href = "/favicon.ico";
    original.setAttribute("type", "image/x-icon");
    original.setAttribute("sizes", "any");
    document.head.appendChild(original);

    const view = await mountView(<Probe logo={LOGO} />);
    expect(icons()).toEqual([original]);
    expect(original.getAttribute("href")).toBe(LOGO);
    expect(original.hasAttribute("type")).toBe(false);
    expect(original.hasAttribute("sizes")).toBe(false);

    await view.rerender(<Probe logo={OTHER_LOGO} />);
    expect(original.getAttribute("href")).toBe(OTHER_LOGO);

    await view.unmount();
    views.pop();
    expect(original.getAttribute("href")).toBe("/favicon.ico");
    expect(original.getAttribute("type")).toBe("image/x-icon");
    expect(original.getAttribute("sizes")).toBe("any");
  });

  it("falls back to fallbackHref, else the original icon, when the logo is cleared", async () => {
    const original = document.createElement("link");
    original.rel = "icon";
    original.setAttribute("href", "/original.ico");
    document.head.appendChild(original);

    const view = await mountView(<Probe logo={LOGO} fallback="/favicon.ico" />);
    expect(original.getAttribute("href")).toBe(LOGO);

    await view.rerender(<Probe logo={null} fallback="/favicon.ico" />);
    expect(original.getAttribute("href")).toBe("/favicon.ico");

    await view.rerender(<Probe logo={null} />);
    expect(original.getAttribute("href")).toBe("/original.ico");
  });

  it("keeps the favicon while another brand slot is still mounted", async () => {
    const first = await mountView(<EnterpriseBrandSlot href="/" title="A" logoSrc={LOGO} />);
    await mountView(<EnterpriseBrandSlot href="/" title="B" logoSrc={LOGO} />);
    expect(icons()).toHaveLength(1);
    expect(icons()[0]?.getAttribute("href")).toBe(LOGO);

    await first.unmount();
    views.splice(views.indexOf(first), 1);
    expect(icons()).toHaveLength(1);
    expect(icons()[0]?.getAttribute("href")).toBe(LOGO);
  });
});
