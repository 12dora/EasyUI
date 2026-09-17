// @vitest-environment happy-dom
/**
 * 用户风险:远端访问时点侧栏要等 300~1500ms 路由提交,标记才动 —— 侧栏"跟不着手指"。
 * useNavIntent 让标记先走一步,但它必须在导航落地 / 中止后老实让位给真实路由,
 * 否则用户会看到一个永远选中的错误条目。
 */
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { mount, type MountedView } from "../enterprise/behavior-test-utils";
import { NAV_INTENT_TIMEOUT_MS, useNavIntent, type NavIntent } from "./nav-intent";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let latest: NavIntent | null = null;

function Probe({ pathname }: { pathname: string }) {
  latest = useNavIntent(pathname);
  return <div data-test-id="nav" data-path={latest.path} data-pending={String(latest.pending)} />;
}

function snapshot(): { path: string; pending: boolean } {
  if (latest === null) throw new Error("Probe not mounted");
  return { path: latest.path, pending: latest.pending };
}

async function intent(href: string): Promise<void> {
  await act(async () => latest?.onIntent(href));
}

let view: MountedView | null = null;

afterEach(async () => {
  await view?.unmount();
  view = null;
  latest = null;
  vi.useRealTimers();
});

describe("useNavIntent", () => {
  it("没有意图时就是真实 pathname", async () => {
    view = await mount(<Probe pathname="/orders" />);
    expect(snapshot()).toEqual({ path: "/orders", pending: false });
  });

  it("点当前页是空操作:不产生 pending", async () => {
    view = await mount(<Probe pathname="/orders" />);
    await intent("/orders");
    expect(snapshot()).toEqual({ path: "/orders", pending: false });
  });

  it("点当前页时连 query/hash 也算同一页", async () => {
    view = await mount(<Probe pathname="/orders" />);
    await intent("/orders?status=open");
    expect(snapshot()).toEqual({ path: "/orders", pending: false });
  });

  it("意图立即生效,pathname 一变(哪怕落在重定向目标上)就让位", async () => {
    view = await mount(<Probe pathname="/orders" />);
    await intent("/settings/profile?tab=basic#top");
    expect(snapshot()).toEqual({ path: "/settings/profile", pending: true });

    await view.rerender(<Probe pathname="/settings/security" />);
    expect(snapshot()).toEqual({ path: "/settings/security", pending: false });
  });

  it("pending 期间再点一次就换目标", async () => {
    view = await mount(<Probe pathname="/orders" />);
    await intent("/library");
    await intent("/settings");
    expect(snapshot()).toEqual({ path: "/settings", pending: true });

    await view.rerender(<Probe pathname="/settings" />);
    expect(snapshot()).toEqual({ path: "/settings", pending: false });
  });

  it("pending 期间点当前页:撤销旧意图,以最后一次点击为准", async () => {
    view = await mount(<Probe pathname="/orders" />);
    await intent("/library");
    expect(snapshot()).toEqual({ path: "/library", pending: true });

    await intent("/orders");
    expect(snapshot()).toEqual({ path: "/orders", pending: false });
  });

  it("导航中止时超时弹回真实路由", async () => {
    vi.useFakeTimers();
    view = await mount(<Probe pathname="/orders" />);
    await intent("/library");

    await act(async () => vi.advanceTimersByTime(NAV_INTENT_TIMEOUT_MS - 1));
    expect(snapshot()).toEqual({ path: "/library", pending: true });

    await act(async () => vi.advanceTimersByTime(1));
    expect(snapshot()).toEqual({ path: "/orders", pending: false });
  });

  it("第二次意图重置超时定时器", async () => {
    vi.useFakeTimers();
    view = await mount(<Probe pathname="/orders" />);
    await intent("/library");
    await act(async () => vi.advanceTimersByTime(NAV_INTENT_TIMEOUT_MS - 1000));
    await intent("/settings");
    await act(async () => vi.advanceTimersByTime(NAV_INTENT_TIMEOUT_MS - 1000));
    expect(snapshot()).toEqual({ path: "/settings", pending: true });

    await act(async () => vi.advanceTimersByTime(1000));
    expect(snapshot()).toEqual({ path: "/orders", pending: false });
  });

  it("导航落地后再后退回原页,陈旧的意图不会复活", async () => {
    view = await mount(<Probe pathname="/orders" />);
    await intent("/library");
    await view.rerender(<Probe pathname="/library" />);
    await view.rerender(<Probe pathname="/orders" />);
    expect(snapshot()).toEqual({ path: "/orders", pending: false });
  });
});
