import type { MouseEventHandler, ReactNode } from "react";

export type EnterpriseLocale = "zh-CN" | "en" | (string & {});

export interface EnterpriseLocaleOption {
  code: EnterpriseLocale;
  label: string;
}

export interface EnterpriseNotification {
  id: string;
  title: string;
  detail?: string;
  urgent?: boolean;
  /** Host-owned internal destination. The package never rewrites this URL. */
  href?: string;
  /** Explicit inbox state. Prefer this when the host applies optimistic updates. */
  unread?: boolean;
  /** Raw server read timestamp; null/undefined means unread when `unread` is absent. */
  readAt?: string | null;
  /** ISO 8601 creation time; render sites show it as relative age. Optional: hosts that don't supply it simply render no time. */
  createdAt?: string;
  /** Absolute time already formatted by the host (business timezone), shown as the tooltip of the relative age. */
  createdAtLabel?: string;
}

export interface EnterpriseUserSummary {
  name: string;
  identity: string;
  avatarUrl?: string | null;
  permissionSummary?: string;
}

export interface EnterpriseLinkRenderArgs {
  href: string;
  className: string;
  testId?: string;
  role?: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
  children: ReactNode;
}

export type EnterpriseLinkRenderer = (args: EnterpriseLinkRenderArgs) => ReactNode;

export interface EnterpriseShellLabels {
  switchLanguage: string;
  notifications: string;
  notificationsEmpty: string;
  notificationsLoadFailed: string;
  notificationsClearAll: string;
  notificationsViewAll: string;
  notificationsDismiss: string;
  userMenu: string;
  securitySettings: string;
  logout: string;
  loggingOut: string;
}

export interface EnterpriseSecurityState {
  passwordEnabled: boolean;
  twoFactorEnabled: boolean;
  passkeyCount?: number;
}

export type IntegrationStatus = "healthy" | "degraded" | "offline" | "not-configured";

export interface EnterpriseIntegrationCard {
  id: string;
  name: string;
  description: string;
  status: IntegrationStatus;
  statusLabel: string;
  endpoint?: string;
  lastChecked?: string;
  details?: readonly { label: string; value: string }[];
}
