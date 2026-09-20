"use client";

/**
 * 行距 —— 一份跨宿主的观感偏好,管全站表单的纵向节奏。
 *
 * 一页里 input 与 input 之间松还是紧,和列表行高一样是个人习惯:用户在设置里
 * 调一次,所有页面都该跟着走。但表单散落在两个宿主的每一个角落,层层传 prop
 * 不现实 —— 所以这里用 **DOM 属性当传输层**:Provider 把当前档位写到
 * `document.documentElement` 的 `data-ui-density` 上,`theme.css` 里
 * `:root[data-ui-density="…"]` 把 `--ui-gap-*` / `--ui-field-gap` /
 * `--ui-section-gap` 换成对应的一组值,`FormGrid` / `Field` / `Section` 与
 * `ui-stack*` 这些类只认这些变量。改一次档,全站表单一起重排,没有一个 prop
 * 被穿透。属性名不要改 —— `theme.css` 就是按 `data-ui-density` 选的。
 *
 * 这和表格行高(`table/table-density.tsx`)是**两份独立的偏好**:表格那份只管
 * antd `Table` 的 `size`,这一份只管表单节奏,用户在「外观」里分别调。
 *
 * 这份上下文是**受控的**:值与写回都由宿主给。偏好存在用户账号里(服务端),不在
 * 浏览器本地 —— 换台机器、换个浏览器,行距还是自己习惯的那一档;套件不碰存储,
 * 也就不会出现"本地存了一份、服务端存了另一份"的两个事实源。
 *
 * 没有挂 Provider 时的缺省值是 `"compact"`:紧凑是全站默认,宿主没接这套偏好时
 * 也该拿到默认观感。
 */

import { createContext, useContext, useLayoutEffect, useMemo, type ReactNode } from "react";

/** 行距档位:紧凑 / 宽松。 */
export type RowSpacing = "compact" | "comfortable";

/** 全局默认:紧凑。 */
export const DEFAULT_ROW_SPACING: RowSpacing = "compact";

export interface RowSpacingValue {
  rowSpacing: RowSpacing;
  /** 写回账号偏好;宿主负责乐观更新、失败回滚与提示。没有 Provider 时是空实现。 */
  setRowSpacing: (next: RowSpacing) => void | Promise<void>;
  /** 正在写回(设置页据此显示保存中)。 */
  saving: boolean;
}

/** CSS 侧读这个属性换 `--ui-gap-*`;挂在 `<html>` 上,见 `theme.css`。 */
const ROW_SPACING_ATTRIBUTE = "data-ui-density";

const RowSpacingContext = createContext<RowSpacingValue>({
  rowSpacing: DEFAULT_ROW_SPACING,
  setRowSpacing: () => undefined,
  saving: false,
});

export interface RowSpacingProviderProps {
  /** 当前档位(来自账号偏好)。 */
  value: RowSpacing;
  /** 用户改档:宿主写回服务端。 */
  onChange: (next: RowSpacing) => void | Promise<void>;
  /** 写回在途。 */
  saving?: boolean;
  children: ReactNode;
}

/**
 * 在外壳上挂一次;它下面的所有表单与「外观」设置页读同一份档位。
 *
 * 除了给出上下文,它还把档位发布到 `<html data-ui-density>`:那是 CSS 侧的传输层
 * (见文件头)。用 `useLayoutEffect` 是为了在浏览器画这一帧之前就把属性写好,
 * 避免"先按默认档排一版、再跳到用户档"的闪动;属性不做清理 —— Provider 与应用外壳
 * 同生共死,卸载时再把它抹掉反而会在路由切换的瞬间掉回默认档。
 */
export function RowSpacingProvider({ value, onChange, saving = false, children }: RowSpacingProviderProps) {
  const context = useMemo<RowSpacingValue>(() => ({ rowSpacing: value, setRowSpacing: onChange, saving }), [onChange, saving, value]);
  useLayoutEffect(() => {
    // SSR / 非 DOM 环境(Node 里跑的单测、RSC 预渲染)没有 document,直接跳过:
    // 缺省那一档已经写在 `:root` 里,首屏拿到的就是紧凑。
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute(ROW_SPACING_ATTRIBUTE, value);
  }, [value]);
  return <RowSpacingContext.Provider value={context}>{children}</RowSpacingContext.Provider>;
}

/** 当前档位 + 写回口。表单与「外观」设置页都走这一个钩子。 */
export function useRowSpacing(): RowSpacingValue {
  return useContext(RowSpacingContext);
}
