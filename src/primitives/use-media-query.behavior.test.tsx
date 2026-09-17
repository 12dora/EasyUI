// @vitest-environment happy-dom
/**
 * User risk: 这个钩子是"手机上换一种界面"的总开关(表格换卡片、壳层收头部栏)。它错一次,
 * 要么手机拿到桌面版式,要么服务端渲染与 hydration 打架把整棵子树重画。所以盯三件事:
 * 没有 `matchMedia` 的环境要安静地回 `false`,客户端要跟着 `matches` 走,断点变化要真的
 * 触发重渲染(而不是等下一次别的 state 更新顺带刷新)。
 */
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { byTestId, mount, type MountedView } from "../enterprise/behavior-test-utils";
import { PHONE_MEDIA_QUERY, useIsPhone, useMediaQuery } from "./use-media-query";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Listener = (event: { matches: boolean; media: string }) => void;

const REAL_MATCH_MEDIA = Object.getOwnPropertyDescriptor(window, "matchMedia");
const listeners = new Set<{ query: string; handler: Listener }>();
let matching: string[] = [];

/** 订阅得起来的 matchMedia 桩:`matching` 里的查询串算命中。 */
function installMatchMedia(queries: string[]): void {
  matching = queries;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      get matches() {
        return matching.includes(query);
      },
      media: query,
      addEventListener: (_type: string, handler: Listener) => listeners.add({ query, handler }),
      removeEventListener: (_type: string, handler: Listener) => {
        for (const entry of listeners) if (entry.handler === handler) listeners.delete(entry);
      },
    }),
  });
}

async function setMatching(queries: string[]): Promise<void> {
  matching = queries;
  await act(async () => {
    for (const { query, handler } of listeners) handler({ matches: queries.includes(query), media: query });
  });
}

let view: MountedView | null = null;

afterEach(async () => {
  await view?.unmount();
  view = null;
  listeners.clear();
  matching = [];
  if (REAL_MATCH_MEDIA) Object.defineProperty(window, "matchMedia", REAL_MATCH_MEDIA);
  else Reflect.deleteProperty(window, "matchMedia");
});

function Phone() {
  return <span data-test-id="phone">{String(useIsPhone())}</span>;
}

function Wide() {
  return <span data-test-id="wide">{String(useMediaQuery("(min-width: 1200px)"))}</span>;
}

function phoneText(): string {
  return byTestId(view!.host, "phone").textContent ?? "";
}

describe("useMediaQuery / useIsPhone", () => {
  it("没有 matchMedia 的环境恒为 false,且不抛错", async () => {
    Reflect.deleteProperty(window, "matchMedia");
    view = await mount(<Phone />);
    expect(phoneText()).toBe("false");
  });

  it("客户端快照跟着 matches 走", async () => {
    installMatchMedia([PHONE_MEDIA_QUERY]);
    view = await mount(<Phone />);
    expect(phoneText()).toBe("true");
  });

  it("断点变化触发重渲染", async () => {
    installMatchMedia([]);
    view = await mount(<Phone />);
    expect(phoneText()).toBe("false");

    await setMatching([PHONE_MEDIA_QUERY]);
    expect(phoneText()).toBe("true");

    await setMatching([]);
    expect(phoneText()).toBe("false");
  });

  it("useMediaQuery 订阅的是传进来的那一条查询", async () => {
    installMatchMedia(["(min-width: 1200px)"]);
    view = await mount(
      <>
        <Phone />
        <Wide />
      </>,
    );
    expect(phoneText()).toBe("false");
    expect(byTestId(view.host, "wide").textContent).toBe("true");
  });
});
