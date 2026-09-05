// @vitest-environment happy-dom
/**
 * User risk: 密集录入的人填完最后一格会直接按 Enter。表单不是 `<form>`、提交按钮是
 * `type="button"` 时,这一下什么都不会发生 —— 用户以为存了,其实没存。下面钉住三件事:
 * Enter(= `requestSubmit`)能提交、提交只打一次、busy 期间不重复提交。
 */
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

// 测试专用:复用 enterprise 层的挂载工具(仅测试期依赖,不构成运行时的层级反向引用)。
import { mount, type MountedView } from "../enterprise/behavior-test-utils";
import { DialogFormActions } from "./action-row";
import { Form } from "./form";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

/** 原生的「输入框里按 Enter」走的就是 requestSubmit。 */
async function submitViaEnter(form: HTMLFormElement): Promise<void> {
  await act(async () => {
    form.requestSubmit();
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

describe("Form", () => {
  it("提交走 onSubmit 并阻止原生导航", async () => {
    const onSubmit = vi.fn();
    view = await mount(
      <Form onSubmit={onSubmit}>
        <input name="name" />
      </Form>,
    );
    const form = formOf(view.host);

    await submitViaEnter(form);
    expect(onSubmit).toHaveBeenCalledTimes(1);

    // 原生提交必须被拦下:否则整页会跳走(SPA 里等于把应用状态清光)。
    const submitEvent = new Event("submit", { bubbles: true, cancelable: true });
    await act(async () => {
      form.dispatchEvent(submitEvent);
    });
    expect(submitEvent.defaultPrevented).toBe(true);
  });

  it("busy 期间的提交被丢弃,并播报 aria-busy", async () => {
    const onSubmit = vi.fn();
    view = await mount(
      <Form onSubmit={onSubmit} busy>
        <input name="name" />
      </Form>,
    );
    const form = formOf(view.host);

    await submitViaEnter(form);

    expect(onSubmit).not.toHaveBeenCalled();
    expect(form.getAttribute("aria-busy")).toBe("true");
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
        <DialogFormActions
          submitType="submit"
          cancelLabel="取消"
          submitLabel="保存"
          onCancel={() => undefined}
          onSubmit={onSubmit}
        />
      </Form>,
    );
    const submit = view.host.querySelectorAll("button")[1];

    expect(submit.type).toBe("submit");

    await submitViaEnter(formOf(view.host));
    expect(onSubmit).toHaveBeenCalledTimes(1);

    await clickButton(submit);
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it("submit + blockedReason:原生提交同样被拦住", async () => {
    const onSubmit = vi.fn();
    view = await mount(
      <Form onSubmit={onSubmit}>
        <DialogFormActions
          submitType="submit"
          cancelLabel="取消"
          submitLabel="保存"
          onCancel={() => undefined}
          onSubmit={onSubmit}
          blockedReason="请先填写名称"
        />
      </Form>,
    );

    await clickButton(view.host.querySelectorAll("button")[1]);

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
