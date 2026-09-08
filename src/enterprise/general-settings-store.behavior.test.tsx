// @vitest-environment happy-dom
/**
 * User risk: the brand is read once for the whole app. A missed fallback shows
 * an empty topbar; a missed event leaves the old name up until a full reload.
 */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EnterpriseGeneralSettingsValue } from "./general-settings-surface";
import {
  primeEnterpriseGeneralSettings,
  resetEnterpriseGeneralSettings,
  resolveEnterpriseBrand,
  resolveEnterpriseFooterHtml,
  useEnterpriseGeneralSettings,
} from "./general-settings-store";
import { mount, settle, type MountedView } from "./behavior-test-utils";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SETTINGS: EnterpriseGeneralSettingsValue = {
  titleZh: "学习工作台",
  titleEn: "EasyLearning",
  subtitleZh: "企业学习",
  subtitleEn: "Enterprise learning",
  footerHtmlZh: "<span>中文页脚</span>",
  footerHtmlEn: "<span>English footer</span>",
  logoDataUrl: "data:image/png;base64,AAAA",
};

const EMPTY: EnterpriseGeneralSettingsValue = {
  titleZh: "",
  titleEn: "",
  subtitleZh: "",
  subtitleEn: "",
  footerHtmlZh: "",
  footerHtmlEn: "",
  logoDataUrl: null,
};

let view: MountedView | null = null;

function BrandProbe({ load }: { load: () => Promise<EnterpriseGeneralSettingsValue> }) {
  const { settings, error } = useEnterpriseGeneralSettings(load);
  const brand = resolveEnterpriseBrand(settings, "zh-CN", { title: "默认名称" });
  return <p data-test-id="probe">{error ? "error" : brand.title}</p>;
}

beforeEach(() => {
  resetEnterpriseGeneralSettings();
});

afterEach(async () => {
  await view?.unmount();
  view = null;
  resetEnterpriseGeneralSettings();
  vi.restoreAllMocks();
});

describe("resolveEnterpriseBrand", () => {
  it("falls back per field when the setting is missing or blank", () => {
    expect(resolveEnterpriseBrand(null, "zh-CN", { title: "默认名称" })).toEqual({
      title: "默认名称",
      subtitle: null,
      logoSrc: null,
    });
    expect(resolveEnterpriseBrand(EMPTY, "en", { title: "Fallback", subtitle: "Sub", logoSrc: "/logo.webp" })).toEqual({
      title: "Fallback",
      subtitle: "Sub",
      logoSrc: "/logo.webp",
    });
  });

  it("prefers the configured per-locale values and the uploaded logo", () => {
    expect(resolveEnterpriseBrand(SETTINGS, "zh-CN", { title: "默认名称", logoSrc: "/logo.webp" })).toEqual({
      title: "学习工作台",
      subtitle: "企业学习",
      logoSrc: "data:image/png;base64,AAAA",
    });
    expect(resolveEnterpriseBrand(SETTINGS, "en", { title: "Fallback" }).title).toBe("EasyLearning");
  });
});

describe("resolveEnterpriseFooterHtml", () => {
  it("returns the html for the locale and undefined when nothing is configured", () => {
    expect(resolveEnterpriseFooterHtml(SETTINGS, "zh-CN")).toBe("<span>中文页脚</span>");
    expect(resolveEnterpriseFooterHtml(SETTINGS, "en")).toBe("<span>English footer</span>");
    expect(resolveEnterpriseFooterHtml(EMPTY, "zh-CN")).toBeUndefined();
    expect(resolveEnterpriseFooterHtml(null, "en")).toBeUndefined();
  });
});

describe("useEnterpriseGeneralSettings", () => {
  it("loads once for several consumers and re-renders on the update event", async () => {
    const load = vi.fn().mockResolvedValue(SETTINGS);
    view = await mount(
      <>
        <BrandProbe load={load} />
        <BrandProbe load={load} />
      </>,
    );
    await settle(20);
    expect(load).toHaveBeenCalledTimes(1);
    expect(view.host.textContent).toBe("学习工作台学习工作台");

    await act(async () => primeEnterpriseGeneralSettings({ ...SETTINGS, titleZh: "培训中心" }));
    await settle(20);
    expect(view.host.textContent).toBe("培训中心培训中心");
  });

  it("reports a load failure instead of caching it", async () => {
    const load = vi.fn().mockRejectedValue(new Error("offline"));
    view = await mount(<BrandProbe load={load} />);
    await settle(20);
    expect(view.host.textContent).toBe("error");

    const second = vi.fn().mockResolvedValue(SETTINGS);
    await view.rerender(<BrandProbe load={second} />);
    await settle(20);
    expect(second).toHaveBeenCalledTimes(1);
    expect(view.host.textContent).toBe("学习工作台");
  });
});
