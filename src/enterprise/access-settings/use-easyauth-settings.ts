"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { EnterpriseEasyAuthConfigurationValue, EnterpriseWriteOnlySecret } from "../integration-configuration-forms";
import {
  createOutcomeReporter,
  runLoadEffect,
  writeOnlyCredential,
  type SettingsOutcome,
  type SettingsOutcomeReporter,
} from "./helpers";
import type {
  EnterpriseAccessSettingsAdapter,
  EnterpriseSettingsConfigurationLabels,
  EnterpriseSettingsFeedbackMode,
} from "./types";

export interface EasyAuthSettings {
  value: EnterpriseEasyAuthConfigurationValue | null;
  credential: EnterpriseWriteOnlySecret;
  webhookSecret: EnterpriseWriteOnlySecret;
  loading: boolean;
  saving: boolean;
  notice: SettingsOutcome | null;
  /** Bumped after every successful save so the authorization workspace refetches. */
  revision: number;
  setCredential: (next: EnterpriseWriteOnlySecret) => void;
  setWebhookSecret: (next: EnterpriseWriteOnlySecret) => void;
  patchValue: (patch: Partial<EnterpriseEasyAuthConfigurationValue>) => void;
  reload: () => void;
  save: () => Promise<void>;
}

interface EasyAuthOperationContext {
  adapter: EnterpriseAccessSettingsAdapter;
  labels: EnterpriseSettingsConfigurationLabels;
  value: EnterpriseEasyAuthConfigurationValue | null;
  credential: EnterpriseWriteOnlySecret;
  webhookSecret: EnterpriseWriteOnlySecret;
  setValue: (next: EnterpriseEasyAuthConfigurationValue) => void;
  setCredential: (next: EnterpriseWriteOnlySecret) => void;
  setWebhookSecret: (next: EnterpriseWriteOnlySecret) => void;
  begin: () => void;
  finish: () => void;
  bumpRevision: () => void;
  report: SettingsOutcomeReporter;
}

/** EasyAuth connection settings state behind the authorization pane. */
export function useEasyAuthSettings({
  adapter,
  labels,
  feedbackMode,
  canManage,
}: {
  adapter: EnterpriseAccessSettingsAdapter;
  labels: EnterpriseSettingsConfigurationLabels;
  feedbackMode: EnterpriseSettingsFeedbackMode;
  canManage: boolean;
}): EasyAuthSettings {
  const toastMode = feedbackMode === "toast";
  const [value, setValue] = useState<EnterpriseEasyAuthConfigurationValue | null>(null);
  const [credential, setCredential] = useState<EnterpriseWriteOnlySecret>({ value: "", clear: false });
  const [webhookSecret, setWebhookSecret] = useState<EnterpriseWriteOnlySecret>({ value: "", clear: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<SettingsOutcome | null>(null);
  const [revision, setRevision] = useState(0);
  /** FE-FB-01: re-issue loadEasyAuthSettings after failure (workspace Refresh alone is a different API set). */
  const [configRevision, setConfigRevision] = useState(0);
  const skipConfigurationLoad = !canManage;
  const report = useMemo(() => createOutcomeReporter(toastMode, setNotice), [toastMode]);

  useEffect(() => {
    if (skipConfigurationLoad) {
      setLoading(false);
      return;
    }
    setLoading(true);
    return runLoadEffect(() => adapter.loadEasyAuthSettings(), {
      onValue: (next) => setValue(next),
      // Keep prior value if any; never invent a blank successful form after failure.
      onError: () => report({ ok: false, message: labels.loadFailed }),
      onSettled: () => setLoading(false),
    });
  }, [adapter, configRevision, labels.loadFailed, skipConfigurationLoad, report]);

  const reload = useCallback(() => {
    setConfigRevision((current) => current + 1);
  }, []);

  const context: EasyAuthOperationContext = {
    adapter,
    labels,
    value,
    credential,
    webhookSecret,
    setValue,
    setCredential,
    setWebhookSecret,
    begin: () => {
      setSaving(true);
      if (!toastMode) setNotice(null);
    },
    finish: () => setSaving(false),
    bumpRevision: () => setRevision((current) => current + 1),
    report,
  };

  return {
    value,
    credential,
    webhookSecret,
    loading,
    saving,
    notice,
    revision,
    setCredential,
    setWebhookSecret,
    patchValue: (patch) => setValue((current) => (current ? { ...current, ...patch } : current)),
    reload,
    save: () => saveEasyAuth(context),
  };
}

async function saveEasyAuth(context: EasyAuthOperationContext): Promise<void> {
  const { adapter, labels, value } = context;
  if (!value) return;
  context.begin();
  try {
    const next = await adapter.saveEasyAuthSettings(value, {
      credential: writeOnlyCredential(context.credential),
      webhookSecret: writeOnlyCredential(context.webhookSecret),
    });
    context.setValue(next);
    context.setCredential({ value: "", clear: false });
    context.setWebhookSecret({ value: "", clear: false });
    context.report({ ok: true, message: labels.saved });
    context.bumpRevision();
  } catch {
    context.report({ ok: false, message: labels.saveFailed });
  } finally {
    context.finish();
  }
}
