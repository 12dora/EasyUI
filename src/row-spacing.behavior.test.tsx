// @vitest-environment happy-dom
/**
 * 用户风险:行距是一份跨页面的观感偏好,而表单侧读的是 CSS 变量 —— 中间只靠
 * `<html data-ui-density>` 这一根传输线。漏写或不跟着改档,设置页看着变了、
 * 表单还是老样子。这里钉住三件事:Provider 把档位发布到 `<html>` 且改档跟着改、
 * 钩子拿到的值与写回口就是宿主传进来的那一份、没有 Provider 时是全站默认(紧凑)。
 */
import { afterEach, describe, expect, it } from "vitest";

import { byTestId, click, mount, type MountedView } from "./enterprise/behavior-test-utils";
import { DEFAULT_ROW_SPACING, RowSpacingProvider, useRowSpacing } from "./row-spacing";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let view: MountedView | null = null;

afterEach(async () => {
  await view?.unmount();
  view = null;
  document.documentElement.removeAttribute("data-ui-density");
});

/** 把上下文摊到 DOM 上,这样"钩子看到了什么"可断言。 */
function Consumer() {
  const { rowSpacing, setRowSpacing, saving } = useRowSpacing();
  return (
    <button
      type="button"
      data-test-id="probe"
      data-row-spacing={rowSpacing}
      data-saving={String(saving)}
      onClick={() => void setRowSpacing("comfortable")}
    >
      {rowSpacing}
    </button>
  );
}

describe("行距", () => {
  it("把档位发布到 <html data-ui-density>,改档时跟着改", async () => {
    // CSS 侧靠这个属性换 `--ui-gap-*` / `--ui-field-gap`,表单的松紧全挂在它上面。
    view = await mount(
      <RowSpacingProvider value="comfortable" onChange={() => undefined}>
        <Consumer />
      </RowSpacingProvider>,
    );
    expect(document.documentElement.getAttribute("data-ui-density")).toBe("comfortable");

    await view.rerender(
      <RowSpacingProvider value="compact" onChange={() => undefined}>
        <Consumer />
      </RowSpacingProvider>,
    );
    expect(document.documentElement.getAttribute("data-ui-density")).toBe("compact");
  });

  it("消费者拿到的值与写回口就是宿主传进来的那一份", async () => {
    const written: string[] = [];
    view = await mount(
      <RowSpacingProvider value="compact" saving onChange={(next) => { written.push(next); }}>
        <Consumer />
      </RowSpacingProvider>,
    );
    const probe = byTestId(view.host, "probe");
    expect(probe.getAttribute("data-row-spacing")).toBe("compact");
    expect(probe.getAttribute("data-saving")).toBe("true");
    await click(probe);
    expect(written).toEqual(["comfortable"]);
  });

  it("没有 Provider 时是全站默认(紧凑),写回是空实现", async () => {
    expect(DEFAULT_ROW_SPACING).toBe("compact");
    view = await mount(<Consumer />);
    const probe = byTestId(view.host, "probe");
    expect(probe.getAttribute("data-row-spacing")).toBe("compact");
    expect(probe.getAttribute("data-saving")).toBe("false");
    // 没人接这份偏好时,点一下也不该炸,也不该有人往 <html> 上写东西。
    await click(probe);
    expect(document.documentElement.hasAttribute("data-ui-density")).toBe(false);
  });
});
