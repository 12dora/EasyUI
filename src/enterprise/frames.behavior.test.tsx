// @vitest-environment happy-dom
/**
 * User risk: two regressions this package kept re-introducing — a parent
 * "Settings" H1 stacked above every settings surface, and an app shell mounted
 * without the configured footer.
 */
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NAV_PROGRESS_DELAY_MS } from "../shell/NavigationProgress";
import { EnterpriseAppFrame } from "./app-frame";
import { EnterpriseConfiguredFooter } from "./footer";
import { EnterpriseSettingsPageFrame } from "./page-frames";
import { byTestId, mount, type MountedView } from "./behavior-test-utils";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let view: MountedView | null = null;

afterEach(async () => {
  await view?.unmount();
  view = null;
  vi.useRealTimers();
});

describe("EnterpriseSettingsPageFrame", () => {
  it("wraps the surface without painting a heading of its own", async () => {
    view = await mount(
      <EnterpriseSettingsPageFrame>
        <section>
          <h1>本地账户</h1>
        </section>
      </EnterpriseSettingsPageFrame>,
    );
    const headings = view.host.querySelectorAll("h1");
    expect(headings).toHaveLength(1);
    expect(headings[0]?.textContent).toBe("本地账户");
    expect(byTestId(view.host, "enterprise-settings-page").className).toContain("max-w-6xl");
  });
});

describe("EnterpriseConfiguredFooter bare", () => {
  it("不画 <footer> 地标与外框,test id 带 -inline 后缀", async () => {
    view = await mount(<EnterpriseConfiguredFooter bare html="<strong>企业应用</strong> · © {year}" fallback="回退页脚" />);
    expect(view.host.querySelector("footer")).toBeNull();
    const html = byTestId(view.host, "app-footer-html-inline");
    expect(html.textContent).toContain("企业应用");
    // 页面底部那份的 test id 不能同时出现,否则宿主 e2e 会一次选中两个节点。
    expect(view.host.querySelector("[data-test-id='app-footer-html']")).toBeNull();
    const wrapper = view.host.firstElementChild as HTMLElement;
    const classes = wrapper.className.split(/\s+/);
    expect(classes).not.toContain("border-t");
    expect(classes).not.toContain("bg-paper-deep");
    expect(classes).toContain("text-[12px]");
  });

  it("bare 的回退文案走 app-footer-fallback-inline", async () => {
    view = await mount(<EnterpriseConfiguredFooter bare html="" fallback="回退页脚" />);
    expect(byTestId(view.host, "app-footer-fallback-inline").textContent).toBe("回退页脚");
    expect(view.host.querySelector("[data-test-id='app-footer-fallback']")).toBeNull();
    expect(view.host.querySelector("footer")).toBeNull();
  });

  it("默认(非 bare)仍然是带地标与外框的页面级页脚", async () => {
    view = await mount(<EnterpriseConfiguredFooter html="" fallback="回退页脚" />);
    const landmark = view.host.querySelector("footer") as HTMLElement;
    expect(landmark).not.toBeNull();
    expect(landmark.className).toContain("border-t");
    expect(byTestId(view.host, "app-footer-fallback").textContent).toBe("回退页脚");
    expect(view.host.querySelector("[data-test-id='app-footer-fallback-inline']")).toBeNull();
  });
});

describe("EnterpriseAppFrame", () => {
  it("pins the configured footer inside the authenticated frame", async () => {
    view = await mount(
      <EnterpriseAppFrame footer={<EnterpriseConfiguredFooter html="<strong>企业应用</strong> · © {year}" fallback="回退页脚" />}>
        <p>内容</p>
      </EnterpriseAppFrame>,
    );
    const html = byTestId(view.host, "app-footer-html");
    expect(html.textContent).toContain("企业应用");
    expect(html.textContent).toContain(String(new Date().getFullYear()));
    expect(view.host.querySelector("[data-test-id='app-footer-fallback']")).toBeNull();
  });

  it("钉死的页脚只在 md+ 出现 —— 手机上宿主必须把同一份文案传给 MobileNav footer", async () => {
    view = await mount(
      <EnterpriseAppFrame footer={<EnterpriseConfiguredFooter html="" fallback="回退页脚" />}>
        <p>内容</p>
      </EnterpriseAppFrame>,
    );
    // 包裹层是 AppShell 画的,页脚节点自己不带断点。
    const wrapper = byTestId(view.host, "app-footer-fallback").closest("footer")?.parentElement as HTMLElement;
    const classes = wrapper.className.split(/\s+/);
    expect(classes).toContain("hidden");
    expect(classes).toContain("md:block");
    expect(classes).toContain("shrink-0");
  });

  it("forwards the navigation-pending props down to AppShell", async () => {
    vi.useFakeTimers();
    view = await mount(
      <EnterpriseAppFrame pending pendingLabel="加载中" footer={<EnterpriseConfiguredFooter html="" fallback="回退页脚" />}>
        <p>内容</p>
      </EnterpriseAppFrame>,
    );
    // 延迟 150ms 之后细轨才显形(见 NAV_PROGRESS_DELAY_MS),aria-busy 则是立刻就有。
    expect(view.host.querySelector("main")?.getAttribute("aria-busy")).toBe("true");
    await act(async () => vi.advanceTimersByTime(NAV_PROGRESS_DELAY_MS));
    expect(byTestId(view.host, "nav-progress").dataset.state).toBe("running");
    expect(byTestId(view.host, "nav-progress").textContent).toBe("加载中");
  });

  it("falls back to the host string when nothing is configured", async () => {
    view = await mount(
      <EnterpriseAppFrame footer={<EnterpriseConfiguredFooter html="" fallback="回退页脚" />}>
        <p>内容</p>
      </EnterpriseAppFrame>,
    );
    expect(byTestId(view.host, "app-footer-fallback").textContent).toBe("回退页脚");
  });
});
