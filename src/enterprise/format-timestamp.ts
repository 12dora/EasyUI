/**
 * Host-injected absolute timestamp formatting for enterprise surfaces (FE-BUG-11).
 *
 * - Default: browser-local `Date.toLocaleString(locale)` (unchanged for EasyTrade / blank).
 * - `formatTimestamp`: full host control (Customs passes Shanghai formatter).
 * - `timeZone`: IANA zone when only a zone override is needed.
 */

export type EnterpriseTimestampFormatter = (value: string, locale: string) => string;

export type EnterpriseTimestampFormatOptions = {
  locale: string;
  empty: string;
  formatTimestamp?: EnterpriseTimestampFormatter;
  timeZone?: string;
};

export function formatEnterpriseTimestamp(value: string, opts: EnterpriseTimestampFormatOptions): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return opts.empty;
  if (opts.formatTimestamp) return opts.formatTimestamp(value, opts.locale);
  if (opts.timeZone) return date.toLocaleString(opts.locale, { timeZone: opts.timeZone });
  return date.toLocaleString(opts.locale);
}
