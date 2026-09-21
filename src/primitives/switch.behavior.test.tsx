// @vitest-environment happy-dom
/**
 * User risk: 开关是"一下就生效"的控件 —— 语义错了(不是 role=switch / aria-checked 没跟着走)
 * 读屏用户听不出当前是开是关;禁用态还能点、或者点标签文字没反应,用户会以为自己已经改了设置,
 * 其实什么都没发生。这里把这四条钉死。
 */
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

// 测试专用:复用 enterprise 层的挂载工具(仅测试期依赖,不构成运行时的层级反向引用)。
import { mount, type MountedView } from "../enterprise/behavior-test-utils";
import { Switch } from "./switch";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let view: MountedView | null = null;

afterEach(async () => {
  await view?.unmount();
  view = null;
});

function switchOf(host: ParentNode): HTMLButtonElement {
  const control = host.querySelector("[role='switch']");
  if (!(control instanceof HTMLButtonElement)) throw new Error("Missing role=switch button");
  return control;
}

/** 真实点击是 cancelable 的;label 转发也走同一条路径。 */
async function click(element: Element): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

describe("Switch 语义", () => {
  it("渲染 role=switch 并把 checked 映射成 aria-checked", async () => {
    view = await mount(<Switch checked={false} onChange={() => undefined} aria-label="启用通知" />);
    const control = switchOf(view.host);

    expect(control.getAttribute("type")).toBe("button");
    expect(control.getAttribute("aria-checked")).toBe("false");
    expect(control.getAttribute("aria-label")).toBe("启用通知");

    await view.rerender(<Switch checked onChange={() => undefined} aria-label="启用通知" />);
    expect(switchOf(view.host).getAttribute("aria-checked")).toBe("true");
  });

  it("data-test-id 等按钮属性透传", async () => {
    view = await mount(
      <Switch checked={false} onChange={() => undefined} data-test-id="notify-switch" id="notify" aria-label="启用通知" />,
    );
    const control = switchOf(view.host);

    expect(control.getAttribute("data-test-id")).toBe("notify-switch");
    expect(control.id).toBe("notify");
  });
});

describe("Switch 切换", () => {
  it("点击回调取反后的值", async () => {
    const onChange = vi.fn();
    view = await mount(<Switch checked={false} onChange={onChange} aria-label="启用通知" />);

    await click(switchOf(view.host));
    expect(onChange).toHaveBeenCalledWith(true);

    onChange.mockClear();
    await view.rerender(<Switch checked onChange={onChange} aria-label="启用通知" />);
    await click(switchOf(view.host));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("禁用态点不动", async () => {
    const onChange = vi.fn();
    view = await mount(<Switch checked={false} onChange={onChange} disabled aria-label="启用通知" />);
    const control = switchOf(view.host);

    expect(control.disabled).toBe(true);
    await click(control);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("点标签文字同样切换", async () => {
    const onChange = vi.fn();
    view = await mount(<Switch checked={false} onChange={onChange} label="启用通知" />);
    const text = view.host.querySelector("label > span:last-child");
    if (!(text instanceof HTMLElement)) throw new Error("Missing label text");

    await click(text);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe("Switch 标签位置", () => {
  it("默认 labelPlacement=end:开关在前、文字在后", async () => {
    view = await mount(<Switch checked={false} onChange={() => undefined} label="启用通知" />);
    const row = view.host.querySelector("label");
    if (!row) throw new Error("Missing label");

    expect(row.firstElementChild).toBe(switchOf(view.host));
    expect(row.lastElementChild?.textContent).toBe("启用通知");
  });

  it("labelPlacement=start:文字在前、开关在右,点文字照样切换", async () => {
    const onChange = vi.fn();
    view = await mount(<Switch checked={false} onChange={onChange} label="profile" labelPlacement="start" />);
    const row = view.host.querySelector("label");
    if (!row) throw new Error("Missing label");
    const control = switchOf(view.host);

    expect(row.firstElementChild?.textContent).toBe("profile");
    expect(row.lastElementChild).toBe(control);
    // 可及名称仍来自包裹它的 <label>,换位置不换语义。
    expect(control.closest("label")).toBe(row);

    await click(row.firstElementChild as HTMLElement);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("没有 label 时 labelPlacement 不起作用,只渲染开关本身", async () => {
    view = await mount(<Switch checked={false} onChange={() => undefined} labelPlacement="start" aria-label="启用通知" />);

    expect(view.host.querySelector("label")).toBeNull();
    expect(view.host.firstElementChild).toBe(switchOf(view.host));
  });
});
