"use client";

import type { ReactNode } from "react";
import { Badge } from "../primitives/badge";
import { Button } from "../primitives/button";
import { InlineNotice } from "../primitives/inline-notice";
import { PageHeader } from "../primitives/page-header";
import { Section } from "../primitives/section";
import { TabList, TabPanel, type TabDefinition } from "../primitives/tabs";
import type { EnterpriseIntegrationCard, IntegrationStatus } from "./models";
import { EnterpriseDependencyCard } from "./shared-settings";

export interface SecuritySettingsLabels {
  title: string;
  description: string;
  passwordTitle: string;
  passwordDescription: string;
  changePassword: string;
  twoFactorTitle: string;
  twoFactorDescription: string;
  enabled: string;
  disabled: string;
  enableTwoFactor: string;
  disableTwoFactor: string;
  passkeysTitle: string;
  passkeysDescription: string;
  managePasskeys: string;
}

interface EnterpriseSecurityWorkspaceProps {
  labels: Pick<SecuritySettingsLabels, "title" | "description" | "passwordTitle" | "passwordDescription" | "twoFactorTitle" | "twoFactorDescription">;
  password?: ReactNode;
  twoFactor?: ReactNode;
  footer?: ReactNode;
}

/**
 * Complete security-settings page shared by every host.
 *
 * Hosts inject credential operations because their API/session rules differ, while
 * this component remains the sole owner of the page header and password/second-
 * factor section hierarchy.
 */
export function EnterpriseSecurityWorkspace({ labels, password, twoFactor, footer }: EnterpriseSecurityWorkspaceProps) {
  if (!password && !twoFactor && !footer) return null;
  return (
    <section data-test-id="enterprise-security-settings" data-enterprise-surface="security-settings">
      <PageHeader title={labels.title} subtitle={labels.description} />
      <div className="mt-6 space-y-4">
        {password ? (
          <div className="rounded-md border border-hairline bg-paper p-4" data-test-id="password-card">
            <p className="text-[14px] font-semibold text-ink" data-test-id="password-card-title">{labels.passwordTitle}</p>
            <p className="mt-1 text-[12px] text-ink-faint">{labels.passwordDescription}</p>
            <div className="mt-4">{password}</div>
          </div>
        ) : null}
        {twoFactor ? (
          <div className="rounded-md border border-hairline bg-paper p-4" data-test-id="two-factor-card">
            <p className="text-[14px] font-semibold text-ink" data-test-id="two-factor-title">{labels.twoFactorTitle}</p>
            <p className="mt-1 text-[12px] text-ink-faint">{labels.twoFactorDescription}</p>
            <div className="mt-3 border-t border-hairline">{twoFactor}</div>
          </div>
        ) : null}
        {footer}
      </div>
    </section>
  );
}

export interface LoginPermissionsLabels { title: string; description: string; loginTab: string; permissionsTab: string; authentikTitle: string; authentikDescription: string; easyAuthTitle: string; easyAuthDescription: string; configured: string; notConfigured: string; endpoint: string; lastChecked: string;
  /** Accessible name of the tab strip. Hosts that override `title` with a card
   *  heading (e.g. "Integration status") must keep this describing the tabs. */
  tabsAriaLabel?: string; }

/** 登录与权限 tab 条与面板共用的 id 前缀。 */
const LOGIN_PERMISSIONS_TABS_ID = "login-permissions";

export function EnterpriseLoginPermissions({ labels, activeTab, onTabChange, authentik, easyAuth, children, visibleTabs = ["login", "permissions"], showHeader = true }: { labels: LoginPermissionsLabels; activeTab: "login" | "permissions"; onTabChange: (tab: "login" | "permissions") => void; authentik: EnterpriseIntegrationCard; easyAuth: EnterpriseIntegrationCard; children?: ReactNode; visibleTabs?: readonly ("login" | "permissions")[]; showHeader?: boolean }) {
  const card = activeTab === "login" ? authentik : easyAuth;
  const tabs: TabDefinition[] = visibleTabs.map((tab) => ({
    key: tab,
    label: tab === "login" ? labels.loginTab : labels.permissionsTab,
    className: `shrink-0 border-b-2 px-4 py-2 text-[12px] font-medium ${activeTab === tab ? "border-ink text-ink" : "border-transparent text-ink-faint hover:text-ink-soft"}`,
    dataAttributes: { "data-test-id": `settings-auth-tab-${tab}` },
  }));
  return <section data-test-id="login-permissions-page">{showHeader ? <PageHeader title={labels.title} subtitle={labels.description}/> : null}<TabList idBase={LOGIN_PERMISSIONS_TABS_ID} label={labels.tabsAriaLabel ?? labels.title} tabs={tabs} activeKey={activeTab} onSelect={(key) => onTabChange(key as "login" | "permissions")} className={`${showHeader ? "mt-5" : ""} flex overflow-x-auto border-b border-ink/10`}/><TabPanel idBase={LOGIN_PERMISSIONS_TABS_ID} activeKey={activeTab} className="mt-5">{children ?? <IntegrationCardView card={card} labels={labels}/>}</TabPanel></section>;
}

export interface UpstreamHealthLabels { title: string; description: string; refresh: string; refreshing: string; empty: string; lastChecked: string; endpoint: string; }

export function EnterpriseUpstreamHealth({ labels, integrations, loading, error, onRefresh, canRefresh = true, testId = "upstream-health-page", actionTestId, cardsTestId, feedbackMode = "inline", refreshVariant = "secondary" }: { labels: UpstreamHealthLabels; integrations: readonly EnterpriseIntegrationCard[]; loading?: boolean; error?: string | null; onRefresh: () => void | Promise<void>; canRefresh?: boolean; testId?: string; actionTestId?: string; cardsTestId?: string; /** Default `inline` keeps main-app InlineNotice error path; `toast` keeps a neutral shell + always-present Refresh. */ feedbackMode?: "inline" | "toast"; /** Host-chosen emphasis for the header Refresh action. */ refreshVariant?: "primary" | "secondary" }) {
  const toastMode = feedbackMode === "toast";
  // FE-FB-01: toast mode never mounts a failure-only retry branch; header Refresh is the recovery entry.
  // Default/inline still paints InlineNotice under the header.
  return (
    <section data-test-id={testId}>
      <PageHeader
        title={labels.title}
        subtitle={labels.description}
        actions={
          canRefresh ? (
            <Button variant={refreshVariant} size="sm" disabled={loading} onClick={() => void onRefresh()} data-test-id={actionTestId}>
              {loading ? labels.refreshing : labels.refresh}
            </Button>
          ) : null
        }
      />
      {error && !toastMode ? <InlineNotice tone="error" className="mt-5" message={error} /> : null}
      <div className="mt-5 grid min-h-[120px] gap-3 lg:grid-cols-2" data-test-id={cardsTestId}>
        {integrations.length
          ? integrations.map((card) => (
              <EnterpriseDependencyCard
                key={card.id}
                name={card.name}
                statusLabel={card.statusLabel}
                statusTone={statusTone(card.status)}
                statusValue={card.status}
                checkedLabel={card.lastChecked ? (labels.lastChecked ? `${labels.lastChecked}: ${card.lastChecked}` : card.lastChecked) : labels.lastChecked}
                summary={card.description}
                testId={`upstream-health-card-${card.id}`}
                statusTestId="upstream-health-status"
              />
            ))
          : (
            <div className="rounded-lg border border-dashed border-hairline p-8 text-center text-[13px] text-ink-faint">
              {toastMode && error ? "—" : labels.empty}
            </div>
          )}
      </div>
    </section>
  );
}

function IntegrationCardView({ card, labels }: { card: EnterpriseIntegrationCard; labels: Pick<LoginPermissionsLabels, "lastChecked" | "endpoint"> }) { return <Section title={card.name} description={card.description} badge={<Badge tone={statusTone(card.status)}>{card.statusLabel}</Badge>}><dl className="space-y-2 text-[12px]">{card.endpoint ? <Detail label={labels.endpoint} value={card.endpoint}/>:null}{card.lastChecked ? <Detail label={labels.lastChecked} value={card.lastChecked}/>:null}{card.details?.map((detail) => <Detail key={detail.label} label={detail.label} value={detail.value}/>)}</dl></Section>; }
function Detail({ label, value }: { label: string; value: string }) { return <div className="grid gap-1 border-t border-hairline-soft pt-2 first:border-0 first:pt-0 sm:grid-cols-[140px_1fr]"><dt className="text-ink-faint">{label}</dt><dd className="break-all font-mono text-ink-soft">{value}</dd></div>; }
function statusTone(status: IntegrationStatus): "evergreen" | "amber" | "signal" | "neutral" { if (status === "healthy") return "evergreen"; if (status === "degraded") return "amber"; if (status === "offline") return "signal"; return "neutral"; }
