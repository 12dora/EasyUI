"use client";

import { Checkbox, Select, Tag, Typography } from "antd";
import { useMemo, useState, type ReactNode } from "react";
import { Button } from "../primitives/button";
import { CollapseReveal } from "../primitives/collapse-reveal";
import { InlineNotice } from "../primitives/inline-notice";
import {
  buildCatalogGroupTree,
  defaultScopeForCode,
  flattenGroupKeys,
  grantScope,
  hasGrant,
  isGrantable,
  isHighRisk,
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

/** 单项在当前操作者下是否可勾选(基线/不可授予/高危越权都不可选)。 */
function isToggleable(
  item: LocalAccountsPermissionCatalogItem,
  baselineSet: ReadonlySet<string>,
  isLocalSuperadmin: boolean,
): boolean {
  if (baselineSet.has(item.code)) return false;
  if (!isGrantable(item)) return false;
  if (isHighRisk(item) && !isLocalSuperadmin) return false;
  return true;
}

/** 子树内全部目录项(含嵌套组)。 */
function collectSubtreeItems(node: CatalogGroupNode): LocalAccountsPermissionCatalogItem[] {
  const items = [...node.items];
  for (const child of node.children) items.push(...collectSubtreeItems(child));
  return items;
}

function displayNameOf(item: LocalAccountsPermissionCatalogItem, locale: string): string {
  const english = locale === "en" || locale.startsWith("en");
  return (english ? item.nameEn || item.nameZh : item.nameZh || item.nameEn) || item.code;
}

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
  const groupKeys = useMemo(() => flattenGroupKeys(groups), [groups]);
  const locked = Boolean(disabled || adminLocked);
  const catalogReady = Boolean(catalogFailed || !catalogLoading || groups.length > 0);

  // 折叠状态:默认全部展开(目录规模小,信息一屏可扫;也与既有 e2e 预期一致)。
  const [collapsedKeys, setCollapsedKeys] = useState<ReadonlySet<string>>(() => new Set());
  const anyCollapsed = groupKeys.some((key) => collapsedKeys.has(key));

  const toggleableItems = useMemo(
    () => groups.flatMap((node) => collectSubtreeItems(node)).filter((item) => isToggleable(item, baselineSet, isLocalSuperadmin)),
    [baselineSet, groups, isLocalSuperadmin],
  );
  const selectedCount = toggleableItems.filter((item) => hasGrant(value, item.code)).length;

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
      setCopyOptions(result.data.filter((row) => !row.isAdmin && row.id !== excludeAccountId));
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
      const filtered = isLocalSuperadmin ? next : next.filter((grant) => !highCodes.has(grant.code));
      onChange(filtered);
    } catch {
      setCopyError(true);
    }
  }

  function toggleGrant(item: LocalAccountsPermissionCatalogItem, checked: boolean) {
    if (locked || !isToggleable(item, baselineSet, isLocalSuperadmin)) return;
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

  /** 批量授予:保留已有作用域,缺失的按默认作用域补齐。 */
  function grantAll(items: readonly LocalAccountsPermissionCatalogItem[]) {
    if (locked) return;
    const next = [...value];
    for (const item of items) {
      if (hasGrant(next, item.code)) continue;
      const scope = defaultScopeForCode(item);
      if (!scope) continue;
      next.push({ code: item.code, scope });
    }
    onChange(stripBaselinePermissions(next, baselinePermissions));
  }

  function revokeAll(items: readonly LocalAccountsPermissionCatalogItem[]) {
    if (locked) return;
    const codes = new Set(items.map((item) => item.code));
    onChange(
      stripBaselinePermissions(
        value.filter((grant) => !codes.has(grant.code)),
        baselinePermissions,
      ),
    );
  }

  function toggleAllGroups() {
    setCollapsedKeys(anyCollapsed ? new Set() : new Set(groupKeys));
  }

  function toggleGroupCollapsed(key: string) {
    setCollapsedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const hasTree = groups.length > 0;

  return (
    <div
      data-test-id="local-accounts-permission-picker"
      data-catalog-loaded={catalogReady ? "true" : "false"}
      className="space-y-2"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="inline-flex items-baseline gap-2">
          <span className="text-[13px] font-semibold text-ink">{labels.permissionPickerTitle}</span>
          {hasTree && !adminLocked ? (
            <span className="font-mono text-[11px] tabular-nums text-ink-faint" data-test-id="local-accounts-perm-count">
              {selectedCount}/{toggleableItems.length}
            </span>
          ) : null}
        </span>
        {hasTree && !adminLocked ? (
          <span className="inline-flex items-center gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={locked}
              data-test-id="local-accounts-perm-select-all"
              onClick={() => grantAll(toggleableItems)}
            >
              {labels.selectAll}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={locked}
              data-test-id="local-accounts-perm-select-none"
              onClick={() => revokeAll(toggleableItems)}
            >
              {labels.selectNone}
            </Button>
            <span aria-hidden className="mx-1 h-3.5 w-px bg-hairline" />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-test-id="local-accounts-perm-toggle-expand"
              onClick={toggleAllGroups}
            >
              {anyCollapsed ? labels.expandAll : labels.collapseAll}
            </Button>
          </span>
        ) : null}
      </div>

      {adminLocked ? <InlineNotice tone="info" message={labels.permissionPickerAdminNote} /> : null}

      {showCopyFrom && adapter && !adminLocked ? (
        <div data-test-id="local-accounts-copy-grants" className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Typography.Text type="secondary" className="whitespace-nowrap text-[12px]">
            {labels.copyGrantsFrom}
          </Typography.Text>
          <Select
            allowClear
            showSearch
            size="small"
            optionFilterProp="label"
            placeholder={labels.copyGrantsFromPlaceholder}
            className="min-w-[220px] flex-1"
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
      ) : catalogLoading && !hasTree ? (
        <Typography.Text type="secondary">{labels.loading}</Typography.Text>
      ) : !hasTree ? (
        <Typography.Text type="secondary">{labels.permissionPickerEmpty}</Typography.Text>
      ) : (
        // 固定高度 + 内部滚动:权限目录再长也不撑开对话框。
        <div className="h-[280px] overflow-y-auto overscroll-contain rounded-[3px] border border-hairline bg-paper p-1.5">
          {groups.map((node) => (
            <CatalogGroupBlock
              key={node.key}
              node={node}
              labels={labels}
              locale={locale}
              baselineSet={baselineSet}
              value={value}
              locked={locked}
              isLocalSuperadmin={isLocalSuperadmin}
              collapsedKeys={collapsedKeys}
              onToggleCollapsed={toggleGroupCollapsed}
              onGrantAll={grantAll}
              onRevokeAll={revokeAll}
              onToggle={toggleGrant}
              onScopeChange={changeScope}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CatalogGroupBlock({
  node,
  labels,
  locale,
  baselineSet,
  value,
  locked,
  isLocalSuperadmin,
  collapsedKeys,
  onToggleCollapsed,
  onGrantAll,
  onRevokeAll,
  onToggle,
  onScopeChange,
}: {
  node: CatalogGroupNode;
  labels: EnterpriseLocalAccountsLabels;
  locale: string;
  baselineSet: Set<string>;
  value: LocalGrant[];
  locked: boolean;
  isLocalSuperadmin: boolean;
  collapsedKeys: ReadonlySet<string>;
  onToggleCollapsed: (key: string) => void;
  onGrantAll: (items: readonly LocalAccountsPermissionCatalogItem[]) => void;
  onRevokeAll: (items: readonly LocalAccountsPermissionCatalogItem[]) => void;
  onToggle: (item: LocalAccountsPermissionCatalogItem, checked: boolean) => void;
  onScopeChange: (item: LocalAccountsPermissionCatalogItem, scope: string) => void;
}) {
  const hasContent = node.items.length > 0 || node.children.length > 0;
  if (!hasContent) return null;

  const open = !collapsedKeys.has(node.key);
  const subtreeToggleable = collectSubtreeItems(node).filter((item) =>
    isToggleable(item, baselineSet, isLocalSuperadmin),
  );
  const subtreeSelected = subtreeToggleable.filter((item) => hasGrant(value, item.code)).length;
  const allSelected = subtreeToggleable.length > 0 && subtreeSelected === subtreeToggleable.length;
  const groupLabel = labels.permissionGroupLabels?.[node.key] ?? node.label;

  return (
    <div data-test-id={`local-accounts-perm-group-${node.key}`}>
      <div className="flex items-center gap-1 rounded-[2px] px-1 py-1 transition-colors hover:bg-paper-deep">
        <button
          type="button"
          aria-expanded={open}
          aria-label={`${open ? labels.collapseAll : labels.expandAll}: ${groupLabel}`}
          data-test-id={`local-accounts-perm-group-toggle-${node.key}`}
          onClick={() => onToggleCollapsed(node.key)}
          className="flex size-5 shrink-0 items-center justify-center rounded-[2px] text-ink-faint transition-colors hover:bg-ink/[0.06] hover:text-ink"
        >
          <svg
            viewBox="0 0 12 12"
            aria-hidden
            className={`size-3 transition-transform duration-150 ease-out ${open ? "rotate-90" : ""}`}
          >
            <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <Checkbox
          checked={allSelected}
          indeterminate={subtreeSelected > 0 && !allSelected}
          disabled={locked || subtreeToggleable.length === 0}
          onChange={(event) =>
            event.target.checked ? onGrantAll(subtreeToggleable) : onRevokeAll(subtreeToggleable)
          }
          data-test-id={`local-accounts-perm-group-select-${node.key}`}
        >
          <span className="text-[13px] font-medium text-ink">{groupLabel}</span>
        </Checkbox>
        {subtreeToggleable.length > 0 ? (
          <span className="ml-auto pr-1 font-mono text-[11px] tabular-nums text-ink-faint">
            {subtreeSelected}/{subtreeToggleable.length}
          </span>
        ) : null}
      </div>
      <CollapseReveal open={open}>
        <div className="mb-1 ml-[9px] border-l border-hairline-soft pl-4">
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
          {node.children.map((child) => (
            <CatalogGroupBlock
              key={child.key}
              node={child}
              labels={labels}
              locale={locale}
              baselineSet={baselineSet}
              value={value}
              locked={locked}
              isLocalSuperadmin={isLocalSuperadmin}
              collapsedKeys={collapsedKeys}
              onToggleCollapsed={onToggleCollapsed}
              onGrantAll={onGrantAll}
              onRevokeAll={onRevokeAll}
              onToggle={onToggle}
              onScopeChange={onScopeChange}
            />
          ))}
        </div>
      </CollapseReveal>
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
  const name = displayNameOf(item, locale);
  const secondaryNote: ReactNode = isBaseline ? (
    <span
      className="text-[11px] text-ink-faint"
      data-test-id={`local-accounts-perm-baseline-hint-${item.code}`}
    >
      {labels.permissionPickerBaselineHint}
    </span>
  ) : !grantable ? (
    <span
      className="text-[11px] text-ink-faint"
      data-test-id={`local-accounts-perm-not-grantable-${item.code}`}
    >
      {labels.permissionNotGrantable}
    </span>
  ) : null;

  return (
    <div
      data-test-id={testId}
      className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-[2px] px-1 py-[3px] transition-colors hover:bg-paper-deep"
    >
      <Checkbox
        checked={isBaseline || checked}
        disabled={itemDisabled}
        onChange={(event) => onToggle(item, event.target.checked)}
        data-test-id={`${testId}-checkbox`}
      >
        <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span className="text-[13px] text-ink">{name}</span>
          {name !== item.code ? (
            <span className="font-mono text-[11px] text-ink-faint">{item.code}</span>
          ) : null}
          {high ? (
            <Tag color="red" className="!mr-0" data-test-id={`local-accounts-perm-high-${item.code}`}>
              {labels.permissionHighRisk}
            </Tag>
          ) : null}
        </span>
      </Checkbox>
      {secondaryNote}
      {showScopeSelect ? (
        <span className="ml-auto inline-flex items-center gap-1.5">
          <span className="text-[11px] text-ink-faint">{labels.scopeLabel}</span>
          <Select
            size="small"
            value={scope && scopes.includes(scope) ? scope : defaultScopeForCode(item) ?? scopes[0]}
            disabled={itemDisabled}
            style={{ minWidth: 96 }}
            options={scopes.map((entry) => ({ value: entry, label: entry }))}
            onChange={(next) => onScopeChange(item, String(next))}
            data-test-id={`local-accounts-perm-scope-${item.code}`}
          />
        </span>
      ) : null}
    </div>
  );
}
