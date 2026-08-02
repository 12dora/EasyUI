"use client";

/**
 * Locale-aware relative time shared by enterprise surfaces (upstream health card,
 * notification list). Absolute timestamps stay a host concern: business timezone
 * belongs to the host, so callers pass a pre-formatted `absoluteLabel`.
 *
 * FE-PERF-12: one `Intl.RelativeTimeFormat` per resolved locale (module cache).
 */

const relativeTimeFormatters = new Map<string, Intl.RelativeTimeFormat>();

function formatterFor(locale: string | undefined): Intl.RelativeTimeFormat {
  const key = resolveLocale(locale) ?? "";
  let formatter = relativeTimeFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.RelativeTimeFormat(key || undefined, { numeric: "auto" });
    relativeTimeFormatters.set(key, formatter);
  }
  return formatter;
}

export function relativeTime(value: string | null | undefined, locale: string | undefined, now: number = Date.now()): string | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  if (Number.isNaN(parsed)) return null;
  const formatter = formatterFor(locale);
  const seconds = Math.round((parsed - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return formatter.format(Math.min(seconds, 0), "second");
  if (abs < 3600) return formatter.format(Math.trunc(seconds / 60), "minute");
  if (abs < 86400) return formatter.format(Math.trunc(seconds / 3600), "hour");
  return formatter.format(Math.trunc(seconds / 86400), "day");
}

function resolveLocale(locale: string | undefined): string | undefined {
  if (!locale) return undefined;
  return locale.startsWith("zh") ? "zh-CN" : "en";
}

/**
 * Relative age on screen, absolute time in the tooltip — the presentation the
 * customs data badges already use. Renders nothing when the host has no time.
 */
export function RelativeTimestamp({ value, absoluteLabel, locale, className, testId }: { value?: string | null; absoluteLabel?: string | null; locale?: string; className?: string; testId?: string }) {
  const relative = relativeTime(value, locale);
  const text = relative ?? absoluteLabel;
  if (!text) return null;
  return (
    <time dateTime={value ?? undefined} title={absoluteLabel ?? undefined} className={className} data-test-id={testId}>
      {text}
    </time>
  );
}
