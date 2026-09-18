"use client";

import type { ReactNode } from "react";

/** 返回目标:一个 href + 一句无障碍名(图标按钮没有可见文案,`label` 就是它的名字)。 */
export interface PageBackNav {
  href: string;
  label: string;
  testId?: string;
}

export interface PageBackLinkRenderArgs {
  href: string;
  className: string;
  /** 落到 `aria-label`:图标按钮没有可见文案。 */
  ariaLabel: string;
  /** 落到 `title`:纯图标控件靠原生提示补一句可见说明。 */
  title: string;
  testId?: string;
  children: ReactNode;
}

/**
 * 宿主用来接自己路由器的渲染函数(与 shell 的 `RenderNavLink`、enterprise 的
 * `EnterpriseLinkRenderer` 同一套路):不传就渲染一个普通 `<a href>`,EasyUI 自己
 * 不依赖任何框架的 `Link`。
 */
export type PageBackLinkRenderer = (args: PageBackLinkRenderArgs) => ReactNode;

/**
 * 返回控件的类:28px(手机)/ 32px(桌面)的圆形命中区,悬停浅底、焦点可见。
 * 它排在 h1 左侧的同一行里,所以必须 `shrink-0` —— 标题再长也不许把它压扁。
 */
const BACK_LINK_CLASS =
  "inline-flex size-7 shrink-0 items-center justify-center rounded-full text-ink-soft outline-none transition-colors hover:bg-ink/[0.06] hover:text-ink focus-visible:ring-2 focus-visible:ring-[rgb(var(--amber))]/45 md:size-8";

/** 左向尖角(内联 SVG:图标不引第三方包,也不占一次网络请求)。 */
function BackChevron() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10 3.5 5.5 8l4.5 4.5" />
    </svg>
  );
}

/**
 * 内联返回控件:紧挨着 h1 左边的一个圆形图标按钮。
 *
 * 不再自成一行 —— 单独一条「← 返回 X」会在页头顶上白占 20 来像素,桌面上首屏因此被
 * 页头整个吃掉一大块(用户反馈:「顶部有巨大空间被浪费」)。文案改由 `aria-label` /
 * `title` 承载,读屏与悬停都还在。
 */
export function PageBackLink({ back, renderLink }: { back: PageBackNav; renderLink?: PageBackLinkRenderer }) {
  const args: PageBackLinkRenderArgs = {
    href: back.href,
    className: BACK_LINK_CLASS,
    ariaLabel: back.label,
    title: back.label,
    testId: back.testId,
    children: <BackChevron />,
  };
  if (renderLink) return <>{renderLink(args)}</>;
  return (
    <a href={args.href} className={args.className} aria-label={args.ariaLabel} title={args.title} data-test-id={args.testId}>
      {args.children}
    </a>
  );
}

interface Props {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  /** 传了就在 h1 左侧内联一个返回控件(不占独立一行)。 */
  back?: PageBackNav;
  /** 宿主路由器的链接渲染函数,只给 `back` 用;不传走普通 `<a>`。 */
  renderLink?: PageBackLinkRenderer;
}

/** Page title block — CSS enter (MOTION.route timing via theme.css). */
export function PageHeader({ eyebrow, title, subtitle, meta, actions, back, renderLink }: Props) {
  return (
    /* 页头竖向节奏:桌面 `mb-5 pb-4`(旧值 mb-6 / pb-5,首行正文因此抬高 8px),
       手机继续走更紧的 `max-md:` 一档。 */
    <header className="easy-page-header-enter mb-5 border-b border-hairline pb-4 max-md:mb-4 max-md:pb-3">
      {/* Stack on phones so a wide toolbar never squeezes the title into
          multiple lines; revert to the side-by-side layout from sm up. */}
      <div className="flex flex-col items-start gap-4 max-md:gap-2 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="w-full min-w-0 sm:flex-1">
          {eyebrow && <div className="eyebrow mb-1 max-md:hidden">{eyebrow}</div>}
          {/* 标题行:返回控件(可选)与 h1 同行。h1 全站同一档 22px(与详情页页眉一致)。 */}
          <div className="flex items-center gap-2">
            {back ? <PageBackLink back={back} renderLink={renderLink} /> : null}
            {/* 有返回控件时标题与它抢同一行的宽度,必须截断而不是把控件挤走。 */}
            <h1 className={`min-w-0 text-[22px] font-semibold leading-tight tracking-tight text-ink ${back ? "truncate" : ""}`}>
              {title}
            </h1>
          </div>
          {subtitle && <p className="mt-1.5 max-w-2xl text-[13px] text-ink-soft max-md:text-[12px]">{subtitle}</p>}
          {/* Meta row carries facts (ids, counts, timestamps) — 12px floor, same as labels. */}
          {meta && (
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[12px] text-ink-faint">{meta}</div>
          )}
        </div>
        {actions && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">{actions}</div>}
      </div>
    </header>
  );
}
