"use client";

import { Alert, Checkbox, Select, Space, Tag, Typography } from "antd";
import { useMemo, useState } from "react";
import { InlineNotice } from "../primitives/inline-notice";
import {
  buildCatalogGroupTree,
  defaultScopeForCode,
  grantScope,
  hasGrant,
  isGrantable,
  isHighRisk,
  permissionDisplayName,
  removeGrant,
  setGrant,
  stripBaselinePermissions,
  type CatalogGroupNode,
} from "./grants";
import type {
  EnterpriseLocalAccountsAdapter,
  EnterpriseLocalAccountsLabels,
  LocalAccountSummary,
  LocalAccountsPermissionCatalogItem,
  LocalGrant,
} from "./types";

export function PermissionPicker({
  labels,
  locale,
  catalog,
  catalogFailed,
  catalogLoading,
  baselinePermissions,
  value,
  onChange,
  disabled,
  adminLocked,
  isLocalSuperadmin,
  onRetryCatalog,
  adapter,
  excludeAccountId,
  showCopyFrom,
}: {
  labels: EnterpriseLocalAccountsLabels;
  locale: string;
  catalog: readonly LocalAccountsPermissionCatalogItem[];
  catalogFailed?: boolean;
  catalogLoading?: boolean;
  baselinePermissions: readonly string[];
  value: LocalGrant[];
  onChange: (next: LocalGrant[]) => void;
  disabled?: boolean;
  adminLocked?: boolean;
  isLocalSuperadmin: boolean;
  onRetryCatalog?: () => void;
  /** When provided with showCopyFrom, renders the "copy grants from existing account" importer. */
  adapter?: EnterpriseLocalAccountsAdapter;
  excludeAccountId?: string | null;
  showCopyFrom?: boolean;
}) {
  const baselineSet = useMemo(() => new Set(baselinePermissions), [baselinePermissions]);
  const groups = useMemo(() => buildCatalogGroupTree(catalog), [catalog]);
  const locked = Boolean(disabled || adminLocked);
  const catalogReady = Boolean(catalogFailed || !catalogLoading || groups.length > 0);

  const [copySourceId, setCopySourceId] = useState<string | undefined>(undefined);
  const [copyOptions, setCopyOptions] = useState<LocalAccountSummary[]>([]);
  const [copyLoading, setCopyLoading] = useState(false);
  const [copyError, setCopyError] = useState(false);

  async function ensureCopyOptions() {
    if (!adapter || copyOptions.length > 0 || copyLoading) return;
    setCopyLoading(true);
    setCopyError(false);
    try {
      const result = await adapter.listAccounts();
      setCopyOptions(
        result.data.filter((row) => !row.isAdmin && row.id !== excludeAccountId),
      );
    } catch {
      setCopyError(true);
      setCopyOptions([]);
    } finally {
      setCopyLoading(false);
    }
  }

  async function importFrom(accountId: string) {
    if (!adapter || locked) return;
    setCopySourceId(accountId);
    try {
      const detail = await adapter.getAccount(accountId);
      const baseline =
        detail.baselinePermissions?.length > 0 ? detail.baselinePermissions : baselinePermissions;
      const next = stripBaselinePermissions(detail.permissions ?? [], baseline);
      // Non-superadmin cannot import high codes into the working set as toggles —
      // strip high grants they cannot hold/edit so the picker stays consistent.
      const highCodes = new Set(catalog.filter((item) => isHighRisk(item)).map((item) => item.code));
      const filtered = isLocalSuperadmin
        ? next
        : next.filter((grant) => !highCodes.has(grant.code));
      onChange(filtered);
    } catch {
      setCopyError(true);
    }
  }

  function toggleGrant(item: LocalAccountsPermissionCatalogItem, checked: boolean) {
    if (baselineSet.has(item.code) || locked) return;
    if (!isGrantable(item)) return;
    if (isHighRisk(item) && !isLocalSuperadmin) return;
    if (checked) {
      const scope = defaultScopeForCode(item);
      if (!scope) return;
      onChange(setGrant(value, item.code, scope, baselinePermissions));
    } else {
      onChange(removeGrant(value, item.code, baselinePermissions));
    }
  }

  function changeScope(item: LocalAccountsPermissionCatalogItem, scope: string) {
    if (baselineSet.has(item.code) || locked) return;
    if (!hasGrant(value, item.code)) return;
    onChange(setGrant(value, item.code, scope, baselinePermissions));
  }

  return (
    <div
      data-test-id="local-accounts-permission-picker"
      data-catalog-loaded={catalogReady ? "true" : "false"}
      className="space-y-3"
    >
      <Typography.Text strong>{labels.permissionPickerTitle}</Typography.Text>
      {adminLocked ? <Alert type="info" showIcon message={labels.permissionPickerAdminNote} /> : null}

      {showCopyFrom && adapter && !adminLocked ? (
        <div data-test-id="local-accounts-copy-grants" className="space-y-1">
          <Typography.Text type="secondary">{labels.copyGrantsFrom}</Typography.Text>
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder={labels.copyGrantsFromPlaceholder}
            style={{ width: "100%" }}
            disabled={locked}
            loading={copyLoading}
            value={copySourceId}
            onFocus={() => void ensureCopyOptions()}
            onDropdownVisibleChange={(open) => {
              if (open) void ensureCopyOptions();
            }}
            onChange={(next) => {
              if (!next) {
                setCopySourceId(undefined);
                return;
              }
              void importFrom(String(next));
            }}
            options={copyOptions.map((row) => ({
              value: row.id,
              label: row.email ? `${row.username} (${row.email})` : row.username,
            }))}
            data-test-id="local-accounts-copy-grants-select"
          />
          {copyError ? (
            <Typography.Text type="danger" className="text-[12px]">
              {labels.copyGrantsFromFailed}
            </Typography.Text>
          ) : null}
        </div>
      ) : null}

      {catalogFailed ? (
        <InlineNotice
          tone="error"
          message={labels.permissionCatalogLoadFailed}
          actionLabel={labels.retry}
          onAction={onRetryCatalog}
          data-test-id="local-accounts-catalog-error"
        />
      ) : catalogLoading && groups.length === 0 ? (
        <Typography.Text type="secondary">{labels.loading}</Typography.Text>
      ) : groups.length === 0 ? (
        <Typography.Text type="secondary">{labels.permissionPickerEmpty}</Typography.Text>
      ) : (
        groups.map((node) => (
          <CatalogGroupBlock
            key={node.key}
            node={node}
            depth={0}
            labels={labels}
            locale={locale}
            baselineSet={baselineSet}
            value={value}
            locked={locked}
            isLocalSuperadmin={isLocalSuperadmin}
            onToggle={toggleGrant}
            onScopeChange={changeScope}
          />
        ))
      )}
    </div>
  );
}

function CatalogGroupBlock({
  node,
  depth,
  labels,
  locale,
  baselineSet,
  value,
  locked,
  isLocalSuperadmin,
  onToggle,
  onScopeChange,
}: {
  node: CatalogGroupNode;
  depth: number;
  labels: EnterpriseLocalAccountsLabels;
  locale: string;
  baselineSet: Set<string>;
  value: LocalGrant[];
  locked: boolean;
  isLocalSuperadmin: boolean;
  onToggle: (item: LocalAccountsPermissionCatalogItem, checked: boolean) => void;
  onScopeChange: (item: LocalAccountsPermissionCatalogItem, scope: string) => void;
}) {
  const hasContent = node.items.length > 0 || node.children.length > 0;
  if (!hasContent) return null;

  return (
    <div
      data-test-id={`local-accounts-perm-group-${node.key}`}
      className="rounded-md border border-hairline p-3"
      style={depth > 0 ? { marginLeft: depth * 8 } : undefined}
    >
      <Typography.Text className="mb-2 block font-medium">{node.label}</Typography.Text>
      {node.items.length > 0 ? (
        <div className="flex flex-col gap-2">
          {node.items.map((item) => (
            <PermissionRow
              key={item.code}
              item={item}
              labels={labels}
              locale={locale}
              isBaseline={baselineSet.has(item.code)}
              checked={hasGrant(value, item.code)}
              scope={grantScope(value, item.code)}
              locked={locked}
              isLocalSuperadmin={isLocalSuperadmin}
              onToggle={onToggle}
              onScopeChange={onScopeChange}
            />
          ))}
        </div>
      ) : null}
      {node.children.map((child) => (
        <div key={child.key} className="mt-2">
          <CatalogGroupBlock
            node={child}
            depth={depth + 1}
            labels={labels}
            locale={locale}
            baselineSet={baselineSet}
            value={value}
            locked={locked}
            isLocalSuperadmin={isLocalSuperadmin}
            onToggle={onToggle}
            onScopeChange={onScopeChange}
          />
        </div>
      ))}
    </div>
  );
}

function PermissionRow({
  item,
  labels,
  locale,
  isBaseline,
  checked,
  scope,
  locked,
  isLocalSuperadmin,
  onToggle,
  onScopeChange,
}: {
  item: LocalAccountsPermissionCatalogItem;
  labels: EnterpriseLocalAccountsLabels;
  locale: string;
  isBaseline: boolean;
  checked: boolean;
  scope?: string;
  locked: boolean;
  isLocalSuperadmin: boolean;
  onToggle: (item: LocalAccountsPermissionCatalogItem, checked: boolean) => void;
  onScopeChange: (item: LocalAccountsPermissionCatalogItem, scope: string) => void;
}) {
  const grantable = isGrantable(item);
  const high = isHighRisk(item);
  const highBlocked = high && !isLocalSuperadmin;
  const itemDisabled = locked || isBaseline || !grantable || highBlocked;
  const scopes = item.grantableScopes ?? [];
  const showScopeSelect = checked && !isBaseline && grantable && scopes.length > 1;
  const testId = isBaseline
    ? `local-accounts-perm-baseline-${item.code}`
    : `local-accounts-perm-${item.code}`;

  return (
    <div key={item.code} data-test-id={testId} className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <Checkbox
          checked={isBaseline || checked}
          disabled={itemDisabled}
          onChange={(event) => onToggle(item, event.target.checked)}
          data-test-id={`${testId}-checkbox`}
        >
          <span className="inline-flex flex-wrap items-center gap-1">
            {permissionDisplayName(item, locale)}
            {high ? (
              <Tag color="red" data-test-id={`local-accounts-perm-high-${item.code}`}>
                {labels.permissionHighRisk}
              </Tag>
            ) : null}
          </span>
        </Checkbox>
        {isBaseline ? (
          <Typography.Text
            type="secondary"
            className="text-[12px]"
            data-test-id={`local-accounts-perm-baseline-hint-${item.code}`}
          >
            {labels.permissionPickerBaselineHint}
          </Typography.Text>
        ) : null}
        {!grantable && !isBaseline ? (
          <Typography.Text
            type="secondary"
            className="text-[12px]"
            data-test-id={`local-accounts-perm-not-grantable-${item.code}`}
          >
            {labels.permissionNotGrantable}
          </Typography.Text>
        ) : null}
      </div>
      {showScopeSelect ? (
        <Space className="ml-6" size={8} align="center">
          <Typography.Text type="secondary" className="text-[12px]">
            {labels.scopeLabel}
          </Typography.Text>
          <Select
            size="small"
            value={scope && scopes.includes(scope) ? scope : defaultScopeForCode(item) ?? scopes[0]}
            disabled={itemDisabled}
            style={{ minWidth: 120 }}
            options={scopes.map((entry) => ({ value: entry, label: entry }))}
            onChange={(next) => onScopeChange(item, String(next))}
            data-test-id={`local-accounts-perm-scope-${item.code}`}
          />
        </Space>
      ) : null}
    </div>
  );
}
