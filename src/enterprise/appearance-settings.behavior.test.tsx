// @vitest-environment happy-dom
/**
 * 用户风险:密度偏好如果由设置页自己持有一份 state,列表页就不会跟着变 —— 用户改完
 * 回到题库,行高还是老样子。这里钉住设置页读写的确实是 `TableDensityProvider` 那一份,
 * 并且写回在途时有状态可见。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TableDensityProvider } from "../table/table-density";
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
  densityTitle: "表格密度",
  densityHint: "紧凑行更省屏幕。",
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
      <TableDensityProvider value="compact" onChange={() => undefined}>
        <EnterpriseAppearanceSettingsSurface labels={LABELS} generalSettingsAdapter={adapter} />
      </TableDensityProvider>,
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
      <TableDensityProvider value="compact" onChange={() => undefined}>
        <EnterpriseAppearanceSettingsSurface labels={LABELS} canManageGlobal generalSettingsAdapter={makeAdapter({ ...GENERAL, showFooter: false })} />
      </TableDensityProvider>,
    );
    await settle(20);
    expect(footerSwitch(view.host).getAttribute("aria-checked")).toBe("false");
    expect(byTestId(view.host, "appearance-global-section").textContent).toContain("显示页脚");
  });

  it("treats a stored value without the field as on", async () => {
    const { showFooter: _omitted, ...legacy } = GENERAL;
    view = await mount(
      <TableDensityProvider value="compact" onChange={() => undefined}>
        <EnterpriseAppearanceSettingsSurface labels={LABELS} canManageGlobal generalSettingsAdapter={makeAdapter(legacy)} />
      </TableDensityProvider>,
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
      <TableDensityProvider value="compact" onChange={() => undefined}>
        <EnterpriseAppearanceSettingsSurface labels={LABELS} canManageGlobal generalSettingsAdapter={adapter} />
      </TableDensityProvider>,
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
      <TableDensityProvider value="compact" onChange={() => undefined}>
        <EnterpriseAppearanceSettingsSurface labels={LABELS} canManageGlobal generalSettingsAdapter={adapter} />
      </TableDensityProvider>,
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
      <TableDensityProvider value="compact" onChange={() => undefined}>
        <EnterpriseAppearanceSettingsSurface labels={LABELS} canManageGlobal generalSettingsAdapter={adapter} />
      </TableDensityProvider>,
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
    expect(zh.showFooterHint).toContain("所有用户");
  });
});
