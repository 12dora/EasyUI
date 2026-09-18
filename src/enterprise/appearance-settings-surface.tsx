"use client";

/**
 * 「外观」设置页(共享面)。
 *
 * 目前只有一张卡片:表格密度。它是一份**账号偏好** —— 宿主把当前值与写回口挂在
 * `TableDensityProvider` 上,这张页面只读写那份上下文,自己既不取数也不落盘。
 * 于是「设置页改一下」与「所有列表页的行高」天然是同一个事实源,不会出现设置页
 * 显示宽松、列表仍然紧凑的两张皮。
 *
 * 文案按本包一贯的做法从 props 注入(`EnterpriseAppearanceSettingsLabels`,
 * `createEnterpriseLabelCatalog` 里有 zh / en 两份),宿主也可以自带。
 */

import { Field } from "../primitives/field";
import { PageHeader } from "../primitives/page-header";
import { SegmentedToggle, type SegmentedToggleOption } from "../primitives/segmented-toggle";
import { useTableDensity, type TableDensity } from "../table/table-density";

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
export function EnterpriseAppearanceSettingsSurface({ labels }: { labels: EnterpriseAppearanceSettingsLabels }) {
  const { density, setDensity, saving } = useTableDensity();
  return (
    <div data-test-id="appearance-settings-page">
      <PageHeader title={labels.title} subtitle={labels.description} />
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
    </div>
  );
}
