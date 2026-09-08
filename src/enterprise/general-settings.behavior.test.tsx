// @vitest-environment happy-dom
/**
 * User risk: the general settings page is the only place an administrator can
 * rebrand the application, so a save must carry BOTH languages plus the logo,
 * and a rejected logo must say why instead of silently doing nothing.
 */
import { act } from "react";
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

/**
 * happy-dom, like a browser, refuses a scripted `value` write on a file input,
 * so the selection is modelled with an instance accessor: the test can seed a
 * fake path and observe whether the surface cleared it.
 */
function trackNativeValue(input: HTMLInputElement, initial: string): () => string {
  let current = initial;
  Object.defineProperty(input, "value", {
    configurable: true,
    get: () => current,
    set: (next: string) => { current = String(next); },
  });
  return () => current;
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

    // C2 contract: consumers locate the retry by this id, in both feedback modes.
    await click(byTestId(view.host, "general-settings-refresh"));
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

describe("EnterpriseGeneralSettingsSurface in-flight safety", () => {
  it("clears the native file selection so the same logo can be picked again", async () => {
    const adapter = makeAdapter();
    view = await mount(<EnterpriseGeneralSettingsSurface adapter={adapter} labels={labels} />);
    await settle(20);

    const input = byTestId(view.host, "general-logo-input") as HTMLInputElement;
    const nativeValue = trackNativeValue(input, "C:\\fakepath\\logo.webp");
    attachFile(input, new File([new Uint8Array([1, 2, 3, 4])], "logo.webp", { type: "image/webp" }));
    await change(input);
    await settle(20);
    expect(nativeValue()).toBe("");

    // Removing must clear it too, otherwise re-selecting the same file is a no-op.
    input.value = "C:\\fakepath\\logo.webp";
    await click(byTestId(view.host, "general-logo-remove"));
    await settle(10);
    expect(nativeValue()).toBe("");
    expect(view.host.querySelector("[data-test-id='general-logo-preview']")).toBeNull();

    await change(input);
    await settle(20);
    expect((byTestId(view.host, "general-logo-preview") as HTMLImageElement).getAttribute("src")?.startsWith("data:image/webp;base64,")).toBe(true);
  });

  it("disables the whole form while saving so an in-flight save cannot discard an edit", async () => {
    let resolveSave: (value: EnterpriseGeneralSettingsValue) => void = () => undefined;
    const adapter = {
      load: vi.fn().mockResolvedValue(LOADED),
      save: vi.fn().mockImplementation(
        () => new Promise<EnterpriseGeneralSettingsValue>((resolve) => { resolveSave = resolve; }),
      ),
    } as unknown as EnterpriseGeneralSettingsAdapter;

    view = await mount(<EnterpriseGeneralSettingsSurface adapter={adapter} labels={labels} feedbackMode="toast" />);
    await settle(20);

    await click(byTestId(view.host, "app-settings-save"));
    await settle(10);
    const locked = [
      "general-title-zh",
      "general-subtitle-zh",
      "footer-html-zh",
      "general-logo-input",
      "general-logo-remove",
      "app-settings-save",
      "general-settings-refresh",
    ];
    for (const testId of locked) {
      expect([testId, (byTestId(view.host, testId) as HTMLInputElement).disabled]).toEqual([testId, true]);
    }

    resolveSave(LOADED);
    await settle(20);
    expect((byTestId(view.host, "general-title-zh") as HTMLInputElement).disabled).toBe(false);
  });
});

/**
 * Reading a file is asynchronous in the browser too, but happy-dom resolves it
 * on its own schedule. This stand-in hands the test the moment the result lands,
 * which is the only way to act *between* the selection and the `load` event.
 */
class ManualFileReader {
  static pending: ManualFileReader[] = [];
  result: string | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readAsDataURL(file: File): void {
    this.file = file;
    ManualFileReader.pending.push(this);
  }
  private file: File | null = null;
  async finish(dataUrl: string): Promise<void> {
    this.result = dataUrl;
    await act(async () => { this.onload?.(); });
  }
  static last(): ManualFileReader {
    const reader = ManualFileReader.pending.at(-1);
    if (!reader) throw new Error("No file read was started");
    return reader;
  }
}

describe("EnterpriseGeneralSettingsSurface logo read race", () => {
  beforeEach(() => {
    ManualFileReader.pending = [];
    vi.stubGlobal("FileReader", ManualFileReader);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("holds Save until the picked logo has been read, then saves the new logo", async () => {
    const adapter = makeAdapter();
    view = await mount(<EnterpriseGeneralSettingsSurface adapter={adapter} labels={labels} />);
    await settle(20);

    const input = byTestId(view.host, "general-logo-input") as HTMLInputElement;
    attachFile(input, new File([new Uint8Array([1, 2, 3, 4])], "logo.webp", { type: "image/webp" }));
    await change(input);
    await settle(10);

    // Saving now would send the previous logo and look like the upload was lost.
    const save = byTestId(view.host, "app-settings-save") as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    await click(save);
    await settle(10);
    expect(adapter.save).not.toHaveBeenCalled();

    await ManualFileReader.last().finish("data:image/webp;base64,BBBB");
    await settle(10);
    expect((byTestId(view.host, "app-settings-save") as HTMLButtonElement).disabled).toBe(false);

    await click(byTestId(view.host, "app-settings-save"));
    await settle(20);
    expect(adapter.save).toHaveBeenCalledWith({ ...LOADED, logoDataUrl: "data:image/webp;base64,BBBB" });
  });

  it("ignores a read that lands after the logo was removed", async () => {
    const adapter = makeAdapter();
    view = await mount(<EnterpriseGeneralSettingsSurface adapter={adapter} labels={labels} />);
    await settle(20);

    const input = byTestId(view.host, "general-logo-input") as HTMLInputElement;
    attachFile(input, new File([new Uint8Array([1, 2, 3, 4])], "logo.webp", { type: "image/webp" }));
    await change(input);
    await settle(10);

    await click(byTestId(view.host, "general-logo-remove"));
    await settle(10);
    expect(view.host.querySelector("[data-test-id='general-logo-preview']")).toBeNull();

    // The abandoned read must neither restore a preview nor re-lock Save.
    await ManualFileReader.last().finish("data:image/webp;base64,BBBB");
    await settle(10);
    expect(view.host.querySelector("[data-test-id='general-logo-preview']")).toBeNull();
    expect((byTestId(view.host, "app-settings-save") as HTMLButtonElement).disabled).toBe(false);

    await click(byTestId(view.host, "app-settings-save"));
    await settle(20);
    expect(adapter.save).toHaveBeenCalledWith({ ...LOADED, logoDataUrl: null });
  });
});

describe("general settings copy", () => {
  it("tells the administrator a blank subtitle falls back to the default, not that it hides it", () => {
    const zh = createEnterpriseLabelCatalog("zh-CN", { appName: "测试", appDescription: "测试" }, "business").generalSettings;
    const en = createEnterpriseLabelCatalog("en", { appName: "Test", appDescription: "Test" }, "business").generalSettings;
    expect(zh.subtitleHint).toBe("留空使用默认副标题。");
    expect(en.subtitleHint).toBe("Leave blank to use the default subtitle.");
  });
});
