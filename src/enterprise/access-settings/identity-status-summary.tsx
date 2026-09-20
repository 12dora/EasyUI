import type { ReactNode } from "react";
import type { EnterpriseSettingsConfigurationLabels } from "./types";
import type { IdentitySettingsValue } from "./use-identity-settings";

/** View-only identity: business status language, no endpoint console. */
export function IdentityStatusSummary({
  value,
  labels,
  actions,
}: {
  value: IdentitySettingsValue;
  labels: EnterpriseSettingsConfigurationLabels;
  /** Panel-owned header control — today only the retry, and only after a failed load. */
  actions?: ReactNode;
}) {
  return (
    <div className="ui-stack-sm rounded-md border border-hairline bg-paper p-4" data-test-id="identity-status-summary">
      <div className="flex flex-wrap items-start justify-between gap-[var(--ui-gap-md,16px)]">
        <div>
          <p className="text-[14px] font-semibold text-ink">{labels.oidcTitle}</p>
          <p className="mt-1 text-[12px] text-ink-faint">{labels.oidcDescription}</p>
        </div>
        {actions}
      </div>
      <dl className="grid gap-2 text-[13px] sm:grid-cols-2">
        <StatusFact label={labels.enabled} value={value.enabled ? labels.enabled : labels.notConfigured} />
        <StatusFact label={labels.clientSecret} value={value.hasClientSecret ? labels.configured : labels.notConfigured} />
      </dl>
    </div>
  );
}

function StatusFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-hairline-soft py-2">
      <dt className="text-ink-faint">{label}</dt>
      <dd className="text-right text-ink">{value}</dd>
    </div>
  );
}
