// @vitest-environment happy-dom
/**
 * User risk: two regressions this package kept re-introducing — a parent
 * "Settings" H1 stacked above every settings surface, and an app shell mounted
 * without the configured footer.
 */
import { afterEach, describe, expect, it } from "vitest";

import { EnterpriseAppFrame } from "./app-frame";
import { EnterpriseConfiguredFooter } from "./footer";
import { EnterpriseSettingsPageFrame } from "./page-frames";
import { byTestId, mount, type MountedView } from "./behavior-test-utils";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let view: MountedView | null = null;

afterEach(async () => {
  await view?.unmount();
  view = null;
});

describe("EnterpriseSettingsPageFrame", () => {
  it("wraps the surface without painting a heading of its own", async () => {
    view = await mount(
      <EnterpriseSettingsPageFrame>
        <section>
          <h1>本地账户</h1>
        </section>
      </EnterpriseSettingsPageFrame>,
    );
    const headings = view.host.querySelectorAll("h1");
    expect(headings).toHaveLength(1);
    expect(headings[0]?.textContent).toBe("本地账户");
    expect(byTestId(view.host, "enterprise-settings-page").className).toContain("max-w-6xl");
  });
});

describe("EnterpriseAppFrame", () => {
  it("pins the configured footer inside the authenticated frame", async () => {
    view = await mount(
      <EnterpriseAppFrame footer={<EnterpriseConfiguredFooter html="<strong>企业应用</strong> · © {year}" fallback="回退页脚" />}>
        <p>内容</p>
      </EnterpriseAppFrame>,
    );
    const html = byTestId(view.host, "app-footer-html");
    expect(html.textContent).toContain("企业应用");
    expect(html.textContent).toContain(String(new Date().getFullYear()));
    expect(view.host.querySelector("[data-test-id='app-footer-fallback']")).toBeNull();
  });

  it("falls back to the host string when nothing is configured", async () => {
    view = await mount(
      <EnterpriseAppFrame footer={<EnterpriseConfiguredFooter html="" fallback="回退页脚" />}>
        <p>内容</p>
      </EnterpriseAppFrame>,
    );
    expect(byTestId(view.host, "app-footer-fallback").textContent).toBe("回退页脚");
  });
});
