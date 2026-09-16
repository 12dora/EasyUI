// @vitest-environment happy-dom
/**
 * User risk: this provider is the only antd bridge a host mounts. If the locale
 * pack or the control geometry stops reaching antd, every antd surface in that
 * host drifts away from the native EasyUI pages at once — and a second cssVar
 * provider nested inside would make the two fight over the same `--ant-*`
 * variables.
 */
import { Table } from "antd";
import { afterEach, describe, expect, it } from "vitest";

import { CONTROL } from "../control-tokens";
import { mount, type MountedView } from "../enterprise/behavior-test-utils";
import { EASY_ANTD_THEME_TOKEN, EasyAntdProvider, EasyAntdProviderEn, EasyAntdProviderZh, createEasyAntdTheme } from ".";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let view: MountedView | null = null;

afterEach(async () => {
  await view?.unmount();
  view = null;
});

const EMPTY_TABLE = <Table dataSource={[]} columns={[{ title: "Name", dataIndex: "name", key: "name" }]} rowKey="id" />;

describe("EasyAntdProvider", () => {
  it("picks the locale pack from the locale prop", async () => {
    view = await mount(<EasyAntdProvider locale="zh-CN">{EMPTY_TABLE}</EasyAntdProvider>);
    expect(view.host.querySelector(".ant-empty-description")?.textContent).toBe("暂无数据");
    await view.rerender(<EasyAntdProvider locale="en">{EMPTY_TABLE}</EasyAntdProvider>);
    expect(view.host.querySelector(".ant-empty-description")?.textContent).toBe("No data");
  });

  it("exposes the same two locales as standalone components for code splitting", async () => {
    view = await mount(<EasyAntdProviderZh>{EMPTY_TABLE}</EasyAntdProviderZh>);
    expect(view.host.querySelector(".ant-empty-description")?.textContent).toBe("暂无数据");
    await view.rerender(<EasyAntdProviderEn>{EMPTY_TABLE}</EasyAntdProviderEn>);
    expect(view.host.querySelector(".ant-empty-description")?.textContent).toBe("No data");
  });

  it("emits the kit control geometry as antd css variables", async () => {
    view = await mount(<EasyAntdProvider locale="en">{EMPTY_TABLE}</EasyAntdProvider>);
    // cssVar + hashed:false is what lets the host stylesheet and antd agree on
    // one set of values; the height is the contract EasyUI Field/Button share.
    expect(document.head.textContent).toContain(`--ant-control-height:${CONTROL.height}`);
  });

  it("passes host token overrides through to the antd css variables", async () => {
    // EasyCustoms mounts the provider with a rounder radius; the override must
    // reach ConfigProvider, not just the exported helper.
    view = await mount(
      <EasyAntdProvider locale="en" token={{ borderRadius: 10 }}>
        {EMPTY_TABLE}
      </EasyAntdProvider>,
    );
    expect(document.head.textContent).toContain("--ant-border-radius:10");
    expect(document.head.textContent).toContain(`--ant-control-height:${CONTROL.height}`);
  });

  it("renders children unchanged with and without the antd App wrapper", async () => {
    view = await mount(
      <EasyAntdProvider locale="en">
        <span data-test-id="child">body</span>
      </EasyAntdProvider>,
    );
    expect(view.host.innerHTML).toBe('<span data-test-id="child">body</span>');
    // `component={false}` means App adds context, not a DOM node — hosts that
    // need message/notification can opt in without a layout change.
    await view.rerender(
      <EasyAntdProvider locale="en" withApp>
        <span data-test-id="child">body</span>
      </EasyAntdProvider>,
    );
    expect(view.host.innerHTML).toBe('<span data-test-id="child">body</span>');
  });
});

describe("EASY_ANTD_THEME_TOKEN / createEasyAntdTheme", () => {
  it("keeps the kit control geometry and adds the shared status colours", () => {
    expect(EASY_ANTD_THEME_TOKEN).toMatchObject({
      controlHeight: CONTROL.height,
      borderRadius: CONTROL.radius,
      colorError: "#DC2626",
      colorSuccess: "#059669",
      colorInfo: "#4F46E5",
      fontFamily: "var(--font-sans)",
    });
  });

  it("lets a host override one token without losing the rest (EasyCustoms radius 10)", () => {
    const customs = createEasyAntdTheme({ borderRadius: 10, borderRadiusSM: 10 });
    expect(customs.borderRadius).toBe(10);
    // Heights are the shared contract; only the radius diverges.
    expect(customs.controlHeight).toBe(CONTROL.height);
    expect(customs.colorText).toBe(EASY_ANTD_THEME_TOKEN.colorText);
    // The shared token itself is untouched.
    expect(EASY_ANTD_THEME_TOKEN.borderRadius).toBe(CONTROL.radius);
  });
});
