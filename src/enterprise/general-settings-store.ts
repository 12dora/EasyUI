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

function nonEmpty(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  return text.length > 0 ? value ?? null : null;
}

function publish(value: EnterpriseGeneralSettingsValue): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ENTERPRISE_GENERAL_UPDATED_EVENT, { detail: value }));
}

/** Seed (or replace) the shared cache — used by settings pages after a save and by SSR handoff. */
export function primeEnterpriseGeneralSettings(value: EnterpriseGeneralSettingsValue): void {
  cachedSettings = value;
  inFlight = null;
  publish(value);
}

/**
 * Read the shared general settings.
 *
 * The first caller triggers `load()`; later callers reuse the cache or attach to
 * the in-flight promise. A failure is reported as `error: true` and never cached,
 * so a retry (a remount or a later save event) can still succeed.
 */
export function useEnterpriseGeneralSettings(
  load: () => Promise<EnterpriseGeneralSettingsValue>,
): { settings: EnterpriseGeneralSettingsValue | null; error: boolean } {
  const [settings, setSettings] = useState<EnterpriseGeneralSettingsValue | null>(cachedSettings);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    const onUpdated = (event: Event) => {
      const detail = (event as CustomEvent<EnterpriseGeneralSettingsValue>).detail;
      if (!detail) return;
      cachedSettings = detail;
      if (!active) return;
      setSettings(detail);
      setError(false);
    };
    window.addEventListener(ENTERPRISE_GENERAL_UPDATED_EVENT, onUpdated);
    if (cachedSettings) {
      setSettings(cachedSettings);
    } else {
      inFlight ??= load();
      void inFlight.then(
        (value) => {
          cachedSettings = value;
          inFlight = null;
          if (!active) return;
          setSettings(value);
          setError(false);
        },
        () => {
          inFlight = null;
          if (active) setError(true);
        },
      );
    }
    return () => {
      active = false;
      window.removeEventListener(ENTERPRISE_GENERAL_UPDATED_EVENT, onUpdated);
    };
  }, [load]);
  return { settings, error };
}

/** Test/host seam: drop the module cache so the next consumer refetches. */
export function resetEnterpriseGeneralSettings(): void {
  cachedSettings = null;
  inFlight = null;
}

/**
 * Per-locale brand for the topbar slot. Empty settings strings mean "use the
 * host default", so each field falls back independently.
 */
export function resolveEnterpriseBrand(
  settings: EnterpriseGeneralSettingsValue | null,
  locale: EnterpriseBrandLocale,
  fallback: EnterpriseBrandFallback,
): EnterpriseResolvedBrand {
  const source = settings ?? BLANK_SETTINGS;
  const english = locale === "en";
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
