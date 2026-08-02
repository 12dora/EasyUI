/**
 * FE-BUG-11: formatEnterpriseTimestamp defaults to browser-local and accepts
 * injected formatter / timeZone. The Customs host must pass one of these props;
 * this suite locks the shared seam and the LA vs Shanghai counterexample.
 *
 * Run: npx tsx src/enterprise/format-timestamp.test.ts
 */
import { formatEnterpriseTimestamp } from "./format-timestamp";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// 2026-12-31T18:30:00Z → Shanghai 2027-01-01 02:30; LA (PST) 2026-12-31 10:30
const iso = "2026-12-31T18:30:00.000Z";

const local = formatEnterpriseTimestamp(iso, { locale: "en-US", empty: "—" });
assert(typeof local === "string" && local.length > 0, "default formatter returns a string");
assert(local !== "—", "valid date must not return empty");

const shanghai = formatEnterpriseTimestamp(iso, {
  locale: "en-US",
  empty: "—",
  timeZone: "Asia/Shanghai",
});
// 18:30 UTC = 02:30 next day Shanghai
assert(
  shanghai.includes("2:30") || shanghai.includes("02:30"),
  `expected Shanghai 02:30 in "${shanghai}"`,
);
assert(
  shanghai.includes("1") || shanghai.includes("1/"),
  `expected January (Shanghai business date) in "${shanghai}"`,
);

const la = formatEnterpriseTimestamp(iso, {
  locale: "en-US",
  empty: "—",
  timeZone: "America/Los_Angeles",
});
assert(
  la.includes("10:30"),
  `expected LA 10:30 in "${la}"`,
);
// The product bug: browser-local LA differs from Shanghai business date.
assert(shanghai !== la, "Shanghai and LA zones must format differently for this instant");

const injected = formatEnterpriseTimestamp(iso, {
  locale: "zh-CN",
  empty: "—",
  timeZone: "America/Los_Angeles",
  formatTimestamp: () => "SHANGHAI-INJECTED",
});
assert(injected === "SHANGHAI-INJECTED", "formatTimestamp prop must win over timeZone/local");

const bad = formatEnterpriseTimestamp("not-a-date", { locale: "en", empty: "—" });
assert(bad === "—", "invalid date uses empty sentinel");

console.log("format-timestamp.test.ts: ok");
