// @vitest-environment happy-dom
/**
 * User risk: the general settings page is the only place an administrator can
 * rebrand the application, so a save must carry BOTH languages plus the logo,
 * and a rejected logo must say why instead of silently doing nothing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { toastBus } from "../toast";
import { createEnterpriseLabelCatalog } from "./label-catalog";
import {
  EnterpriseGeneralSettingsSurface,
  type EnterpriseGeneralSettingsAdapter,
  type EnterpriseGeneralSettingsValue,
} from "./general-settings-surface";
import { ENTERPRISE_GENERAL_UPDATED_EVENT, resetEnterpriseGeneralSettings } from "./general-settings-store";
import { byTestId, change, click, fill, installReducedMotion, mount, settle, type MountedView } from "./behavior-test-utils";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const labels = createEnterpriseLabelCatalog("zh-CN", { appName: "测试", appDescription: "测试" }, "business").generalSettings;
let view: MountedView | null = null;

const LOADED: EnterpriseGeneralSettingsValue = {
  titleZh: "学习工作台",
  titleEn: "EasyLearning",
  subtitleZh: "企业学习",
  subtitleEn: "Enterprise learning",
  footerHtmlZh: "<strong>页脚</strong>",
  footerHtmlEn: "<strong>Footer</strong>",
  logoDataUrl: "data:image/png;base64,AAAA",
};

function makeAdapter(value: EnterpriseGeneralSettingsValue = LOADED): EnterpriseGeneralSettingsAdapter {
  return {
    load: vi.fn().mockResolvedValue(value),
    save: vi.fn().mockImplementation((next: EnterpriseGeneralSettingsValue) => Promise.resolve(next)),
  };
}

function attachFile(input: HTMLInputElement, file: File): void {
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
}

function pngOfSize(bytes: number): File {
  return new File([new Uint8Array(bytes)], "logo.png", { type: "image/png" });
}

beforeEach(() => {
  installReducedMotion(true);
  toastBus.clear();
  resetEnterpriseGeneralSettings();
});

afterEach(async () => {
  await view?.unmount();
  view = null;
  toastBus.clear();
  resetEnterpriseGeneralSettings();
  vi.restoreAllMocks();
});

describe("EnterpriseGeneralSettingsSurface", () => {
  it("edits both language tabs and saves one complete value, announcing the update", async () => {
    const adapter = makeAdapter();
    const updates: EnterpriseGeneralSettingsValue[] = [];
    const listener = (event: Event) => updates.push((event as CustomEvent<EnterpriseGeneralSettingsValue>).detail);
    window.addEventListener(ENTERPRISE_GENERAL_UPDATED_EVENT, listener);

    view = await mount(<EnterpriseGeneralSettingsSurface adapter={adapter} labels={labels} />);
    await settle(20);

    // The surface is the page's only H1.
    expect(view.host.querySelectorAll("h1")).toHaveLength(1);
    expect(byTestId(view.host, "general-settings-page")).toBeTruthy();

    await fill(byTestId(view.host, "general-title-zh") as HTMLInputElement, "学习中心");
    await fill(byTestId(view.host, "general-subtitle-zh") as HTMLInputElement, "培训与考试");
    await fill(byTestId(view.host, "footer-html-zh") as HTMLTextAreaElement, "<span>中文页脚</span>");

    await click(byTestId(view.host, "general-locale-tab-en"));
    await fill(byTestId(view.host, "general-title-en") as HTMLInputElement, "Learning Center");
    await fill(byTestId(view.host, "general-subtitle-en") as HTMLInputElement, "Training and exams");
    await fill(byTestId(view.host, "footer-html-en") as HTMLTextAreaElement, "<span>English footer</span>");

    await click(byTestId(view.host, "app-settings-save"));
    await settle(20);

    expect(adapter.save).toHaveBeenCalledWith({
      titleZh: "学习中心",
      titleEn: "Learning Center",
      subtitleZh: "培训与考试",
      subtitleEn: "Training and exams",
      footerHtmlZh: "<span>中文页脚</span>",
      footerHtmlEn: "<span>English footer</span>",
      logoDataUrl: "data:image/png;base64,AAAA",
    });
    expect(updates).toHaveLength(1);
    expect(updates[0]?.titleEn).toBe("Learning Center");
    window.removeEventListener(ENTERPRISE_GENERAL_UPDATED_EVENT, listener);
  });

  it("rejects a logo above 128 KiB with the size label and keeps the stored logo", async () => {
    const adapter = makeAdapter();
    view = await mount(<EnterpriseGeneralSettingsSurface adapter={adapter} labels={labels} />);
    await settle(20);

    const input = byTestId(view.host, "general-logo-input") as HTMLInputElement;
    attachFile(input, pngOfSize(128 * 1024 + 1));
    await change(input);
    await settle(10);

    expect(view.host.textContent).toContain(labels.logoTooLarge);
    expect((byTestId(view.host, "general-logo-preview") as HTMLImageElement).getAttribute("src")).toBe(LOADED.logoDataUrl);
  });

  it("rejects a non-image type with the invalid label", async () => {
    const adapter = makeAdapter();
    view = await mount(<EnterpriseGeneralSettingsSurface adapter={adapter} labels={labels} />);
    await settle(20);

    const input = byTestId(view.host, "general-logo-input") as HTMLInputElement;
    attachFile(input, new File([new Uint8Array(8)], "logo.svg", { type: "image/svg+xml" }));
    await change(input);
    await settle(10);

    expect(view.host.textContent).toContain(labels.logoInvalid);
    expect(view.host.textContent).not.toContain(labels.logoTooLarge);
  });

  it("accepts an allowed image and saves it as a data URL", async () => {
    const adapter = makeAdapter();
    view = await mount(<EnterpriseGeneralSettingsSurface adapter={adapter} labels={labels} />);
    await settle(20);

    const input = byTestId(view.host, "general-logo-input") as HTMLInputElement;
    attachFile(input, new File([new Uint8Array([1, 2, 3, 4])], "logo.webp", { type: "image/webp" }));
    await change(input);
    await settle(20);

    const preview = byTestId(view.host, "general-logo-preview") as HTMLImageElement;
    expect(preview.getAttribute("src")?.startsWith("data:image/webp;base64,")).toBe(true);

    await click(byTestId(view.host, "app-settings-save"));
    await settle(20);
    const saved = (adapter.save as unknown as { mock: { calls: EnterpriseGeneralSettingsValue[][] } }).mock.calls[0]?.[0];
    expect(saved?.logoDataUrl?.startsWith("data:image/webp;base64,")).toBe(true);
  });

  it("clears the logo to null when it is removed", async () => {
    const adapter = makeAdapter();
    view = await mount(<EnterpriseGeneralSettingsSurface adapter={adapter} labels={labels} />);
    await settle(20);

    await click(byTestId(view.host, "general-logo-remove"));
    await settle(10);
    expect(view.host.querySelector("[data-test-id='general-logo-preview']")).toBeNull();

    await click(byTestId(view.host, "app-settings-save"));
    await settle(20);
    expect(adapter.save).toHaveBeenCalledWith({ ...LOADED, logoDataUrl: null });
  });

  it("offers a retry when the initial load fails in inline mode", async () => {
    const adapter = {
      load: vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(LOADED),
      save: vi.fn(),
    } as unknown as EnterpriseGeneralSettingsAdapter;

    view = await mount(<EnterpriseGeneralSettingsSurface adapter={adapter} labels={labels} />);
    await settle(20);
    expect(view.host.textContent).toContain(labels.loadFailed);

    const retry = view.host.querySelector("button");
    expect(retry).not.toBeNull();
    await click(retry!);
    await settle(20);
    expect(byTestId(view.host, "general-title-zh")).toBeTruthy();
  });

  it("shows a skeleton while loading in toast mode", async () => {
    let resolveLoad: (value: EnterpriseGeneralSettingsValue) => void = () => undefined;
    const adapter = {
      load: vi.fn().mockImplementation(() => new Promise<EnterpriseGeneralSettingsValue>((resolve) => { resolveLoad = resolve; })),
      save: vi.fn(),
    } as unknown as EnterpriseGeneralSettingsAdapter;

    view = await mount(<EnterpriseGeneralSettingsSurface adapter={adapter} labels={labels} feedbackMode="toast" />);
    await settle(20);
    expect(byTestId(view.host, "general-settings-skeleton")).toBeTruthy();
    expect(byTestId(view.host, "general-settings-refresh")).toBeTruthy();

    resolveLoad(LOADED);
    await settle(30);
    expect(byTestId(view.host, "general-title-zh")).toBeTruthy();
  });
});
