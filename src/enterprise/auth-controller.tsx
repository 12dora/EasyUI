"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "../toast";
import { EnterpriseCredentialLoginSurface, type EnterpriseCredentialLoginLabels, type EnterpriseSecondFactorMethod } from "./auth-surfaces";
import { isWebAuthnAvailable, isWebAuthnCancelled, parseRequestOptions, serializeCredential, type SerializedPublicKeyCredential } from "./webauthn";

export interface EnterpriseOidcStatus {
  enabled: boolean;
  authorizePath: string;
  endSessionUrl?: string | null;
}

export interface EnterpriseLoginResult { mustChangePassword?: boolean; }
export interface EnterpriseLoginAdapter {
  loadOidcStatus(): Promise<EnterpriseOidcStatus>;
  passwordLogin(values: { username: string; password: string; totpCode?: string }): Promise<EnterpriseLoginResult>;
  beginPasskeyLogin(username: string, password: string): Promise<{ options: unknown; stateToken: string }>;
  completePasskeyLogin(username: string, password: string, stateToken: string, credential: SerializedPublicKeyCredential): Promise<EnterpriseLoginResult>;
  startOidcLogin(status: EnterpriseOidcStatus, target: string): void;
  /** 宿主自有错误 DTO → 文案的前置映射;返回 null/undefined 时回落共享分类。 */
  mapLoginError?(error: unknown): string | null;
}

export interface EnterpriseLoginControllerLabels extends EnterpriseCredentialLoginLabels {
  usernameRequired: string;
  passwordRequired: string;
  totpRequired: string;
  invalidCredentials: string;
  invalidTotp: string;
  unknownError: string;
  passkeyCancelled: string;
  passkeyFailed: string;
  oidcErrorTitle: string;
  oidcErrorUnknown: string;
  oidcLoading: string;
  oidcLoadFailed: string;
  oidcRetry: string;
  oidcErrors: Record<EnterpriseOidcErrorKind, string>;
}

export const ENTERPRISE_OIDC_ERROR_KINDS = ["access_denied", "not_configured", "state_mismatch", "missing_code", "unreachable", "invalid_response", "invalid_token", "inactive_user", "identity_binding_conflict"] as const;
export type EnterpriseOidcErrorKind = (typeof ENTERPRISE_OIDC_ERROR_KINDS)[number];
export interface EnterpriseOidcErrorInput { kind?: string | null; detail?: string | null; }
export interface EnterpriseOidcError { kind: EnterpriseOidcErrorKind | "unknown"; detailProvided: boolean; }

/** Normalize callback query values without retaining untrusted kind/detail text. */
export function normalizeEnterpriseOidcError(input?: EnterpriseOidcErrorInput | null): EnterpriseOidcError | null {
  const rawKind = input?.kind?.trim().toLowerCase();
  if (!rawKind) return null;
  const kind = ENTERPRISE_OIDC_ERROR_KINDS.find((candidate) => candidate === rawKind) ?? "unknown";
  return { kind, detailProvided: Boolean(input?.detail?.trim()) };
}

export function buildEnterpriseOidcErrorNotice(input: EnterpriseOidcErrorInput | null | undefined, labels: Pick<EnterpriseLoginControllerLabels, "oidcErrorTitle" | "oidcErrorUnknown" | "oidcErrors">): { title: string; message: string } | null {
  const error = normalizeEnterpriseOidcError(input);
  if (!error) return null;
  return { title: labels.oidcErrorTitle, message: error.kind === "unknown" ? labels.oidcErrorUnknown : labels.oidcErrors[error.kind] };
}

export type EnterpriseLoginErrorChannel = "inline" | "hint" | "toast";
export interface EnterpriseLoginErrorReport { channel: EnterpriseLoginErrorChannel; message: string; }

/**
 * 登录失败反馈契约 —— 密码、TOTP 与 Passkey 共用同一套语义, 一次失败只播报一次:
 *
 * - `inline` 凭据错误(用户名/密码错、TOTP 错): 用户要在原地改输入, 所以只留贴着
 *   表单的 InlineNotice(tone=error → role=alert), 不再叠加同文 toast。
 * - `toast`  系统错误(网络中断、上游 5xx 等与本次输入无关的后台故障): 走全局
 *   toast(error variant 不自动消失, 可手动关闭), 表单内不重复渲染。
 * - `hint`   用户取消 Passkey: 这不是失败, 只用 InlineNotice(tone=info →
 *   role=status)轻提示, 不发 toast、不用 alert 打断读屏。
 *
 * 宿主可通过 `feedbackMode="toast"` 强制所有失败走 toast(EasyCustoms 策略);
 * 默认 `auto` 保留上述主应用契约, 保证 EasyTrade 登录反馈回归测试不变。
 */
export type EnterpriseFeedbackMode = "auto" | "toast";

export function reportLoginError(error: unknown, labels: EnterpriseLoginControllerLabels, feedbackMode: EnterpriseFeedbackMode = "auto"): EnterpriseLoginErrorReport {
  if (isWebAuthnCancelled(error)) return { channel: "hint", message: labels.passkeyCancelled };
  const message = loginError(error, labels);
  if (feedbackMode === "toast") return { channel: "toast", message };
  return { channel: message === labels.unknownError ? "toast" : "inline", message };
}

/** Complete credential/OIDC/second-factor controller and surface shared by all hosts. */
export function EnterpriseLoginController({ adapter, labels, target, oidcTarget, changePasswordTarget, navigate, oidcError, successNotice, feedbackMode = "auto" }: { adapter: EnterpriseLoginAdapter; labels: EnterpriseLoginControllerLabels; target: string; oidcTarget?: string; changePasswordTarget: string; navigate: (href: string) => void; oidcError?: EnterpriseOidcErrorInput | null; successNotice?: string | null; /** `toast` = 宿主 toast-only 策略;默认 `auto` 保持主应用 inline 凭据错误。 */ feedbackMode?: EnterpriseFeedbackMode }) {
  const [username, setUsername] = useState(""); const [password, setPassword] = useState(""); const [totpCode, setTotpCode] = useState("");
  const [methods, setMethods] = useState<EnterpriseSecondFactorMethod[] | null>(null); const [activeMethod, setActiveMethod] = useState<EnterpriseSecondFactorMethod>("totp");
  const [loading, setLoading] = useState(false); const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "error" | "info"; message: string } | null>(null);
  const [oidc, setOidc] = useState<{ phase: "loading" | "ready" | "error"; value: EnterpriseOidcStatus | null }>({ phase: "loading", value: null });
  const [oidcRevision, setOidcRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setOidc({ phase: "loading", value: null });
    adapter.loadOidcStatus()
      .then((value) => { if (active) setOidc({ phase: "ready", value }); })
      .catch(() => {
        if (!active) return;
        setOidc({ phase: "error", value: null });
        // FE-UX-12: toast mode announces OIDC status-load failure once via toast.
        if (feedbackMode === "toast") toast.error(labels.oidcLoadFailed);
      });
    return () => { active = false; };
  }, [adapter, feedbackMode, labels.oidcLoadFailed, oidcRevision]);
  useEffect(() => {
    if (feedbackMode !== "toast") return;
    const notice = buildEnterpriseOidcErrorNotice(oidcError, labels);
    if (notice) toast.error(notice.message);
  }, [feedbackMode, labels, oidcError]);
  const unsupportedPasskeyPane = feedbackMode === "toast"
    && Boolean(methods?.includes("passkey"))
    && activeMethod === "passkey"
    && !isWebAuthnAvailable();
  const unsupportedPasskeyPaneWasActive = useRef(false);
  // FE-FB-04: announce the false -> true pane transition, not a replacement methods-array identity.
  useEffect(() => {
    if (unsupportedPasskeyPane && !unsupportedPasskeyPaneWasActive.current) {
      toast.warning(labels.passkeyUnsupported, { id: "login-passkey-unsupported" });
    }
    unsupportedPasskeyPaneWasActive.current = unsupportedPasskeyPane;
  }, [labels.passkeyUnsupported, unsupportedPasskeyPane]);
  const blockedReason = !username.trim() ? labels.usernameRequired : !password ? labels.passwordRequired : methods && activeMethod === "totp" && !totpCode ? labels.totpRequired : "";
  // 单一分发点: 每次登录失败只落到 inline / hint / toast 三者之一。
  function announceLoginError(reason: unknown) {
    const mapped = adapter.mapLoginError?.(reason);
    if (mapped) {
      if (feedbackMode === "toast") { setFeedback(null); toast.error(mapped); return; }
      setFeedback({ tone: "error", message: mapped });
      return;
    }
    const report = reportLoginError(reason, labels, feedbackMode);
    if (report.channel === "toast") { setFeedback(null); toast.error(report.message); return; }
    if (report.channel === "hint" && feedbackMode === "toast") { setFeedback(null); toast.info(report.message); return; }
    setFeedback({ tone: report.channel === "hint" ? "info" : "error", message: report.message });
  }
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (blockedReason) return; setLoading(true); setFeedback(null); try { const result = await adapter.passwordLogin({ username, password, ...(methods && totpCode ? { totpCode } : {}) }); navigate(result.mustChangePassword ? changePasswordTarget : target); } catch (reason) { const nextMethods = secondFactorMethods(reason); if (nextMethods) { setMethods(nextMethods); setActiveMethod(nextMethods[0]); } else { announceLoginError(reason); } } finally { setLoading(false); } }
  async function passkeyLogin() {
    if (!isWebAuthnAvailable()) {
      // Toast mode already warned on pane entry (FE-FB-04); avoid a second channel here.
      if (feedbackMode === "toast") return;
      setFeedback({ tone: "error", message: labels.passkeyFailed });
      return;
    }
    setPasskeyBusy(true); setFeedback(null);
    try {
      const begin = await adapter.beginPasskeyLogin(username, password);
      const credential = await navigator.credentials.get({ publicKey: parseRequestOptions(begin.options) });
      if (!credential) throw new DOMException("credential request returned null", "NotAllowedError");
      const result = await adapter.completePasskeyLogin(username, password, begin.stateToken, serializeCredential(credential as PublicKeyCredential));
      navigate(result.mustChangePassword ? changePasswordTarget : target);
    } catch (reason) { announceLoginError(reason); } finally { setPasskeyBusy(false); }
  }
  const oidcNotice = feedbackMode === "toast" ? null : buildEnterpriseOidcErrorNotice(oidcError, labels);
  const notice = feedback ? { tone: feedback.tone, message: feedback.message } : oidcNotice ? { tone: "error" as const, title: oidcNotice.title, message: oidcNotice.message } : successNotice ? { tone: "success" as const, message: successNotice } : undefined;
  const oidcEnabled = oidc.phase === "ready" && Boolean(oidc.value?.enabled && oidc.value.authorizePath);
  // passkeyError 不再重复渲染 notice 的同一句话 —— 两处同文会让读屏播报两次。
  return <EnterpriseCredentialLoginSurface labels={labels} username={username} password={password} totpCode={totpCode} oidcEnabled={oidcEnabled} oidcState={oidc.phase} loading={loading} blockedReason={blockedReason} secondFactorMethods={methods} activeMethod={activeMethod} passkeyBusy={passkeyBusy} passkeySupported={isWebAuthnAvailable()} notice={notice} feedbackMode={feedbackMode} onUsernameChange={setUsername} onPasswordChange={setPassword} onTotpCodeChange={setTotpCode} onMethodChange={(method) => { setActiveMethod(method); setFeedback(null); }} onOidcRetry={() => setOidcRevision((current) => current + 1)} onOidcLogin={() => { if (oidcEnabled && oidc.value) adapter.startOidcLogin(oidc.value, oidcTarget ?? target); }} onPasskeyLogin={passkeyLogin} onSubmit={submit} />;
}

export function completeEnterprisePasswordChange({ clearLocalSession, clearAuthMethod, navigate, loginTarget }: { clearLocalSession: () => void; clearAuthMethod: () => void; navigate: (href: string) => void; loginTarget: string }) {
  clearLocalSession();
  clearAuthMethod();
  navigate(loginTarget);
}

function secondFactorMethods(error: unknown): EnterpriseSecondFactorMethod[] | null {
  const record = error && typeof error === "object" ? error as { status?: unknown; detail?: unknown; message?: unknown } : null;
  if (!record || (record.status !== 401 && (!(error instanceof Error) || error.name !== "AuthenticationRequiredError"))) return null;
  if (record.detail === "REQUIRE_TOTP" || record.message === "REQUIRE_TOTP") return ["totp"];
  if (!record.detail || typeof record.detail !== "object" || Array.isArray(record.detail)) return null;
  const detail = record.detail as { code?: unknown; methods?: unknown };
  if (detail.code !== "REQUIRE_SECOND_FACTOR") return null;
  const raw = Array.isArray(detail.methods) ? detail.methods : [];
  const methods = (["totp", "passkey"] as const).filter((method) => raw.includes(method));
  return methods.length ? [...methods] : ["totp"];
}

function loginError(error: unknown, labels: EnterpriseLoginControllerLabels): string {
  // 宿主 API 层可能把 Error.message 归一成通用文案(如 EasyTrade 的「请求失败，请稍后重试」),
  // 后端原始文案挂在 error.detail 上——分类须优先读 detail,message 仅作回退。
  const record = error && typeof error === "object" ? (error as { detail?: unknown }) : null;
  const detail = record && typeof record.detail === "string" ? record.detail : null;
  const message = error instanceof Error && error.message.trim() ? error.message : null;
  for (const candidate of [detail, message]) {
    if (!candidate) continue;
    const normalized = candidate.trim().toLowerCase();
    if (normalized === "invalid username or password" || normalized === "用户名或密码错误") return labels.invalidCredentials;
    if (normalized === "totp code is invalid" || normalized === "totp 验证码错误" || normalized === "验证码错误") return labels.invalidTotp;
  }
  return labels.unknownError;
}

export interface EnterpriseOidcCompleteLabels { processing: string; missingTitle: string; missingDescription: string; back: string; }
export function EnterpriseOidcCompleteController({ labels, defaultTarget, persistToken, rememberOidc, navigate, renderBackLink }: { labels: EnterpriseOidcCompleteLabels; defaultTarget: string; persistToken: (token: string) => void; rememberOidc: () => void; navigate: (href: string) => void; renderBackLink: (label: string) => ReactNode }) {
  const [missing, setMissing] = useState(false);
  const handled = useRef(false);
  useEffect(() => { const timer = window.setTimeout(() => { if (handled.current) return; handled.current = true; const fragment = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash; const params = new URLSearchParams(fragment); const token = params.get("token")?.trim(); if (!token) { setMissing(true); return; } persistToken(token); rememberOidc(); window.history.replaceState(null, "", window.location.pathname + window.location.search); navigate(safeInternalTarget(params.get("next"), defaultTarget)); }, 0); return () => window.clearTimeout(timer); }, [defaultTarget, navigate, persistToken, rememberOidc]);
  return <main className="flex min-h-[80vh] items-center justify-center px-4 py-16"><div className="w-full max-w-sm rounded-lg border border-hairline bg-paper p-8 text-center shadow-sm" data-test-id="oidc-complete-page">{missing ? <><h1 className="text-[18px] font-semibold text-ink">{labels.missingTitle}</h1><p className="mt-2 text-[13px] leading-5 text-ink-soft">{labels.missingDescription}</p><div className="mt-5">{renderBackLink(labels.back)}</div></> : <><span className="mx-auto mb-4 block h-5 w-5 animate-spin rounded-full border-2 border-ink/20 border-t-ink" aria-hidden="true"/><p className="text-[14px] font-medium text-ink">{labels.processing}</p></>}</div></main>;
}

export function safeInternalTarget(value: string | null, fallback: string): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) return fallback;
  return value;
}

export interface EnterpriseLogoutAdapter {
  revoke(): Promise<unknown>;
  loadOidcStatus(): Promise<EnterpriseOidcStatus>;
  authMethod(): "local" | "oidc" | null;
  clearLocalSession(): void;
  clearAuthMethod(): void;
  markLoggedOut?(): void;
}

export async function performEnterpriseLogout(adapter: EnterpriseLogoutAdapter, redirectToLoggedOut: () => void): Promise<void> {
  const method = adapter.authMethod();
  await withTimeout(adapter.revoke(), 3000).catch(() => undefined);
  adapter.clearLocalSession(); adapter.markLoggedOut?.(); adapter.clearAuthMethod();
  if (method === "oidc") { const status = await adapter.loadOidcStatus().catch(() => null); const url = status?.endSessionUrl?.trim(); if (url && isSafeHttpsUrl(url)) { window.location.assign(url); return; } }
  redirectToLoggedOut();
}

function isSafeHttpsUrl(value: string) { try { return new URL(value).protocol === "https:"; } catch { return false; } }
function withTimeout<T>(promise: Promise<T>, ms: number) { return new Promise<T>((resolve, reject) => { const timer = setTimeout(() => reject(new Error("timeout")), ms); promise.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); }); }); }
