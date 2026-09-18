// @vitest-environment happy-dom
/**
 * 用户风险:侧栏里两块业务(学员自己的考试 / 管理侧的题库与阅卷)只靠一条分隔线隔开时,
 * 用户读不出"线的上下是两回事",只会觉得菜单很长。分组标题必须在桌面侧栏与手机抽屉
 * **同时**出现,而且不能把条目挪出原来的列表(否则选中标记与内边距全乱)。
 */
import { afterEach, describe, expect, it } from "vitest";

import { byTestId, click, mount, type MountedView } from "../enterprise/behavior-test-utils";
import { MobileNav } from "./MobileNav";
import { Sidebar } from "./Sidebar";
import type { NavModel, RenderNavLink } from "./nav-model";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let view: MountedView | null = null;

const model: NavModel = {
  groups: [
    { key: "main", nodes: [{ kind: "link", link: { key: "home", label: "工作台", href: "/app", active: true, testId: "nav-home" } }] },
    {
      key: "learner",
      label: "我的学习",
      nodes: [{ kind: "link", link: { key: "my-exams", label: "我的考试", href: "/app/my-exams", active: false, testId: "nav-my-exams" } }],
    },
    {
      key: "manage",
      label: "考试管理",
      divider: true,
      nodes: [{ kind: "link", link: { key: "banks", label: "题库", href: "/app/question-banks", active: false, testId: "nav-banks" } }],
    },
  ],
};

const renderLink: RenderNavLink = ({ href, className, testId, onNavigate, children }) => (
  <a href={href} className={className} data-test-id={testId} onClick={onNavigate}>
    {children}
  </a>
);

afterEach(async () => {
  await view?.unmount();
  view = null;
});

describe("NavGroup 分组标题", () => {
  it("桌面侧栏:有标题的分组画出小标题,没标题的分组一个字都不多", async () => {
    view = await mount(
      <Sidebar model={model} openPanelId={null} onOpenPanel={() => undefined} onBack={() => undefined} renderLink={renderLink} backLabel="返回" navLabel="主导航" />,
    );
    expect(byTestId(view.host, "nav-group-label-learner").textContent).toBe("我的学习");
    expect(byTestId(view.host, "nav-group-label-manage").textContent).toBe("考试管理");
    expect(view.host.querySelector("[data-test-id='nav-group-label-main']")).toBeNull();
    expect(view.host.querySelector("[data-test-id='nav-group-main']")).toBeNull();
  });

  it("标题只是条目列表上方的一行,条目仍在同一个 <ol> 里", async () => {
    view = await mount(
      <Sidebar model={model} openPanelId={null} onOpenPanel={() => undefined} onBack={() => undefined} renderLink={renderLink} backLabel="返回" navLabel="主导航" />,
    );
    const group = byTestId(view.host, "nav-group-learner");
    const label = byTestId(view.host, "nav-group-label-learner");
    expect(group.firstElementChild).toBe(label);
    expect(label.nextElementSibling?.tagName).toBe("OL");
    expect(group.querySelectorAll("ol > li").length).toBe(1);
  });

  it("分隔线画在标题之上,不会夹在标题与它的条目之间", async () => {
    view = await mount(
      <Sidebar model={model} openPanelId={null} onOpenPanel={() => undefined} onBack={() => undefined} renderLink={renderLink} backLabel="返回" navLabel="主导航" />,
    );
    const group = byTestId(view.host, "nav-group-manage");
    expect(group.className).toContain("border-t");
    const label = byTestId(view.host, "nav-group-label-manage");
    expect(label.className).not.toContain("border-t");
    // 标题走套件的 eyebrow(12px 排版下限),不自带一档更小的字号。
    expect(label.className).toContain("eyebrow");
    expect((group.querySelector("ol") as HTMLElement).className).not.toContain("border-t");
  });

  it("手机抽屉读同一份模型,标题一样出现", async () => {
    view = await mount(<MobileNav variant="trigger" model={model} renderLink={renderLink} backLabel="返回" menuLabel="菜单" closeLabel="关闭" navLabel="主导航" />);
    await click(byTestId(view.host, "admin-mobile-nav-trigger"));
    const drawer = document.body.querySelector("[data-test-id='admin-mobile-nav-drawer']");
    if (!drawer) throw new Error("drawer did not open");
    expect(byTestId(drawer, "nav-group-label-learner").textContent).toBe("我的学习");
    expect(byTestId(drawer, "nav-group-label-manage").textContent).toBe("考试管理");
  });
});
