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

/**
 * 工作账号登录支持的授权范围,数组顺序即写回后端的顺序。
 * 产品上不开放自定义:这四项之外的令牌在下一次保存时被丢弃。
 */
export const OIDC_SCOPE_TOKENS = ["openid", "profile", "email", "dingtalk"] as const;

export type OidcScopeToken = (typeof OIDC_SCOPE_TOKENS)[number];

/** OIDC 协议要求必须申请的范围:永远勾上,也永远写进结果。 */
export const OIDC_REQUIRED_SCOPE: OidcScopeToken = "openid";

/** 把后端存的空格分隔串解析成勾选集合:未知令牌忽略,openid 一定在内。 */
export function parseOidcScopes(value: string): ReadonlySet<string> {
  const known = new Set<string>(OIDC_SCOPE_TOKENS);
  const selected = new Set<string>([OIDC_REQUIRED_SCOPE]);
  for (const token of (value ?? "").split(/\s+/)) {
    if (known.has(token)) selected.add(token);
  }
  return selected;
}

/** 把勾选集合写回空格分隔串:按 `OIDC_SCOPE_TOKENS` 的顺序,openid 永远打头。 */
export function serializeOidcScopes(selected: Iterable<string>): string {
  const chosen = new Set(selected);
  return OIDC_SCOPE_TOKENS.filter((token) => token === OIDC_REQUIRED_SCOPE || chosen.has(token)).join(" ");
}
