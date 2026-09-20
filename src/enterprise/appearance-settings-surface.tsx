"use client";

/**
 * 「外观」设置页(共享面)。
 *
 * 两张卡片:
 *
 * 1. 视觉效果(每个用户都有)。目前只有一行:**行距** —— 它既管列表行高,也管全站
 * 表单里 input 之间的纵向节奏(见 `table/table-density.tsx`)。这是一份**账号偏好**,
 * 宿主把当前值与写回口挂在 `TableDensityProvider` 上,这张页面只读写那份上下文,
 * 自己既不取数也不落盘。于是「设置页改一下」与「所有页面的松紧」天然是同一个事实源,
 * 不会出现设置页显示宽松、列表仍然紧凑的两张皮。
 * 2. 显示页脚(只有管理员,即宿主判定持有 `settings.app_setting.update` 时才画)。它是
 *    **全局设置**,存在通用设置(`/api/v1/app-settings/general` 的 `showFooter`)里:
 *    切换时**紧接着 PUT 之前**再 `load()` 一份最新的通用设置,把它连同新的
 *    `showFooter` 整份 PUT 回去(页面开着期间别人改的品牌字段不会被旧值盖掉),成功后 `primeEnterpriseGeneralSettings` 让外壳
 *    立刻收起 / 放出页脚。
 *
 * 文案按本包一贯的做法从 props 注入(`EnterpriseAppearanceSettingsLabels`,
 * `createEnterpriseLabelCatalog` 里有 zh / en 两份),宿主也可以自带。
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
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
  /** 卡片标题,例如「视觉效果」。 */
  visualTitle: string;
  /** 设置行的标签,例如「行距」。 */
  rowSpacing: string;
  densityCompact: string;
  densityComfortable: string;
  /** 写回账号偏好时的状态字。 */
  saving: string;
  /** 写回失败的提示语;由宿主在自己的提示通道里用(它才知道用 toast 还是别的)。 */
  saveFailed: string;
  /** 开关文案,例如「显示页脚」。 */
  showFooter: string;
  /** 开关下方一句说明:这是影响所有用户的全局设置。 */
  showFooterHint?: string;
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
      {/* 兜底 16px = 改造前的 space-y-4;与 theme.css 的缺省档(紧凑 12px)不同是故意的。 */}
      <div className="space-y-[var(--ui-gap-md,16px)]">
        <DensitySection labels={labels} />
        {canManageGlobal && generalSettingsAdapter ? (
          <GlobalAppearanceSection labels={labels} adapter={generalSettingsAdapter} />
        ) : null}
      </div>
    </div>
  );
}

/**
 * 卡片里的一行设置:左边一句标签,右边控件,同一条基线上。
 *
 * 刻意不用 `Field` —— `Field` 是"标签在上、控件在下"的录入布局,而设置页要的是
 * 一行一个开关的清单式排布,以后再加一行(比如字号、主题)直接多写一个
 * `<SettingRow>` 就行。窄屏时 `flex-wrap` 让控件掉到下一行,不会把标签挤没。
 */
function SettingRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <span className="text-[13px] text-ink">{label}</span>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

function DensitySection({ labels }: { labels: EnterpriseAppearanceSettingsLabels }) {
  const { density, setDensity, saving } = useTableDensity();
  return (
    <div className="rounded-md border border-hairline bg-paper p-4" data-test-id="appearance-density-section">
      <p className="text-[14px] font-semibold text-ink" data-test-id="appearance-visual-title">{labels.visualTitle}</p>
      <div className="mt-4 space-y-[var(--ui-gap-md,16px)]">
        <SettingRow label={labels.rowSpacing}>
          <SegmentedToggle<TableDensity>
            value={density}
            options={densityOptions(labels)}
            ariaLabel={labels.rowSpacing}
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
        </SettingRow>
      </div>
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
  // A fresh read for the switch position (the shared cache may be stale); the
  // save re-reads again right before its PUT, see `setShowFooter`.
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
        // Re-read right before the PUT: the body is the whole general value, and
        // the copy loaded when this page opened may predate another
        // administrator's title / logo edit — sending it would restore the old brand.
        const fresh = await adapter.load();
        const saved = await adapter.save({ ...fresh, showFooter: next });
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
    <div className="space-y-[var(--ui-gap-md,16px)] rounded-md border border-hairline bg-paper p-4" data-test-id="appearance-global-section">
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
