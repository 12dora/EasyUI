"use client";

import { useState, type ReactNode } from "react";
import { Button } from "../primitives/button";
import { Checkbox } from "../primitives/checkbox";
import { CollapseReveal } from "../primitives/collapse-reveal";
import { Field, Input } from "../primitives/field";
import { FormGrid } from "../primitives/form-grid";
import { GatedBody } from "../primitives/gated-body";
import { InfoTooltip } from "../primitives/info-tooltip";
import { InlineNotice } from "../primitives/inline-notice";
import { Section } from "../primitives/section";
import { Switch } from "../primitives/switch";
import { OIDC_REQUIRED_SCOPE, OIDC_SCOPE_TOKENS, parseOidcScopes, serializeOidcScopes, type OidcScopeToken } from "./access-settings/helpers";
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
  /** 授权范围勾选组下的一行说明。手工拼 labels 的宿主可以不给,给了才显示。 */
  scopesHint?: string;
  /** 四个固定授权范围各自的说明,按令牌取用。缺了就只印令牌本身,不至于崩。 */
  scopeOptions?: { openid: string; profile: string; email: string; dingtalk: string };
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
        actions={<OidcCardActions {...props} />}
      >
        <div className="ui-stack">
          {/* 标题行动作的反馈留在闸门之外:关掉这张卡再保存是正常流程,正文变灰之后
              这条结果仍要读得到、也仍在无障碍树里。 */}
          {props.operationResult ? <InlineNotice tone={props.operationResult.ok ? "success" : "error"} message={props.operationResult.message} data-test-id="identity-connection-test-result" /> : null}
          <GatedBody off={!value.enabled} className="ui-stack">
            <Field label={<GuidedLabel label={labels.issuer} guide={labels.guides?.issuer} ariaLabel={labels.guideAriaLabel} testId="identity-guide-issuer" />} htmlFor="enterprise-oidc-issuer">
              <div className="flex items-start gap-2">
                <Input id="enterprise-oidc-issuer" value={value.issuer} disabled={disabled} className="font-mono" onChange={(event) => props.onChange({ issuer: event.target.value })} />
                {!disabled && props.onDiscover ? <Button variant="outline" size="md" className="h-[34px] shrink-0" loading={props.discovering} onClick={() => void props.onDiscover?.()} data-test-id="identity-discover">{labels.discover}</Button> : null}
              </div>
            </Field>
            <EnterpriseConfigurationFieldGrid>
              <TextField id="enterprise-oidc-client-id" label={<GuidedLabel label={labels.clientId} guide={labels.guides?.clientId} ariaLabel={labels.guideAriaLabel} testId="identity-guide-client-id" />} value={value.clientId} disabled={disabled} onChange={(clientId) => props.onChange({ clientId })} />
              <EnterpriseSecretField id="enterprise-oidc-client-secret" label={<GuidedLabel label={labels.clientSecret} guide={labels.guides?.clientSecret} ariaLabel={labels.guideAriaLabel} testId="identity-guide-client-secret" />} keepHint={labels.authorityHint} clearLabel={labels.clearSecret} configuredHint={value.hasClientSecret ? labels.configured : labels.notConfigured} value={props.clientSecret.value} clear={props.clientSecret.clear} disabled={disabled} onValueChange={(secret) => props.onClientSecretChange({ value: secret, clear: false })} onClearChange={(clear) => props.onClientSecretChange({ value: clear ? "" : props.clientSecret.value, clear })} />
              <OidcScopeField labels={labels} value={value.scopes} disabled={disabled} onChange={(scopes) => props.onChange({ scopes })} />
              <TextField id="enterprise-oidc-redirect-base" label={labels.redirectBaseUrl} value={value.redirectBaseUrl} disabled={disabled} onChange={(redirectBaseUrl) => props.onChange({ redirectBaseUrl })} />
              <TextField id="enterprise-oidc-frontend-base" label={labels.frontendBaseUrl} value={value.frontendBaseUrl} disabled={disabled} onChange={(frontendBaseUrl) => props.onChange({ frontendBaseUrl })} />
            </EnterpriseConfigurationFieldGrid>
            {labels.redirectUri ? <Field label={labels.redirectUri}><p className="break-all rounded border border-hairline bg-paper-deep px-3 py-2 font-mono text-[12px]" data-test-id="identity-redirect-uri">{value.redirectUri || "—"}</p></Field> : null}
          </GatedBody>
        </div>
      </Section>
      {!disabled || !props.hideAdvancedWhenDisabled ? (
        <Section title={labels.advancedTitle} description={labels.advancedDescription} actions={<Button variant="ghost" size="sm" onClick={() => setAdvancedOpen((open) => !open)} data-test-id="identity-advanced-toggle">{advancedOpen ? labels.advancedHide : labels.advancedShow}</Button>}>
          <CollapseReveal open={advancedOpen} data-test-id="identity-advanced-reveal">
            <div className="ui-stack" data-test-id="identity-advanced-fields">
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

/**
 * 卡片标题行右端:总开关 + 连接测试 + 保存。
 *
 * 开关和保存都刻意留在 `GatedBody` 之外——关掉之后开关自己仍可操作(否则这张卡再也
 * 开不回来),而「关掉」这个状态本身也要存得下去。开关只在没有管理权限时置灰。
 */
function OidcCardActions({ labels, value, disabled, saving, testing, onChange, onSave, onTest }: OidcFormProps) {
  return (
    <>
      {!disabled && onTest ? <Button variant="outline" size="sm" loading={testing} onClick={() => void onTest()} data-test-id="identity-connection-test">{labels.connectionTest}</Button> : null}
      {!disabled ? <Button variant="primary" size="sm" loading={saving} onClick={() => void onSave()} data-test-id="enterprise-oidc-save">{labels.save}</Button> : null}
      {/* 开关摆在最右端,与同一页的「用户目录」卡片对齐。 */}
      <Switch checked={value.enabled} disabled={disabled} aria-label={labels.enabled} onChange={(enabled) => onChange({ enabled })} data-test-id="identity-enabled" />
    </>
  );
}

/**
 * 授权范围:固定四项,不开放自定义,所以用勾选组而不是自由文本框——用户不必知道
 * 令牌怎么拼,也不会把一个拼错的范围存进去。openid 是 OIDC 的硬性要求,常勾且不可改。
 *
 * 勾选组没有单一可关联的控件,`Field` 的 `<label>` 挂不上去,因此另给一层
 * `role="group"` + `aria-label` 让读屏念出组名。整组横跨两列,免得四行勾选把栅格撑歪。
 */
function OidcScopeField({ labels, value, disabled, onChange }: { labels: EnterpriseIntegrationConfigurationLabels; value: string; disabled?: boolean; onChange: (value: string) => void }) {
  const selected = parseOidcScopes(value);
  const toggle = (token: OidcScopeToken, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(token);
    else next.delete(token);
    onChange(serializeOidcScopes(next));
  };
  return (
    <Field label={labels.scopes} hint={labels.scopesHint} className="sm:col-span-2">
      <div role="group" aria-label={labels.scopes} className="flex flex-col gap-0.5" data-test-id="enterprise-oidc-scopes">
        {OIDC_SCOPE_TOKENS.map((token) => (
          <Checkbox
            key={token}
            checked={token === OIDC_REQUIRED_SCOPE || selected.has(token)}
            disabled={disabled || token === OIDC_REQUIRED_SCOPE}
            onChange={(event) => toggle(token, event.target.checked)}
            data-test-id={`enterprise-oidc-scope-${token}`}
            label={<ScopeRowLabel token={token} description={labels.scopeOptions?.[token]} />}
          />
        ))}
      </div>
    </Field>
  );
}

/** 一行勾选:令牌用等宽印出来(它要照抄进登录服务),后面跟一句人话。 */
function ScopeRowLabel({ token, description }: { token: string; description?: string }) {
  return (
    <span className="inline-flex items-baseline gap-2">
      <span className="font-mono text-[12px]">{token}</span>
      {description ? <span>{description}</span> : null}
    </span>
  );
}

function GuidedLabel({ label, guide, ariaLabel, testId }: { label: string; guide?: string; ariaLabel: string; testId: string }) {
  if (!guide) return <>{label}</>;
  return <span className="inline-flex items-center gap-1"><span>{label}</span><InfoTooltip label={ariaLabel.replace("{field}", label)} testId={testId}>{guide}</InfoTooltip></span>;
}

function TextField({ id, label, value, disabled, type = "text", onChange }: { id: string; label: ReactNode; value: string; disabled?: boolean; type?: string; onChange: (value: string) => void }) {
  return <Field label={label} htmlFor={id}><Input id={id} type={type} value={value ?? ""} disabled={disabled} className="font-mono" onChange={(event) => onChange(event.target.value)}/></Field>;
}
