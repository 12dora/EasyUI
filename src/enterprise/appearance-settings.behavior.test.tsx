// @vitest-environment happy-dom
/**
 * 用户风险:密度偏好如果由设置页自己持有一份 state,列表页就不会跟着变 —— 用户改完
 * 回到题库,行高还是老样子。这里钉住设置页读写的确实是 `TableDensityProvider` 那一份,
 * 并且写回在途时有状态可见。
 */
import { afterEach, describe, expect, it } from "vitest";

import { TableDensityProvider } from "../table/table-density";
import { EnterpriseAppearanceSettingsSurface, type EnterpriseAppearanceSettingsLabels } from "./appearance-settings-surface";
import { byTestId, click, mount, type MountedView } from "./behavior-test-utils";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LABELS: EnterpriseAppearanceSettingsLabels = {
  title: "外观",
  description: "列表与表格的显示密度。",
  densityTitle: "表格密度",
  densityHint: "紧凑行更省屏幕。",
  densityCompact: "紧凑",
  densityComfortable: "宽松",
  saving: "正在保存",
  saveFailed: "外观设置保存失败，请重试",
};

let view: MountedView | null = null;

afterEach(async () => {
  await view?.unmount();
  view = null;
});

function option(host: ParentNode, density: string): HTMLElement {
  const element = byTestId(host, "appearance-density-toggle").querySelector(`[data-density='${density}']`);
  if (!(element instanceof HTMLElement)) throw new Error(`missing option ${density}`);
  return element;
}

describe("EnterpriseAppearanceSettingsSurface", () => {
  it("选中项来自上下文,不是页面自己的 state", async () => {
    view = await mount(
      <TableDensityProvider value="comfortable" onChange={() => undefined}>
        <EnterpriseAppearanceSettingsSurface labels={LABELS} />
      </TableDensityProvider>,
    );
    expect(option(view.host, "comfortable").getAttribute("aria-pressed")).toBe("true");
    expect(option(view.host, "compact").getAttribute("aria-pressed")).toBe("false");
  });

  it("改档把新值交给宿主的写回口;点当前档不重复写", async () => {
    const written: string[] = [];
    view = await mount(
      <TableDensityProvider value="compact" onChange={(next) => { written.push(next); }}>
        <EnterpriseAppearanceSettingsSurface labels={LABELS} />
      </TableDensityProvider>,
    );
    await click(option(view.host, "compact"));
    expect(written).toEqual([]);
    await click(option(view.host, "comfortable"));
    expect(written).toEqual(["comfortable"]);
  });

  it("写回在途时显示保存状态", async () => {
    view = await mount(
      <TableDensityProvider value="compact" saving onChange={() => undefined}>
        <EnterpriseAppearanceSettingsSurface labels={LABELS} />
      </TableDensityProvider>,
    );
    expect(byTestId(view.host, "appearance-density-saving").textContent).toBe("正在保存");
  });

  it("写回失败不冒泡成未捕获的 rejection", async () => {
    view = await mount(
      <TableDensityProvider value="compact" onChange={() => Promise.reject(new Error("offline"))}>
        <EnterpriseAppearanceSettingsSurface labels={LABELS} />
      </TableDensityProvider>,
    );
    await click(option(view.host, "comfortable"));
    expect(byTestId(view.host, "appearance-settings-page")).toBeTruthy();
  });
});
