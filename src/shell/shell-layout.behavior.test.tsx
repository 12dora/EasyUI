// @vitest-environment happy-dom
/**
 * 用户风险:手机首屏被"框架"吃光 —— 顶栏留白按桌面走、内容区上下 24px、再加一条钉死的页脚,
 * 390px 宽的屏幕上正文要滚过 300px 才开始。这些都是纯 class 契约,回归时没有任何报错信号,
 * 所以在这里逐条钉住;同时钉住 md+ 的值一个都没动(桌面必须像素不变)。
 */
import { afterEach, describe, expect, it } from "vitest";

import { byTestId, mount, type MountedView } from "../enterprise/behavior-test-utils";
import { AppShell, APP_SHELL_MAIN_PADDING } from "./AppShell";
import { Topbar } from "./Topbar";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let view: MountedView | null = null;

afterEach(async () => {
  await view?.unmount();
  view = null;
});

describe("Topbar", () => {
  it("手机上收窄内边距与间距,高度与桌面值不变", async () => {
    view = await mount(<Topbar brand={<span>品牌</span>} actions={<span>动作</span>} testId="topbar" />);
    const row = byTestId(view.host, "topbar").firstElementChild as HTMLElement;
    const classes = row.className.split(/\s+/);
    // 手机侧
    expect(classes).toContain("px-3");
    expect(classes).toContain("gap-2");
    // 桌面侧(原值)
    expect(classes).toContain("md:px-5");
    expect(classes).toContain("md:gap-4");
    expect(classes).toContain("h-14");
    // 旧的无断点写法必须消失,否则手机上仍按桌面留白。
    expect(classes).not.toContain("px-5");
    expect(classes).not.toContain("gap-4");
  });

  it("leading 插槽排在品牌之前(汉堡按钮的落点)", async () => {
    view = await mount(
      <Topbar testId="topbar" leading={<button data-test-id="lead" type="button" />} brand={<span data-test-id="brand" />} />,
    );
    const lead = byTestId(view.host, "lead");
    expect(lead.nextElementSibling?.getAttribute("data-test-id")).toBe("brand");
  });
});

describe("AppShell", () => {
  it("内容区手机竖向留白 16px,桌面留白不变", () => {
    const classes = APP_SHELL_MAIN_PADDING.split(/\s+/);
    expect(classes).toContain("py-4");
    expect(classes).toContain("px-4");
    expect(classes).not.toContain("py-6");
    expect(classes).toContain("md:px-10");
    expect(classes).toContain("md:py-12");
    expect(classes).toContain("2xl:px-12");
    expect(classes).toContain("3xl:px-16");
  });

  it("页脚只在 md+ 出现(手机改由抽屉底部承载)", async () => {
    view = await mount(
      <AppShell topbar={null} footer={<span data-test-id="footer-text">© 示例</span>}>
        <div />
      </AppShell>,
    );
    const footer = byTestId(view.host, "footer-text").parentElement as HTMLElement;
    const classes = footer.className.split(/\s+/);
    expect(classes).toContain("hidden");
    expect(classes).toContain("md:block");
    expect(classes).toContain("shrink-0");
  });

  it("不传 footer 时不渲染包裹层", async () => {
    view = await mount(
      <AppShell topbar={null}>
        <div data-test-id="body" />
      </AppShell>,
    );
    const main = view.host.querySelector("main") as HTMLElement;
    expect(main.className).toContain("py-4");
    expect(main.parentElement?.nextElementSibling).toBeNull();
  });
});
