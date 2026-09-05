// @vitest-environment happy-dom
/**
 * User risk: 标签 / 提示 / 错误是录入界面里被反复扫读的文本。11px + `uppercase` +
 * `tracking` 对中文毫无"大写"效果,只是把字距拉散;11px 的 ink-faint 在浅底上也只擦着
 * AA 的下限。这里把口径钉死,免得以后有人"顺手"把字号压回去。
 */
import { afterEach, describe, expect, it } from "vitest";

import { mount, type MountedView } from "../enterprise/behavior-test-utils";
import { Field, FieldLabel, Input } from "./field";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let view: MountedView | null = null;

afterEach(async () => {
  await view?.unmount();
  view = null;
});

describe("FieldLabel 排版", () => {
  it("12px、不做 uppercase / tracking(对 CJK 无意义)", async () => {
    view = await mount(<FieldLabel>名称</FieldLabel>);
    const label = view.host.firstElementChild as HTMLElement;

    expect(label.className).toContain("text-[12px]");
    expect(label.className).toContain("text-ink-soft");
    expect(label.className).not.toContain("uppercase");
    expect(label.className).not.toContain("tracking-");
    expect(label.className).not.toContain("text-[11px]");
  });
});

describe("Field 提示与错误", () => {
  it("提示 12px + ink-soft(7.58:1),不再用 11px 的 ink-faint", async () => {
    view = await mount(
      <Field label="名称" hint="用于对外展示">
        <Input />
      </Field>,
    );
    const hint = view.host.querySelector("[id$='-hint']") as HTMLElement;

    expect(hint.textContent).toBe("用于对外展示");
    expect(hint.className).toContain("text-[12px]");
    expect(hint.className).toContain("text-ink-soft");
    expect(hint.className).not.toContain("text-ink-faint");
  });

  it("错误 12px + signal-ink(6.54:1),不再用 --signal 直出", async () => {
    view = await mount(
      <Field label="名称" error="名称不能为空">
        <Input />
      </Field>,
    );
    const error = view.host.querySelector("[id$='-error']") as HTMLElement;

    expect(error.textContent).toBe("名称不能为空");
    expect(error.className).toContain("text-[12px]");
    expect(error.className).toContain("text-[rgb(var(--signal-ink))]");
  });

  it("排版改动没有动 label / 描述的无障碍关联", async () => {
    view = await mount(
      <Field label="名称" hint="用于对外展示" required>
        <Input />
      </Field>,
    );
    const input = view.host.querySelector("input") as HTMLInputElement;
    const label = view.host.querySelector("label") as HTMLLabelElement;
    const hint = view.host.querySelector("[id$='-hint']") as HTMLElement;

    expect(label.getAttribute("for")).toBe(input.id);
    expect(input.getAttribute("aria-describedby")).toBe(hint.id);
    expect(input.getAttribute("aria-required")).toBe("true");
  });
});
