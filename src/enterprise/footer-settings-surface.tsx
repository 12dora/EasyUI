"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "../toast";
import { Button } from "../primitives/button";
import { Field, Textarea } from "../primitives/field";
import { InlineNotice } from "../primitives/inline-notice";
import { AsyncStateTransition } from "../primitives/async-state-transition";
import { Section } from "../primitives/section";
import { EnterpriseSettingsFormSkeleton } from "./surface-helpers";

export interface EnterpriseFooterSettingsValue {
  footerHtmlZh: string;
  footerHtmlEn: string;
}

export interface EnterpriseFooterSettingsAdapter {
  load(): Promise<EnterpriseFooterSettingsValue>;
  save(value: EnterpriseFooterSettingsValue): Promise<EnterpriseFooterSettingsValue>;
  onSaved?(value: EnterpriseFooterSettingsValue): void;
}

export interface EnterpriseFooterSettingsLabels {
  title: string;
  loading: string;
  loadFailed: string;
  retry: string;
  chineseHtml: string;
  englishHtml: string;
  save: string;
  saving: string;
  saved: string;
  saveFailed: string;
}

/** Complete bilingual footer editor. Hosts provide transport and copy only. */
export function EnterpriseFooterSettingsSurface({
  adapter,
  labels,
  feedbackMode = "inline",
}: {
  adapter: EnterpriseFooterSettingsAdapter;
  labels: EnterpriseFooterSettingsLabels;
  /** Default `inline` preserves main-app InlineNotice load path; Customs passes `toast`. */
  feedbackMode?: "inline" | "toast";
}) {
  const [value, setValue] = useState<EnterpriseFooterSettingsValue | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const toastMode = feedbackMode === "toast";
  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      setValue(normalizeFooterSettings(await adapter.load()));
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
  async function save() {
    if (!value) return;
    setSaving(true);
    try {
      const next = normalizeFooterSettings(await adapter.save(normalizeFooterSettings(value)));
      setValue(next);
      adapter.onSaved?.(next);
      toast.success(labels.saved);
    } catch {
      toast.error(labels.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  // Default/inline: keep InlineNotice failure + loading text (line-for-line host contract).
  if (!toastMode) {
    const loadError = loadFailed || (!loading && !value);
    return (
      <Section title={labels.title}>
        {loading ? (
          <p className="text-[13px] text-ink-soft">{labels.loading}</p>
        ) : loadError ? (
          <InlineNotice tone="error" message={labels.loadFailed} actionLabel={labels.retry} onAction={() => void refresh()} />
        ) : (
          <div className="space-y-4 rounded-md border border-hairline bg-paper p-4" data-test-id="app-settings-section">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={labels.chineseHtml} required>
                <Textarea rows={4} value={value!.footerHtmlZh} onChange={(event) => setValue({ ...value!, footerHtmlZh: event.target.value })} className="font-mono text-[12px]" data-test-id="footer-html-zh" />
              </Field>
              <Field label={labels.englishHtml} required>
                <Textarea rows={4} value={value!.footerHtmlEn} onChange={(event) => setValue({ ...value!, footerHtmlEn: event.target.value })} className="font-mono text-[12px]" data-test-id="footer-html-en" />
              </Field>
            </div>
            <div className="flex justify-end">
              <Button variant="primary" loading={saving} onClick={() => void save()} data-test-id="app-settings-save">
                {saving ? labels.saving : labels.save}
              </Button>
            </div>
          </div>
        )}
      </Section>
    );
  }

  // FE-FB-01 + FE-UXA-10 toast mode: skeleton while loading, neutral shell + permanent Refresh on failure.
  // Only an initial miss is empty/disabled. A rejected refresh keeps the last successful form unchanged.
  const formValue = value ?? { footerHtmlZh: "", footerHtmlEn: "" };
  const formDisabled = !value || loading;
  const state = loading && !value ? "loading" : !value ? "empty" : "ready";

  const formBody = (
    <div className="space-y-4 rounded-md border border-hairline bg-paper p-4" data-test-id="app-settings-section">
      {!value ? (
        <p className="text-[13px] text-ink-faint" data-test-id="footer-settings-missing">—</p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={labels.chineseHtml} required>
          <Textarea
            rows={4}
            value={formValue.footerHtmlZh}
            onChange={(event) => setValue((current) => ({ ...(current ?? formValue), footerHtmlZh: event.target.value }))}
            className="font-mono text-[12px]"
            data-test-id="footer-html-zh"
            disabled={formDisabled}
          />
        </Field>
        <Field label={labels.englishHtml} required>
          <Textarea
            rows={4}
            value={formValue.footerHtmlEn}
            onChange={(event) => setValue((current) => ({ ...(current ?? formValue), footerHtmlEn: event.target.value }))}
            className="font-mono text-[12px]"
            data-test-id="footer-html-en"
            disabled={formDisabled}
          />
        </Field>
      </div>
      <div className="flex justify-end">
        <Button variant="primary" loading={saving} disabled={formDisabled} onClick={() => void save()} data-test-id="app-settings-save">
          {saving ? labels.saving : labels.save}
        </Button>
      </div>
    </div>
  );

  return (
    <Section
      title={labels.title}
      actions={
        <Button variant="outline" size="sm" loading={loading} onClick={() => void refresh()} data-test-id="footer-settings-refresh">
          {labels.retry}
        </Button>
      }
    >
      <AsyncStateTransition
        state={state}
        minHeight={220}
        data-test-id="footer-settings-async"
        loading={<EnterpriseSettingsFormSkeleton testId="footer-settings-skeleton" rows={2} />}
        empty={formBody}
        ready={formBody}
      />
    </Section>
  );
}

function normalizeFooterSettings(value: EnterpriseFooterSettingsValue): EnterpriseFooterSettingsValue {
  return { footerHtmlZh: value.footerHtmlZh, footerHtmlEn: value.footerHtmlEn };
}
