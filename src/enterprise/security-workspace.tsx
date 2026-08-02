"use client";

import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import QRCode from "qrcode";
import { MOTION } from "../motion";
import { toast } from "../toast";
import { Button } from "../primitives/button";
import { Dialog } from "../primitives/dialog";
import { Field, Input } from "../primitives/field";
import { InlineNotice } from "../primitives/inline-notice";
import { EnterpriseChangePasswordForm, type ChangePasswordLabels } from "./auth-surfaces";
import { EnterpriseSecurityMethodRow } from "./shared-settings";
import { EnterprisePermissionDeniedState } from "./surface-helpers";
import { isWebAuthnAvailable, isWebAuthnCancelled, parseCreationOptions, serializeCredential } from "./webauthn";
import type { SecuritySettingsLabels } from "./settings-surfaces";
import { EnterpriseSecurityWorkspace as SecurityPageFrame } from "./settings-surfaces";

export interface EnterprisePasskeyItem { id: string; name: string | null; createdAt: string | null; lastUsedAt: string | null; }
export interface EnterpriseSecurityAdapter {
  changePassword(currentPassword: string, newPassword: string): Promise<void>;
  loadTotpStatus(): Promise<{ enabled: boolean }>;
  beginTotp(): Promise<{ secret: string; otpauthUri: string }>;
  confirmTotp(code: string): Promise<void>;
  disableTotp(password: string, code: string): Promise<void>;
  loadPasskeys?(): Promise<readonly EnterprisePasskeyItem[]>;
  beginPasskeyRegistration?(): Promise<{ options: unknown; stateToken: string }>;
  completePasskeyRegistration?(stateToken: string, credential: unknown, name: string): Promise<void>;
  deletePasskey?(id: string): Promise<void>;
}

export interface EnterpriseSecurityOperationsLabels {
  page: Pick<SecuritySettingsLabels, "title" | "description" | "passwordTitle" | "passwordDescription" | "twoFactorTitle" | "twoFactorDescription">;
  password: ChangePasswordLabels & { success: string };
  authenticator: string; authenticatorHint: string; loading: string; statusFailed: string; authenticatorOperationFailed: string; retry: string; enabled: string; enable: string; disable: string;
  scanQr: string; qrAlt: string; manualEntry: string; currentCode: string; currentPassword: string; cancel: string; confirmEnable: string; confirmDisable: string; missingFields: string; enabledSuccess: string; disabledSuccess: string;
  passkeysTitle: string; passkeysDescription: string; addPasskey: string; passkeyUnsupported: string; passkeysLoadFailed: string; passkeysEmpty: string; passkeyName: string; passkeyNamePlaceholder: string; addPasskeyHint: string; confirmAddPasskey: string; deletePasskey: string; confirmDeletePasskey: string; passkeyUnnamed: string; passkeyAdded: string; passkeyDeleted: string; passkeyOperationFailed: string;
  permissionDenied: string;
  /** Page-unavailable detail for toast-mode EmptyState (FE-FB-02). */
  permissionDeniedDetail?: string;
  /** Label for the safe root-navigation fallback when the host omits a route action. */
  permissionDeniedAction?: string;
  close: string;
  totpDigit: (position: number) => string;
}

export interface EnterpriseSecurityPermissions {
  password: boolean;
  /** Reading enrollment state and disabling an existing authenticator require advance. */
  totpStatus: boolean;
  createTotp: boolean;
  disableTotp: boolean;
  viewPasskeys: boolean;
  canRegisterPasskeys: boolean;
  canDeletePasskeys: boolean;
}

/** Complete password, TOTP and passkey settings surface. Hosts supply only transport and labels. */
export function EnterpriseAccountSecuritySurface({
  adapter,
  labels,
  permissions,
  onPasswordChanged,
  feedbackMode = "inline",
  permissionDeniedActions,
}: {
  adapter: EnterpriseSecurityAdapter;
  labels: EnterpriseSecurityOperationsLabels;
  permissions: EnterpriseSecurityPermissions;
  onPasswordChanged?: () => void;
  /** Default `inline` preserves main-app path; Customs passes `toast`. */
  feedbackMode?: "inline" | "toast";
  /** Optional route-specific action; omission falls back to safe root navigation. */
  permissionDeniedActions?: ReactNode;
}) {
  const canUseTotp = permissions.totpStatus || permissions.createTotp || permissions.disableTotp;
  if (!permissions.password && !canUseTotp && !permissions.viewPasskeys) {
    // FE-FB-02 / DECISIONS ruling 4: page-state EmptyState (title + detail + home), no toast, no redirect.
    if (feedbackMode === "toast") {
      return (
        <EnterprisePermissionDeniedState
          title={labels.permissionDenied}
          description={labels.permissionDeniedDetail}
          actions={permissionDeniedActions}
          defaultActionLabel={labels.permissionDeniedAction}
        />
      );
    }
    return <InlineNotice tone="error" message={labels.permissionDenied} data-test-id="permission-denied" />;
  }
  return <SecurityPageFrame labels={labels.page} password={permissions.password ? <EnterpriseChangePasswordForm labels={labels.password} onSubmit={adapter.changePassword} onSuccess={onPasswordChanged ?? (() => toast.success(labels.password.success))} feedbackMode={feedbackMode} /> : undefined} twoFactor={canUseTotp || permissions.viewPasskeys ? <div className="divide-y divide-hairline">{canUseTotp ? <TotpOperations adapter={adapter} labels={labels} canLoadStatus={permissions.totpStatus} canCreate={permissions.createTotp} canDisable={permissions.disableTotp} feedbackMode={feedbackMode} /> : null}{permissions.viewPasskeys ? <PasskeyOperations adapter={adapter} labels={labels} canRegister={permissions.canRegisterPasskeys} canDelete={permissions.canDeletePasskeys} feedbackMode={feedbackMode} /> : null}</div> : undefined} />;
}

function TotpOperations({ adapter, labels, canLoadStatus, canCreate, canDisable, feedbackMode = "inline" }: { adapter: EnterpriseSecurityAdapter; labels: EnterpriseSecurityOperationsLabels; canLoadStatus: boolean; canCreate: boolean; canDisable: boolean; feedbackMode?: "inline" | "toast" }) {
  const toastMode = feedbackMode === "toast";
  const [enabled, setEnabled] = useState(false); const [statusKnown, setStatusKnown] = useState(false); const [loading, setLoading] = useState(canLoadStatus); const [failed, setFailed] = useState(false);
  const [enable, setEnable] = useState({ open: false, busy: false, secret: "", uri: "", qr: "", code: "" }); const [disable, setDisable] = useState({ open: false, busy: false, password: "", code: "" });
  const refresh = useCallback(async () => {
    if (!canLoadStatus) { setLoading(false); return; }
    setLoading(true); setFailed(false);
    try { setEnabled((await adapter.loadTotpStatus()).enabled); setStatusKnown(true); }
    catch { setFailed(true); if (toastMode) toast.error(labels.statusFailed); }
    finally { setLoading(false); }
  }, [adapter, canLoadStatus, labels.statusFailed, toastMode]);
  useEffect(() => { void refresh(); }, [refresh]);
  async function begin() { setEnable((state) => ({ ...state, busy: true })); try { const value = await adapter.beginTotp(); const qr = await QRCode.toDataURL(value.otpauthUri, { errorCorrectionLevel: "M", margin: 2, width: 200 }); setEnable({ open: true, busy: false, secret: value.secret, uri: value.otpauthUri, qr, code: "" }); } catch { toast.error(labels.authenticatorOperationFailed); setEnable((state) => ({ ...state, busy: false })); } }
  async function confirm() { const code = digits(enable.code); if (code.length !== 6) return toast.warning(labels.missingFields); setEnable((state) => ({ ...state, busy: true })); try { await adapter.confirmTotp(code); toast.success(labels.enabledSuccess); setEnabled(true); setStatusKnown(true); setEnable({ open: false, busy: false, secret: "", uri: "", qr: "", code: "" }); await refresh(); } catch { toast.error(labels.authenticatorOperationFailed); setEnable((state) => ({ ...state, busy: false })); } }
  async function confirmDisable() { const code = digits(disable.code); if (!disable.password || code.length !== 6) return toast.warning(labels.missingFields); setDisable((state) => ({ ...state, busy: true })); try { await adapter.disableTotp(disable.password, code); toast.success(labels.disabledSuccess); setEnabled(false); setStatusKnown(true); setDisable({ open: false, busy: false, password: "", code: "" }); await refresh(); } catch { toast.error(labels.authenticatorOperationFailed); setDisable((state) => ({ ...state, busy: false })); } }

  const knownDescription = enabled
    ? <span data-test-id="totp-enabled-label">{labels.enabled}</span>
    : <span data-test-id="totp-disabled-label">{labels.authenticatorHint}</span>;

  // FE-FB-01 toast mode: only an initial miss is unknown. Refreshes retain the
  // last observed status and action while the toast reports a rejected request.
  // Default/inline hosts keep their existing loading/error replacement branch.
  const description = toastMode && canLoadStatus
    ? statusKnown
      ? knownDescription
      : loading
        ? null
        : <span className="text-ink-faint" data-test-id="totp-status-missing">—</span>
    : loading
      ? null
      : failed
        ? <span className="text-[rgb(var(--signal))]" data-test-id="totp-status-error">{labels.loading}</span>
        : knownDescription;

  let action: ReactNode = null;
  if (toastMode && canLoadStatus) {
    const primary =
      statusKnown
        ? enabled
          ? canDisable
            ? <Button variant="ghost" data-test-id="totp-disable-btn" onClick={() => setDisable((state) => ({ ...state, open: true }))}>{labels.disable}</Button>
            : null
          : canCreate
            ? <Button variant="ghost" loading={enable.busy && !enable.open} data-test-id="totp-enable-btn" onClick={() => void begin()}>{labels.enable}</Button>
            : null
        : null;
    action = (
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" data-test-id="totp-status-retry" loading={loading} onClick={() => void refresh()}>{labels.retry}</Button>
        {primary}
      </div>
    );
  } else {
    action = loading
      ? <span className="text-[12px] text-ink-soft">{labels.loading}</span>
      : failed
        ? <Button variant="ghost" data-test-id="totp-status-retry" onClick={() => void refresh()}>{labels.retry}</Button>
        : enabled
          ? canDisable
            ? <Button variant="ghost" data-test-id="totp-disable-btn" onClick={() => setDisable((state) => ({ ...state, open: true }))}>{labels.disable}</Button>
            : null
          : canCreate
            ? <Button variant="ghost" loading={enable.busy && !enable.open} data-test-id="totp-enable-btn" onClick={() => void begin()}>{labels.enable}</Button>
            : null;
  }

  return <EnterpriseSecurityMethodRow testId="totp-method" title={labels.authenticator} description={description} action={action}><Dialog open={enable.open} onClose={() => enable.busy ? undefined : setEnable((state) => ({ ...state, open: false }))} title={labels.enable} closeLabel={labels.close} size="md" footer={<><Button variant="ghost" disabled={enable.busy} onClick={() => setEnable((state) => ({ ...state, open: false }))}>{labels.cancel}</Button><Button variant="primary" loading={enable.busy} onClick={() => void confirm()} data-test-id="totp-enable-confirm">{labels.confirmEnable}</Button></>}><div className="flex flex-col items-center gap-4" data-test-id="totp-enable-dialog"><p className="text-[12px] text-ink-soft">{labels.scanQr}</p>{enable.qr ? <img src={enable.qr} alt={labels.qrAlt} width={200} height={200} className="rounded border border-hairline bg-paper p-2" data-test-id="totp-qr" /> : null}<div className="w-full"><p className="mb-1 text-[11px] uppercase tracking-wider text-ink-faint">{labels.manualEntry}</p><code className="block w-full select-all break-all rounded bg-paper-deep px-3 py-2 font-mono text-[12px]" data-test-id="totp-secret">{enable.secret}</code></div><Field label={labels.currentCode} htmlFor="enable-code" required><TotpCodeInput id="enable-code" value={enable.code} onChange={(code) => setEnable((state) => ({ ...state, code }))} disabled={enable.busy} baseTestId="totp-enable-code" digitLabel={labels.totpDigit} /></Field></div></Dialog><Dialog open={disable.open} onClose={() => disable.busy ? undefined : setDisable((state) => ({ ...state, open: false }))} title={labels.disable} closeLabel={labels.close} size="sm" footer={<><Button variant="ghost" disabled={disable.busy} onClick={() => setDisable((state) => ({ ...state, open: false }))}>{labels.cancel}</Button><Button variant="primary" loading={disable.busy} onClick={() => void confirmDisable()} data-test-id="totp-disable-confirm">{labels.confirmDisable}</Button></>}><div className="flex flex-col gap-3" data-test-id="totp-disable-dialog"><Field label={labels.currentPassword} htmlFor="disable-password" required><Input id="disable-password" type="password" value={disable.password} onChange={(event) => setDisable((state) => ({ ...state, password: event.target.value }))} data-test-id="totp-disable-password" /></Field><Field label={labels.currentCode} htmlFor="disable-code" required><TotpCodeInput id="disable-code" value={disable.code} onChange={(code) => setDisable((state) => ({ ...state, code }))} disabled={disable.busy} baseTestId="totp-disable-code" digitLabel={labels.totpDigit} /></Field></div></Dialog></EnterpriseSecurityMethodRow>;
}

function PasskeyOperations({ adapter, labels, canRegister, canDelete, feedbackMode = "inline" }: { adapter: EnterpriseSecurityAdapter; labels: EnterpriseSecurityOperationsLabels; canRegister: boolean; canDelete: boolean; feedbackMode?: "inline" | "toast" }) {
  const toastMode = feedbackMode === "toast";
  const reduceMotion = useReducedMotion();
  const [items, setItems] = useState<readonly EnterprisePasskeyItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [add, setAdd] = useState({ open: false, busy: false, name: "", notice: "" });
  const [remove, setRemove] = useState<EnterprisePasskeyItem | null>(null);
  const [removing, setRemoving] = useState(false);
  const loadRequestSequence = useRef(0);
  const removedIds = useRef(new Set<string>());
  const refresh = useCallback(async () => {
    const request = (loadRequestSequence.current += 1);
    if (!adapter.loadPasskeys) {
      setItems([]);
      setFailed(false);
      return;
    }
    try {
      const loaded = await adapter.loadPasskeys();
      if (request !== loadRequestSequence.current) return;
      const visible = loaded.filter((item) => !removedIds.current.has(item.id));
      const loadedIds = new Set(loaded.map((item) => item.id));
      for (const removedId of removedIds.current) {
        if (!loadedIds.has(removedId)) removedIds.current.delete(removedId);
      }
      setItems(visible);
      setFailed(false);
    } catch {
      if (request !== loadRequestSequence.current) return;
      // FE-FB-01: retain the last successful list. An initial miss remains null/unknown.
      setFailed(true);
      if (toastMode) toast.error(labels.passkeysLoadFailed);
    }
  }, [adapter, labels.passkeysLoadFailed, toastMode]);
  useEffect(() => { void refresh(); }, [refresh]);
  const supported = isWebAuthnAvailable() && Boolean(adapter.beginPasskeyRegistration && adapter.completePasskeyRegistration);
  async function register() {
    const name = add.name.trim();
    if (!name) {
      if (toastMode) return toast.warning(labels.missingFields);
      return setAdd((state) => ({ ...state, notice: labels.missingFields }));
    }
    if (!supported || !adapter.beginPasskeyRegistration || !adapter.completePasskeyRegistration) {
      if (toastMode) return toast.warning(labels.passkeyUnsupported);
      return setAdd((state) => ({ ...state, notice: labels.passkeyUnsupported }));
    }
    setAdd((state) => ({ ...state, busy: true, notice: "" }));
    try {
      const begin = await adapter.beginPasskeyRegistration();
      const credential = await navigator.credentials.create({ publicKey: parseCreationOptions(begin.options) });
      if (!credential) throw new DOMException("credential creation returned null", "NotAllowedError");
      await adapter.completePasskeyRegistration(begin.stateToken, serializeCredential(credential as PublicKeyCredential), name);
      toast.success(labels.passkeyAdded);
      setAdd({ open: false, busy: false, name: "", notice: "" });
      await refresh();
    } catch (error) {
      const message = isWebAuthnCancelled(error) ? labels.cancel : labels.passkeyOperationFailed;
      if (toastMode) { toast.error(message); setAdd((state) => ({ ...state, busy: false })); }
      else setAdd((state) => ({ ...state, busy: false, notice: message }));
    }
  }
  async function removeItem() {
    if (!remove || !adapter.deletePasskey) return;
    setRemoving(true);
    try {
      const removedId = remove.id;
      await adapter.deletePasskey(removedId);
      // FE-FB-13: DELETE is authoritative. Apply it before revalidation so a
      // rejected, overlapping, or replica-stale GET cannot retain the row.
      loadRequestSequence.current += 1;
      removedIds.current.add(removedId);
      setItems((current) => current?.filter((item) => item.id !== removedId) ?? current);
      toast.success(labels.passkeyDeleted);
      setRemove(null);
      await refresh();
    } catch {
      toast.error(labels.passkeyOperationFailed);
    } finally {
      setRemoving(false);
    }
  }

  const listItems = items ?? [];
  const visibleItems = failed && !toastMode ? [] : listItems;

  // FE-FB-01 toast mode: permanent refresh next to add; never show empty-as-success after failure.
  const headerActions = (
    <div className="flex flex-wrap items-center gap-2">
      {toastMode ? (
        <Button variant="ghost" onClick={() => void refresh()} data-test-id="passkeys-refresh">{labels.retry}</Button>
      ) : null}
      {canRegister ? (
        <Button variant="ghost" disabled={!supported} onClick={() => setAdd({ open: true, busy: false, name: "", notice: "" })} data-test-id="passkey-add-btn">
          {labels.addPasskey}
        </Button>
      ) : null}
    </div>
  );

  // FE-FB-13: this owner stays mounted across loading, failure, empty, and list
  // states. Toast refresh failures keep known rows; inline hosts retain their
  // existing failure panel while row exits now stay inside one owner.
  const body = (
    <div className="mt-3" data-test-id="passkeys-list-region">
      <ul className={items === null || (failed && !toastMode) ? "" : "divide-y divide-hairline border-t border-hairline"} data-test-id="passkeys-list">
        <AnimatePresence initial={false}>
          {visibleItems.map((item) => (
            <motion.li
              key={item.id}
              layout={!reduceMotion}
              initial={reduceMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
              transition={reduceMotion ? { duration: 0 } : { duration: MOTION.list.duration, ease: MOTION.list.ease }}
              className="flex items-center justify-between gap-2 py-2.5"
              data-test-id={`passkey-row-${item.id}`}
            >
              <span className="text-[13px]">{item.name?.trim() || labels.passkeyUnnamed}</span>
              {canDelete ? (
                <Button variant="ghost-danger" size="sm" onClick={() => setRemove(item)} data-test-id={`passkey-delete-btn-${item.id}`}>
                  {labels.deletePasskey}
                </Button>
              ) : null}
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      {failed && !toastMode ? (
        <div className="flex items-center gap-2" data-test-id="passkeys-load-failed">
          <p className="text-[13px] text-[rgb(var(--signal))]">{labels.passkeysLoadFailed}</p>
          <Button variant="ghost" onClick={() => void refresh()}>{labels.retry}</Button>
        </div>
      ) : items === null && failed ? (
        <p className="text-[13px] text-ink-faint" data-test-id="passkeys-load-missing">—</p>
      ) : items === null ? (
        <p className="text-[13px] text-ink-soft">{labels.loading}</p>
      ) : listItems.length === 0 ? (
        <p className="py-2.5 text-[13px] text-ink-soft" data-test-id="passkeys-empty">{labels.passkeysEmpty}</p>
      ) : null}
    </div>
  );

  return (
    <div className="py-4" data-test-id="passkeys-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[13px] text-ink" data-test-id="passkeys-title">{labels.passkeysTitle}</p>
          <p className="mt-0.5 text-[12px] text-ink-faint">{labels.passkeysDescription}</p>
        </div>
        {headerActions}
      </div>
      {body}
      <Dialog open={add.open} onClose={() => add.busy ? undefined : setAdd({ open: false, busy: false, name: "", notice: "" })} title={labels.addPasskey} closeLabel={labels.close} size="sm" footer={<><Button variant="ghost" disabled={add.busy} onClick={() => setAdd({ open: false, busy: false, name: "", notice: "" })}>{labels.cancel}</Button><Button variant="primary" loading={add.busy} onClick={() => void register()} data-test-id="passkey-add-confirm">{labels.confirmAddPasskey}</Button></>}><div className="space-y-3" data-test-id="passkey-add-dialog"><p className="text-[12px] text-ink-soft">{labels.addPasskeyHint}</p><Field label={labels.passkeyName}><Input value={add.name} onChange={(event) => setAdd((state) => ({ ...state, name: event.target.value }))} placeholder={labels.passkeyNamePlaceholder} data-test-id="passkey-name-input" /></Field>{!toastMode && add.notice ? <InlineNotice tone="error" message={add.notice} data-test-id="passkey-add-notice" /> : null}</div></Dialog>
      <Dialog open={Boolean(remove)} onClose={() => removing ? undefined : setRemove(null)} title={labels.deletePasskey} closeLabel={labels.close} size="sm" footer={<><Button variant="ghost" disabled={removing} onClick={() => setRemove(null)}>{labels.cancel}</Button><Button variant="danger" loading={removing} onClick={() => void removeItem()} data-test-id="passkey-delete-confirm">{labels.confirmDeletePasskey}</Button></>}><p data-test-id="passkey-delete-dialog">{remove?.name || labels.passkeyUnnamed}</p></Dialog>
    </div>
  );
}

const CODE_LENGTH = 6;
function TotpCodeInput({ id, value, onChange, baseTestId, digitLabel, disabled }: { id: string; value: string; onChange: (value: string) => void; baseTestId: string; digitLabel: (position: number) => string; disabled?: boolean }) { const refs = useRef<Array<HTMLInputElement | null>>([]); const slots = normalizeSlots(value); function focus(index: number) { refs.current[Math.max(0, Math.min(CODE_LENGTH - 1, index))]?.focus(); } function apply(index: number, raw: string) { const incoming = digits(raw).slice(0, CODE_LENGTH - index); const next = slots.map((slot) => slot === " " ? "" : slot); if (!incoming) next[index] = ""; else for (let offset = 0; offset < incoming.length; offset += 1) next[index + offset] = incoming[offset]; onChange(next.map((slot) => slot || " ").join("")); if (incoming) focus(index + incoming.length); } function key(index: number, event: KeyboardEvent<HTMLInputElement>) { if (event.key !== "Backspace" || slots[index] !== " " || index === 0) return; event.preventDefault(); const next = slots.map((slot) => slot === " " ? "" : slot); next[index - 1] = ""; onChange(next.map((slot) => slot || " ").join("")); focus(index - 1); } function paste(index: number, event: ClipboardEvent<HTMLInputElement>) { event.preventDefault(); apply(index, event.clipboardData.getData("text")); } return <div className="grid grid-cols-6 gap-2" data-test-id={baseTestId}>{slots.map((slot, index) => <input key={index} ref={(node) => { refs.current[index] = node; }} id={index === 0 ? id : undefined} type="text" inputMode="numeric" maxLength={CODE_LENGTH} value={slot === " " ? "" : slot} disabled={disabled} aria-label={digitLabel(index + 1)} data-test-id={`${baseTestId}-digit-${index}`} onChange={(event) => apply(index, event.target.value)} onKeyDown={(event) => key(index, event)} onPaste={(event) => paste(index, event)} className="h-10 w-full rounded border border-ink/15 bg-paper-soft text-center font-mono text-[18px] focus:border-[rgb(var(--amber))] focus:outline-none disabled:opacity-50" />)}</div>; }
function digits(value: string) { return value.replace(/\D/g, "").slice(0, CODE_LENGTH); }
function normalizeSlots(value: string) { return value.padEnd(CODE_LENGTH, " ").slice(0, CODE_LENGTH).split("").map((character) => /\d/.test(character) ? character : " "); }
