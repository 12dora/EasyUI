// @vitest-environment happy-dom
/**
 * User risk: 标签 / 提示 / 错误是录入界面里被反复扫读的文本。11px + `uppercase` +
 * `tracking` 对中文毫无"大写"效果,只是把字距拉散;11px 的 ink-faint 在浅底上也只擦着
 * AA 的下限。这里把口径钉死,免得以后有人"顺手"把字号压回去。
 *
 * 另一条:纵向间距必须走 `--ui-gap-*` / `--ui-field-gap`。谁把它写回 `gap-1` / `gap-4`
 * 这类固定值,「设置 → 外观 → 行距」就对那一处失效 —— 用户调了松紧,那块表单纹丝不动。
 */
import { afterEach, describe, expect, it } from "vitest";

import { byTestId, mount, type MountedView } from "../enterprise/behavior-test-utils";
import { Field, FieldLabel, Input } from "./field";
import { FormGrid } from "./form-grid";

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

  it("错误 12px + signal-ink(6.47:1),不再用 --signal 直出", async () => {
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

describe("行距变量", () => {
  it("Field 的标签→控件间距走 --ui-field-gap,不写死", async () => {
    view = await mount(
      <Field label="名称">
        <Input />
      </Field>,
    );
    const wrapper = view.host.firstElementChild as HTMLElement;

    // 兜底值 = 改造前的老尺寸,没引 theme.css 的宿主不会塌成 0(与 theme.css 的紧凑档不同,是故意的)。
    expect(wrapper.className).toContain("gap-[var(--ui-field-gap,4px)]");
    expect(wrapper.className).not.toMatch(/\bgap-1\b/);
  });

  it("FormGrid 三档间距都指向 --ui-gap-*", async () => {
    view = await mount(
      <>
        <FormGrid gap="sm" data-test-id="sm"><span /></FormGrid>
        <FormGrid gap="md" data-test-id="md"><span /></FormGrid>
        <FormGrid gap="lg" data-test-id="lg"><span /></FormGrid>
      </>,
    );
    expect(byTestId(view.host, "sm").className).toContain("gap-[var(--ui-gap-sm,12px)]");
    expect(byTestId(view.host, "md").className).toContain("gap-[var(--ui-gap-md,16px)]");
    expect(byTestId(view.host, "lg").className).toContain("gap-[var(--ui-gap-lg,20px)]");
  });
});
