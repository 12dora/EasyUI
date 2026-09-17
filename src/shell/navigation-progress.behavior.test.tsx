// @vitest-environment happy-dom
/**
 * 用户风险:慢导航期间内容列一动不动,用户以为点空了;而如果进度条一 pending 就画出来,
 * 每次秒开导航都会闪一条线,比不画还吵。所以它必须"迟到 150ms 才来、来了就要收尾"。
 */
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { byTestId, mount, type MountedView } from "../enterprise/behavior-test-utils";
import { AppShell } from "./AppShell";
import { NAV_PROGRESS_DELAY_MS, NavigationProgress } from "./NavigationProgress";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let view: MountedView | null = null;

afterEach(async () => {
  await view?.unmount();
  view = null;
  vi.useRealTimers();
});

function rail(host: ParentNode): HTMLElement {
  return byTestId(host, "nav-progress");
}

function bar(host: ParentNode): HTMLElement | null {
  return host.querySelector("[data-test-id='nav-progress-bar']");
}

async function tick(ms: number): Promise<void> {
  await act(async () => vi.advanceTimersByTime(ms));
}

describe("NavigationProgress", () => {
  it("150ms 之前不显形(秒开导航不闪线)", async () => {
    vi.useFakeTimers();
    view = await mount(<NavigationProgress pending label="加载中" />);
    expect(rail(view.host).dataset.state).toBe("idle");
    expect(bar(view.host)).toBeNull();
    expect(rail(view.host).getAttribute("aria-hidden")).toBe("true");
    expect(rail(view.host).getAttribute("role")).toBeNull();

    await tick(NAV_PROGRESS_DELAY_MS - 1);
    expect(rail(view.host).dataset.state).toBe("idle");
    expect(bar(view.host)).toBeNull();
  });

  it("超过 150ms 才画出细轨,并带上视觉隐藏的状态文案", async () => {
    vi.useFakeTimers();
    view = await mount(<NavigationProgress pending label="加载中" />);
    await tick(NAV_PROGRESS_DELAY_MS);

    const container = rail(view.host);
    expect(container.dataset.state).toBe("running");
    expect(container.getAttribute("role")).toBe("status");
    expect(container.getAttribute("aria-hidden")).toBeNull();
    expect(bar(view.host)?.className).toContain("easy-nav-progress-grow");
    const hidden = container.querySelector(".easy-visually-hidden");
    expect(hidden?.textContent).toBe("加载中");
  });

  it("导航落地后补满再淡出", async () => {
    vi.useFakeTimers();
    view = await mount(<NavigationProgress pending label="加载中" />);
    await tick(NAV_PROGRESS_DELAY_MS);

    await view.rerender(<NavigationProgress pending={false} label="加载中" />);
    expect(rail(view.host).dataset.state).toBe("done");
    expect(bar(view.host)?.className).toContain("easy-nav-progress-done");

    await tick(300);
    expect(rail(view.host).dataset.state).toBe("idle");
    expect(bar(view.host)).toBeNull();
  });

  it("秒开导航(150ms 内落地)自始至终不显形", async () => {
    vi.useFakeTimers();
    view = await mount(<NavigationProgress pending />);
    await tick(NAV_PROGRESS_DELAY_MS - 50);
    await view.rerender(<NavigationProgress pending={false} />);
    expect(rail(view.host).dataset.state).toBe("idle");

    await tick(500);
    expect(rail(view.host).dataset.state).toBe("idle");
    expect(bar(view.host)).toBeNull();
  });

  it("不传 label 时不塞空的状态文案", async () => {
    vi.useFakeTimers();
    view = await mount(<NavigationProgress pending />);
    await tick(NAV_PROGRESS_DELAY_MS);
    expect(rail(view.host).querySelector(".easy-visually-hidden")).toBeNull();
  });
});

describe("AppShell 的进度条", () => {
  it("pending 时给 <main> 挂 aria-busy,并把细轨画在滚动区之外", async () => {
    vi.useFakeTimers();
    view = await mount(
      <AppShell pending pendingLabel="加载中">
        <p>内容</p>
      </AppShell>,
    );
    await tick(NAV_PROGRESS_DELAY_MS);

    const main = view.host.querySelector("main");
    expect(main?.getAttribute("aria-busy")).toBe("true");
    expect(bar(view.host)).not.toBeNull();
    // 细轨是 <main> 的兄弟节点(贴内容列顶边、不随内容滚动)。
    expect(main?.contains(rail(view.host))).toBe(false);
    expect(rail(view.host).parentElement).toBe(main?.parentElement);
  });

  it("不 pending 时没有 aria-busy,细轨保持隐藏", async () => {
    view = await mount(
      <AppShell>
        <p>内容</p>
      </AppShell>,
    );
    expect(view.host.querySelector("main")?.getAttribute("aria-busy")).toBeNull();
    expect(rail(view.host).dataset.state).toBe("idle");
    expect(bar(view.host)).toBeNull();
  });
});
