"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { EnterpriseOidcConfigurationValue, EnterpriseWriteOnlySecret } from "../integration-configuration-forms";
import {
  computeRedirectUri,
  createOutcomeReporter,
  runLoadEffect,
  type SettingsOutcome,
  type SettingsOutcomeReporter,
} from "./helpers";
import type {
  EnterpriseAccessSettingsAdapter,
  EnterpriseIdentityDiscoveryResult,
  EnterpriseOidcStatusSummary,
  EnterpriseSettingsConfigurationLabels,
  EnterpriseSettingsFeedbackMode,
} from "./types";

/** A view-only host answers the load with a status summary instead of the editable form. */
export type IdentitySettingsValue = EnterpriseOidcConfigurationValue | EnterpriseOidcStatusSummary;

export type IdentityOperation = "load" | "save" | "discover" | "test";

export interface IdentitySettings {
  value: IdentitySettingsValue | null;
  clientSecret: EnterpriseWriteOnlySecret;
  busy: IdentityOperation | null;
  result: SettingsOutcome | null;
  setClientSecret: (next: EnterpriseWriteOnlySecret) => void;
  patchValue: (patch: Partial<EnterpriseOidcConfigurationValue>) => void;
  reload: () => void;
  save: () => Promise<void>;
  discover: () => Promise<void>;
  testConnection: () => Promise<void>;
}

interface IdentityOperationContext {
  adapter: EnterpriseAccessSettingsAdapter;
  labels: EnterpriseSettingsConfigurationLabels;
  value: IdentitySettingsValue | null;
  clientSecret: EnterpriseWriteOnlySecret;
  setValue: (next: IdentitySettingsValue) => void;
  setClientSecret: (next: EnterpriseWriteOnlySecret) => void;
  begin: (operation: IdentityOperation) => void;
  finish: () => void;
  report: SettingsOutcomeReporter;
}

/** OIDC settings state: load, save, issuer discovery and the connection probe. */
export function useIdentitySettings({
  adapter,
  labels,
  feedbackMode,
}: {
  adapter: EnterpriseAccessSettingsAdapter;
  labels: EnterpriseSettingsConfigurationLabels;
  feedbackMode: EnterpriseSettingsFeedbackMode;
}): IdentitySettings {
  const toastMode = feedbackMode === "toast";
  const [value, setValue] = useState<IdentitySettingsValue | null>(null);
  const [clientSecret, setClientSecret] = useState<EnterpriseWriteOnlySecret>({ value: "", clear: false });
  const [busy, setBusy] = useState<IdentityOperation | null>("load");
  const [result, setResult] = useState<SettingsOutcome | null>(null);
  const [loadRevision, setLoadRevision] = useState(0);
  const report = useMemo(() => createOutcomeReporter(toastMode, setResult), [toastMode]);

  const reload = useCallback(() => {
    setBusy("load");
    setLoadRevision((current) => current + 1);
  }, []);

  useEffect(
    () =>
      runLoadEffect(() => adapter.loadOidcSettings(), {
        onValue: (next) => setValue(next),
        onError: () => report({ ok: false, message: labels.loadFailed }),
        onSettled: () => setBusy(null),
      }),
    // `report` is keyed by `toastMode`; an explicit retry bumps `loadRevision`.
    [adapter, labels.loadFailed, report, loadRevision],
  );

  const patchValue = useCallback((patch: Partial<EnterpriseOidcConfigurationValue>) => {
    setValue((current) => (current ? { ...current, ...patch, ...redirectUriPatch(patch) } : current));
  }, []);

  const context: IdentityOperationContext = {
    adapter,
    labels,
    value,
    clientSecret,
    setValue,
    setClientSecret,
    begin: (operation) => {
      setBusy(operation);
      if (!toastMode) setResult(null);
    },
    finish: () => setBusy(null),
    report,
  };

  return {
    value,
    clientSecret,
    busy,
    result,
    setClientSecret,
    patchValue,
    reload,
    save: () => saveIdentity(context),
    discover: () => discoverIdentity(context),
    testConnection: () => testIdentityConnection(context),
  };
}

/** The redirect URI is derived, never typed: it must follow the base URL edit. */
function redirectUriPatch(patch: Partial<EnterpriseOidcConfigurationValue>) {
  if (patch.redirectBaseUrl === undefined) return {};
  return { redirectUri: computeRedirectUri(patch.redirectBaseUrl) };
}

/** Write-only secret: a cleared box sends "", a blank one keeps the stored value. */
function clientSecretPatch({ value, clear }: EnterpriseWriteOnlySecret): { clientSecret?: string } {
  if (clear) return { clientSecret: "" };
  return value ? { clientSecret: value } : {};
}

async function saveIdentity(context: IdentityOperationContext): Promise<void> {
  const { adapter, labels, value } = context;
  if (!value) return;
  const editableValue = value as EnterpriseOidcConfigurationValue;
  context.begin("save");
  try {
    const next = await adapter.saveOidcSettings(editableValue, clientSecretPatch(context.clientSecret));
    context.setValue(next);
    context.setClientSecret({ value: "", clear: false });
    context.report({ ok: true, message: labels.saved });
  } catch {
    context.report({ ok: false, message: labels.saveFailed });
  } finally {
    context.finish();
  }
}

async function discoverIdentity(context: IdentityOperationContext): Promise<void> {
  const { adapter, labels, value } = context;
  const discover = adapter.discoverIdentity;
  if (!discover || !value) return;
  const editableValue = value as EnterpriseOidcConfigurationValue;
  context.begin("discover");
  try {
    const next = await discover.call(adapter, editableValue.issuer);
    if (!next.ok) {
      context.report(discoveryFailure(labels));
      return;
    }
    context.setValue(applyDiscovery(editableValue, next));
    context.report({ ok: true, message: labels.operationSucceeded ?? labels.saved });
  } catch {
    context.report(discoveryFailure(labels));
  } finally {
    context.finish();
  }
}

function applyDiscovery(
  value: EnterpriseOidcConfigurationValue,
  discovery: EnterpriseIdentityDiscoveryResult,
): EnterpriseOidcConfigurationValue {
  return {
    ...value,
    issuer: discovery.issuer,
    authorizationEndpoint: discovery.authorizationEndpoint,
    tokenEndpoint: discovery.tokenEndpoint,
    jwksUri: discovery.jwksUri,
    userinfoEndpoint: discovery.userinfoEndpoint,
  };
}

function discoveryFailure(labels: EnterpriseSettingsConfigurationLabels): SettingsOutcome {
  return { ok: false, message: labels.operationFailed ?? labels.loadFailed };
}

async function testIdentityConnection(context: IdentityOperationContext): Promise<void> {
  const { labels } = context;
  const action = context.adapter.testIdentityConnection;
  if (!action) return;
  context.begin("test");
  try {
    const next = await action();
    context.report(
      next.ok
        ? { ok: true, message: `${labels.operationSucceeded}${next.latencyMs === undefined ? "" : ` · ${next.latencyMs} ms`}` }
        : { ok: false, message: labels.operationFailed },
    );
  } catch {
    context.report({ ok: false, message: labels.operationFailed });
  } finally {
    context.finish();
  }
}
