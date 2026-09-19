import type { ReactNode } from "react";

export interface TopbarProps {
  /** Left slot — usually a brand/logo link. */
  brand: ReactNode;
  /** Right slot — usually user/notification/language actions. */
  actions?: ReactNode;
  /** Optional slot before the brand (e.g. a mobile menu button). */
  leading?: ReactNode;
  /**
   * Optional centered content max width. Unset (the default) is full-bleed, so
   * the brand stays flush with the sidebar and the actions stay flush with the
   * right edge of the viewport — matching `<AppShell />`, which is full-bleed
   * for the same reason. Only pass a number for surfaces that deliberately
   * centre a narrow column.
   */
  maxWidth?: number;
  testId?: string;
  className?: string;
}

/**
 * EasyUI top bar: a sticky, translucent header with a brand slot and an actions
 * slot. Purely presentational — the host supplies brand + action components.
 */
export function Topbar({ brand, actions, leading, maxWidth, testId, className = "" }: TopbarProps) {
  return (
    <header
      className={`sticky top-0 z-20 border-b border-hairline bg-paper/95 backdrop-blur-sm ${className}`}
      data-test-id={testId}
    >
      {/* 行高 48px(`h-12`,手机/桌面同值;原 56px 在小屏上太占首屏)。
          手机上收窄左右留白与间距,给品牌标题和右侧动作腾宽度。
          行内元素按 48px 配平:图标按钮 36px、logo 32px、头像 32px;
          手机弹层 `max-md:top-12` 贴在这条行的正下方 —— 改高度时这几处要一起改。 */}
      <div
        className="mx-auto flex h-12 items-center justify-between gap-2 px-3 md:gap-4 md:px-5"
        style={{ maxWidth }}
      >
        <div className="flex min-w-0 items-center gap-2">
          {leading}
          {brand}
        </div>
        {actions}
      </div>
    </header>
  );
}
