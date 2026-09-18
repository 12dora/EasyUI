"use client";

/**
 * 表格密度(行高)—— 一份跨宿主的观感偏好。
 *
 * 列表页的行高不是某一张表的事:同一个人在题库、考试、阅卷、成绩之间来回切,
 * 行高必须处处一致,否则每换一页都要重新对焦。所以密度不是表格的 prop,而是一份
 * **上下文**:`ClientTable` / `DataTable` 各自读它,宿主只在外壳上挂一次。
 *
 * 这份上下文是**受控的**:值与写回都由宿主给。偏好存在用户账号里(服务端),不在
 * 浏览器本地 —— 换台机器、换个浏览器,行高还是自己习惯的那一档;套件不碰存储,
 * 也就不会出现"本地存了一份、服务端存了另一份"的两个事实源。
 *
 * 没有挂 Provider 时的缺省值是 `"compact"`:紧凑是全站默认,宿主没接这套偏好时
 * 也该拿到默认观感,而不是退回 antd 的 `middle`。
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";

/** 行高档位:紧凑(antd `size="small"`)/ 宽松(antd `size="middle"`)。 */
export type TableDensity = "compact" | "comfortable";

/** 全局默认:紧凑。 */
export const DEFAULT_TABLE_DENSITY: TableDensity = "compact";

export interface TableDensityValue {
  density: TableDensity;
  /** 写回账号偏好;宿主负责乐观更新、失败回滚与提示。没有 Provider 时是空实现。 */
  setDensity: (next: TableDensity) => void | Promise<void>;
  /** 正在写回(设置页据此显示保存中)。 */
  saving: boolean;
}

const TableDensityContext = createContext<TableDensityValue>({
  density: DEFAULT_TABLE_DENSITY,
  setDensity: () => undefined,
  saving: false,
});

export interface TableDensityProviderProps {
  /** 当前档位(来自账号偏好)。 */
  value: TableDensity;
  /** 用户改档:宿主写回服务端。 */
  onChange: (next: TableDensity) => void | Promise<void>;
  /** 写回在途。 */
  saving?: boolean;
  children: ReactNode;
}

/** 在外壳上挂一次;它下面的所有表格与「外观」设置页读同一份档位。 */
export function TableDensityProvider({ value, onChange, saving = false, children }: TableDensityProviderProps) {
  const context = useMemo<TableDensityValue>(() => ({ density: value, setDensity: onChange, saving }), [onChange, saving, value]);
  return <TableDensityContext.Provider value={context}>{children}</TableDensityContext.Provider>;
}

/** 当前档位 + 写回口。表格与「外观」设置页都走这一个钩子。 */
export function useTableDensity(): TableDensityValue {
  return useContext(TableDensityContext);
}

/** 档位 → antd `Table` 的 `size`。 */
export function tableSizeOf(density: TableDensity): "small" | "middle" {
  return density === "compact" ? "small" : "middle";
}
