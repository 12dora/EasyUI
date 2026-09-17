// @vitest-environment happy-dom
/**
 * 用户风险:页头在手机上占掉近一屏(eyebrow + 22px 标题 + 副标题 + 动作行 + 24px 下边距 + 20px 内边距),
 * 正文要滚过 300px 才开始。压缩只能走 `max-md:`,桌面 md+ 的数值一个都不能动 —— 这两面都在这里钉住。
 */
import { afterEach, describe, expect, it } from "vitest";

import { mount, type MountedView } from "../enterprise/behavior-test-utils";
import { PageHeader } from "./page-header";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let view: MountedView | null = null;

function classesOf(node: Element | null | undefined): string[] {
  if (!(node instanceof HTMLElement)) throw new Error("节点不存在");
  return node.className.split(/\s+/);
}

afterEach(async () => {
  await view?.unmount();
  view = null;
});

describe("PageHeader", () => {
  it("手机压缩外边距与内边距,桌面值保持原样", async () => {
    view = await mount(<PageHeader title="考试" />);
    const classes = classesOf(view.host.querySelector("header"));
    expect(classes).toContain("max-md:mb-4");
    expect(classes).toContain("max-md:pb-3");
    // 桌面(md+)仍是原来的 mb-6 / pb-5,以及入场动画与分隔线。
    expect(classes).toContain("mb-6");
    expect(classes).toContain("pb-5");
    expect(classes).toContain("border-b");
    expect(classes).toContain("easy-page-header-enter");
  });

  it("手机上标题行间距收紧,sm 以上的布局断点不变", async () => {
    view = await mount(<PageHeader title="考试" actions={<button type="button">新建</button>} />);
    const row = classesOf(view.host.querySelector("header > div"));
    expect(row).toContain("max-md:gap-2");
    expect(row).toContain("gap-4");
    expect(row).toContain("sm:flex-row");
    expect(row).toContain("sm:justify-between");
    // 动作行仍然可换行、手机上占满一行。
    const actions = classesOf(view.host.querySelector("header > div > div:last-child"));
    expect(actions).toContain("flex-wrap");
    expect(actions).toContain("w-full");
    expect(actions).toContain("sm:w-auto");
  });

  it("手机隐藏 eyebrow、缩小副标题;标题字号不变", async () => {
    view = await mount(<PageHeader eyebrow="考务" title="考试" subtitle="按场次查看" />);
    const eyebrow = classesOf(view.host.querySelector(".eyebrow"));
    expect(eyebrow).toContain("max-md:hidden");
    expect(eyebrow).toContain("mb-1.5");

    const subtitle = classesOf(view.host.querySelector("header p"));
    expect(subtitle).toContain("max-md:text-[12px]");
    expect(subtitle).toContain("text-[13px]");

    const h1 = classesOf(view.host.querySelector("h1"));
    expect(h1).toContain("text-[22px]");
    expect(h1).toContain("sm:text-[26px]");
  });
});
