// @vitest-environment happy-dom
// @vitest-environment-options { "settings": { "disableIframePageLoading": true } }
/**
 * User risk: a silent identity re-check runs with the user's session token in a
 * hidden frame. It must hand the token to the parent only over a same-origin
 * message, never leave it in the address bar, never loop when the page is opened
 * directly, and never strand the app with a frame that hangs forever.
 */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IDENTITY_CHECK_MESSAGE_TYPE, type IdentityCheckOutcome } from "./identity-check";
import {
  EnterpriseOidcSilentCompleteController,
  IDENTITY_CHECK_FRAME_TEST_ID,
  useEnterpriseIdentityCheck,
  type EnterpriseIdentityCheckHandle,
  type EnterpriseIdentityCheckOptions,
} from "./identity-check-controller";
import { byTestId, mount, settle, type MountedView } from "./behavior-test-utils";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SILENT_URL = "https://api.example.test/auth/oidc/authorize?silent=1";
const labels = { standalone: "此页面由应用自动打开,无需手工访问。", back: "返回登录" };

let view: MountedView | null = null;
let handle: EnterpriseIdentityCheckHandle | null = null;
let clock = 0;

function frames(): HTMLIFrameElement[] {
  return [...document.querySelectorAll<HTMLIFrameElement>(`[data-test-id='${IDENTITY_CHECK_FRAME_TEST_ID}']`)];
}

async function postMessageEvent(data: unknown, origin: string = window.location.origin): Promise<void> {
  await act(async () => {
    window.dispatchEvent(new MessageEvent("message", { data, origin }));
    await Promise.resolve();
  });
}

function authenticatedMessage(token = "jwt-1", accountId = "acc-7") {
  return { type: IDENTITY_CHECK_MESSAGE_TYPE, outcome: "authenticated", token, accountId };
}

function Harness(props: EnterpriseIdentityCheckOptions) {
  handle = useEnterpriseIdentityCheck(props);
  return <div data-test-id="harness" />;
}

function hookOptions(overrides: Partial<EnterpriseIdentityCheckOptions> = {}): EnterpriseIdentityCheckOptions {
  return {
    enabled: true,
    silentAuthorizeUrl: SILENT_URL,
    currentAccountId: "acc-7",
    timeoutMs: 40,
    intervalMs: 100_000,
    visibilityThrottleMs: 1000,
    now: () => clock,
    onAuthenticated: vi.fn(),
    onLoggedOut: vi.fn(),
    onError: vi.fn(),
    ...overrides,
  };
}

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, value: state });
}

beforeEach(() => {
  clock = 0;
  setVisibility("visible");
  window.history.replaceState(null, "", "/en/login/oidc-silent");
});

afterEach(async () => {
  await view?.unmount();
  view = null;
  handle = null;
  for (const frame of frames()) frame.remove();
  vi.restoreAllMocks();
});

describe("EnterpriseOidcSilentCompleteController", () => {
  it("posts the parsed outcome to the parent frame and strips the token from the URL", async () => {
    const postMessage = vi.fn();
    Object.defineProperty(window, "parent", { configurable: true, value: { postMessage } });
    window.history.replaceState(null, "", "/en/login/oidc-silent?x=1#outcome=authenticated&token=jwt-1&account=acc-7");
    view = await mount(<EnterpriseOidcSilentCompleteController labels={labels} />);
    expect(postMessage).toHaveBeenCalledExactlyOnceWith(
      { type: IDENTITY_CHECK_MESSAGE_TYPE, outcome: "authenticated", token: "jwt-1", accountId: "acc-7" },
      window.location.origin,
    );
    expect(window.location.hash).toBe("");
    expect(window.location.search).toBe("?x=1");
    expect(view.host.textContent).toBe("");
    Object.defineProperty(window, "parent", { configurable: true, value: window });
  });

  it("forwards a provider logout outcome without inventing an authenticated result", async () => {
    const postMessage = vi.fn();
    Object.defineProperty(window, "parent", { configurable: true, value: { postMessage } });
    window.history.replaceState(null, "", "/en/login/oidc-silent#outcome=logged_out&kind=login_required");
    view = await mount(<EnterpriseOidcSilentCompleteController labels={labels} />);
    expect(postMessage).toHaveBeenCalledExactlyOnceWith(
      { type: IDENTITY_CHECK_MESSAGE_TYPE, outcome: "logged_out", kind: "login_required" },
      window.location.origin,
    );
    Object.defineProperty(window, "parent", { configurable: true, value: window });
  });

  it("shows the standalone hint and posts nothing when opened top-level", async () => {
    const postMessage = vi.spyOn(window, "postMessage").mockImplementation(() => undefined);
    window.history.replaceState(null, "", "/en/login/oidc-silent#outcome=authenticated&token=jwt-1&account=acc-7");
    view = await mount(<EnterpriseOidcSilentCompleteController labels={labels} renderBackLink={(label) => <a href="/en/login" data-test-id="back">{label}</a>} />);
    expect(postMessage).not.toHaveBeenCalled();
    expect(byTestId(view.host, "oidc-silent-standalone").textContent).toBe(labels.standalone);
    expect(byTestId(view.host, "back").textContent).toBe(labels.back);
    expect(window.location.hash).toBe("");
  });
});

describe("useEnterpriseIdentityCheck", () => {
  it("mounts one hidden, inert frame on the silent authorize URL and removes it on the result", async () => {
    view = await mount(<Harness {...hookOptions()} />);
    const [frame] = frames();
    expect(frame.getAttribute("src")).toBe(SILENT_URL);
    expect(frame.getAttribute("aria-hidden")).toBe("true");
    expect(frame.getAttribute("tabindex")).toBe("-1");
    expect(frame.style.width).toBe("0px");
    expect(frame.style.height).toBe("0px");
    await postMessageEvent(authenticatedMessage());
    expect(frames()).toHaveLength(0);
  });

  it("hands the token and account id to the host without deciding anything", async () => {
    const options = hookOptions();
    view = await mount(<Harness {...options} />);
    await postMessageEvent(authenticatedMessage());
    expect(options.onAuthenticated).toHaveBeenCalledExactlyOnceWith({ token: "jwt-1", accountId: "acc-7" });
    expect(options.onLoggedOut).not.toHaveBeenCalled();
    expect(options.onError).not.toHaveBeenCalled();
  });

  it("reports a provider logout through onLoggedOut", async () => {
    const options = hookOptions();
    view = await mount(<Harness {...options} />);
    await postMessageEvent({ type: IDENTITY_CHECK_MESSAGE_TYPE, outcome: "logged_out", kind: "login_required" });
    expect(options.onLoggedOut).toHaveBeenCalledExactlyOnceWith({ kind: "login_required" });
  });

  it("ignores cross-origin messages and same-origin messages of another type", async () => {
    const options = hookOptions();
    view = await mount(<Harness {...options} />);
    await postMessageEvent(authenticatedMessage("stolen-jwt", "acc-999"), "https://evil.example.test");
    await postMessageEvent({ type: "other-widget", outcome: "logged_out" });
    expect(options.onAuthenticated).not.toHaveBeenCalled();
    expect(options.onLoggedOut).not.toHaveBeenCalled();
    expect(frames()).toHaveLength(1);
    await postMessageEvent(authenticatedMessage());
    expect(options.onAuthenticated).toHaveBeenCalledExactlyOnceWith({ token: "jwt-1", accountId: "acc-7" });
  });

  it("times out a frame that never answers and tears it down", async () => {
    const options = hookOptions();
    view = await mount(<Harness {...options} />);
    expect(frames()).toHaveLength(1);
    await settle(80);
    expect(options.onError).toHaveBeenCalledExactlyOnceWith({ kind: "timeout" });
    expect(frames()).toHaveLength(0);
  });

  it("coalesces concurrent triggers into a single frame and resolves every caller", async () => {
    view = await mount(<Harness {...hookOptions()} />);
    const first = handle!.runCheck();
    const second = handle!.runCheck();
    expect(frames()).toHaveLength(1);
    await postMessageEvent(authenticatedMessage());
    const outcome: IdentityCheckOutcome = { outcome: "authenticated", token: "jwt-1", accountId: "acc-7" };
    await expect(first).resolves.toEqual(outcome);
    await expect(second).resolves.toEqual(outcome);
  });

  it("throttles a re-check when the tab becomes visible again", async () => {
    view = await mount(<Harness {...hookOptions()} />);
    await postMessageEvent(authenticatedMessage());
    clock = 999;
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(frames()).toHaveLength(0);
    clock = 1000;
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(frames()).toHaveLength(1);
  });

  it("does not re-check when the tab goes to the background", async () => {
    view = await mount(<Harness {...hookOptions()} />);
    await postMessageEvent(authenticatedMessage());
    clock = 10_000;
    setVisibility("hidden");
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(frames()).toHaveLength(0);
  });

  it("runs nothing while disabled and answers runCheck with the disabled outcome", async () => {
    const options = hookOptions({ enabled: false });
    view = await mount(<Harness {...options} />);
    expect(frames()).toHaveLength(0);
    await expect(handle!.runCheck()).resolves.toEqual({ outcome: "error", kind: "disabled" });
    expect(options.onError).not.toHaveBeenCalled();
  });

  it("removes the frame and stops calling back once the host unmounts", async () => {
    const options = hookOptions();
    view = await mount(<Harness {...options} />);
    expect(frames()).toHaveLength(1);
    await view.unmount();
    view = null;
    expect(frames()).toHaveLength(0);
    await postMessageEvent(authenticatedMessage());
    expect(options.onAuthenticated).not.toHaveBeenCalled();
  });
});
