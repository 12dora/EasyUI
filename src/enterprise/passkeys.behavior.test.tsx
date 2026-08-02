// @vitest-environment happy-dom
/**
 * User risk: passkey identity must stay visually continuous across the empty
 * boundary so users can tell which credential was added, replaced, or removed.
 */
import { act, Children, cloneElement, isValidElement, useEffect, useState, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const motionControl = vi.hoisted(() => ({ reduced: false }));

vi.mock("motion/react", () => {
  type PresenceChild = ReactElement<{ exit?: unknown; __presencePhase?: "enter" | "exit" | "steady" }>;

  function childrenOf(value: ReactNode): PresenceChild[] {
    return Children.toArray(value).filter(isValidElement) as PresenceChild[];
  }

  function phased(child: PresenceChild, phase: "enter" | "exit" | "steady"): PresenceChild {
    return cloneElement(child, { __presencePhase: phase });
  }

  function AnimatePresence({ children }: { children: ReactNode; initial?: boolean }) {
    const next = childrenOf(children);
    const signature = next.map((child) => String(child.key)).join("|");
    const [displayed, setDisplayed] = useState(() => next.map((child) => phased(child, "steady")));

    useEffect(() => {
      if (motionControl.reduced) {
        setDisplayed(next.map((child) => phased(child, "steady")));
        return;
      }
      setDisplayed((current) => {
        const currentKeys = new Set(current.map((child) => child.key));
        const nextKeys = new Set(next.map((child) => child.key));
        const entered = next.map((child) => phased(child, currentKeys.has(child.key) ? "steady" : "enter"));
        const exited = current
          .filter((child) => !nextKeys.has(child.key) && child.props.exit !== undefined)
          .map((child) => phased(child, "exit"));
        return [...entered, ...exited];
      });
      const timer = window.setTimeout(() => {
        setDisplayed(next.map((child) => phased(child, "steady")));
      }, 60);
      return () => window.clearTimeout(timer);
    }, [signature]);

    return <>{displayed}</>;
  }

  function MotionLi({
    children,
    __presencePhase = "steady",
    layout: _layout,
    initial: _initial,
    animate: _animate,
    exit: _exit,
    transition: _transition,
    ...props
  }: React.LiHTMLAttributes<HTMLLIElement> & {
    __presencePhase?: "enter" | "exit" | "steady";
    layout?: unknown;
    initial?: unknown;
    animate?: unknown;
    exit?: unknown;
    transition?: unknown;
  }) {
    return <li {...props} data-presence-phase={__presencePhase}>{children}</li>;
  }

  return {
    AnimatePresence,
    motion: { li: MotionLi },
    useReducedMotion: () => motionControl.reduced,
  };
});

import { toast } from "../toast";
import { createEnterpriseLabelCatalog } from "./label-catalog";
import { EnterpriseAccountSecuritySurface, type EnterprisePasskeyItem, type EnterpriseSecurityAdapter } from "./security-workspace";
import { byTestId, click, installReducedMotion, mount, type MountedView } from "./behavior-test-utils";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const labels = createEnterpriseLabelCatalog("en", { appName: "Test", appDescription: "Test" }, "business");
const keyA: EnterprisePasskeyItem = { id: "a", name: "Laptop A", createdAt: null, lastUsedAt: null };
const keyB: EnterprisePasskeyItem = { id: "b", name: "Security key B", createdAt: null, lastUsedAt: null };
let view: MountedView | null = null;

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function security(adapter: EnterpriseSecurityAdapter) {
  return (
    <EnterpriseAccountSecuritySurface
      adapter={adapter}
      labels={labels.security}
      permissions={{ password: false, totpStatus: false, createTotp: false, disableTotp: false, viewPasskeys: true, canRegisterPasskeys: false, canDeletePasskeys: true }}
      feedbackMode="toast"
    />
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.useFakeTimers();
  motionControl.reduced = false;
  installReducedMotion(false);
});

afterEach(async () => {
  await view?.unmount();
  view = null;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("FE-FB-13 passkey collection transitions", () => {
  it("animates first-add, replacement, and last-delete inside one persistent list region", async () => {
    let items: readonly EnterprisePasskeyItem[] = [];
    const adapter = {
      loadPasskeys: vi.fn(() => Promise.resolve(items)),
      deletePasskey: vi.fn(() => Promise.resolve()),
    } as unknown as EnterpriseSecurityAdapter;

    view = await mount(security(adapter));
    await flush();
    expect(byTestId(view.host, "passkeys-empty")).toBeTruthy();

    items = [keyA];
    await click(byTestId(view.host, "passkeys-refresh"));
    await flush();
    expect(byTestId(view.host, "passkey-row-a").getAttribute("data-presence-phase")).toBe("enter");
    expect(view.host.querySelector("[data-test-id='passkeys-empty']")).toBeNull();
    await act(async () => vi.advanceTimersByTime(60));

    items = [keyB];
    await click(byTestId(view.host, "passkeys-refresh"));
    await flush();
    expect(byTestId(view.host, "passkey-row-a").getAttribute("data-presence-phase")).toBe("exit");
    expect(byTestId(view.host, "passkey-row-b").getAttribute("data-presence-phase")).toBe("enter");
    await act(async () => vi.advanceTimersByTime(60));
    expect(view.host.querySelector("[data-test-id='passkey-row-a']")).toBeNull();

    items = [];
    await click(byTestId(view.host, "passkey-delete-btn-b"));
    await click(byTestId(document, "passkey-delete-confirm"));
    await flush();
    expect(byTestId(view.host, "passkeys-empty")).toBeTruthy();
    expect(byTestId(view.host, "passkey-row-b").getAttribute("data-presence-phase")).toBe("exit");
    await act(async () => vi.advanceTimersByTime(60));
    expect(view.host.querySelector("[data-test-id='passkey-row-b']")).toBeNull();
  });

  it("removes the last row immediately under reduced motion", async () => {
    motionControl.reduced = true;
    installReducedMotion(true);
    let items: readonly EnterprisePasskeyItem[] = [keyA];
    const adapter = {
      loadPasskeys: vi.fn(() => Promise.resolve(items)),
    } as unknown as EnterpriseSecurityAdapter;

    view = await mount(security(adapter));
    await flush();
    expect(byTestId(view.host, "passkey-row-a")).toBeTruthy();

    items = [];
    await click(byTestId(view.host, "passkeys-refresh"));
    await flush();
    expect(view.host.querySelector("[data-test-id='passkey-row-a']")).toBeNull();
    expect(byTestId(view.host, "passkeys-empty")).toBeTruthy();
  });

  it("keeps known rows, actions, and the presence owner mounted after a rejected refresh", async () => {
    const adapter = {
      loadPasskeys: vi.fn()
        .mockResolvedValueOnce([keyA])
        .mockRejectedValueOnce(new Error("offline"))
        .mockResolvedValueOnce([keyA]),
    } as unknown as EnterpriseSecurityAdapter;

    view = await mount(security(adapter));
    await flush();
    const region = byTestId(view.host, "passkeys-list-region");
    const row = byTestId(view.host, "passkey-row-a");

    await click(byTestId(view.host, "passkeys-refresh"));
    await flush();
    expect(byTestId(view.host, "passkeys-list-region")).toBe(region);
    expect(byTestId(view.host, "passkey-row-a")).toBe(row);
    expect(byTestId(view.host, "passkey-delete-btn-a")).toBeTruthy();
    expect(view.host.querySelector("[data-test-id='passkeys-load-missing']")).toBeNull();
    expect(view.host.textContent).not.toContain(labels.security.passkeysLoadFailed);

    await click(byTestId(view.host, "passkeys-refresh"));
    await flush();
    expect(byTestId(view.host, "passkeys-list-region")).toBe(region);
    expect(byTestId(view.host, "passkey-row-a")).toBe(row);
    expect(adapter.loadPasskeys).toHaveBeenCalledTimes(3);
  });

  it("removes a successfully deleted row before a rejected follow-up reload", async () => {
    const failure = vi.spyOn(toast, "error");
    const adapter = {
      loadPasskeys: vi.fn()
        .mockResolvedValueOnce([keyA])
        .mockRejectedValueOnce(new Error("offline")),
      deletePasskey: vi.fn().mockResolvedValue(undefined),
    } as unknown as EnterpriseSecurityAdapter;

    view = await mount(security(adapter));
    await flush();
    await act(async () => vi.advanceTimersByTime(60));

    await click(byTestId(view.host, "passkey-delete-btn-a"));
    await click(byTestId(document, "passkey-delete-confirm"));
    await flush();

    expect(adapter.deletePasskey).toHaveBeenCalledWith("a");
    expect(adapter.loadPasskeys).toHaveBeenCalledTimes(2);
    expect(byTestId(view.host, "passkeys-empty")).toBeTruthy();
    expect(byTestId(view.host, "passkey-row-a").getAttribute("data-presence-phase")).toBe("exit");
    expect(failure).toHaveBeenCalledWith(labels.security.passkeysLoadFailed);
    await act(async () => vi.advanceTimersByTime(60));
    expect(view.host.querySelector("[data-test-id='passkey-row-a']")).toBeNull();
  });

  it("deletes a retained row after an earlier refresh failure even when revalidation fails again", async () => {
    const adapter = {
      loadPasskeys: vi.fn()
        .mockResolvedValueOnce([keyA])
        .mockRejectedValueOnce(new Error("offline before delete"))
        .mockRejectedValueOnce(new Error("offline after delete")),
      deletePasskey: vi.fn().mockResolvedValue(undefined),
    } as unknown as EnterpriseSecurityAdapter;

    view = await mount(security(adapter));
    await flush();
    await act(async () => vi.advanceTimersByTime(60));
    await click(byTestId(view.host, "passkeys-refresh"));
    await flush();
    expect(byTestId(view.host, "passkey-row-a")).toBeTruthy();

    await click(byTestId(view.host, "passkey-delete-btn-a"));
    await click(byTestId(document, "passkey-delete-confirm"));
    await flush();

    expect(adapter.loadPasskeys).toHaveBeenCalledTimes(3);
    expect(byTestId(view.host, "passkeys-empty")).toBeTruthy();
    expect(byTestId(view.host, "passkey-row-a").getAttribute("data-presence-phase")).toBe("exit");
    await act(async () => vi.advanceTimersByTime(60));
    expect(view.host.querySelector("[data-test-id='passkey-row-a']")).toBeNull();
  });

  it("keeps the row and skips revalidation when deletion itself is rejected", async () => {
    const failure = vi.spyOn(toast, "error");
    const adapter = {
      loadPasskeys: vi.fn().mockResolvedValue([keyA]),
      deletePasskey: vi.fn().mockRejectedValue(new Error("delete rejected")),
    } as unknown as EnterpriseSecurityAdapter;

    view = await mount(security(adapter));
    await flush();
    const row = byTestId(view.host, "passkey-row-a");
    await click(byTestId(view.host, "passkey-delete-btn-a"));
    await click(byTestId(document, "passkey-delete-confirm"));
    await flush();

    expect(byTestId(view.host, "passkey-row-a")).toBe(row);
    expect(adapter.loadPasskeys).toHaveBeenCalledTimes(1);
    expect(failure).toHaveBeenCalledWith(labels.security.passkeyOperationFailed);
  });

  it("ignores an older refresh that resolves after a successful deletion", async () => {
    const olderRefresh = deferred<readonly EnterprisePasskeyItem[]>();
    const adapter = {
      loadPasskeys: vi.fn()
        .mockResolvedValueOnce([keyA])
        .mockImplementationOnce(() => olderRefresh.promise)
        .mockResolvedValueOnce([]),
      deletePasskey: vi.fn().mockResolvedValue(undefined),
    } as unknown as EnterpriseSecurityAdapter;

    view = await mount(security(adapter));
    await flush();
    await act(async () => vi.advanceTimersByTime(60));

    await click(byTestId(view.host, "passkeys-refresh"));
    await flush();
    await click(byTestId(view.host, "passkey-delete-btn-a"));
    await click(byTestId(document, "passkey-delete-confirm"));
    await flush();
    await act(async () => vi.advanceTimersByTime(60));
    expect(view.host.querySelector("[data-test-id='passkey-row-a']")).toBeNull();

    await act(async () => olderRefresh.resolve([keyA]));
    await flush();

    expect(adapter.loadPasskeys).toHaveBeenCalledTimes(3);
    expect(view.host.querySelector("[data-test-id='passkey-row-a']")).toBeNull();
    expect(byTestId(view.host, "passkeys-empty")).toBeTruthy();
  });

  it("does not restore a deleted row from a replica-stale follow-up load", async () => {
    const adapter = {
      loadPasskeys: vi.fn()
        .mockResolvedValueOnce([keyA])
        .mockResolvedValueOnce([keyA]),
      deletePasskey: vi.fn().mockResolvedValue(undefined),
    } as unknown as EnterpriseSecurityAdapter;

    view = await mount(security(adapter));
    await flush();
    await act(async () => vi.advanceTimersByTime(60));
    await click(byTestId(view.host, "passkey-delete-btn-a"));
    await click(byTestId(document, "passkey-delete-confirm"));
    await flush();
    await act(async () => vi.advanceTimersByTime(60));

    expect(adapter.loadPasskeys).toHaveBeenCalledTimes(2);
    expect(view.host.querySelector("[data-test-id='passkey-row-a']")).toBeNull();
    expect(byTestId(view.host, "passkeys-empty")).toBeTruthy();
  });
});
