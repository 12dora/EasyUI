/**
 * FE-PERF-12: prove RelativeTimeFormat is constructed via the module cache,
 * not once per relativeTime() call. Spies the real constructor so a regression
 * that restores `new Intl.RelativeTimeFormat(...)` inside relativeTime fails
 * even if a dead Map helper remains.
 *
 * Run: npx tsx src/enterprise/relative-time.test.ts
 */
import { relativeTime } from "./relative-time";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const OriginalRTF = Intl.RelativeTimeFormat;
let constructCount = 0;

// @ts-expect-error test spy on built-in
Intl.RelativeTimeFormat = class extends OriginalRTF {
  constructor(...args: ConstructorParameters<typeof Intl.RelativeTimeFormat>) {
    super(...args);
    constructCount += 1;
  }
};

try {
  // Fresh module state is not guaranteed across reloads; measure delta only.
  const before = constructCount;
  const now = Date.parse("2026-08-01T12:00:00.000Z");
  const fiveMinutesAgo = new Date(now - 5 * 60 * 1000).toISOString();

  // 50 calls across locale variants must resolve to at most two formatters
  // (zh-CN and en) and must not construct per call.
  for (let i = 0; i < 50; i += 1) {
    const locale = (["zh-CN", "zh-HK", "zh-TW", "en", "en-US", "en-GB"] as const)[i % 6];
    const text = relativeTime(fiveMinutesAgo, locale, now);
    assert(typeof text === "string" && text.length > 0, `expected formatted relative time for ${locale}`);
  }

  const grew = constructCount - before;
  assert(grew <= 2, `expected ≤2 RelativeTimeFormat constructions for 50 calls, got ${grew}`);

  // Invalid / missing timestamps must not allocate formatters.
  const mid = constructCount;
  assert(relativeTime(null, "en", now) === null, "null value returns null");
  assert(relativeTime(undefined, "zh-CN", now) === null, "undefined value returns null");
  assert(relativeTime("not-a-date", "en", now) === null, "invalid date returns null");
  assert(constructCount === mid, "invalid inputs must not construct formatters");

  // Repeat the same resolved locales — zero new constructions.
  const mid2 = constructCount;
  relativeTime(fiveMinutesAgo, "zh-CN", now);
  relativeTime(fiveMinutesAgo, "en-US", now);
  assert(constructCount === mid2, "repeat locales must reuse cached formatters");

  console.log("relative-time.test.ts: ok");
} finally {
  // @ts-expect-error restore the built-in spied on above
  Intl.RelativeTimeFormat = OriginalRTF;
}
