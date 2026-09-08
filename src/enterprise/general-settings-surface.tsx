"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { toast } from "../toast";
import { Button } from "../primitives/button";
import { Field, Input, Textarea } from "../primitives/field";
import { InlineNotice } from "../primitives/inline-notice";
import { AsyncStateTransition } from "../primitives/async-state-transition";
import { PageHeader } from "../primitives/page-header";
import { TabList, TabPanel, type TabDefinition } from "../primitives/tabs";
import { EnterpriseSettingsFormSkeleton } from "./surface-helpers";
import { primeEnterpriseGeneralSettings } from "./general-settings-store";

export interface EnterpriseGeneralSettingsValue {
  titleZh: string;
  titleEn: string;
  subtitleZh: string;
  subtitleEn: string;
  footerHtmlZh: string;
  footerHtmlEn: string;
  /** `data:image/(png|jpeg|webp);base64,…`, or null for "use the host default". */
  logoDataUrl: string | null;
}

export interface EnterpriseGeneralSettingsAdapter {
  load(): Promise<EnterpriseGeneralSettingsValue>;
  save(value: EnterpriseGeneralSettingsValue): Promise<EnterpriseGeneralSettingsValue>;
  onSaved?(value: EnterpriseGeneralSettingsValue): void;
}

export interface EnterpriseGeneralSettingsLabels {
  title: string;
  description: string;
  loading: string;
  loadFailed: string;
  retry: string;
  localeTabs: { "zh-CN": string; en: string };
  appTitle: string;
  appTitleHint: string;
  subtitle: string;
  subtitleHint: string;
  footerHtml: string;
  footerHtmlHint: string;
  logo: string;
  logoHint: string;
  logoUpload: string;
  logoRemove: string;
  logoInvalid: string;
  logoTooLarge: string;
  save: string;
  saving: string;
  saved: string;
  saveFailed: string;
}

export type EnterpriseGeneralSettingsLocale = "zh-CN" | "en";

/** Mirrors the backend limit: decoded logo bytes must stay at or below 128 KiB. */
export const ENTERPRISE_LOGO_MAX_BYTES = 128 * 1024;
const ALLOWED_LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const LOCALE_TABS_ID = "general-settings-locale";
const EMPTY_VALUE: EnterpriseGeneralSettingsValue = {
  titleZh: "",
  titleEn: "",
  subtitleZh: "",
  subtitleEn: "",
  footerHtmlZh: "",
  footerHtmlEn: "",
  logoDataUrl: null,
};

function normalize(value: EnterpriseGeneralSettingsValue): EnterpriseGeneralSettingsValue {
  return {
    titleZh: value.titleZh ?? "",
    titleEn: value.titleEn ?? "",
    subtitleZh: value.subtitleZh ?? "",
    subtitleEn: value.subtitleEn ?? "",
    footerHtmlZh: value.footerHtmlZh ?? "",
    footerHtmlEn: value.footerHtmlEn ?? "",
    logoDataUrl: value.logoDataUrl ? value.logoDataUrl : null,
  };
}

interface GeneralSettingsController {
  value: EnterpriseGeneralSettingsValue | null;
  loading: boolean;
  saving: boolean;
  loadFailed: boolean;
  update(patch: Partial<EnterpriseGeneralSettingsValue>): void;
  refresh(): Promise<void>;
  save(current: EnterpriseGeneralSettingsValue): Promise<void>;
}

function useGeneralSettingsController(
  adapter: EnterpriseGeneralSettingsAdapter,
  labels: EnterpriseGeneralSettingsLabels,
  toastMode: boolean,
): GeneralSettingsController {
  const [value, setValue] = useState<EnterpriseGeneralSettingsValue | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      setValue(normalize(await adapter.load()));
    } catch {
      setLoadFailed(true);
      if (toastMode) toast.error(labels.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [adapter, labels.loadFailed, toastMode]);
  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);
  const save = useCallback(async (current: EnterpriseGeneralSettingsValue) => {
    setSaving(true);
    try {
      const next = normalize(await adapter.save(normalize(current)));
      setValue(next);
      // Seed the shared cache and announce the change so every mounted shell
      // (topbar brand, footer) re-renders without a reload.
      primeEnterpriseGeneralSettings(next);
      adapter.onSaved?.(next);
      toast.success(labels.saved);
    } catch {
      toast.error(labels.saveFailed);
    } finally {
      setSaving(false);
    }
  }, [adapter, labels.saved, labels.saveFailed]);
  const update = useCallback((patch: Partial<EnterpriseGeneralSettingsValue>) => {
    setValue((current) => ({ ...(current ?? EMPTY_VALUE), ...patch }));
  }, []);
  return { value, loading, saving, loadFailed, update, refresh, save };
}

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("logo-read-failed"));
    reader.readAsDataURL(file);
  });
}

function GeneralLogoControl({
  labels,
  logoDataUrl,
  disabled,
  onChange,
}: {
  labels: EnterpriseGeneralSettingsLabels;
  logoDataUrl: string | null;
  disabled: boolean;
  onChange: (next: string | null) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // A file input only fires `change` when the selection differs from what it
  // already holds. Clearing it as soon as the File is captured keeps "remove,
  // then pick the same file again" — and "retry after a rejected file" — working.
  function clearNativeSelection() {
    if (inputRef.current) inputRef.current.value = "";
  }
  async function pickFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    clearNativeSelection();
    if (!file) return;
    if (!ALLOWED_LOGO_TYPES.has(file.type)) {
      setError(labels.logoInvalid);
      return;
    }
    if (file.size > ENTERPRISE_LOGO_MAX_BYTES) {
      setError(labels.logoTooLarge);
      return;
    }
    try {
      onChange(await readDataUrl(file));
      setError(null);
    } catch {
      setError(labels.logoInvalid);
    }
  }
  return (
    <Field label={labels.logo} hint={labels.logoHint} error={error}>
      <div className="flex flex-wrap items-center gap-3">
        {logoDataUrl ? (
          <img
            src={logoDataUrl}
            alt=""
            aria-hidden="true"
            className="h-9 w-auto max-w-[160px] shrink-0 object-contain"
            data-test-id="general-logo-preview"
          />
        ) : null}
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          aria-label={labels.logoUpload}
          disabled={disabled}
          onChange={(event) => void pickFile(event)}
          className="text-[13px] text-ink-soft file:mr-3 file:rounded-[2px] file:border file:border-ink/15 file:bg-paper file:px-3 file:py-1.5 file:text-[13px] file:text-ink"
          data-test-id="general-logo-input"
        />
        {logoDataUrl ? (
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => {
              setError(null);
              clearNativeSelection();
              onChange(null);
            }}
            data-test-id="general-logo-remove"
          >
            {labels.logoRemove}
          </Button>
        ) : null}
      </div>
    </Field>
  );
}

function GeneralLocaleFields({
  labels,
  locale,
  value,
  disabled,
  onChange,
}: {
  labels: EnterpriseGeneralSettingsLabels;
  locale: EnterpriseGeneralSettingsLocale;
  value: EnterpriseGeneralSettingsValue;
  disabled: boolean;
  onChange: (patch: Partial<EnterpriseGeneralSettingsValue>) => void;
}) {
  const english = locale === "en";
  const suffix = english ? "en" : "zh";
  return (
    <div className="space-y-4">
      <Field label={labels.appTitle} hint={labels.appTitleHint}>
        <Input
          value={english ? value.titleEn : value.titleZh}
          disabled={disabled}
          maxLength={80}
          onChange={(event) => onChange(english ? { titleEn: event.target.value } : { titleZh: event.target.value })}
          data-test-id={`general-title-${suffix}`}
        />
      </Field>
      <Field label={labels.subtitle} hint={labels.subtitleHint}>
        <Input
          value={english ? value.subtitleEn : value.subtitleZh}
          disabled={disabled}
          maxLength={200}
          onChange={(event) => onChange(english ? { subtitleEn: event.target.value } : { subtitleZh: event.target.value })}
          data-test-id={`general-subtitle-${suffix}`}
        />
      </Field>
      <Field label={labels.footerHtml} hint={labels.footerHtmlHint}>
        <Textarea
          rows={4}
          value={english ? value.footerHtmlEn : value.footerHtmlZh}
          disabled={disabled}
          onChange={(event) =>
            onChange(english ? { footerHtmlEn: event.target.value } : { footerHtmlZh: event.target.value })
          }
          className="font-mono text-[12px]"
          data-test-id={`footer-html-${suffix}`}
        />
      </Field>
    </div>
  );
}

function localeTabs(labels: EnterpriseGeneralSettingsLabels, activeLocale: EnterpriseGeneralSettingsLocale): TabDefinition[] {
  const locales: EnterpriseGeneralSettingsLocale[] = ["zh-CN", "en"];
  return locales.map((locale) => ({
    key: locale,
    label: labels.localeTabs[locale],
    className: `shrink-0 border-b-2 px-4 py-2 text-[12px] font-medium ${
      activeLocale === locale ? "border-ink text-ink" : "border-transparent text-ink-faint hover:text-ink-soft"
    }`,
    dataAttributes: { "data-test-id": `general-locale-tab-${locale}` },
  }));
}

function GeneralSettingsForm({
  labels,
  controller,
  locale,
  onLocaleChange,
}: {
  labels: EnterpriseGeneralSettingsLabels;
  controller: GeneralSettingsController;
  locale: EnterpriseGeneralSettingsLocale;
  onLocaleChange: (locale: EnterpriseGeneralSettingsLocale) => void;
}) {
  const value = controller.value ?? EMPTY_VALUE;
  // Saving disables every control, logo included: the response replaces the
  // draft, so an edit typed while the PUT is in flight would be silently
  // discarded. No editable control during a save means no edit to lose.
  const disabled = !controller.value || controller.loading || controller.saving;
  return (
    <div className="space-y-5 rounded-md border border-hairline bg-paper p-4" data-test-id="app-settings-section">
      <GeneralLogoControl
        labels={labels}
        logoDataUrl={value.logoDataUrl}
        disabled={disabled}
        onChange={(next) => controller.update({ logoDataUrl: next })}
      />
      <div>
        <TabList
          idBase={LOCALE_TABS_ID}
          label={labels.title}
          tabs={localeTabs(labels, locale)}
          activeKey={locale}
          onSelect={(key) => onLocaleChange(key as EnterpriseGeneralSettingsLocale)}
          className="flex overflow-x-auto border-b border-ink/10"
        />
        <TabPanel idBase={LOCALE_TABS_ID} activeKey={locale} className="mt-5">
          <GeneralLocaleFields
            labels={labels}
            locale={locale}
            value={value}
            disabled={disabled}
            onChange={(patch) => controller.update(patch)}
          />
        </TabPanel>
      </div>
      <div className="flex justify-end">
        <Button
          variant="primary"
          loading={controller.saving}
          disabled={disabled}
          onClick={() => void controller.save(value)}
          data-test-id="app-settings-save"
        >
          {controller.saving ? labels.saving : labels.save}
        </Button>
      </div>
    </div>
  );
}

/**
 * Complete "general" application settings page: brand logo, per-language app
 * title / subtitle / footer HTML, one Save.
 *
 * The surface owns its own `PageHeader` and is therefore the page's only H1 —
 * hosts wrap it in `EnterpriseSettingsPageFrame`, which no longer paints a
 * parent "Settings" heading of its own.
 *
 * `inline` (default) keeps the main-app load path: loading text, then an
 * `InlineNotice` + retry on failure. `toast` mirrors the Customs contract:
 * a skeleton while loading, a permanent Refresh action in the header, and a
 * rejected refresh that leaves the last successful form untouched.
 */
export function EnterpriseGeneralSettingsSurface({
  adapter,
  labels,
  feedbackMode = "inline",
}: {
  adapter: EnterpriseGeneralSettingsAdapter;
  labels: EnterpriseGeneralSettingsLabels;
  feedbackMode?: "inline" | "toast";
}) {
  const toastMode = feedbackMode === "toast";
  const controller = useGeneralSettingsController(adapter, labels, toastMode);
  const [locale, setLocale] = useState<EnterpriseGeneralSettingsLocale>("zh-CN");
  const form = (
    <GeneralSettingsForm labels={labels} controller={controller} locale={locale} onLocaleChange={setLocale} />
  );
  const header = (
    <PageHeader
      title={labels.title}
      subtitle={labels.description}
      actions={
        toastMode ? (
          <Button
            variant="outline"
            size="sm"
            loading={controller.loading}
            disabled={controller.saving}
            onClick={() => void controller.refresh()}
            data-test-id="general-settings-refresh"
          >
            {labels.retry}
          </Button>
        ) : null
      }
    />
  );
  return (
    <section data-test-id="general-settings-page" data-enterprise-surface="general-settings">
      {header}
      {toastMode ? (
        <AsyncStateTransition
          state={controller.loading && !controller.value ? "loading" : controller.value ? "ready" : "empty"}
          minHeight={360}
          className="mt-5"
          data-test-id="general-settings-async"
          loading={<EnterpriseSettingsFormSkeleton testId="general-settings-skeleton" rows={2} />}
          empty={form}
          ready={form}
        />
      ) : (
        <InlineBody controller={controller} labels={labels} form={form} />
      )}
    </section>
  );
}

function InlineBody({
  controller,
  labels,
  form,
}: {
  controller: GeneralSettingsController;
  labels: EnterpriseGeneralSettingsLabels;
  form: ReactNode;
}) {
  if (controller.loading) return <p className="mt-5 text-[13px] text-ink-soft">{labels.loading}</p>;
  if (controller.loadFailed || !controller.value) {
    return (
      <InlineNotice
        className="mt-5"
        tone="error"
        message={labels.loadFailed}
        action={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void controller.refresh()}
            data-test-id="general-settings-refresh"
          >
            {labels.retry}
          </Button>
        }
      />
    );
  }
  return <div className="mt-5">{form}</div>;
}
