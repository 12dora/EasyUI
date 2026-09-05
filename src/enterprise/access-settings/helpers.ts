import { toast } from "../../toast";
import type { EnterpriseWriteOnlySecret } from "../integration-configuration-forms";

/** The two panes of the access-settings page. */
export type AccessSettingsTab = "login" | "permissions";

/** Result of one save / discover / test / sync round, as the user reads it. */
export interface SettingsOutcome {
  ok: boolean;
  message: string;
}

export type SettingsOutcomeReporter = (outcome: SettingsOutcome) => void;

/**
 * Where a finished operation reports to: inline mode paints the outcome into
 * the form, toast mode fires a transient toast and leaves the page untouched.
 */
export function createOutcomeReporter(
  toastMode: boolean,
  setResult: (outcome: SettingsOutcome) => void,
): SettingsOutcomeReporter {
  return (outcome) => {
    if (toastMode) (outcome.ok ? toast.success : toast.error)(outcome.message);
    else setResult(outcome);
  };
}

export interface SettingsLoadHandlers<T> {
  onValue: (value: T) => void;
  onError: () => void;
  onSettled: () => void;
}

/**
 * Body of a panel's load effect. The returned cleanup drops the response of a
 * superseded or unmounted load, so a late arrival never writes state.
 */
export function runLoadEffect<T>(load: () => Promise<T>, handlers: SettingsLoadHandlers<T>): () => void {
  let active = true;
  load()
    .then((next) => {
      if (active) handlers.onValue(next);
    })
    .catch(() => {
      if (active) handlers.onError();
    })
    .finally(() => {
      if (active) handlers.onSettled();
    });
  return () => {
    active = false;
  };
}

/**
 * Write-only credential argument: a cleared box sends `""` (drop the stored
 * secret), a blank one sends nothing (keep it), a typed one sends the value.
 */
export function writeOnlyCredential({ value, clear }: EnterpriseWriteOnlySecret): string | undefined {
  return clear ? "" : value || undefined;
}

export function pickTab(
  visibleTabs: readonly AccessSettingsTab[],
  selected: AccessSettingsTab | null,
  preferred?: AccessSettingsTab | null,
) {
  if (selected && visibleTabs.includes(selected)) return selected;
  if (preferred && visibleTabs.includes(preferred)) return preferred;
  return visibleTabs[0] ?? null;
}

export function computeRedirectUri(base: string) {
  const normalized = base.trim().replace(/\/+$/, "");
  return normalized ? `${normalized}/api/v1/auth/oidc/callback` : "";
}
