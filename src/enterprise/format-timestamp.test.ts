/**
 * FE-BUG-11: formatEnterpriseTimestamp defaults to browser-local and accepts
 * injected formatter / timeZone. The Customs host must pass one of these props;
 * this suite locks the shared seam and the LA vs Shanghai counterexample.
 */
import { expect, it } from "vitest";

import { formatEnterpriseTimestamp } from "./format-timestamp";

// 2026-12-31T18:30:00Z → Shanghai 2027-01-01 02:30; LA (PST) 2026-12-31 10:30
const iso = "2026-12-31T18:30:00.000Z";

it("default formatter returns a non-empty string for a valid date", () => {
  const local = formatEnterpriseTimestamp(iso, { locale: "en-US", empty: "—" });
  expect(typeof local).toBe("string");
  expect(local.length).toBeGreaterThan(0);
  expect(local).not.toBe("—");
});

it("timeZone prop moves the business date (Shanghai vs LA counterexample)", () => {
  const shanghai = formatEnterpriseTimestamp(iso, {
    locale: "en-US",
    empty: "—",
    timeZone: "Asia/Shanghai",
  });
  // 18:30 UTC = 02:30 next day Shanghai
  expect(shanghai.includes("2:30") || shanghai.includes("02:30")).toBe(true);
  expect(shanghai.includes("1") || shanghai.includes("1/")).toBe(true);

  const la = formatEnterpriseTimestamp(iso, {
    locale: "en-US",
    empty: "—",
    timeZone: "America/Los_Angeles",
  });
  expect(la).toContain("10:30");

  // The product bug: browser-local LA differs from Shanghai business date.
  expect(shanghai).not.toBe(la);
});

it("formatTimestamp prop wins over timeZone/local", () => {
  const injected = formatEnterpriseTimestamp(iso, {
    locale: "zh-CN",
    empty: "—",
    timeZone: "America/Los_Angeles",
    formatTimestamp: () => "SHANGHAI-INJECTED",
  });
  expect(injected).toBe("SHANGHAI-INJECTED");
});

it("invalid date uses the empty sentinel", () => {
  expect(formatEnterpriseTimestamp("not-a-date", { locale: "en", empty: "—" })).toBe("—");
});
