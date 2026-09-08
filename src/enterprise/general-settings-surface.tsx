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
import { primeEnterpriseGeneralSettings, useEnterpriseDefaultBrandLogo } from "./general-settings-store";

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
  /** Caption under the preview while the host default logo is in use. */
  logoDefaultCaption: string;
  /** Caption under the preview while an uploaded logo is in use. */
  logoCustomCaption: string;
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
  defaultLogoSrc,
  disabled,
  onChange,
  onReadPendingChange,
}: {
  labels: EnterpriseGeneralSettingsLabels;
  logoDataUrl: string | null;
  /** The host's own logo, previewed while no custom one is stored. */
  defaultLogoSrc: string | null;
  disabled: boolean;
  onChange: (next: string | null) => void;
  /** Reported up so Save can wait for the file to finish being read. */
  onReadPendingChange: (pending: boolean) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Reading a file is asynchronous, so its result can land after the
  // administrator has already moved on. Every read carries the generation it
  // started in; picking another file or pressing Remove bumps the counter, and a
  // result from an older generation is dropped instead of resurrecting a logo
  // that was replaced or cleared in the meantime.
  const readGeneration = useRef(0);
  function abandonPendingRead(): number {
    readGeneration.current += 1;
    onReadPendingChange(false);
    return readGeneration.current;
  }
  // A file input only fires `change` when the selection differs from what it
  // already holds. Clearing it as soon as the File is captured keeps "remove,
  // then pick the same file again" — and "retry after a rejected file" — working.
  function clearNativeSelection() {
    if (inputRef.current) inputRef.current.value = "";
  }
  async function pickFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    clearNativeSelection();
    const request = abandonPendingRead();
    if (!file) return;
    if (!ALLOWED_LOGO_TYPES.has(file.type)) {
      setError(labels.logoInvalid);
      return;
    }
    if (file.size > ENTERPRISE_LOGO_MAX_BYTES) {
      setError(labels.logoTooLarge);
      return;
    }
    onReadPendingChange(true);
    try {
      const dataUrl = await readDataUrl(file);
      if (request !== readGeneration.current) return;
      onChange(dataUrl);
      setError(null);
    } catch {
      if (request !== readGeneration.current) return;
      setError(labels.logoInvalid);
    } finally {
      // Only the newest read owns the pending flag: an abandoned one already
      // handed it over when its successor bumped the generation.
      if (request === readGeneration.current) onReadPendingChange(false);
    }
  }
  // The control always shows what is live: the uploaded logo when there is one,
  // otherwise the host default the application is rendering right now. Removing
  // an uploaded logo therefore returns to the default preview, not to nothing.
  const custom = logoDataUrl && logoDataUrl.length > 0 ? logoDataUrl : null;
  const previewSrc = custom ?? defaultLogoSrc;
  return (
    <Field label={labels.logo} hint={labels.logoHint} error={error}>
      <div className="flex flex-wrap items-center gap-3">
        {previewSrc ? (
          <span className="flex shrink-0 items-center gap-2">
            <img
              src={previewSrc}
              alt=""
              aria-hidden="true"
              className="h-9 w-auto max-w-[160px] shrink-0 object-contain"
              data-test-id="general-logo-preview"
              data-logo-source={custom ? "custom" : "default"}
            />
            <span className="text-[12px] text-ink-faint" data-test-id="general-logo-caption">
              {custom ? labels.logoCustomCaption : labels.logoDefaultCaption}
            </span>
          </span>
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
        {custom ? (
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => {
              setError(null);
              clearNativeSelection();
              abandonPendingRead();
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
    className: `shrink-0 border-b-2 px-4 py-2 text-[12px] font-medium transition-colors ${
      activeLocale === locale ? "border-ink text-ink" : "border-transparent text-ink-faint hover:text-ink-soft"
    }`,
    dataAttributes: { "data-test-id": `general-locale-tab-${locale}` },
  }));
}

function GeneralSettingsForm({
  labels,
  controller,
  locale,
  defaultLogoSrc,
  onLocaleChange,
}: {
  labels: EnterpriseGeneralSettingsLabels;
  controller: GeneralSettingsController;
  locale: EnterpriseGeneralSettingsLocale;
  defaultLogoSrc: string | null;
  onLocaleChange: (locale: EnterpriseGeneralSettingsLocale) => void;
}) {
  const value = controller.value ?? EMPTY_VALUE;
  // A picked file is not part of the draft until the browser has finished
  // reading it. Saving in that window would send the previous logo and then look
  // like the upload was lost, so Save waits for the read; the fields stay
  // editable because they are unaffected by it.
  const [logoReadPending, setLogoReadPending] = useState(false);
  // Saving disables every control, logo included: the response replaces the
  // draft, so an edit typed while the PUT is in flight would be silently
  // discarded. No editable control during a save means no edit to lose.
  const disabled = !controller.value || controller.loading || controller.saving;
  return (
    <div className="space-y-5 rounded-md border border-hairline bg-paper p-4" data-test-id="app-settings-section">
      <GeneralLogoControl
        labels={labels}
        logoDataUrl={value.logoDataUrl}
        defaultLogoSrc={defaultLogoSrc}
        disabled={disabled}
        onChange={(next) => controller.update({ logoDataUrl: next })}
        onReadPendingChange={setLogoReadPending}
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
        {/* Keyed by the locale so switching tabs remounts the panel and replays the
            enter animation (`--duration-fast`, neutralised under reduced motion). */}
        <TabPanel key={locale} idBase={LOCALE_TABS_ID} activeKey={locale} className="mt-5 easy-tab-panel-enter">
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
          disabled={disabled || logoReadPending}
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
 * The Logo control always previews the logo in use: the uploaded one, or the
 * host default otherwise. That default comes from `defaultLogoSrc`, and failing
 * that from the brand fallback the host's shell already resolves.
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
  defaultLogoSrc,
}: {
  adapter: EnterpriseGeneralSettingsAdapter;
  labels: EnterpriseGeneralSettingsLabels;
  feedbackMode?: "inline" | "toast";
  /**
   * The host's bundled default logo, previewed while no custom logo is stored.
   * Optional: a host whose shell brands itself through `resolveEnterpriseBrand`
   * is already known to the package and needs no wiring here.
   */
  defaultLogoSrc?: string | null;
}) {
  const toastMode = feedbackMode === "toast";
  const controller = useGeneralSettingsController(adapter, labels, toastMode);
  const [locale, setLocale] = useState<EnterpriseGeneralSettingsLocale>("zh-CN");
  const registeredLogo = useEnterpriseDefaultBrandLogo();
  const hostLogo = defaultLogoSrc ?? registeredLogo;
  const form = (
    <GeneralSettingsForm
      labels={labels}
      controller={controller}
      locale={locale}
      defaultLogoSrc={hostLogo}
      onLocaleChange={setLocale}
    />
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
