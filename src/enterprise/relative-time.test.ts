/**
 * FE-PERF-12: prove RelativeTimeFormat is constructed via the module cache,
 * not once per relativeTime() call. Spies the real constructor so a regression
 * that restores `new Intl.RelativeTimeFormat(...)` inside relativeTime fails
 * even if a dead Map helper remains.
 */
import { afterAll, expect, it } from "vitest";

import { relativeTime } from "./relative-time";

const OriginalRTF = Intl.RelativeTimeFormat;
let constructCount = 0;

// @ts-expect-error test spy on built-in
Intl.RelativeTimeFormat = class extends OriginalRTF {
  constructor(...args: ConstructorParameters<typeof Intl.RelativeTimeFormat>) {
    super(...args);
    constructCount += 1;
  }
};

afterAll(() => {
  // @ts-expect-error restore the built-in spied on above
  Intl.RelativeTimeFormat = OriginalRTF;
});

const now = Date.parse("2026-08-01T12:00:00.000Z");
const fiveMinutesAgo = new Date(now - 5 * 60 * 1000).toISOString();

it("reuses cached formatters across 50 calls and 6 locale variants", () => {
  // Fresh module state is not guaranteed across reloads; measure delta only.
  const before = constructCount;

  // 50 calls across locale variants must resolve to at most two formatters
  // (zh-CN and en) and must not construct per call.
  for (let i = 0; i < 50; i += 1) {
    const locale = (["zh-CN", "zh-HK", "zh-TW", "en", "en-US", "en-GB"] as const)[i % 6];
    const text = relativeTime(fiveMinutesAgo, locale, now);
    expect(typeof text).toBe("string");
    expect((text as string).length).toBeGreaterThan(0);
  }

  expect(constructCount - before).toBeLessThanOrEqual(2);
});

it("invalid inputs return null and never allocate formatters", () => {
  const mid = constructCount;
  expect(relativeTime(null, "en", now)).toBeNull();
  expect(relativeTime(undefined, "zh-CN", now)).toBeNull();
  expect(relativeTime("not-a-date", "en", now)).toBeNull();
  expect(constructCount).toBe(mid);
});

it("repeat locales reuse cached formatters with zero new constructions", () => {
  relativeTime(fiveMinutesAgo, "zh-CN", now);
  relativeTime(fiveMinutesAgo, "en-US", now);
  const mid = constructCount;
  relativeTime(fiveMinutesAgo, "zh-CN", now);
  relativeTime(fiveMinutesAgo, "en-US", now);
  expect(constructCount).toBe(mid);
});
