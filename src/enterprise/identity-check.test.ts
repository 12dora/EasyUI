import { describe, expect, it, vi } from "vitest";

import {
  buildIdentityCheckMessage,
  createIdentityCheckScheduler,
  deliverIdentityCheckOutcome,
  parseSilentIdentityResult,
  readIdentityCheckMessage,
  IDENTITY_CHECK_MESSAGE_TYPE,
  type IdentityCheckOutcome,
} from "./identity-check";

describe("parseSilentIdentityResult", () => {
  it("reads the authenticated hash and ignores unrelated params", () => {
    expect(parseSilentIdentityResult("#outcome=authenticated&token=jwt-1&account=acc-7&state=xyz&next=%2Fapp")).toEqual({
      outcome: "authenticated",
      token: "jwt-1",
      accountId: "acc-7",
    });
  });

  it("accepts a fragment without the leading hash", () => {
    expect(parseSilentIdentityResult("outcome=logged_out&kind=login_required")).toEqual({ outcome: "logged_out", kind: "login_required" });
  });

  it("degrades a missing or unknown outcome to error/malformed", () => {
    for (const hash of ["", "#", "#token=jwt-1&account=acc-7", "#outcome=", "#outcome=whatever"]) {
      expect(parseSilentIdentityResult(hash)).toEqual({ outcome: "error", kind: "malformed" });
    }
  });

  it("refuses an authenticated result that is missing the token or the account", () => {
    expect(parseSilentIdentityResult("#outcome=authenticated&account=acc-7")).toEqual({ outcome: "error", kind: "malformed" });
    expect(parseSilentIdentityResult("#outcome=authenticated&token=jwt-1")).toEqual({ outcome: "error", kind: "malformed" });
    expect(parseSilentIdentityResult("#outcome=authenticated&token=%20&account=acc-7")).toEqual({ outcome: "error", kind: "malformed" });
  });

  it("keeps only short identifier kinds and folds anything else into unknown", () => {
    expect(parseSilentIdentityResult("#outcome=error&kind=State_Mismatch")).toEqual({ outcome: "error", kind: "state_mismatch" });
    expect(parseSilentIdentityResult("#outcome=logged_out")).toEqual({ outcome: "logged_out", kind: "unknown" });
    expect(parseSilentIdentityResult("#outcome=error&kind=%3Cimg%20src%3Dx%3E")).toEqual({ outcome: "error", kind: "unknown" });
    expect(parseSilentIdentityResult(`#outcome=error&kind=${"a".repeat(65)}`)).toEqual({ outcome: "error", kind: "unknown" });
  });
});

describe("identity-check messages", () => {
  it("wraps an outcome with the shared type and carries no extra fields", () => {
    expect(buildIdentityCheckMessage({ outcome: "authenticated", token: "jwt-1", accountId: "acc-7" })).toEqual({
      type: IDENTITY_CHECK_MESSAGE_TYPE,
      outcome: "authenticated",
      token: "jwt-1",
      accountId: "acc-7",
    });
  });

  it("round-trips a parsed hash through the message payload", () => {
    const parsed = parseSilentIdentityResult("#outcome=logged_out&kind=login_required");
    expect(readIdentityCheckMessage(buildIdentityCheckMessage(parsed))).toEqual(parsed);
  });

  it("returns null for anything that is not one of our messages", () => {
    expect(readIdentityCheckMessage(null)).toBeNull();
    expect(readIdentityCheckMessage("easy-enterprise:identity-check")).toBeNull();
    expect(readIdentityCheckMessage({ outcome: "logged_out" })).toBeNull();
    expect(readIdentityCheckMessage({ type: "other", outcome: "logged_out" })).toBeNull();
  });

  it("normalizes a malformed payload of the right type instead of trusting it", () => {
    expect(readIdentityCheckMessage({ type: IDENTITY_CHECK_MESSAGE_TYPE, outcome: "authenticated", token: 42, accountId: "acc-7" })).toEqual({
      outcome: "error",
      kind: "malformed",
    });
  });
});

describe("deliverIdentityCheckOutcome", () => {
  it("routes each outcome to exactly one handler and tolerates a missing onError", () => {
    const handlers = { onAuthenticated: vi.fn(), onLoggedOut: vi.fn(), onError: vi.fn() };
    deliverIdentityCheckOutcome({ outcome: "authenticated", token: "jwt-1", accountId: "acc-7" }, handlers);
    deliverIdentityCheckOutcome({ outcome: "logged_out", kind: "login_required" }, handlers);
    deliverIdentityCheckOutcome({ outcome: "error", kind: "timeout" }, handlers);
    expect(handlers.onAuthenticated).toHaveBeenCalledExactlyOnceWith({ token: "jwt-1", accountId: "acc-7" });
    expect(handlers.onLoggedOut).toHaveBeenCalledExactlyOnceWith({ kind: "login_required" });
    expect(handlers.onError).toHaveBeenCalledExactlyOnceWith({ kind: "timeout" });
    expect(() => deliverIdentityCheckOutcome({ outcome: "error", kind: "timeout" }, { onAuthenticated: vi.fn(), onLoggedOut: vi.fn() })).not.toThrow();
  });
});

interface Pending { resolve(outcome: IdentityCheckOutcome): void }

function createHarness({ intervalMs = 1000, visibilityThrottleMs = 500 } = {}) {
  let time = 0;
  let visible = true;
  const timers = new Map<number, { at: number; callback: () => void }>();
  let nextTimer = 1;
  const pending: Pending[] = [];
  const runCheck = vi.fn(() => new Promise<IdentityCheckOutcome>((resolve) => { pending.push({ resolve }); }));
  const scheduler = createIdentityCheckScheduler({
    runCheck,
    isVisible: () => visible,
    now: () => time,
    schedule: (callback, delayMs) => {
      const id = nextTimer++;
      timers.set(id, { at: time + delayMs, callback });
      return () => timers.delete(id);
    },
    intervalMs,
    visibilityThrottleMs,
  });
  async function advance(ms: number) {
    time += ms;
    for (const [id, timer] of [...timers]) {
      if (timer.at > time) continue;
      timers.delete(id);
      timer.callback();
    }
    await Promise.resolve();
  }
  async function settleCheck(outcome: IdentityCheckOutcome) {
    const next = pending.shift();
    if (!next) throw new Error("no check in flight");
    next.resolve(outcome);
    await Promise.resolve();
    await Promise.resolve();
  }
  return { scheduler, runCheck, advance, settleCheck, setVisible: (value: boolean) => { visible = value; }, pendingCount: () => pending.length };
}

const AUTHENTICATED: IdentityCheckOutcome = { outcome: "authenticated", token: "jwt-1", accountId: "acc-7" };

describe("createIdentityCheckScheduler", () => {
  it("checks once on start and then once per interval while visible", async () => {
    const harness = createHarness();
    harness.scheduler.start();
    expect(harness.runCheck).toHaveBeenCalledTimes(1);
    await harness.settleCheck(AUTHENTICATED);
    await harness.advance(1000);
    expect(harness.runCheck).toHaveBeenCalledTimes(2);
    await harness.settleCheck(AUTHENTICATED);
    await harness.advance(1000);
    expect(harness.runCheck).toHaveBeenCalledTimes(3);
  });

  it("skips interval ticks while the tab is hidden but keeps ticking afterwards", async () => {
    const harness = createHarness();
    harness.scheduler.start();
    await harness.settleCheck(AUTHENTICATED);
    harness.setVisible(false);
    await harness.advance(1000);
    expect(harness.runCheck).toHaveBeenCalledTimes(1);
    harness.setVisible(true);
    await harness.advance(1000);
    expect(harness.runCheck).toHaveBeenCalledTimes(2);
  });

  it("throttles visibility re-checks by the completion time", async () => {
    const harness = createHarness();
    harness.scheduler.start();
    await harness.settleCheck(AUTHENTICATED);
    await harness.advance(499);
    harness.scheduler.handleVisible();
    expect(harness.runCheck).toHaveBeenCalledTimes(1);
    await harness.advance(1);
    harness.scheduler.handleVisible();
    expect(harness.runCheck).toHaveBeenCalledTimes(2);
  });

  it("coalesces concurrent triggers into the single in-flight check", async () => {
    const harness = createHarness();
    harness.scheduler.start();
    const first = harness.scheduler.runNow();
    harness.scheduler.handleVisible();
    const second = harness.scheduler.runNow();
    expect(harness.runCheck).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
    await harness.settleCheck(AUTHENTICATED);
    await expect(first).resolves.toEqual(AUTHENTICATED);
  });

  it("runs an imperative check even inside the visibility throttle window", async () => {
    const harness = createHarness();
    harness.scheduler.start();
    await harness.settleCheck(AUTHENTICATED);
    const manual = harness.scheduler.runNow();
    expect(harness.runCheck).toHaveBeenCalledTimes(2);
    await harness.settleCheck({ outcome: "logged_out", kind: "login_required" });
    await expect(manual).resolves.toEqual({ outcome: "logged_out", kind: "login_required" });
  });

  it("stops the interval on stop and ignores a double start", async () => {
    const harness = createHarness();
    harness.scheduler.start();
    harness.scheduler.start();
    expect(harness.runCheck).toHaveBeenCalledTimes(1);
    await harness.settleCheck(AUTHENTICATED);
    harness.scheduler.stop();
    await harness.advance(5000);
    expect(harness.runCheck).toHaveBeenCalledTimes(1);
  });
});
