"use client";

import { useEffect, useState } from "react";
import type { EnterpriseGeneralSettingsValue } from "./general-settings-surface";

/** Dispatched after a successful save so every mounted shell re-brands immediately. */
export const ENTERPRISE_GENERAL_UPDATED_EVENT = "enterprise-starter:general-updated";

export type EnterpriseBrandLocale = "zh-CN" | "en";

export interface EnterpriseBrandFallback {
  title: string;
  subtitle?: string | null;
  logoSrc?: string | null;
}

export interface EnterpriseResolvedBrand {
  title: string;
  subtitle: string | null;
  logoSrc: string | null;
}

const BLANK_SETTINGS: EnterpriseGeneralSettingsValue = {
  titleZh: "",
  titleEn: "",
  subtitleZh: "",
  subtitleEn: "",
  footerHtmlZh: "",
  footerHtmlEn: "",
  logoDataUrl: null,
};

// Module-level cache + single in-flight promise: the general settings are one
// public GET shared by the topbar, the footer and the login page, so a route
// change must not refetch it and three mounted consumers must not race.
let cachedSettings: EnterpriseGeneralSettingsValue | null = null;
let inFlight: Promise<EnterpriseGeneralSettingsValue> | null = null;
// Request generation. A save (prime), a host-dispatched update or a reset makes
// every request started before it obsolete: without this a GET that was already
// on the wire when the administrator saved would land afterwards and put the old
// brand back — or report a load failure on top of a value we already have.
let generation = 0;
// Every mounted consumer, not only the ones attached to the request that happens
// to be on the wire. One shared GET means one shared result: a consumer whose own
// request failed earlier must still pick up the value a later retry brought in,
// otherwise it stays stuck on `error: true` until it remounts.
const subscribers = new Set<(value: EnterpriseGeneralSettingsValue) => void>();

function nonEmpty(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  return text.length > 0 ? value ?? null : null;
}

/** Hand a freshly known value to every mounted consumer. */
function announce(value: EnterpriseGeneralSettingsValue): void {
  for (const subscriber of [...subscribers]) subscriber(value);
}

function publish(value: EnterpriseGeneralSettingsValue): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ENTERPRISE_GENERAL_UPDATED_EVENT, { detail: value }));
}

/** Abandon every request currently on the wire; their results must not be applied. */
function invalidateInFlight(): void {
  generation += 1;
  inFlight = null;
}

/** Seed (or replace) the shared cache — used by settings pages after a save and by SSR handoff. */
export function primeEnterpriseGeneralSettings(value: EnterpriseGeneralSettingsValue): void {
  cachedSettings = value;
  invalidateInFlight();
  publish(value);
}

/**
 * Read the shared general settings.
 *
 * The first caller triggers `load()`; later callers reuse the cache or attach to
 * the in-flight promise. A failure is reported as `error: true` and never cached,
 * so a retry can still succeed — and because a successful result is broadcast to
 * every mounted consumer, that retry may just as well come from a different one:
 * the topbar recovers when the footer's later request succeeds, without a reload.
 */
export function useEnterpriseGeneralSettings(
  load: () => Promise<EnterpriseGeneralSettingsValue>,
): { settings: EnterpriseGeneralSettingsValue | null; error: boolean } {
  const [settings, setSettings] = useState<EnterpriseGeneralSettingsValue | null>(cachedSettings);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    const apply = (value: EnterpriseGeneralSettingsValue) => {
      setSettings(value);
      setError(false);
    };
    // Subscribing before the request starts is what makes the result shared:
    // whichever consumer's `load()` wins, everybody gets the answer.
    subscribers.add(apply);
    const onUpdated = (event: Event) => {
      const detail = (event as CustomEvent<EnterpriseGeneralSettingsValue>).detail;
      if (!detail) return;
      cachedSettings = detail;
      invalidateInFlight();
      apply(detail);
    };
    window.addEventListener(ENTERPRISE_GENERAL_UPDATED_EVENT, onUpdated);
    if (cachedSettings) {
      apply(cachedSettings);
    } else {
      inFlight ??= load();
      // Both callbacks are gated on the generation the request was started in:
      // a primed value wins over anything that was already in flight.
      const request = generation;
      void inFlight.then(
        (value) => {
          if (request !== generation) return;
          cachedSettings = value;
          inFlight = null;
          announce(value);
        },
        () => {
          if (request !== generation) return;
          inFlight = null;
          // A failure belongs to the consumer that asked: it is never cached and
          // never broadcast, so a later successful retry can clear it.
          if (active) setError(true);
        },
      );
    }
    return () => {
      active = false;
      subscribers.delete(apply);
      window.removeEventListener(ENTERPRISE_GENERAL_UPDATED_EVENT, onUpdated);
    };
  }, [load]);
  return { settings, error };
}

/**
 * Test/host seam: drop the module cache so the next consumer refetches. The
 * remembered host default logo goes with it; the next brand resolution — the
 * topbar renders on every page — registers it again.
 */
export function resetEnterpriseGeneralSettings(): void {
  cachedSettings = null;
  defaultBrandLogo = null;
  invalidateInFlight();
}

// The host's own default logo, learned from the brand fallback rather than from
// a second piece of host wiring: every shell already hands its bundled asset to
// `resolveEnterpriseBrand`. The general settings page reads it back so the Logo
// control can preview the logo the application is actually rendering while no
// custom one is stored.
let defaultBrandLogo: string | null = null;
const defaultBrandLogoSubscribers = new Set<(src: string | null) => void>();

/**
 * Remember the host's default logo. Called by `resolveEnterpriseBrand`; hosts
 * only need this directly when they brand a shell without that resolver.
 */
export function registerEnterpriseDefaultBrandLogo(src: string | null | undefined): void {
  const next = nonEmpty(src);
  if (next === defaultBrandLogo) return;
  defaultBrandLogo = next;
  const listeners = [...defaultBrandLogoSubscribers];
  // Registration happens while the topbar renders, so a synchronous notification
  // would update the settings page from inside another component's render pass.
  queueMicrotask(() => {
    for (const listener of listeners) listener(next);
  });
}

/** The remembered host default logo, or null when nothing has branded a shell yet. */
export function getEnterpriseDefaultBrandLogo(): string | null {
  return defaultBrandLogo;
}

/**
 * Subscribe to the remembered host default logo.
 *
 * The first render always reports `null` so a server-rendered page and its
 * hydration agree; the value arrives in an effect, and later registrations
 * (a shell mounted after this consumer) are pushed in.
 */
export function useEnterpriseDefaultBrandLogo(): string | null {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    setSrc(defaultBrandLogo);
    defaultBrandLogoSubscribers.add(setSrc);
    return () => {
      defaultBrandLogoSubscribers.delete(setSrc);
    };
  }, []);
  return src;
}

/**
 * Per-locale brand for the topbar slot. Empty settings strings mean "use the
 * host default", so each field falls back independently.
 *
 * The fallback logo is also remembered (`registerEnterpriseDefaultBrandLogo`):
 * it is the only place the package is told which logo the host ships, and the
 * general settings page needs it to preview the logo currently in use.
 */
export function resolveEnterpriseBrand(
  settings: EnterpriseGeneralSettingsValue | null,
  locale: EnterpriseBrandLocale,
  fallback: EnterpriseBrandFallback,
): EnterpriseResolvedBrand {
  const source = settings ?? BLANK_SETTINGS;
  const english = locale === "en";
  registerEnterpriseDefaultBrandLogo(fallback.logoSrc);
  return {
    title: nonEmpty(english ? source.titleEn : source.titleZh) ?? fallback.title,
    subtitle: nonEmpty(english ? source.subtitleEn : source.subtitleZh) ?? nonEmpty(fallback.subtitle),
    logoSrc: nonEmpty(source.logoDataUrl) ?? nonEmpty(fallback.logoSrc),
  };
}

/**
 * Configured footer HTML for a locale, or `undefined` when nothing is configured
 * so `EnterpriseConfiguredFooter` paints its fallback. `{year}` stays a render-time
 * substitution inside that component — it is never baked into the stored value.
 */
export function resolveEnterpriseFooterHtml(
  settings: EnterpriseGeneralSettingsValue | null,
  locale: EnterpriseBrandLocale,
): string | undefined {
  const source = settings ?? BLANK_SETTINGS;
  return nonEmpty(locale === "en" ? source.footerHtmlEn : source.footerHtmlZh) ?? undefined;
}
