"use client";

import { useState, type ReactNode } from "react";
import { InlineNotice } from "../primitives/inline-notice";
import type { EnterpriseTimestampFormatter } from "./format-timestamp";
import type { EnterpriseIntegrationCard } from "./models";
import { EnterpriseLoginPermissions, type LoginPermissionsLabels } from "./settings-surfaces";
import { EnterprisePermissionDeniedState } from "./surface-helpers";
import { AuthorizationPanel } from "./access-settings/authorization-panel";
import { DirectoryPanel } from "./access-settings/directory-panel";
import { pickTab, type AccessSettingsTab } from "./access-settings/helpers";
import { IdentityPanel } from "./access-settings/identity-panel";
import type {
  EnterpriseAccessSettingsAdapter,
  EnterpriseAccessSettingsLabels,
  EnterpriseAccessSettingsPermissions,
  EnterpriseSettingsFeedbackMode,
} from "./access-settings/types";

export type {
  EnterpriseAccessSettingsAdapter,
  EnterpriseAccessSettingsLabels,
  EnterpriseAccessSettingsPermissions,
  EnterpriseIdentityDiscoveryResult,
  EnterpriseIdentityOperationResult,
  EnterpriseOidcStatusSummary,
  EnterpriseSettingsFeedbackMode,
} from "./access-settings/types";

/**
 * Complete access-settings surface shared by every host.
 *
 * `feedbackMode` defaults to `"inline"` so the main EasyTrade host keeps its
 * previous InlineNotice-based load/save path. Customs opts into `"toast"`.
 */
export function EnterpriseAccessSettingsSurface({
  adapter,
  labels,
  permissions,
  locale,
  preferredTab,
  showHeader = true,
  feedbackMode = "inline",
  formatTimestamp,
  timeZone,
  permissionDeniedActions,
}: {
  adapter: EnterpriseAccessSettingsAdapter;
  labels: EnterpriseAccessSettingsLabels;
  permissions: EnterpriseAccessSettingsPermissions;
  locale: string;
  preferredTab?: AccessSettingsTab | null;
  showHeader?: boolean;
  /** Default `inline` preserves main-app behavior; Customs passes `toast`. */
  feedbackMode?: EnterpriseSettingsFeedbackMode;
  /** FE-BUG-11: forwarded to the authorization workspace for snapshot timestamps. */
  formatTimestamp?: EnterpriseTimestampFormatter;
  /** FE-BUG-11: IANA zone when `formatTimestamp` is omitted. Default = browser local. */
  timeZone?: string;
  /** Optional route-specific action; omission falls back to safe root navigation. */
  permissionDeniedActions?: ReactNode;
}) {
  const visibleTabs = ([permissions.viewIdentity ? "login" : null, permissions.viewAuthorization ? "permissions" : null].filter(Boolean)) as AccessSettingsTab[];
  const [selectedTab, setSelectedTab] = useState<AccessSettingsTab | null>(null);
  const activeTab = pickTab(visibleTabs, selectedTab, preferredTab);
  if (!activeTab) return renderPermissionDenied(feedbackMode, labels, permissionDeniedActions);
  return (
    <div data-test-id="enterprise-access-settings" data-enterprise-surface="login-permissions-settings">
      <EnterpriseLoginPermissions
        labels={labels.page}
        activeTab={activeTab}
        onTabChange={setSelectedTab}
        authentik={emptyCard("authentik", labels.page)}
        easyAuth={emptyCard("easyauth", labels.page)}
        visibleTabs={visibleTabs}
        showHeader={showHeader}
      >
        {activeTab === "login" ? (
          <div className="space-y-2">
            <IdentityPanel adapter={adapter} labels={labels.configuration} canManage={permissions.manageIdentity} feedbackMode={feedbackMode} />
            {adapter.loadDirectorySettings && adapter.saveDirectorySettings && labels.directory ? (
              <DirectoryPanel
                adapter={adapter}
                labels={labels.configuration}
                directoryLabels={labels.directory}
                canManage={permissions.manageIdentity}
                feedbackMode={feedbackMode}
                locale={locale}
                formatTimestamp={formatTimestamp}
                timeZone={timeZone}
              />
            ) : null}
          </div>
        ) : (
          <AuthorizationPanel
            adapter={adapter}
            labels={labels}
            locale={locale}
            canManage={permissions.manageAuthorization}
            feedbackMode={feedbackMode}
            formatTimestamp={formatTimestamp}
            timeZone={timeZone}
          />
        )}
      </EnterpriseLoginPermissions>
    </div>
  );
}

// FE-FB-02 / DECISIONS ruling 4: page-state EmptyState (title + detail + home), no toast, no redirect.
function renderPermissionDenied(
  feedbackMode: EnterpriseSettingsFeedbackMode,
  labels: EnterpriseAccessSettingsLabels,
  permissionDeniedActions: ReactNode,
): ReactNode {
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

function emptyCard(id: "authentik" | "easyauth", labels: LoginPermissionsLabels): EnterpriseIntegrationCard {
  return {
    id,
    name: id === "authentik" ? labels.authentikTitle : labels.easyAuthTitle,
    description: id === "authentik" ? labels.authentikDescription : labels.easyAuthDescription,
    status: "not-configured",
    statusLabel: labels.notConfigured,
  };
}
