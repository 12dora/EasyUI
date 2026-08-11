/**
 * Pins Dayjs → ISO-8601 wire serialization for local-account create / expiry-update.
 * Guards against regressions to local-naive strings (e.g. format('YYYY-MM-DDTHH:mm:ss')).
 */
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { expect, it } from "vitest";

import {
  mapCreateExpiresAt,
  mapExpiryUpdatePatch,
  serializeFormExpiresAt,
} from "./serialize";

dayjs.extend(utc);
dayjs.extend(timezone);

/** Timezone-aware ISO-8601 instant: ends with Z or ±HH:mm. */
const AWARE_ISO = /Z$|[+-]\d{2}:\d{2}$/;
/** Local-naive datetime without zone (forbidden on the wire). */
const NAIVE_LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

it("serializeFormExpiresAt emits a timezone-aware ISO instant from a non-UTC Dayjs", () => {
  // Wall clock 20:30 in Shanghai = 12:30 UTC on the same calendar day.
  const shanghai = dayjs.tz("2027-06-15 20:30:00", "Asia/Shanghai");
  const iso = serializeFormExpiresAt(shanghai);

  expect(iso).toMatch(AWARE_ISO);
  expect(iso).not.toMatch(NAIVE_LOCAL);
  // Round-trip: same epoch as the form value.
  expect(Date.parse(iso)).toBe(shanghai.valueOf());
  // Stable UTC form from Dayjs#toISOString.
  expect(iso).toBe("2027-06-15T12:30:00.000Z");
});

it("serializeFormExpiresAt preserves epoch for offset-parsed Dayjs values", () => {
  const offset = dayjs("2027-06-15T20:30:00+08:00");
  const iso = serializeFormExpiresAt(offset);
  expect(iso).toMatch(AWARE_ISO);
  expect(Date.parse(iso)).toBe(offset.valueOf());
  expect(iso).toBe("2027-06-15T12:30:00.000Z");
});

it("mapCreateExpiresAt includes ISO when Dayjs is present and omits when empty", () => {
  const shanghai = dayjs.tz("2027-06-15 20:30:00", "Asia/Shanghai");
  const withValue = mapCreateExpiresAt(shanghai);
  expect(withValue).toEqual({ expiresAt: "2027-06-15T12:30:00.000Z" });
  expect(Object.prototype.hasOwnProperty.call(withValue, "expiresAt")).toBe(true);
  expect(String((withValue as { expiresAt: string }).expiresAt)).toMatch(AWARE_ISO);

  // Permanent / cleared form → omit field (not null).
  expect(mapCreateExpiresAt(null)).toEqual({});
  expect(mapCreateExpiresAt(undefined)).toEqual({});
  expect(Object.prototype.hasOwnProperty.call(mapCreateExpiresAt(null), "expiresAt")).toBe(false);
});

it("mapExpiryUpdatePatch is tri-state set/clear (Dayjs → ISO, null → null)", () => {
  const shanghai = dayjs.tz("2027-06-15 20:30:00", "Asia/Shanghai");
  const set = mapExpiryUpdatePatch(shanghai);
  expect(set).toEqual({ expiresAt: "2027-06-15T12:30:00.000Z" });
  expect(String(set.expiresAt)).toMatch(AWARE_ISO);
  expect(Date.parse(String(set.expiresAt))).toBe(shanghai.valueOf());

  // Clear expiry → explicit null (not omit).
  const cleared = mapExpiryUpdatePatch(null);
  expect(cleared).toEqual({ expiresAt: null });
  expect(Object.prototype.hasOwnProperty.call(cleared, "expiresAt")).toBe(true);
  expect(JSON.stringify(cleared)).toBe(JSON.stringify({ expiresAt: null }));
});
