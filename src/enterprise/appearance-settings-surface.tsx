"use client";

/**
 * 「外观」设置页(共享面)。
 *
 * 两张卡片:
 *
 * 1. 表格密度(每个用户都有)。它是一份**账号偏好** —— 宿主把当前值与写回口挂在
 * `TableDensityProvider` 上,这张页面只读写那份上下文,自己既不取数也不落盘。
 * 于是「设置页改一下」与「所有列表页的行高」天然是同一个事实源,不会出现设置页
 * 显示宽松、列表仍然紧凑的两张皮。
 * 2. 显示页脚(只有管理员,即宿主判定持有 `settings.app_setting.update` 时才画)。它是
 *    **全局设置**,存在通用设置(`/api/v1/app-settings/general` 的 `showFooter`)里:
 *    这里先 `load()` 一份最新的通用设置,切换时把**整份**值连同新的 `showFooter` PUT
 *    回去(不会把品牌字段重置成旧值),成功后 `primeEnterpriseGeneralSettings` 让外壳
 *    立刻收起 / 放出页脚。
 *
 * 文案按本包一贯的做法从 props 注入(`EnterpriseAppearanceSettingsLabels`,
 * `createEnterpriseLabelCatalog` 里有 zh / en 两份),宿主也可以自带。
 */

import { useCallback, useEffect, useState } from "react";
import { toast } from "../toast";
import { Button } from "../primitives/button";
import { Field } from "../primitives/field";
import { Switch } from "../primitives/switch";
import { PageHeader } from "../primitives/page-header";
import { SegmentedToggle, type SegmentedToggleOption } from "../primitives/segmented-toggle";
import { useTableDensity, type TableDensity } from "../table/table-density";
import type { EnterpriseGeneralSettingsAdapter, EnterpriseGeneralSettingsValue } from "./general-settings-surface";
import { primeEnterpriseGeneralSettings, resolveEnterpriseShowFooter } from "./general-settings-store";

export interface EnterpriseAppearanceSettingsLabels {
  title: string;
  description: string;
  /** 卡片标题,例如「表格密度」。 */
  densityTitle: string;
  /** 卡片下方一句说明。 */
  densityHint: string;
  densityCompact: string;
  densityComfortable: string;
  /** 写回账号偏好时的状态字。 */
  saving: string;
  /** 写回失败的提示语;由宿主在自己的提示通道里用(它才知道用 toast 还是别的)。 */
  saveFailed: string;
  /** 开关文案,例如「显示页脚」。 */
  showFooter: string;
  /** 开关下方一句说明:这是影响所有用户的全局设置。 */
  showFooterHint: string;
  /** 读取全局设置失败的提示语。 */
  globalLoadFailed: string;
  /** 重试按钮。 */
  retry: string;
  /** 全局设置保存成功的 toast。 */
  globalSaved: string;
  /** 全局设置保存失败的 toast。 */
  globalSaveFailed: string;
}

export interface EnterpriseAppearanceSettingsSurfaceProps {
  labels: EnterpriseAppearanceSettingsLabels;
  /**
   * 当前用户能否改全局设置 —— 宿主按 `settings.app_setting.update` 判定。为 `false`
   * (默认)时全局卡片整块不渲染。
   */
  canManageGlobal?: boolean;
  /**
   * 通用设置的传输口,与「通用」页用的是同一个 adapter。全局卡片只在它与
   * `canManageGlobal` 同时给出时渲染。
   */
  generalSettingsAdapter?: EnterpriseGeneralSettingsAdapter;
}

function densityOptions(labels: EnterpriseAppearanceSettingsLabels): readonly SegmentedToggleOption<TableDensity>[] {
  return [
    { value: "compact", label: labels.densityCompact },
    { value: "comfortable", label: labels.densityComfortable },
  ];
}

/**
 * 完整的「外观」设置页:自带 `PageHeader`,所以它是本页唯一的 H1 —— 宿主把它放进
 * 设置页框架里就行,不要在外面再画一个标题。
 */
export function EnterpriseAppearanceSettingsSurface({
  labels,
  canManageGlobal = false,
  generalSettingsAdapter,
}: EnterpriseAppearanceSettingsSurfaceProps) {
  return (
    <div data-test-id="appearance-settings-page">
      <PageHeader title={labels.title} subtitle={labels.description} />
      <div className="space-y-4">
        <DensitySection labels={labels} />
        {canManageGlobal && generalSettingsAdapter ? (
          <GlobalAppearanceSection labels={labels} adapter={generalSettingsAdapter} />
        ) : null}
      </div>
    </div>
  );
}

function DensitySection({ labels }: { labels: EnterpriseAppearanceSettingsLabels }) {
  const { density, setDensity, saving } = useTableDensity();
  return (
      <div className="space-y-4 rounded-md border border-hairline bg-paper p-4" data-test-id="appearance-density-section">
        <Field label={labels.densityTitle} hint={labels.densityHint}>
          <div className="flex flex-wrap items-center gap-3">
            <SegmentedToggle<TableDensity>
              value={density}
              options={densityOptions(labels)}
              ariaLabel={labels.densityTitle}
              dataTestId="appearance-density-toggle"
              dataOptionAttribute="data-density"
              onChange={(next) => {
                if (next === density) return;
                // 写回失败的回滚与提示是宿主的事(它才知道用什么提示通道);
                // 这里只保证一次未捕获的 rejection 不会冒到控制台。
                void Promise.resolve(setDensity(next)).catch(() => undefined);
              }}
            />
            {saving ? (
              <span className="text-[12px] text-ink-faint" data-test-id="appearance-density-saving">
                {labels.saving}
              </span>
            ) : null}
          </div>
        </Field>
      </div>
  );
}

interface GlobalAppearanceController {
  value: EnterpriseGeneralSettingsValue | null;
  loadFailed: boolean;
  saving: boolean;
  reload(): Promise<void>;
  setShowFooter(next: boolean): Promise<void>;
}

function useGlobalAppearanceController(
  adapter: EnterpriseGeneralSettingsAdapter,
  labels: EnterpriseAppearanceSettingsLabels,
): GlobalAppearanceController {
  const [value, setValue] = useState<EnterpriseGeneralSettingsValue | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  // A fresh read, not the shared cache: the PUT carries the whole general value,
  // and a cache primed at first paint could predate another administrator's
  // brand edit — saving the switch would then quietly put the old brand back.
  const reload = useCallback(async () => {
    setLoadFailed(false);
    try {
      setValue(await adapter.load());
    } catch {
      setLoadFailed(true);
    }
  }, [adapter]);
  useEffect(() => {
    const timer = window.setTimeout(() => void reload(), 0);
    return () => window.clearTimeout(timer);
  }, [reload]);
  const setShowFooter = useCallback(
    async (next: boolean) => {
      if (!value) return;
      setSaving(true);
      try {
        const saved = await adapter.save({ ...value, showFooter: next });
        setValue(saved);
        // The shell reads the shared store: seeding it hides / shows the footer now.
        primeEnterpriseGeneralSettings(saved);
        adapter.onSaved?.(saved);
        toast.success(labels.globalSaved);
      } catch {
        toast.error(labels.globalSaveFailed);
      } finally {
        setSaving(false);
      }
    },
    [adapter, labels.globalSaved, labels.globalSaveFailed, value],
  );
  return { value, loadFailed, saving, reload, setShowFooter };
}

function GlobalAppearanceSection({
  labels,
  adapter,
}: {
  labels: EnterpriseAppearanceSettingsLabels;
  adapter: EnterpriseGeneralSettingsAdapter;
}) {
  const controller = useGlobalAppearanceController(adapter, labels);
  const checked = resolveEnterpriseShowFooter(controller.value);
  return (
    <div className="space-y-4 rounded-md border border-hairline bg-paper p-4" data-test-id="appearance-global-section">
      <Field hint={labels.showFooterHint}>
        <div className="flex flex-wrap items-center gap-3">
          <Switch
            checked={checked}
            label={labels.showFooter}
            disabled={!controller.value || controller.saving}
            onChange={(next) => void controller.setShowFooter(next)}
            data-test-id="appearance-show-footer-switch"
          />
          {controller.saving ? (
            <span className="text-[12px] text-ink-faint" data-test-id="appearance-show-footer-saving">
              {labels.saving}
            </span>
          ) : null}
        </div>
      </Field>
      {controller.loadFailed ? (
        <div className="flex flex-wrap items-center gap-3 text-[12px] text-ink-soft" data-test-id="appearance-global-load-failed">
          <span>{labels.globalLoadFailed}</span>
          <Button variant="ghost" size="sm" onClick={() => void controller.reload()} data-test-id="appearance-global-retry">
            {labels.retry}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
