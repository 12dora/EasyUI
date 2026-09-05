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
import { Dialog } from "./dialog";
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

/**
 * 版式二:动作行挂在 Dialog 的 `footer` 上,表单体在 `children` 里 —— 页脚渲染在
 * `<form>` 外面。`submitFormId` 就是为这一版式存在的;这里直接用 `Dialog` 搭,
 * 免得把「按钮在表单外」这个前提测没了。
 */
describe("DialogFormActions submitFormId(动作行在表单之外)", () => {
  const FORM_ID = "dialog-body-form";

  function footerActions(onSubmit: () => void, extra: { blockedReason?: string } = {}) {
    return (
      <DialogFormActions
        submitType="submit"
        submitFormId={FORM_ID}
        cancelLabel="取消"
        submitLabel="保存"
        onCancel={() => undefined}
        onSubmit={onSubmit}
        {...extra}
      />
    );
  }

  function renderDialog(onSubmit: () => void, extra: { blockedReason?: string } = {}) {
    return (
      <Dialog open onClose={() => undefined} title="任务" footer={footerActions(onSubmit, extra)}>
        <Form id={FORM_ID} onSubmit={onSubmit}>
          <input name="name" />
          <input name="code" />
        </Form>
      </Dialog>
    );
  }

  /** Dialog 走 portal:内容在 document.body 上,不在 mount 的宿主节点里。 */
  function submitButton(): HTMLButtonElement {
    const buttons = Array.from(document.body.querySelectorAll("button")).filter((b) => b.type === "submit");
    if (buttons.length !== 1) throw new Error(`Expected exactly one submit button, found ${buttons.length}`);
    return buttons[0];
  }

  /**
   * 表单的**默认提交按钮**,按规范的定义找:tree order 里第一个 form owner 是该表单的
   * 提交按钮。注意它不必是表单的后代 —— 通过 `form` 属性认领表单的按钮同样算数,
   * `submitFormId` 要的就是这个身份。
   */
  function defaultSubmitButton(form: HTMLFormElement): HTMLButtonElement | undefined {
    return Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.type === "submit" && button.form === form,
    );
  }

  /**
   * 输入框里按 Enter。浏览器的隐式提交不是直接提交表单,而是去点那个默认提交按钮;
   * 这最后一下只能手写:user-event 找按钮用的是 `form.querySelector(…)`,只看后代,
   * 认不出待在表单外面的默认按钮,而 happy-dom 压根没实现隐式提交。
   *
   * helper 本身不预设结果 —— 找不到默认按钮就什么都不点,正如浏览器在多字段表单里
   * 找不到默认按钮时什么也不做。别的用例(按钮在表单内)照旧用真键盘,见文件顶部说明。
   */
  async function pressEnterIn(control: HTMLInputElement): Promise<void> {
    const submit = control.form ? defaultSubmitButton(control.form) : undefined;
    await act(async () => {
      await user.type(control, "王二");
    });
    if (submit) await clickButton(submit);
  }

  it("按钮在 form 之外,靠 form 属性成为表单的默认提交按钮", async () => {
    const onSubmit = vi.fn();
    view = await mount(renderDialog(onSubmit));

    const form = formOf(document.body);
    const submit = submitButton();
    // 前提校验:按钮确实不在表单里 —— 否则这条用例测的是版式一,`submitFormId` 白加了。
    expect(form.contains(submit)).toBe(false);
    expect(submit.getAttribute("form")).toBe(FORM_ID);
    // form owner 才是关键:有它按钮就是默认提交按钮,Enter 才有地方去。
    expect(submit.form).toBe(form);
    expect(defaultSubmitButton(form)).toBe(submit);
  });

  it("输入框里按 Enter 提交一次,并拦下原生导航", async () => {
    const onSubmit = vi.fn();
    view = await mount(renderDialog(onSubmit));
    const form = formOf(document.body);
    const submitEvents: Event[] = [];
    form.addEventListener("submit", (event) => submitEvents.push(event));

    await pressEnterIn(controlOf(document.body, "input[name='name']") as HTMLInputElement);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(submitEvents.map((event) => event.defaultPrevented)).toEqual([true]);
  });

  it("点这个页脚提交按钮同样只提交一次(没有额外的 onClick 再打一发)", async () => {
    const onSubmit = vi.fn();
    view = await mount(renderDialog(onSubmit));

    await clickButton(submitButton());

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("blockedReason 仍然拦得住:点击与 Enter 都提交不出去", async () => {
    const onSubmit = vi.fn();
    view = await mount(renderDialog(onSubmit, { blockedReason: "请先填写名称" }));

    await clickButton(submitButton());
    await pressEnterIn(controlOf(document.body, "input[name='name']") as HTMLInputElement);

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("不传 submitFormId 时这一版式提交不出去 —— 这个 prop 是必需的,不是装饰", async () => {
    const onSubmit = vi.fn();
    view = await mount(
      <Dialog
        open
        onClose={() => undefined}
        title="任务"
        footer={
          <DialogFormActions
            submitType="submit"
            cancelLabel="取消"
            submitLabel="保存"
            onCancel={() => undefined}
            onSubmit={onSubmit}
          />
        }
      >
        <Form id={FORM_ID} onSubmit={onSubmit}>
          <input name="name" />
          <input name="code" />
        </Form>
      </Dialog>,
    );

    // 页脚按钮没有 form owner,于是表单根本没有默认提交按钮:Enter 与点击都落空。
    const form = formOf(document.body);
    expect(defaultSubmitButton(form)).toBeUndefined();

    await pressEnterIn(controlOf(document.body, "input[name='name']") as HTMLInputElement);
    await clickButton(submitButton());

    expect(onSubmit).not.toHaveBeenCalled();
  });
});
