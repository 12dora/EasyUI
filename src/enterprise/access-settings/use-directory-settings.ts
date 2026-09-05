"use client";

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { EnterpriseDirectorySettingsLabels, EnterpriseDirectorySettingsValue } from "../directory-settings-form";
import type { EnterpriseWriteOnlySecret } from "../integration-configuration-forms";
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

export type DirectoryOperation = "load" | "save" | "test" | "sync";

export interface DirectorySettings {
  value: EnterpriseDirectorySettingsValue | null;
  credential: EnterpriseWriteOnlySecret;
  busy: DirectoryOperation | null;
  result: SettingsOutcome | null;
  setCredential: (next: EnterpriseWriteOnlySecret) => void;
  patchValue: (patch: Partial<EnterpriseDirectorySettingsValue>) => void;
  save: () => Promise<void>;
  test: () => Promise<void>;
  sync: () => Promise<void>;
}

interface DirectoryOperationContext {
  adapter: EnterpriseAccessSettingsAdapter;
  labels: EnterpriseSettingsConfigurationLabels;
  directoryLabels: EnterpriseDirectorySettingsLabels;
  value: EnterpriseDirectorySettingsValue | null;
  credential: EnterpriseWriteOnlySecret;
  setValue: Dispatch<SetStateAction<EnterpriseDirectorySettingsValue | null>>;
  setCredential: (next: EnterpriseWriteOnlySecret) => void;
  begin: (operation: DirectoryOperation) => void;
  finish: () => void;
  report: SettingsOutcomeReporter;
}

/**
 * EasyAuth directory state: load, save, connectivity probe and manual sync.
 *
 * Deliberately separate from the OIDC state: sign-in and the user source of
 * truth are configured, credentialed and failing independently, so one failing
 * load must never blank the other.
 */
export function useDirectorySettings({
  adapter,
  labels,
  directoryLabels,
  feedbackMode,
}: {
  adapter: EnterpriseAccessSettingsAdapter;
  labels: EnterpriseSettingsConfigurationLabels;
  directoryLabels: EnterpriseDirectorySettingsLabels;
  feedbackMode: EnterpriseSettingsFeedbackMode;
}): DirectorySettings {
  const toastMode = feedbackMode === "toast";
  const [value, setValue] = useState<EnterpriseDirectorySettingsValue | null>(null);
  const [credential, setCredential] = useState<EnterpriseWriteOnlySecret>({ value: "", clear: false });
  const [busy, setBusy] = useState<DirectoryOperation | null>("load");
  const [result, setResult] = useState<SettingsOutcome | null>(null);
  const report = useMemo(() => createOutcomeReporter(toastMode, setResult), [toastMode]);

  useEffect(() => {
    const load = adapter.loadDirectorySettings;
    if (!load) return;
    setBusy("load");
    return runLoadEffect(() => load.call(adapter), {
      onValue: (next) => setValue(next),
      onError: () => report({ ok: false, message: labels.loadFailed }),
      onSettled: () => setBusy(null),
    });
  }, [adapter, labels.loadFailed, report]);

  const context: DirectoryOperationContext = {
    adapter,
    labels,
    directoryLabels,
    value,
    credential,
    setValue,
    setCredential,
    begin: (operation) => {
      setBusy(operation);
      setResult(null);
    },
    finish: () => setBusy(null),
    report,
  };

  return {
    value,
    credential,
    busy,
    result,
    setCredential,
    patchValue: (patch) => setValue((current) => (current ? { ...current, ...patch } : current)),
    save: () => saveDirectory(context),
    test: () => testDirectory(context),
    sync: () => syncDirectory(context),
  };
}

async function saveDirectory(context: DirectoryOperationContext): Promise<void> {
  const { adapter, labels, value } = context;
  const persist = adapter.saveDirectorySettings;
  if (!persist || !value) return;
  context.begin("save");
  try {
    // Write-only credential: blank keeps the stored one, clear sends "".
    const next = await persist.call(adapter, value, writeOnlyCredential(context.credential));
    context.setValue(next);
    context.setCredential({ value: "", clear: false });
    context.report({ ok: true, message: labels.saved });
  } catch {
    context.report({ ok: false, message: labels.saveFailed });
  } finally {
    context.finish();
  }
}

async function testDirectory(context: DirectoryOperationContext): Promise<void> {
  const { adapter, directoryLabels } = context;
  const probe = adapter.testDirectory;
  if (!probe) return;
  context.begin("test");
  try {
    const next = await probe.call(adapter);
    const message = next.ok
      ? `${directoryLabels.operationSucceeded}${next.latencyMs === undefined ? "" : ` · ${next.latencyMs} ms`}`
      : next.errorDetail || directoryLabels.operationFailed;
    context.report({ ok: next.ok, message });
  } catch {
    context.report({ ok: false, message: directoryLabels.operationFailed });
  } finally {
    context.finish();
  }
}

async function syncDirectory(context: DirectoryOperationContext): Promise<void> {
  const { adapter, directoryLabels } = context;
  const run = adapter.syncDirectory;
  if (!run) return;
  context.begin("sync");
  try {
    const next = await run.call(adapter);
    context.setValue((current) => (current ? { ...current, lastSync: next } : current));
    // Only `completed` actually wrote: everything else is reported as a failure
    // so nobody reads "sync finished" as "the user list is up to date".
    context.report({
      ok: next.status === "completed",
      message: next.summary || directoryLabels.statusLabels[next.status],
    });
  } catch {
    context.report({ ok: false, message: directoryLabels.operationFailed });
  } finally {
    context.finish();
  }
}
