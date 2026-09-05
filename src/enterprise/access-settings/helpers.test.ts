/**
 * User risk: these four helpers decide which pane opens, what the OIDC provider
 * is told to call back on, whether a stored secret survives a blank box, and
 * whether a superseded load is allowed to overwrite fresher state.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { toast } from "../../toast";
import {
  computeRedirectUri,
  createOutcomeReporter,
  pickTab,
  runLoadEffect,
  writeOnlyCredential,
  type AccessSettingsTab,
} from "./helpers";

const bothTabs: AccessSettingsTab[] = ["login", "permissions"];

/** Lets the load promise's then / catch / finally chain drain before asserting. */
function settlePromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("pickTab", () => {
  it("keeps the user's own choice while it is still visible", () => {
    expect(pickTab(bothTabs, "permissions", "login")).toBe("permissions");
  });

  it("falls back to the host's preferred tab before the first click", () => {
    expect(pickTab(bothTabs, null, "permissions")).toBe("permissions");
  });

  it("never opens a tab the permissions hid, even if it was selected or preferred", () => {
    expect(pickTab(["permissions"], "login", "login")).toBe("permissions");
  });

  it("returns null when no tab is visible, so the caller can render the denial state", () => {
    expect(pickTab([], "login", "login")).toBeNull();
  });
});

describe("computeRedirectUri", () => {
  it("appends the callback path to the trimmed base URL", () => {
    expect(computeRedirectUri("  https://app.example.com  ")).toBe("https://app.example.com/api/v1/auth/oidc/callback");
  });

  it("collapses trailing slashes so the provider never sees a doubled separator", () => {
    expect(computeRedirectUri("https://app.example.com///")).toBe("https://app.example.com/api/v1/auth/oidc/callback");
  });

  it("stays empty for an empty base instead of publishing a bare callback path", () => {
    expect(computeRedirectUri("   ")).toBe("");
  });
});

describe("writeOnlyCredential", () => {
  it("sends nothing for a blank box, so the stored credential survives a save", () => {
    expect(writeOnlyCredential({ value: "", clear: false })).toBeUndefined();
  });

  it("sends an empty string only when the user explicitly asked to clear it", () => {
    expect(writeOnlyCredential({ value: "", clear: true })).toBe("");
    expect(writeOnlyCredential({ value: "typed", clear: true })).toBe("");
  });

  it("passes a typed secret through untouched", () => {
    expect(writeOnlyCredential({ value: "token", clear: false })).toBe("token");
  });
});

describe("createOutcomeReporter", () => {
  it("paints inline hosts and leaves the toast bus alone", () => {
    const success = vi.spyOn(toast, "success");
    const error = vi.spyOn(toast, "error");
    const setResult = vi.fn();

    createOutcomeReporter(false, setResult)({ ok: true, message: "saved" });

    expect(setResult).toHaveBeenCalledWith({ ok: true, message: "saved" });
    expect(success).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("routes toast hosts to the matching variant and never rewrites the page", () => {
    const success = vi.spyOn(toast, "success").mockReturnValue("id");
    const error = vi.spyOn(toast, "error").mockReturnValue("id");
    const setResult = vi.fn();
    const report = createOutcomeReporter(true, setResult);

    report({ ok: true, message: "saved" });
    report({ ok: false, message: "failed" });

    expect(success).toHaveBeenCalledWith("saved");
    expect(error).toHaveBeenCalledWith("failed");
    expect(setResult).not.toHaveBeenCalled();
  });
});

describe("runLoadEffect", () => {
  it("hands the value and the settled signal to the panel", async () => {
    const handlers = { onValue: vi.fn(), onError: vi.fn(), onSettled: vi.fn() };

    runLoadEffect(() => Promise.resolve("value"), handlers);
    await settlePromises();

    expect(handlers.onValue).toHaveBeenCalledWith("value");
    expect(handlers.onError).not.toHaveBeenCalled();
    expect(handlers.onSettled).toHaveBeenCalledTimes(1);
  });

  it("reports a rejected load as an error and still settles", async () => {
    const handlers = { onValue: vi.fn(), onError: vi.fn(), onSettled: vi.fn() };

    runLoadEffect(() => Promise.reject(new Error("boom")), handlers);
    await settlePromises();

    expect(handlers.onValue).not.toHaveBeenCalled();
    expect(handlers.onError).toHaveBeenCalledTimes(1);
    expect(handlers.onSettled).toHaveBeenCalledTimes(1);
  });

  it("drops a superseded response: a cleaned-up load never writes state", async () => {
    const handlers = { onValue: vi.fn(), onError: vi.fn(), onSettled: vi.fn() };

    const cleanup = runLoadEffect(() => Promise.resolve("late"), handlers);
    cleanup();
    await settlePromises();

    expect(handlers.onValue).not.toHaveBeenCalled();
    expect(handlers.onSettled).not.toHaveBeenCalled();
  });
});
