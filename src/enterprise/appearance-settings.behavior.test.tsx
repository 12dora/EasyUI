// @vitest-environment happy-dom
/**
 * 用户风险:观感偏好如果由设置页自己持有一份 state,列表页与表单就不会跟着变 ——
 * 用户改完回到题库,还是老样子。这里钉住设置页读写的确实是宿主挂的那两份上下文
 * (`TableDensityProvider` / `RowSpacingProvider`),并且写回在途时有状态可见;
 * 另外钉住卡片的形状:一个「视觉效果」标题 + 两行独立的档位(表格、行距),
 * 两行互不串台 —— 表格在保存时不该让行距那行也转圈。
 */
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RowSpacingProvider, type RowSpacing } from "../row-spacing";
import { TableDensityProvider, type TableDensity } from "../table/table-density";
import { EnterpriseAppearanceSettingsSurface, type EnterpriseAppearanceSettingsLabels } from "./appearance-settings-surface";
import { byTestId, click, mount, settle, type MountedView } from "./behavior-test-utils";
import type { EnterpriseGeneralSettingsAdapter, EnterpriseGeneralSettingsValue } from "./general-settings-surface";
import {
  ENTERPRISE_GENERAL_UPDATED_EVENT,
  resetEnterpriseGeneralSettings,
  resolveEnterpriseShowFooter,
} from "./general-settings-store";
import { createEnterpriseLabelCatalog } from "./label-catalog";
import { toastBus } from "../toast";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LABELS: EnterpriseAppearanceSettingsLabels = {
  title: "外观",
  description: "列表与表格的显示密度。",
  visualTitle: "视觉效果",
  tableDensity: "表格",
  rowSpacing: "行距",
  densityCompact: "紧凑",
  densityComfortable: "宽松",
  saving: "正在保存",
  saveFailed: "外观设置保存失败，请重试",
  showFooter: "显示页脚",
  showFooterHint: "关闭后所有用户均不显示页脚。",
  globalLoadFailed: "全局外观设置加载失败",
  retry: "重试",
  globalSaved: "全局外观设置已保存",
  globalSaveFailed: "全局外观设置保存失败，请重试",
};

let view: MountedView | null = null;

afterEach(async () => {
  await view?.unmount();
  view = null;
});

/** 某一行(`appearance-density` / `appearance-row-spacing`)里的某一个档位按钮。 */
function option(host: ParentNode, row: string, density: string): HTMLElement {
  const element = byTestId(host, `${row}-toggle`).querySelector(`[data-density='${density}']`);
  if (!(element instanceof HTMLElement)) throw new Error(`missing option ${row}/${density}`);
  return element;
}

/** 两份偏好各挂各的 Provider,和宿主的做法一致。 */
function withProviders(
  node: ReactNode,
  options: {
    density?: TableDensity;
    onDensityChange?: (next: TableDensity) => void | Promise<void>;
    densitySaving?: boolean;
    rowSpacing?: RowSpacing;
    onRowSpacingChange?: (next: RowSpacing) => void | Promise<void>;
    rowSpacingSaving?: boolean;
  } = {},
) {
  return (
    <TableDensityProvider
      value={options.density ?? "compact"}
      saving={options.densitySaving ?? false}
      onChange={options.onDensityChange ?? (() => undefined)}
    >
      <RowSpacingProvider
        value={options.rowSpacing ?? "compact"}
        saving={options.rowSpacingSaving ?? false}
        onChange={options.onRowSpacingChange ?? (() => undefined)}
      >
        {node}
      </RowSpacingProvider>
    </TableDensityProvider>
  );
}

describe("EnterpriseAppearanceSettingsSurface", () => {
  it("卡片是「视觉效果」标题 + 两行档位:表格、行距", async () => {
    view = await mount(withProviders(<EnterpriseAppearanceSettingsSurface labels={LABELS} />));
    const card = byTestId(view.host, "appearance-density-section");
    // 标题是卡片标题,不是 Field 的 label —— 它不该挂在 <label> 上。
    expect(byTestId(card, "appearance-visual-title").textContent).toBe("视觉效果");
    expect(card.querySelector("label")).toBeNull();

    for (const [row, label] of [["appearance-density", "表格"], ["appearance-row-spacing", "行距"]] as const) {
      const toggle = byTestId(card, `${row}-toggle`);
      // 标签与控件在同一行:标签在左、控件在右,垂直居中,窄屏可换行。
      const line = toggle.parentElement?.parentElement as HTMLElement;
      expect(line.textContent).toContain(label);
      expect(line.className).toContain("items-center");
      expect(line.className).toContain("justify-between");
      expect(line.className).toContain("flex-wrap");
      expect(toggle.getAttribute("aria-label")).toBe(label);
      expect(Array.from(toggle.querySelectorAll("[data-density]")).map((node) => node.textContent)).toEqual(["紧凑", "宽松"]);
    }
  });

  it("两行的选中项各来自自己的上下文,不是页面自己的 state", async () => {
    view = await mount(
      withProviders(<EnterpriseAppearanceSettingsSurface labels={LABELS} />, { density: "comfortable", rowSpacing: "compact" }),
    );
    expect(option(view.host, "appearance-density", "comfortable").getAttribute("aria-pressed")).toBe("true");
    expect(option(view.host, "appearance-density", "compact").getAttribute("aria-pressed")).toBe("false");
    // 行距是另一份偏好:表格调成宽松,它不该跟着动。
    expect(option(view.host, "appearance-row-spacing", "compact").getAttribute("aria-pressed")).toBe("true");
    expect(option(view.host, "appearance-row-spacing", "comfortable").getAttribute("aria-pressed")).toBe("false");
  });

  it("每一行把新值交给自己的写回口;点当前档不重复写", async () => {
    const density: string[] = [];
    const rowSpacing: string[] = [];
    view = await mount(
      withProviders(<EnterpriseAppearanceSettingsSurface labels={LABELS} />, {
        onDensityChange: (next) => { density.push(next); },
        onRowSpacingChange: (next) => { rowSpacing.push(next); },
      }),
    );
    await click(option(view.host, "appearance-density", "compact"));
    await click(option(view.host, "appearance-row-spacing", "compact"));
    expect(density).toEqual([]);
    expect(rowSpacing).toEqual([]);

    await click(option(view.host, "appearance-density", "comfortable"));
    expect(density).toEqual(["comfortable"]);
    expect(rowSpacing).toEqual([]);

    await click(option(view.host, "appearance-row-spacing", "comfortable"));
    expect(rowSpacing).toEqual(["comfortable"]);
    expect(density).toEqual(["comfortable"]);
  });

  it("保存状态各算各的:表格在写回时行距那行不转圈,反之亦然", async () => {
    view = await mount(withProviders(<EnterpriseAppearanceSettingsSurface labels={LABELS} />, { densitySaving: true }));
    expect(byTestId(view.host, "appearance-density-saving").textContent).toBe("正在保存");
    expect(view.host.querySelector("[data-test-id='appearance-row-spacing-saving']")).toBeNull();

    await view.rerender(withProviders(<EnterpriseAppearanceSettingsSurface labels={LABELS} />, { rowSpacingSaving: true }));
    expect(byTestId(view.host, "appearance-row-spacing-saving").textContent).toBe("正在保存");
    expect(view.host.querySelector("[data-test-id='appearance-density-saving']")).toBeNull();
  });

  it.each([true, false])("只禁用正在保存的那一行:tableSaving=%s", async (tableSaving) => {
    const density = vi.fn();
    const spacing = vi.fn();
    view = await mount(withProviders(<EnterpriseAppearanceSettingsSurface labels={LABELS} />, {
      densitySaving: tableSaving, rowSpacingSaving: !tableSaving,
      onDensityChange: density, onRowSpacingChange: spacing,
    }));
    const table = option(view.host, "appearance-density", "comfortable") as HTMLButtonElement;
    const row = option(view.host, "appearance-row-spacing", "comfortable") as HTMLButtonElement;
    expect(table.disabled).toBe(tableSaving);
    expect(row.disabled).toBe(!tableSaving);
    await click(table);
    await click(row);
    expect(density).toHaveBeenCalledTimes(tableSaving ? 0 : 1);
    expect(spacing).toHaveBeenCalledTimes(tableSaving ? 1 : 0);
  });

  it("写回失败不冒泡成未捕获的 rejection", async () => {
    view = await mount(
      withProviders(<EnterpriseAppearanceSettingsSurface labels={LABELS} />, {
        onDensityChange: () => Promise.reject(new Error("offline")),
        onRowSpacingChange: () => Promise.reject(new Error("offline")),
      }),
    );
    await click(option(view.host, "appearance-density", "comfortable"));
    await click(option(view.host, "appearance-row-spacing", "comfortable"));
    expect(byTestId(view.host, "appearance-settings-page")).toBeTruthy();
  });
});

const GENERAL: EnterpriseGeneralSettingsValue = {
  titleZh: "学习工作台",
  titleEn: "EasyLearning",
  subtitleZh: "企业学习",
  subtitleEn: "Enterprise learning",
  footerHtmlZh: "<span>页脚</span>",
  footerHtmlEn: "<span>Footer</span>",
  logoDataUrl: "data:image/png;base64,AAAA",
  showFooter: true,
};

function makeAdapter(value: EnterpriseGeneralSettingsValue = GENERAL) {
  return {
    load: vi.fn().mockResolvedValue(value),
    save: vi.fn().mockImplementation((next: EnterpriseGeneralSettingsValue) => Promise.resolve(next)),
  } satisfies EnterpriseGeneralSettingsAdapter;
}

function footerSwitch(host: ParentNode): HTMLButtonElement {
  return byTestId(host, "appearance-show-footer-switch") as HTMLButtonElement;
}

describe("global footer switch (admin only)", () => {
  beforeEach(() => {
    resetEnterpriseGeneralSettings();
    toastBus.clear();
  });
  afterEach(() => {
    resetEnterpriseGeneralSettings();
    toastBus.clear();
  });

  it("is hidden from users who cannot change global settings", async () => {
    const adapter = makeAdapter();
    view = await mount(
      withProviders(<EnterpriseAppearanceSettingsSurface labels={LABELS} generalSettingsAdapter={adapter} />),
    );
    await settle(20);
    expect(view.host.querySelector("[data-test-id='appearance-global-section']")).toBeNull();
    expect(view.host.querySelector("[data-test-id='appearance-show-footer-switch']")).toBeNull();
    // A non-admin must not even trigger the read.
    expect(adapter.load).not.toHaveBeenCalled();
    // The per-user density card is still there.
    expect(byTestId(view.host, "appearance-density-toggle")).toBeTruthy();
  });

  it("shows the switch to an administrator, reflecting the stored value", async () => {
    view = await mount(
      withProviders(<EnterpriseAppearanceSettingsSurface labels={LABELS} canManageGlobal generalSettingsAdapter={makeAdapter({ ...GENERAL, showFooter: false })} />),
    );
    await settle(20);
    expect(footerSwitch(view.host).getAttribute("aria-checked")).toBe("false");
    expect(byTestId(view.host, "appearance-global-section").textContent).toContain("显示页脚");
  });

  it("treats a stored value without the field as on", async () => {
    const { showFooter: _omitted, ...legacy } = GENERAL;
    view = await mount(
      withProviders(<EnterpriseAppearanceSettingsSurface labels={LABELS} canManageGlobal generalSettingsAdapter={makeAdapter(legacy)} />),
    );
    await settle(20);
    expect(footerSwitch(view.host).getAttribute("aria-checked")).toBe("true");
  });

  it("saves the whole general value with only showFooter changed and primes the shell", async () => {
    const adapter = makeAdapter();
    const updates: EnterpriseGeneralSettingsValue[] = [];
    const listener = (event: Event) => updates.push((event as CustomEvent<EnterpriseGeneralSettingsValue>).detail);
    window.addEventListener(ENTERPRISE_GENERAL_UPDATED_EVENT, listener);
    view = await mount(
      withProviders(<EnterpriseAppearanceSettingsSurface labels={LABELS} canManageGlobal generalSettingsAdapter={adapter} />),
    );
    await settle(20);
    await click(footerSwitch(view.host));
    await settle(20);
    window.removeEventListener(ENTERPRISE_GENERAL_UPDATED_EVENT, listener);
    expect(adapter.save).toHaveBeenCalledTimes(1);
    expect(adapter.save).toHaveBeenCalledWith({ ...GENERAL, showFooter: false });
    expect(updates).toHaveLength(1);
    expect(resolveEnterpriseShowFooter(updates[0] ?? null)).toBe(false);
    expect(footerSwitch(view.host).getAttribute("aria-checked")).toBe("false");
    expect(toastBus.getSnapshot().map((item) => item.message)).toContain("全局外观设置已保存");
  });

  it("keeps the switch where it was and reports the failure when the save is rejected", async () => {
    const adapter = makeAdapter();
    adapter.save.mockRejectedValue(new Error("forbidden"));
    view = await mount(
      withProviders(<EnterpriseAppearanceSettingsSurface labels={LABELS} canManageGlobal generalSettingsAdapter={adapter} />),
    );
    await settle(20);
    await click(footerSwitch(view.host));
    await settle(20);
    expect(footerSwitch(view.host).getAttribute("aria-checked")).toBe("true");
    expect(toastBus.getSnapshot().map((item) => item.message)).toContain("全局外观设置保存失败，请重试");
  });

  it("offers a retry when the global settings cannot be read, with the switch disabled", async () => {
    const adapter = makeAdapter();
    adapter.load.mockRejectedValueOnce(new Error("offline"));
    view = await mount(
      withProviders(<EnterpriseAppearanceSettingsSurface labels={LABELS} canManageGlobal generalSettingsAdapter={adapter} />),
    );
    await settle(20);
    expect(footerSwitch(view.host).disabled).toBe(true);
    await click(byTestId(view.host, "appearance-global-retry"));
    await settle(20);
    expect(footerSwitch(view.host).disabled).toBe(false);
    expect(view.host.querySelector("[data-test-id='appearance-global-load-failed']")).toBeNull();
  });

  it("ships zh + en copy in the label catalog", () => {
    const zh = createEnterpriseLabelCatalog("zh-CN", { appName: "测试", appDescription: "测试" }, "business").appearanceSettings;
    const en = createEnterpriseLabelCatalog("en", { appName: "Test", appDescription: "Test" }, "business").appearanceSettings;
    expect(zh.showFooter).toBe("显示页脚");
    expect(en.showFooter).toBe("Show footer");
    expect(zh.showFooterHint).toBeUndefined();
  });
});

describe("global footer switch: stale page safety", () => {
  beforeEach(() => {
    resetEnterpriseGeneralSettings();
    toastBus.clear();
  });
  afterEach(() => {
    resetEnterpriseGeneralSettings();
    toastBus.clear();
  });

  it("re-reads the general settings right before the PUT so a stale page cannot restore the old brand", async () => {
    // 外观页一直开着;期间另一位管理员在「通用」改了标题和 logo。此时切换页脚,
    // PUT 必须带上最新的品牌,而不是页面打开时读到的那份。
    const rebranded: EnterpriseGeneralSettingsValue = { ...GENERAL, titleZh: "学习中心", logoDataUrl: null };
    const adapter = makeAdapter();
    view = await mount(
      withProviders(<EnterpriseAppearanceSettingsSurface labels={LABELS} canManageGlobal generalSettingsAdapter={adapter} />),
    );
    await settle(20);
    adapter.load.mockResolvedValue(rebranded);
    await click(footerSwitch(view.host));
    await settle(20);
    expect(adapter.load).toHaveBeenCalledTimes(2);
    expect(adapter.save).toHaveBeenCalledWith({ ...rebranded, showFooter: false });
  });

  it("does not PUT when the pre-save read fails", async () => {
    const adapter = makeAdapter();
    view = await mount(
      withProviders(<EnterpriseAppearanceSettingsSurface labels={LABELS} canManageGlobal generalSettingsAdapter={adapter} />),
    );
    await settle(20);
    adapter.load.mockRejectedValueOnce(new Error("offline"));
    await click(footerSwitch(view.host));
    await settle(20);
    expect(adapter.save).not.toHaveBeenCalled();
    expect(footerSwitch(view.host).getAttribute("aria-checked")).toBe("true");
    expect(toastBus.getSnapshot().map((item) => item.message)).toContain("全局外观设置保存失败，请重试");
  });
});
