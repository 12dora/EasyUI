"use client";

/**
 * 行距 —— 一份跨宿主的观感偏好,同时管表格行高与表单的纵向节奏。
 *
 * 列表页的行高不是某一张表的事:同一个人在题库、考试、阅卷、成绩之间来回切,
 * 行高必须处处一致,否则每换一页都要重新对焦。所以密度不是表格的 prop,而是一份
 * **上下文**:`ClientTable` / `DataTable` 各自读它,宿主只在外壳上挂一次。
 *
 * 表单同理:一页里 input 之间的行距松紧,和列表行高是同一个"观感"问题,用户在
 * 设置里只该调一次。但表单散落在两个宿主的每一个角落,层层传 prop 不现实 ——
 * 所以这里用 **DOM 属性当传输层**:Provider 把当前档位写到
 * `document.documentElement` 的 `data-ui-density` 上,`theme.css` 里
 * `:root[data-ui-density="…"]` 把 `--ui-gap-*` / `--ui-field-gap` 换成对应的一组值,
 * `FormGrid` / `Field` 只认这些变量。改一次档,全站表单一起重排,没有一个 prop 被穿透。
 *
 * 这份上下文是**受控的**:值与写回都由宿主给。偏好存在用户账号里(服务端),不在
 * 浏览器本地 —— 换台机器、换个浏览器,行高还是自己习惯的那一档;套件不碰存储,
 * 也就不会出现"本地存了一份、服务端存了另一份"的两个事实源。
 *
 * 没有挂 Provider 时的缺省值是 `"compact"`:紧凑是全站默认,宿主没接这套偏好时
 * 也该拿到默认观感,而不是退回 antd 的 `middle`。
 */

import { createContext, useContext, useLayoutEffect, useMemo, type ReactNode } from "react";

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

/** CSS 侧读这个属性换 `--ui-gap-*`;挂在 `<html>` 上,见 `theme.css`。 */
const DENSITY_ATTRIBUTE = "data-ui-density";

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

/**
 * 在外壳上挂一次;它下面的所有表格、表单与「外观」设置页读同一份档位。
 *
 * 除了给出上下文,它还把档位发布到 `<html data-ui-density>`:那是 CSS 侧的传输层
 * (见文件头)。用 `useLayoutEffect` 是为了在浏览器画这一帧之前就把属性写好,
 * 避免"先按默认档排一版、再跳到用户档"的闪动;属性不做清理 —— Provider 与应用外壳
 * 同生共死,卸载时再把它抹掉反而会在路由切换的瞬间掉回默认档。
 */
export function TableDensityProvider({ value, onChange, saving = false, children }: TableDensityProviderProps) {
  const context = useMemo<TableDensityValue>(() => ({ density: value, setDensity: onChange, saving }), [onChange, saving, value]);
  useLayoutEffect(() => {
    // SSR / 非 DOM 环境(Node 里跑的单测、RSC 预渲染)没有 document,直接跳过:
    // 缺省那一档已经写在 `:root` 里,首屏拿到的就是紧凑。
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute(DENSITY_ATTRIBUTE, value);
  }, [value]);
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
