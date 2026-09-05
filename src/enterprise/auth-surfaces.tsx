"use client";

import { useState, type FormEvent } from "react";
import { Button } from "../primitives/button";
import { Field, Input } from "../primitives/field";
import { InlineNotice } from "../primitives/inline-notice";
import { toast } from "../toast";
import type { EnterpriseLinkRenderer } from "./models";

export type EnterpriseSecondFactorMethod = "totp" | "passkey";

export interface EnterpriseCredentialLoginLabels {
  title: string; username: string; password: string; login: string; loggingIn: string;
  oidcLogin: string; oidcDivider: string; oidcDisabledReason: string;
  oidcLoading: string; oidcLoadFailed: string; oidcRetry: string;
  secondFactorTitle: string; secondFactorSubtitle: string; secondFactorSubtitleTotp: string; secondFactorSubtitlePasskey: string;
  methodTotp: string; methodPasskey: string; totpCode: string; verifyAndLogin: string;
  passkeyHint: string; passkeyVerify: string; passkeyVerifying: string; passkeyUnsupported: string;
}

export interface EnterpriseCredentialLoginProps {
  labels: EnterpriseCredentialLoginLabels;
  username: string; password: string; totpCode: string; oidcEnabled: boolean; oidcState: "loading" | "ready" | "error"; loading: boolean; blockedReason?: string;
  secondFactorMethods: readonly EnterpriseSecondFactorMethod[] | null; activeMethod: EnterpriseSecondFactorMethod;
  passkeyBusy: boolean; passkeySupported: boolean;
  /** 登录反馈的唯一 inline 出口。Passkey 失败也走这里 —— 曾经额外渲染一份同文 passkeyError, 读屏会播报两遍。 */
  notice?: { tone: "error" | "warning" | "info" | "success"; title?: string; message: string };
  /** Default preserves main-app inline OIDC status error; Customs toast mode uses neutral retry only. */
  feedbackMode?: "auto" | "toast";
  onUsernameChange: (value: string) => void; onPasswordChange: (value: string) => void; onTotpCodeChange: (value: string) => void;
  onMethodChange: (method: EnterpriseSecondFactorMethod) => void; onOidcLogin: () => void;
  onOidcRetry: () => void;
  onPasskeyLogin: () => void | Promise<void>; onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
}

/** Exact shared credential/OIDC/second-factor/passkey surface used by both hosts. */
export function EnterpriseCredentialLoginSurface(props: EnterpriseCredentialLoginProps) {
  const { labels } = props;
  const methods = props.secondFactorMethods ?? [];
  const multi = methods.length > 1;
  const subtitle = multi
    ? labels.secondFactorSubtitle
    : props.activeMethod === "passkey"
      ? labels.secondFactorSubtitlePasskey
      : labels.secondFactorSubtitleTotp;
  const toastMode = props.feedbackMode === "toast";
  const oidcErrored = props.oidcState === "error";
  const oidcLoading = props.oidcState === "loading";

  // FE-FB-01 toast mode: no error-only retry row. The OIDC button itself is always present and
  // becomes the retry control when status load failed. Default/inline keeps InlineNotice + disabled button.
  const oidcStatusError =
    oidcErrored && !toastMode ? (
      <InlineNotice
        tone="error"
        message={labels.oidcLoadFailed}
        action={
          <Button type="button" variant="ghost" size="sm" onClick={props.onOidcRetry} data-test-id="login-oidc-retry">
            {labels.oidcRetry}
          </Button>
        }
        data-test-id="login-oidc-status-error"
      />
    ) : null;

  // FE-FB-01: OIDC control keeps neutral always-present copy. On toast-mode load failure
  // the same button retries (click handler), but the label must not become failure-only "Retry".
  const oidcButtonLabel = oidcLoading ? labels.oidcLoading : labels.oidcLogin;

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4 py-16" data-test-id="enterprise-login-page">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-[24px] font-semibold tracking-tight text-ink">{labels.title}</h1>
        </div>
        {props.notice ? (
          <InlineNotice tone={props.notice.tone} title={props.notice.title} message={props.notice.message} className="mb-4" />
        ) : null}
        <div className="rounded-lg border border-hairline bg-paper p-6 shadow-sm">
          <div className="mb-4 flex flex-col gap-3" data-test-id="login-oidc-entry">
            <Button
              type="button"
              variant="primary"
              size="lg"
              className="w-full"
              loading={oidcLoading}
              blockedReason={props.oidcState === "ready" && !props.oidcEnabled ? labels.oidcDisabledReason : ""}
              disabled={!toastMode && oidcErrored}
              onClick={() => {
                if (oidcErrored) props.onOidcRetry();
                else props.onOidcLogin();
              }}
              data-test-id="login-oidc-button"
            >
              {oidcButtonLabel}
            </Button>
            {oidcStatusError}
            <div className="flex items-center gap-3 text-[12px] text-ink-faint" aria-hidden="true">
              <span className="h-px flex-1 bg-hairline" />
              <span>{labels.oidcDivider}</span>
              <span className="h-px flex-1 bg-hairline" />
            </div>
          </div>
          <form onSubmit={(event) => void props.onSubmit(event)} noValidate className="flex flex-col gap-4" data-test-id="login-form">
            <Field label={labels.username} htmlFor="username" required>
              <Input
                id="username"
                type="text"
                value={props.username}
                onChange={(event) => props.onUsernameChange(event.target.value)}
                required
                autoFocus
                autoComplete="username"
                data-test-id="login-username"
              />
            </Field>
            <Field label={labels.password} htmlFor="password" required>
              <Input
                id="password"
                type="password"
                value={props.password}
                onChange={(event) => props.onPasswordChange(event.target.value)}
                required
                autoComplete="current-password"
                data-test-id="login-password"
              />
            </Field>
            {props.secondFactorMethods ? (
              <div className="mt-1 flex flex-col gap-4 border-t border-hairline pt-4" data-test-id="login-need-totp">
                <div>
                  <h2 className="text-[15px] font-semibold text-ink" data-test-id="login-second-factor-title">
                    {labels.secondFactorTitle}
                  </h2>
                  <p className="mt-1 text-[12px] text-ink-soft">{subtitle}</p>
                </div>
                {multi ? (
                  <div className="grid grid-cols-2 gap-2" role="tablist" aria-label={labels.secondFactorTitle} data-test-id="login-second-factor-methods">
                    {methods.map((method) => (
                      <button
                        key={method}
                        type="button"
                        role="tab"
                        aria-selected={props.activeMethod === method}
                        onClick={() => props.onMethodChange(method)}
                        className={`h-9 rounded-[2px] border text-[13px] transition-colors ${
                          props.activeMethod === method
                            ? "border-[rgb(var(--amber))] bg-[rgb(var(--amber))]/[0.08] font-medium text-[rgb(var(--amber))]"
                            : "border-hairline bg-transparent text-ink-soft hover:text-ink"
                        }`}
                        data-test-id={`login-second-factor-method-${method}`}
                      >
                        {method === "totp" ? labels.methodTotp : labels.methodPasskey}
                      </button>
                    ))}
                  </div>
                ) : null}
                {props.activeMethod === "passkey" ? (
                  <div className="flex flex-col gap-3" data-test-id="login-passkey-pane">
                    <p className="text-[12px] leading-5 text-ink-soft">{labels.passkeyHint}</p>
                    <Button
                      type="button"
                      variant="primary"
                      size="lg"
                      loading={props.passkeyBusy}
                      disabled={!props.passkeySupported}
                      onClick={() => void props.onPasskeyLogin()}
                      className="w-full"
                      data-test-id="login-passkey-submit"
                    >
                      {props.passkeyBusy ? labels.passkeyVerifying : labels.passkeyVerify}
                    </Button>
                    {/* FE-FB-04: toast mode drops the red unsupported paragraph; capability stays on the disabled button. */}
                    {!props.passkeySupported && !toastMode ? (
                      <p className="text-[12px] text-[rgb(var(--signal-ink))]" data-test-id="login-passkey-unsupported">
                        {labels.passkeyUnsupported}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <div className="flex flex-col gap-4" data-test-id="login-totp-pane">
                    <Field label={labels.totpCode} htmlFor="totp" required>
                      <Input
                        id="totp"
                        type="text"
                        inputMode="numeric"
                        value={props.totpCode}
                        onChange={(event) => props.onTotpCodeChange(event.target.value.replace(/\D/g, ""))}
                        maxLength={6}
                        minLength={6}
                        placeholder="000000"
                        required
                        autoFocus
                        className="text-center font-mono text-[16px] tracking-[0.5em]"
                        data-test-id="login-totp"
                      />
                    </Field>
                    <Button
                      type="submit"
                      variant="primary"
                      size="lg"
                      loading={props.loading}
                      blockedReason={props.blockedReason}
                      className="w-full"
                      data-test-id="login-submit"
                    >
                      {props.loading ? labels.loggingIn : labels.verifyAndLogin}
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <Button
                type="submit"
                variant={props.oidcEnabled ? "outline" : "primary"}
                size="lg"
                loading={props.loading}
                blockedReason={props.blockedReason}
                className="mt-2 w-full"
                data-test-id="login-submit"
              >
                {props.loading ? labels.loggingIn : labels.login}
              </Button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}

export function SignedOutSurface({ eyebrow, title, description, actionHref, actionLabel, renderLink }: { eyebrow: string; title: string; description: string; actionHref: string; actionLabel: string; renderLink: EnterpriseLinkRenderer }) {
  return <div className="flex min-h-[70vh] items-center justify-center px-4 py-16" data-test-id="logged-out-page"><div className="w-full max-w-md text-center"><div className="eyebrow">{eyebrow}</div><h1 className="mt-3 text-[28px] font-semibold text-ink">{title}</h1><p className="mt-3 text-[13px] leading-6 text-ink-soft">{description}</p><div className="mt-7 flex justify-center">{renderLink({ href: actionHref, className: "inline-flex h-11 items-center justify-center rounded-[2px] border border-ink bg-ink px-6 text-[14px] font-medium tracking-wide text-paper transition-all hover:bg-ink/90", children: actionLabel })}</div></div></div>;
}

export interface ChangePasswordLabels { currentPassword: string; newPassword: string; confirmPassword: string; submit: string; submitting: string; tooShort: string; mismatch: string; failed: string; }
export function EnterpriseChangePasswordForm({ labels, onSubmit, onSuccess, feedbackMode = "inline" }: { labels: ChangePasswordLabels; onSubmit: (currentPassword: string, newPassword: string) => Promise<void>; onSuccess?: () => void; /** `toast` = 操作结果只 toast;字段级校验仍可 aria-invalid。默认 inline 保持主应用。 */ feedbackMode?: "inline" | "toast" }) {
  const [currentPassword, setCurrentPassword] = useState(""); const [newPassword, setNewPassword] = useState(""); const [confirmPassword, setConfirmPassword] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (newPassword.length < 8) {
      if (feedbackMode === "toast") {
        setError(labels.tooShort);
        toast.warning(labels.tooShort);
      }
      else setError(labels.tooShort);
      return;
    }
    if (newPassword !== confirmPassword) {
      if (feedbackMode === "toast") {
        setError(labels.mismatch);
        toast.warning(labels.mismatch);
      }
      else setError(labels.mismatch);
      return;
    }
    setBusy(true); setError(null);
    try {
      await onSubmit(currentPassword, newPassword);
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      onSuccess?.();
    } catch {
      if (feedbackMode === "toast") {
        setError(labels.failed);
        toast.error(labels.failed);
      }
      else setError(labels.failed);
    } finally { setBusy(false); }
  }
  return <form className="space-y-4" onSubmit={submit} data-test-id="change-password-form">{error && feedbackMode === "inline" ? <InlineNotice tone="error" message={error}/> : null}<Field label={labels.currentPassword} required><Input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} data-test-id="change-password-current"/></Field><Field label={labels.newPassword} required><Input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} aria-invalid={feedbackMode === "toast" && Boolean(error) || undefined} data-test-id="change-password-new"/></Field><Field label={labels.confirmPassword} required><Input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} aria-invalid={feedbackMode === "toast" && Boolean(error) || undefined} data-test-id="change-password-confirm"/></Field><Button type="submit" variant="primary" className="w-full" loading={busy} data-test-id="change-password-submit">{busy ? labels.submitting : labels.submit}</Button></form>;
}
