// @vitest-environment happy-dom
/**
 * User risk: 密集录入的人填完最后一格会直接按 Enter。表单不是 `<form>`、提交按钮是
 * `type="button"` 时,这一下什么都不会发生 —— 用户以为存了,其实没存。
 *
 * 所以这里一律用**真键盘**(`user-event` 的 `{Enter}`)驱动,不用 `form.requestSubmit()`:
 * 原生的隐式提交并不是直接提交表单,而是去点那个默认的提交按钮 —— 按钮 `disabled` 或者在
 * 阻断态里 `preventDefault()` 时,提交根本走不出来。`requestSubmit()` 会绕过这一段,把
 * "Enter 提交不了"的真实故障测成绿的。
 */
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

// 测试专用:复用 enterprise 层的挂载工具(仅测试期依赖,不构成运行时的层级反向引用)。
import { mount, type MountedView } from "../enterprise/behavior-test-utils";
import { DialogFormActions } from "./action-row";
import { Form } from "./form";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const user = userEvent.setup({ delay: null });

let view: MountedView | null = null;

afterEach(async () => {
  await view?.unmount();
  view = null;
});

function formOf(host: ParentNode): HTMLFormElement {
  const form = host.querySelector("form");
  if (!form) throw new Error("Missing <form>");
  return form;
}

function controlOf(host: ParentNode, selector: string): HTMLElement {
  const control = host.querySelector(selector);
  if (!(control instanceof HTMLElement)) throw new Error(`Missing ${selector}`);
  return control;
}

/** 在控件里敲字并按回车。act 包住是因为 React 的状态更新发生在事件回调里。 */
async function typeAndEnter(control: HTMLElement, text = "王二"): Promise<void> {
  await act(async () => {
    await user.type(control, `${text}{Enter}`);
  });
}

/**
 * 真实浏览器的点击是 cancelable 的 —— 共享的 click 工具发的事件不可取消,
 * 那样 Button 阻断态里的 preventDefault 会被无声吞掉,测不出"提交被拦住"。
 */
async function clickButton(button: Element): Promise<void> {
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

function submitActions(onSubmit: () => void, extra: { blockedReason?: string; submitting?: boolean } = {}) {
  return (
    <DialogFormActions
      submitType="submit"
      cancelLabel="取消"
      submitLabel="保存"
      onCancel={() => undefined}
      onSubmit={onSubmit}
      {...extra}
    />
  );
}

// 每个表单都放两个输入框:只有一个字段时,原生规则允许"没有提交按钮也按 Enter 提交",
// 那条捷径会让"提交按钮没接上"的故障照样测成绿的。两个字段之后,Enter 只剩走默认提交按钮
// 这一条路 —— 也就是真实用户走的那条。
describe("Form 的 Enter 提交", () => {
  it("文本框里按 Enter 提交一次,并拦下原生导航", async () => {
    const onSubmit = vi.fn();
    view = await mount(
      <Form onSubmit={onSubmit}>
        <input name="name" />
        <input name="code" />
        {submitActions(onSubmit)}
      </Form>,
    );
    const submitEvents: Event[] = [];
    formOf(view.host).addEventListener("submit", (event) => submitEvents.push(event));

    await typeAndEnter(controlOf(view.host, "input[name='name']"));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    // 原生提交必须被拦下:否则整页会跳走(SPA 里等于把应用状态清光)。
    expect(submitEvents.map((event) => event.defaultPrevented)).toEqual([true]);
  });

  it("多行文本框里按 Enter 只换行,不提交", async () => {
    const onSubmit = vi.fn();
    view = await mount(
      <Form onSubmit={onSubmit}>
        <textarea name="note" />
        {submitActions(onSubmit)}
      </Form>,
    );

    await typeAndEnter(controlOf(view.host, "textarea"), "第一行");

    expect(onSubmit).not.toHaveBeenCalled();
    expect((controlOf(view.host, "textarea") as HTMLTextAreaElement).value).toBe("第一行\n");
  });

  it("busy 期间的 Enter 被丢弃,并播报 aria-busy;busy 落回 false 之后才提交", async () => {
    const onSubmit = vi.fn();
    const render = (busy: boolean) => (
      <Form onSubmit={onSubmit} busy={busy}>
        <input name="name" />
        <input name="code" />
        {submitActions(onSubmit)}
      </Form>
    );
    view = await mount(render(true));

    await typeAndEnter(controlOf(view.host, "input[name='name']"));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(formOf(view.host).getAttribute("aria-busy")).toBe("true");

    await view.rerender(render(false));
    await typeAndEnter(controlOf(view.host, "input[name='name']"));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(formOf(view.host).getAttribute("aria-busy")).toBeNull();
  });

  it("默认关掉原生校验气泡(校验反馈走 Field / blockedReason)", async () => {
    view = await mount(
      <Form onSubmit={() => undefined}>
        <input name="name" required />
      </Form>,
    );

    expect(formOf(view.host).noValidate).toBe(true);
  });
});

describe("DialogFormActions submitType", () => {
  it("默认 button:自己处理点击,不需要外层 form", async () => {
    const onSubmit = vi.fn();
    view = await mount(
      <DialogFormActions cancelLabel="取消" submitLabel="保存" onCancel={() => undefined} onSubmit={onSubmit} />,
    );
    const submit = view.host.querySelectorAll("button")[1];

    expect(submit.type).toBe("button");
    await clickButton(submit);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("submit:委托外层 Form,Enter 与点击各只提交一次", async () => {
    const onSubmit = vi.fn();
    view = await mount(
      <Form onSubmit={onSubmit}>
        <input name="name" />
        <input name="code" />
        {submitActions(onSubmit)}
      </Form>,
    );
    const submit = view.host.querySelectorAll("button")[1];

    expect(submit.type).toBe("submit");

    await typeAndEnter(controlOf(view.host, "input[name='name']"));
    expect(onSubmit).toHaveBeenCalledTimes(1);

    await clickButton(submit);
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it("submit + blockedReason:点击与 Enter 的原生提交同样被拦住", async () => {
    const onSubmit = vi.fn();
    view = await mount(
      <Form onSubmit={onSubmit}>
        <input name="name" />
        <input name="code" />
        {submitActions(onSubmit, { blockedReason: "请先填写名称" })}
      </Form>,
    );

    await clickButton(view.host.querySelectorAll("button")[1]);
    await typeAndEnter(controlOf(view.host, "input[name='name']"));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("取消按钮始终是 type=button,不会误触发提交", async () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    view = await mount(
      <Form onSubmit={onSubmit}>
        <DialogFormActions submitType="submit" cancelLabel="取消" submitLabel="保存" onCancel={onCancel} onSubmit={onSubmit} />
      </Form>,
    );

    await clickButton(view.host.querySelectorAll("button")[0]);

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
