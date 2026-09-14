// @vitest-environment happy-dom
/**
 * User risk: a signed-in account with zero grants must be told how to request
 * access, not stranded on a permission-denied settings page. Recheck on focus
 * has to be throttled so a tab switch does not stampede `/auth/me`.
 */
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { byTestId, click, mount, type MountedView } from "./behavior-test-utils";
import { createEnterpriseLabelCatalog } from "./label-catalog";
import {
  EnterprisePermissionOnboarding,
  PERMISSION_ONBOARDING_RECHECK_THROTTLE_MS,
  type EnterprisePermissionOnboardingProps,
} from "./permission-onboarding";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const labels = createEnterpriseLabelCatalog("zh-CN", { appName: "测试", appDescription: "测试" }).permissionOnboarding;

let view: MountedView | null = null;

function render(overrides: Partial<EnterprisePermissionOnboardingProps> = {}) {
  const props: EnterprisePermissionOnboardingProps = {
    identity: { displayName: "张三", secondaryLabel: "zhangsan@example.com", avatarUrl: null },
    permissionRequestUrl: "https://easyauth.example.test/request",
    onRecheck: vi.fn(),
    onLogout: vi.fn(),
    labels,
    ...overrides,
  };
  return props;
}

afterEach(async () => {
  await view?.unmount();
  view = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("EnterprisePermissionOnboarding", () => {
  it("renders a single page heading, the signed-in identity, and a styled request link", async () => {
    const props = render();
    view = await mount(<EnterprisePermissionOnboarding {...props} />);
    const headings = view.host.querySelectorAll("h1");
    expect(headings).toHaveLength(1);
    expect(headings[0]?.textContent).toBe("尚无可用权限");
    expect(view.host.textContent).toContain("当前账号已登录");
    expect(byTestId(view.host, "permission-onboarding-name").textContent).toBe("张三");
    expect(byTestId(view.host, "permission-onboarding-secondary").textContent).toBe("zhangsan@example.com");
    const request = byTestId(view.host, "permission-onboarding-request");
    expect(request.tagName).toBe("A");
    expect(request.querySelector("button")).toBeNull();
    expect(request.getAttribute("href")).toBe("https://easyauth.example.test/request");
    expect(request.getAttribute("target")).toBe("_blank");
    expect(request.getAttribute("rel")).toBe("noreferrer noopener");
    expect(request.className).toContain("inline-flex");
    expect(byTestId(view.host, "permission-onboarding-recheck").textContent).toContain("重新检查");
    expect(byTestId(view.host, "permission-onboarding-logout").textContent).toContain("退出登录");
  });

  it("omits the request link when permissionRequestUrl is null, blank, or not http(s)/path", async () => {
    view = await mount(<EnterprisePermissionOnboarding {...render({ permissionRequestUrl: null })} />);
    expect(view.host.querySelector("[data-test-id='permission-onboarding-request']")).toBeNull();
    await view.unmount();
    view = await mount(<EnterprisePermissionOnboarding {...render({ permissionRequestUrl: "  " })} />);
    expect(view.host.querySelector("[data-test-id='permission-onboarding-request']")).toBeNull();
    await view.unmount();
    view = await mount(<EnterprisePermissionOnboarding {...render({ permissionRequestUrl: "javascript:alert(1)" })} />);
    expect(view.host.querySelector("[data-test-id='permission-onboarding-request']")).toBeNull();
    await view.unmount();
    view = await mount(<EnterprisePermissionOnboarding {...render({ permissionRequestUrl: " /portal/request " })} />);
    expect(byTestId(view.host, "permission-onboarding-request").getAttribute("href")).toBe("/portal/request");
  });

  it("calls onLogout from the tertiary action", async () => {
    const props = render();
    view = await mount(<EnterprisePermissionOnboarding {...props} />);
    await click(byTestId(view.host, "permission-onboarding-logout"));
    expect(props.onLogout).toHaveBeenCalledTimes(1);
  });

  it("calls onRecheck from the secondary action", async () => {
    const props = render();
    view = await mount(<EnterprisePermissionOnboarding {...props} />);
    await click(byTestId(view.host, "permission-onboarding-recheck"));
    expect(props.onRecheck).toHaveBeenCalledTimes(1);
  });

  it("leaves the recheck button idle when onRecheck rejects, without an unhandled rejection", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (event: PromiseRejectionEvent) => {
      unhandled.push(event.reason);
      event.preventDefault();
    };
    window.addEventListener("unhandledrejection", onUnhandled);
    let rejectRecheck!: (reason?: unknown) => void;
    const onRecheck = vi.fn(() => new Promise<void>((_, reject) => { rejectRecheck = reject; }));
    view = await mount(<EnterprisePermissionOnboarding {...render({ onRecheck })} />);
    const button = byTestId(view.host, "permission-onboarding-recheck") as HTMLButtonElement;
    await click(button);
    expect(button.disabled).toBe(true);
    await act(async () => {
      rejectRecheck(new Error("me failed"));
    });
    expect(button.disabled).toBe(false);
    expect(unhandled).toEqual([]);
    window.removeEventListener("unhandledrejection", onUnhandled);
  });

  it("rechecks on focus and visibilitychange, throttled to 10s", async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    const onRecheck = vi.fn();
    view = await mount(<EnterprisePermissionOnboarding {...render({ onRecheck })} />);

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(onRecheck).toHaveBeenCalledTimes(1);

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(onRecheck).toHaveBeenCalledTimes(1);

    vi.setSystemTime(1_000_000 + PERMISSION_ONBOARDING_RECHECK_THROTTLE_MS);
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(onRecheck).toHaveBeenCalledTimes(2);
  });

  it("does not recheck on focus while a manual recheck is in flight, even after the throttle window", async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    const onRecheck = vi.fn(() => new Promise<void>(() => undefined));
    view = await mount(<EnterprisePermissionOnboarding {...render({ onRecheck })} />);
    await click(byTestId(view.host, "permission-onboarding-recheck"));
    expect(onRecheck).toHaveBeenCalledTimes(1);
    vi.setSystemTime(1_000_000 + PERMISSION_ONBOARDING_RECHECK_THROTTLE_MS);
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(onRecheck).toHaveBeenCalledTimes(1);
  });

  it("does not recheck while the document is hidden", async () => {
    const onRecheck = vi.fn();
    view = await mount(<EnterprisePermissionOnboarding {...render({ onRecheck })} />);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(onRecheck).not.toHaveBeenCalled();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  });

  it("skips focus listeners when recheckOnFocus is false", async () => {
    const onRecheck = vi.fn();
    view = await mount(<EnterprisePermissionOnboarding {...render({ onRecheck, recheckOnFocus: false })} />);
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(onRecheck).not.toHaveBeenCalled();
  });
});
