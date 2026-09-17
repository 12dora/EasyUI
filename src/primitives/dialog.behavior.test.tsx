// @vitest-environment happy-dom
/**
 * 用户风险:手机上 Dialog 已经是贴边的整屏 sheet,卡片时代的 24px 左右留白会再吃掉 48px 宽度 ——
 * 360px 的屏上表单标签与输入框被挤到换行甚至溢出;页脚里「取消 + 长标签提交」不换行就直接被推出可视区。
 * 这两条都是纯 class 契约,回归时没有任何报错信号,所以在这里逐条钉住,同时钉住 sm+/桌面的原值没动。
 */
import { afterEach, describe, expect, it } from "vitest";

import { ActionRow } from "./action-row";
import { mount, type MountedView } from "../enterprise/behavior-test-utils";
import { Dialog } from "./dialog";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let view: MountedView | null = null;

function classesOf(node: Element | null | undefined): string[] {
  if (!(node instanceof HTMLElement)) throw new Error("节点不存在");
  return node.className.split(/\s+/);
}

function panel(): HTMLElement {
  const node = document.body.querySelector("[role='dialog']");
  if (!(node instanceof HTMLElement)) throw new Error("对话框未打开");
  return node;
}

afterEach(async () => {
  await view?.unmount();
  view = null;
});

describe("Dialog — 手机密度", () => {
  it("正文、标题行、页脚在 < md 都收到 16px 留白,sm+ 的值不变", async () => {
    view = await mount(
      <Dialog open onClose={() => undefined} title="新建考试" closeLabel="关闭" footer={<span data-test-id="foot" />}>
        <p data-test-id="body-text">正文</p>
      </Dialog>,
    );
    const frame = panel();

    const header = classesOf(frame.querySelector("[data-test-id='app-dialog-close']")?.parentElement);
    expect(header).toContain("max-md:px-4");
    expect(header).toContain("max-md:pt-4");
    // 底部本来就是 pb-4,不必再写一条手机侧覆盖(写了也是同值,纯噪声)。
    expect(header).not.toContain("max-md:pb-4");
    expect(header).toContain("px-6");
    expect(header).toContain("pt-5");
    expect(header).toContain("pb-4");

    const body = classesOf(frame.querySelector("[data-test-id='body-text']")?.parentElement);
    expect(body).toContain("max-md:px-4");
    expect(body).toContain("max-md:py-4");
    expect(body).toContain("px-6");
    expect(body).toContain("py-5");
    expect(body).toContain("overflow-y-auto");

    const footer = classesOf(frame.querySelector("[data-test-id='foot']")?.parentElement);
    expect(footer).toContain("max-md:px-4");
    expect(footer).toContain("px-6");
    expect(footer).toContain("py-4");
  });

  it("整屏 sheet / sm+ 居中卡片的既有断点原样保留", async () => {
    view = await mount(
      <Dialog open onClose={() => undefined} title="新建考试" closeLabel="关闭">
        <p>正文</p>
      </Dialog>,
    );
    const classes = classesOf(panel());
    expect(classes).toContain("rounded-none");
    expect(classes).toContain("sm:rounded-[3px]");
    expect(classes).toContain("max-h-[100dvh]");
    expect(classes).toContain("sm:max-h-[90vh]");
  });
});

describe("ActionRow", () => {
  it("手机上允许换行,桌面仍是单行", async () => {
    view = await mount(
      <ActionRow>
        <button type="button" data-test-id="submit">
          保存并发布到全部班级
        </button>
      </ActionRow>,
    );
    const row = classesOf(view.host.firstElementChild);
    expect(row).toContain("max-md:flex-wrap");
    // 桌面侧:不许出现无断点的 flex-wrap,否则对齐会跟着内容抖。
    expect(row).not.toContain("flex-wrap");
    expect(row).toContain("items-center");
    expect(row).toContain("gap-2");
    expect(row).toContain("justify-end");
  });

  it("align=\"between\" 的布局类不受影响", async () => {
    view = await mount(
      <ActionRow align="between" left={<span data-test-id="left" />}>
        <button type="button" />
      </ActionRow>,
    );
    const row = classesOf(view.host.firstElementChild);
    expect(row).toContain("justify-between");
    expect(row).toContain("max-md:flex-wrap");
  });
});
