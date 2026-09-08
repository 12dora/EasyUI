"use client";

import { useState, type ReactNode } from "react";
import { Button } from "../primitives/button";
import { Checkbox } from "../primitives/checkbox";
import { CollapseReveal } from "../primitives/collapse-reveal";
import { Field, Input } from "../primitives/field";
import { FormGrid } from "../primitives/form-grid";
import { InfoTooltip } from "../primitives/info-tooltip";
import { InlineNotice } from "../primitives/inline-notice";
import { Section } from "../primitives/section";
import { EnterpriseSecretField } from "./shared-settings";

export interface EnterpriseOidcConfigurationValue {
  enabled: boolean;
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUri: string;
  userinfoEndpoint: string;
  clientId: string;
  hasClientSecret: boolean;
  scopes: string;
  redirectBaseUrl: string;
  redirectUri: string;
  frontendBaseUrl: string;
  serverBaseUrl: string;
}

export interface EnterpriseEasyAuthConfigurationValue {
  baseUrl: string;
  appKey: string;
  hasCredential: boolean;
  /** Whether the host already stores a webhook secret. The secret itself is never sent back. */
  hasWebhookSecret: boolean;
  permissionRequestUrl: string;
}

export interface EnterpriseIntegrationConfigurationLabels {
  save: string;
  enabled: string;
  configured: string;
  notConfigured: string;
  clearSecret: string;
  authorityHint: string;
  oidcTitle: string;
  oidcDescription: string;
  issuer: string;
  clientId: string;
  clientSecret: string;
  scopes: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUri: string;
  userinfoEndpoint: string;
  redirectBaseUrl: string;
  redirectUri?: string;
  frontendBaseUrl: string;
  serverBaseUrl: string;
  easyAuthTitle: string;
  easyAuthDescription: string;
  baseUrl: string;
  appKey: string;
  credential: string;
  webhookSecret: string;
  webhookSecretHint: string;
  permissionRequestUrl: string;
  discover: string;
  connectionTest: string;
  advancedTitle: string;
  advancedDescription: string;
  advancedShow: string;
  advancedHide: string;
  operationSucceeded: string;
  operationFailed: string;
  guideAriaLabel: string;
  guides?: Partial<Record<"issuer" | "clientId" | "clientSecret", string>>;
}

export interface EnterpriseWriteOnlySecret { value: string; clear: boolean; }

export function EnterpriseConfigurationFieldGrid({ children }: { children: ReactNode }) {
  return <FormGrid columns={2}>{children}</FormGrid>;
}

interface OidcFormProps {
  labels: EnterpriseIntegrationConfigurationLabels;
  value: EnterpriseOidcConfigurationValue;
  clientSecret: EnterpriseWriteOnlySecret;
  disabled?: boolean;
  saving?: boolean;
  discovering?: boolean;
  testing?: boolean;
  operationResult?: { ok: boolean; message: string } | null;
  onChange: (patch: Partial<EnterpriseOidcConfigurationValue>) => void;
  onClientSecretChange: (next: EnterpriseWriteOnlySecret) => void;
  onSave: () => void | Promise<void>;
  onDiscover?: () => void | Promise<void>;
  onTest?: () => void | Promise<void>;
  /** Customs hides protocol endpoints from disabled/view-only forms; omitted preserves the legacy form. */
  hideAdvancedWhenDisabled?: boolean;
}

export function EnterpriseOidcConfigurationForm(props: OidcFormProps) {
  const { labels, value, disabled } = props;
  const [advancedOpen, setAdvancedOpen] = useState(false);
  return (
    <div className="space-y-2" data-test-id="identity-integration-section">
      <Section
        title={labels.oidcTitle}
        description={labels.oidcDescription}
        actions={!disabled ? <>
          {props.onTest ? <Button variant="outline" size="sm" loading={props.testing} onClick={() => void props.onTest?.()} data-test-id="identity-connection-test">{labels.connectionTest}</Button> : null}
          <Button variant="primary" size="sm" loading={props.saving} onClick={() => void props.onSave()} data-test-id="enterprise-oidc-save">{labels.save}</Button>
        </> : null}
      >
        <div className="space-y-4">
          <Checkbox label={labels.enabled} checked={value.enabled} disabled={disabled} onChange={(event) => props.onChange({ enabled: event.target.checked })} data-test-id="identity-enabled" />
          <Field label={<GuidedLabel label={labels.issuer} guide={labels.guides?.issuer} ariaLabel={labels.guideAriaLabel} testId="identity-guide-issuer" />} htmlFor="enterprise-oidc-issuer">
            <div className="flex items-start gap-2">
              <Input id="enterprise-oidc-issuer" value={value.issuer} disabled={disabled} className="font-mono" onChange={(event) => props.onChange({ issuer: event.target.value })} />
              {!disabled && props.onDiscover ? <Button variant="outline" size="md" className="h-[34px] shrink-0" loading={props.discovering} onClick={() => void props.onDiscover?.()} data-test-id="identity-discover">{labels.discover}</Button> : null}
            </div>
          </Field>
          <EnterpriseConfigurationFieldGrid>
            <TextField id="enterprise-oidc-client-id" label={<GuidedLabel label={labels.clientId} guide={labels.guides?.clientId} ariaLabel={labels.guideAriaLabel} testId="identity-guide-client-id" />} value={value.clientId} disabled={disabled} onChange={(clientId) => props.onChange({ clientId })} />
            <EnterpriseSecretField id="enterprise-oidc-client-secret" label={<GuidedLabel label={labels.clientSecret} guide={labels.guides?.clientSecret} ariaLabel={labels.guideAriaLabel} testId="identity-guide-client-secret" />} keepHint={labels.authorityHint} clearLabel={labels.clearSecret} configuredHint={value.hasClientSecret ? labels.configured : labels.notConfigured} value={props.clientSecret.value} clear={props.clientSecret.clear} disabled={disabled} onValueChange={(secret) => props.onClientSecretChange({ value: secret, clear: false })} onClearChange={(clear) => props.onClientSecretChange({ value: clear ? "" : props.clientSecret.value, clear })} />
            <TextField id="enterprise-oidc-scopes" label={labels.scopes} value={value.scopes} disabled={disabled} onChange={(scopes) => props.onChange({ scopes })} />
            <TextField id="enterprise-oidc-redirect-base" label={labels.redirectBaseUrl} value={value.redirectBaseUrl} disabled={disabled} onChange={(redirectBaseUrl) => props.onChange({ redirectBaseUrl })} />
            <TextField id="enterprise-oidc-frontend-base" label={labels.frontendBaseUrl} value={value.frontendBaseUrl} disabled={disabled} onChange={(frontendBaseUrl) => props.onChange({ frontendBaseUrl })} />
          </EnterpriseConfigurationFieldGrid>
          {labels.redirectUri ? <Field label={labels.redirectUri}><p className="break-all rounded border border-hairline bg-paper-deep px-3 py-2 font-mono text-[12px]" data-test-id="identity-redirect-uri">{value.redirectUri || "—"}</p></Field> : null}
          {props.operationResult ? <InlineNotice tone={props.operationResult.ok ? "success" : "error"} message={props.operationResult.message} data-test-id="identity-connection-test-result" /> : null}
        </div>
      </Section>
      {!disabled || !props.hideAdvancedWhenDisabled ? (
        <Section title={labels.advancedTitle} description={labels.advancedDescription} actions={<Button variant="ghost" size="sm" onClick={() => setAdvancedOpen((open) => !open)} data-test-id="identity-advanced-toggle">{advancedOpen ? labels.advancedHide : labels.advancedShow}</Button>}>
          <CollapseReveal open={advancedOpen} data-test-id="identity-advanced-reveal">
            <div className="space-y-4" data-test-id="identity-advanced-fields">
              <EnterpriseConfigurationFieldGrid>
                <TextField id="enterprise-oidc-authorization-endpoint" label={labels.authorizationEndpoint} value={value.authorizationEndpoint} disabled={disabled} onChange={(authorizationEndpoint) => props.onChange({ authorizationEndpoint })} />
                <TextField id="enterprise-oidc-token-endpoint" label={labels.tokenEndpoint} value={value.tokenEndpoint} disabled={disabled} onChange={(tokenEndpoint) => props.onChange({ tokenEndpoint })} />
                <TextField id="enterprise-oidc-jwks-uri" label={labels.jwksUri} value={value.jwksUri} disabled={disabled} onChange={(jwksUri) => props.onChange({ jwksUri })} />
                <TextField id="enterprise-oidc-userinfo-endpoint" label={labels.userinfoEndpoint} value={value.userinfoEndpoint} disabled={disabled} onChange={(userinfoEndpoint) => props.onChange({ userinfoEndpoint })} />
                <TextField id="enterprise-oidc-server-base" label={labels.serverBaseUrl} value={value.serverBaseUrl} disabled={disabled} onChange={(serverBaseUrl) => props.onChange({ serverBaseUrl })} />
              </EnterpriseConfigurationFieldGrid>
            </div>
          </CollapseReveal>
        </Section>
      ) : null}
    </div>
  );
}

interface EasyAuthFormProps {
  labels: EnterpriseIntegrationConfigurationLabels;
  value: EnterpriseEasyAuthConfigurationValue;
  credential: EnterpriseWriteOnlySecret;
  /** Write-only webhook secret, shaped exactly like `credential`. */
  webhookSecret: EnterpriseWriteOnlySecret;
  disabled?: boolean;
  connectionDisabled?: boolean;
  saving?: boolean;
  onChange: (patch: Partial<EnterpriseEasyAuthConfigurationValue>) => void;
  onCredentialChange: (next: EnterpriseWriteOnlySecret) => void;
  onWebhookSecretChange: (next: EnterpriseWriteOnlySecret) => void;
  onSave: () => void | Promise<void>;
}

export function EnterpriseEasyAuthConfigurationForm({ labels, value, credential, webhookSecret, disabled, connectionDisabled, saving, onChange, onCredentialChange, onWebhookSecretChange, onSave }: EasyAuthFormProps) {
  const connectionReadOnly = disabled || connectionDisabled;
  return (
    <Section
      title={labels.easyAuthTitle}
      description={labels.easyAuthDescription}
      actions={!disabled ? <Button variant="primary" size="sm" loading={saving} onClick={() => void onSave()} data-test-id="enterprise-easyauth-save">{labels.save}</Button> : null}
    >
      <EnterpriseConfigurationFieldGrid>
        <TextField id="enterprise-easyauth-base-url" label={labels.baseUrl} value={value.baseUrl} disabled={connectionReadOnly} onChange={(baseUrl) => onChange({ baseUrl })}/>
        <TextField id="enterprise-easyauth-app-key" label={labels.appKey} value={value.appKey} disabled={connectionReadOnly} onChange={(appKey) => onChange({ appKey })}/>
        <EnterpriseSecretField id="enterprise-easyauth-credential" label={labels.credential} keepHint={labels.authorityHint} clearLabel={labels.clearSecret} configuredHint={value.hasCredential ? labels.configured : labels.notConfigured} value={credential.value} clear={credential.clear} disabled={connectionReadOnly} onValueChange={(secret) => onCredentialChange({ value: secret, clear: false })} onClearChange={(clear) => onCredentialChange({ value: clear ? "" : credential.value, clear })} testId="easyauth-credential"/>
        <EnterpriseSecretField id="enterprise-easyauth-webhook-secret" label={labels.webhookSecret} keepHint={labels.webhookSecretHint} clearLabel={labels.clearSecret} configuredHint={value.hasWebhookSecret ? labels.configured : labels.notConfigured} value={webhookSecret.value} clear={webhookSecret.clear} disabled={connectionReadOnly} onValueChange={(secret) => onWebhookSecretChange({ value: secret, clear: false })} onClearChange={(clear) => onWebhookSecretChange({ value: clear ? "" : webhookSecret.value, clear })} testId="easyauth-webhook-secret"/>
        <TextField id="enterprise-easyauth-request-url" label={labels.permissionRequestUrl} value={value.permissionRequestUrl} disabled={disabled} onChange={(permissionRequestUrl) => onChange({ permissionRequestUrl })}/>
      </EnterpriseConfigurationFieldGrid>
    </Section>
  );
}

function GuidedLabel({ label, guide, ariaLabel, testId }: { label: string; guide?: string; ariaLabel: string; testId: string }) {
  if (!guide) return <>{label}</>;
  return <span className="inline-flex items-center gap-1"><span>{label}</span><InfoTooltip label={ariaLabel.replace("{field}", label)} testId={testId}>{guide}</InfoTooltip></span>;
}

function TextField({ id, label, value, disabled, type = "text", onChange }: { id: string; label: ReactNode; value: string; disabled?: boolean; type?: string; onChange: (value: string) => void }) {
  return <Field label={label} htmlFor={id}><Input id={id} type={type} value={value ?? ""} disabled={disabled} className="font-mono" onChange={(event) => onChange(event.target.value)}/></Field>;
}
