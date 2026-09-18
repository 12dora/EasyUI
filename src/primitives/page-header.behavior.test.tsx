// @vitest-environment happy-dom
/**
 * 用户风险:页头占掉半屏 —— 手机上是 eyebrow + 标题 + 副标题 + 动作行 + 下边距 + 内边距,
 * 桌面上则是标题上方那条 48px 的外壳留白再加一条独立的返回行。两侧的竖向节奏都是纯 class
 * 契约,回归时没有任何报错信号,所以在这里逐条钉住:桌面 `mb-5 pb-4`、h1 全站同一档 22px、
 * 返回控件内联在 h1 左边;手机那一档仍只走 `max-md:`。
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
  it("手机压缩外边距与内边距,桌面收到 mb-5 / pb-4", async () => {
    view = await mount(<PageHeader title="考试" />);
    const classes = classesOf(view.host.querySelector("header"));
    expect(classes).toContain("max-md:mb-4");
    expect(classes).toContain("max-md:pb-3");
    // 桌面(md+)收紧一档:mb-6 / pb-5 → mb-5 / pb-4,入场动画与分隔线照旧。
    expect(classes).toContain("mb-5");
    expect(classes).toContain("pb-4");
    expect(classes).not.toContain("mb-6");
    expect(classes).not.toContain("pb-5");
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

  it("手机隐藏 eyebrow、缩小副标题;标题全站同一档 22px", async () => {
    view = await mount(<PageHeader eyebrow="考务" title="考试" subtitle="按场次查看" />);
    const eyebrow = classesOf(view.host.querySelector(".eyebrow"));
    expect(eyebrow).toContain("max-md:hidden");
    expect(eyebrow).toContain("mb-1");

    const subtitle = classesOf(view.host.querySelector("header p"));
    expect(subtitle).toContain("max-md:text-[12px]");
    expect(subtitle).toContain("text-[13px]");

    // h1 不再在 sm 起放大到 26px:列表页与详情页(DetailHeader)共用同一个 22px 标题档。
    const h1 = classesOf(view.host.querySelector("h1"));
    expect(h1).toContain("text-[22px]");
    expect(h1).not.toContain("sm:text-[26px]");
  });
});

/**
 * 内联返回控件。
 *
 * 之前详情页把「← 返回 X」摆成标题上方独立的一行,桌面上页头因此又高一档。改成 h1 左侧
 * 的一个圆形图标按钮:文案落到 `aria-label` / `title`,标题行高度一点没变。
 */
describe("PageHeader 的返回控件", () => {
  it("不传 back 时不渲染任何链接", async () => {
    view = await mount(<PageHeader title="考试" />);
    expect(view.host.querySelector("a")).toBeNull();
  });

  it("渲染在 h1 左边的同一行里,带 aria-label / href / test id", async () => {
    view = await mount(
      <PageHeader title="期末考试" back={{ href: "/app/exams", label: "返回考试列表", testId: "exam-back" }} />,
    );
    const link = view.host.querySelector("a") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/app/exams");
    expect(link.getAttribute("aria-label")).toBe("返回考试列表");
    expect(link.getAttribute("title")).toBe("返回考试列表");
    expect(link.getAttribute("data-test-id")).toBe("exam-back");
    // 图标本身对读屏隐藏:名字只由 aria-label 给,不许读出两遍。
    expect(link.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");

    // 同一个 flex 行里,控件排在 h1 之前;标题让位给它(truncate),控件不被压扁。
    const h1 = view.host.querySelector("h1") as HTMLElement;
    expect(link.parentElement).toBe(h1.parentElement);
    expect(link.nextElementSibling).toBe(h1);
    expect(classesOf(link.parentElement)).toEqual(expect.arrayContaining(["flex", "items-center", "gap-2"]));
    expect(classesOf(link)).toEqual(expect.arrayContaining(["shrink-0", "rounded-full", "size-7", "md:size-8"]));
    expect(classesOf(link)).toContain("focus-visible:ring-2");
    expect(classesOf(h1)).toContain("truncate");
  });

  it("宿主的 renderLink 接管渲染(Next Link 之类),参数带全 href / 名字 / test id", async () => {
    const seen: string[] = [];
    view = await mount(
      <PageHeader
        title="期末考试"
        back={{ href: "/app/exams", label: "返回考试列表", testId: "exam-back" }}
        renderLink={({ href, className, ariaLabel, title, testId, children }) => {
          seen.push(href, ariaLabel, title, testId ?? "");
          return (
            <a href={href} className={className} aria-label={ariaLabel} title={title} data-test-id={testId} data-host="1">
              {children}
            </a>
          );
        }}
      />,
    );
    expect(seen).toEqual(["/app/exams", "返回考试列表", "返回考试列表", "exam-back"]);
    const link = view.host.querySelector("a") as HTMLAnchorElement;
    expect(link.dataset.host).toBe("1");
    expect(link.getAttribute("aria-label")).toBe("返回考试列表");
  });

  it("没有 back 时标题不截断(长页名照旧换行)", async () => {
    view = await mount(<PageHeader title="一个相当长的页面名称" />);
    expect(classesOf(view.host.querySelector("h1"))).not.toContain("truncate");
  });
});
