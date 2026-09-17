// @vitest-environment happy-dom
/**
 * 用户风险:手机上「一条头部栏」的方案要求汉堡按钮离开自己的分区栏、搬进 Topbar。
 * 如果 `variant="trigger"` 另起一套抽屉实现,抽屉的下钻 / 路由关闭 / 焦点这些行为就会
 * 在两条路径上分叉 —— 用户在某一个宿主里点开菜单发现二级菜单打不开、或者换页后菜单还开着。
 * 这里钉死:trigger 形态不渲染分区栏、但打开的是同一个抽屉,下钻与 pathKey 关闭照旧;
 * 同时页脚插槽真的出现在抽屉底部(手机上 AppShell 已经不钉页脚了)。
 */
import { afterEach, describe, expect, it } from "vitest";

import { byTestId, click, installReducedMotion, mount, type MountedView } from "../enterprise/behavior-test-utils";
import { MobileNav } from "./MobileNav";
import type { NavModel, RenderNavLink } from "./nav-model";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let view: MountedView | null = null;

const model: NavModel = {
  groups: [
    {
      key: "main",
      nodes: [
        { kind: "link", link: { key: "home", label: "工作台", href: "/app", active: true, testId: "nav-home" } },
        {
          kind: "panel",
          panel: {
            id: "records",
            label: "考试",
            active: false,
            firstHref: "/app/exams",
            items: [{ key: "exams", label: "考试列表", href: "/app/exams", active: false, testId: "nav-exams" }],
            testId: "nav-records",
            viewTestId: "nav-records-view",
            backTestId: "nav-records-back",
          },
        },
      ],
    },
  ],
};

const renderLink: RenderNavLink = ({ href, className, testId, onNavigate, children }) => (
  <a href={href} className={className} data-test-id={testId} onClick={onNavigate}>
    {children}
  </a>
);

function labels() {
  return { backLabel: "返回", menuLabel: "菜单", closeLabel: "关闭", navLabel: "主导航" };
}

function drawer(): HTMLElement | null {
  return document.body.querySelector("[data-test-id='admin-mobile-nav-drawer']");
}

afterEach(async () => {
  await view?.unmount();
  view = null;
});

describe("MobileNav", () => {
  it("bar 形态仍然渲染分区栏与当前条目(桌面/旧宿主不受影响)", async () => {
    view = await mount(<MobileNav model={model} renderLink={renderLink} {...labels()} />);
    const bar = byTestId(view.host, "admin-mobile-nav");
    expect(bar.className).toContain("md:hidden");
    expect(byTestId(view.host, "admin-mobile-nav-current").textContent).toBe("工作台");
    // 分区栏自己已经是 md:hidden,里面的按钮不再重复挂一次。
    expect(byTestId(view.host, "admin-mobile-nav-trigger").className).not.toContain("md:hidden");
  });

  it("trigger 形态不渲染分区栏,只留自带 md:hidden 的汉堡按钮", async () => {
    view = await mount(<MobileNav variant="trigger" model={model} renderLink={renderLink} {...labels()} />);
    expect(view.host.querySelector("[data-test-id='admin-mobile-nav']")).toBeNull();
    expect(view.host.querySelector("[data-test-id='admin-mobile-nav-current']")).toBeNull();
    const trigger = byTestId(view.host, "admin-mobile-nav-trigger");
    expect(trigger.className).toContain("md:hidden");
    expect(trigger.getAttribute("aria-label")).toBe("菜单");
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("trigger 形态打开的是同一个抽屉,下钻照旧", async () => {
    view = await mount(<MobileNav variant="trigger" model={model} renderLink={renderLink} {...labels()} />);
    expect(drawer()).toBeNull();

    await click(byTestId(view.host, "admin-mobile-nav-trigger"));
    const panel = drawer();
    expect(panel).not.toBeNull();
    expect(byTestId(view.host, "admin-mobile-nav-trigger").getAttribute("aria-expanded")).toBe("true");
    expect(document.body.querySelector("[data-test-id='admin-mobile-nav-close']")).not.toBeNull();

    // 下钻进二级面板 —— 与 bar 形态同一套 NavPanelView。
    await click(byTestId(document.body, "nav-records"));
    expect(document.body.querySelector("[data-test-id='nav-records-view']")).not.toBeNull();
    expect(byTestId(document.body, "nav-exams").getAttribute("href")).toBe("/app/exams");
  });

  it("抽屉底部渲染 footer 插槽(手机上页脚文案的落点)", async () => {
    view = await mount(
      <MobileNav
        variant="trigger"
        model={model}
        renderLink={renderLink}
        {...labels()}
        footer={<span data-test-id="host-footer">© 2026 示例</span>}
      />,
    );
    await click(byTestId(view.host, "admin-mobile-nav-trigger"));
    const footer = byTestId(document.body, "admin-mobile-nav-footer");
    expect(footer.querySelector("[data-test-id='host-footer']")?.textContent).toBe("© 2026 示例");
    // 页脚在导航之后,并且仍在抽屉面板内。
    expect(drawer()?.contains(footer)).toBe(true);
    expect(footer.previousElementSibling?.tagName).toBe("NAV");
  });

  it("bar 形态渲染同一个 footer 插槽", async () => {
    view = await mount(
      <MobileNav model={model} renderLink={renderLink} {...labels()} footer={<span data-test-id="host-footer">© 2026 示例</span>} />,
    );
    await click(byTestId(view.host, "admin-mobile-nav-trigger"));
    expect(byTestId(document.body, "admin-mobile-nav-footer").textContent).toBe("© 2026 示例");
  });

  it("页脚槽只做布局,外观与地标由传进来的节点决定", async () => {
    view = await mount(
      <MobileNav variant="trigger" model={model} renderLink={renderLink} {...labels()} footer={<span data-test-id="host-footer" />} />,
    );
    await click(byTestId(view.host, "admin-mobile-nav-trigger"));
    const slot = byTestId(document.body, "admin-mobile-nav-footer");
    const classes = slot.className.split(/\s+/);
    expect(classes).toContain("shrink-0");
    // 槽本身不着色、不定字号:传 `<EnterpriseConfiguredFooter bare />` 时排版由它自己带。
    expect(classes).not.toContain("text-[12px]");
    expect(classes).not.toContain("text-ink-faint");
    expect(slot.querySelector("footer")).toBeNull();
  });

  it("没有 footer 时不渲染多余的分隔容器", async () => {
    view = await mount(<MobileNav variant="trigger" model={model} renderLink={renderLink} {...labels()} />);
    await click(byTestId(view.host, "admin-mobile-nav-trigger"));
    expect(document.body.querySelector("[data-test-id='admin-mobile-nav-footer']")).toBeNull();
  });

  // 以下两条放最后:installReducedMotion 会替换掉全局 matchMedia,让抽屉跳过退场动画立即卸载。
  it("bar 形态走的是同一条抽屉路径:下钻 + pathKey 关闭并重置", async () => {
    installReducedMotion();
    view = await mount(<MobileNav model={model} renderLink={renderLink} {...labels()} pathKey="/app" />);
    await click(byTestId(view.host, "admin-mobile-nav-trigger"));
    await click(byTestId(document.body, "nav-records"));
    expect(document.body.querySelector("[data-test-id='nav-records-view']")).not.toBeNull();

    await view.rerender(<MobileNav model={model} renderLink={renderLink} {...labels()} pathKey="/app/exams" />);
    expect(drawer()).toBeNull();

    await click(byTestId(view.host, "admin-mobile-nav-trigger"));
    expect(drawer()).not.toBeNull();
    expect(document.body.querySelector("[data-test-id='nav-records-view']")).toBeNull();
  });

  it("pathKey 变化关闭抽屉并重置下钻状态(trigger 形态同样生效)", async () => {
    installReducedMotion();
    view = await mount(<MobileNav variant="trigger" model={model} renderLink={renderLink} {...labels()} pathKey="/app" />);
    await click(byTestId(view.host, "admin-mobile-nav-trigger"));
    await click(byTestId(document.body, "nav-records"));
    expect(document.body.querySelector("[data-test-id='nav-records-view']")).not.toBeNull();

    await view.rerender(
      <MobileNav variant="trigger" model={model} renderLink={renderLink} {...labels()} pathKey="/app/exams" />,
    );
    expect(drawer()).toBeNull();

    // 重新打开时回到一级菜单,而不是停在旧的二级面板。
    await click(byTestId(view.host, "admin-mobile-nav-trigger"));
    expect(drawer()).not.toBeNull();
    expect(document.body.querySelector("[data-test-id='nav-records-view']")).toBeNull();
  });
});
