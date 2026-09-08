"use client";

import type { ReactNode } from "react";

export interface EnterpriseBrandSlotRenderLinkArgs {
  href: string;
  className: string;
  children: ReactNode;
  testId?: string;
}

export interface EnterpriseBrandSlotProps {
  href: string;
  title: string;
  subtitle?: string | null;
  /** Data URL or public asset path. The `<img>` is omitted entirely when empty. */
  logoSrc?: string | null;
  testId?: string;
  /** Hosts pass their router link (Next `Link`); the default renders a plain `<a>`. */
  renderLink?: (args: EnterpriseBrandSlotRenderLinkArgs) => ReactNode;
}

const BRAND_LINK_CLASS = "flex min-w-0 items-center gap-3 transition-opacity hover:opacity-80";

/**
 * Top-left brand slot shared by every host topbar (public and authenticated).
 *
 * The logo is decorative: the product name is already the link's visible text,
 * so `alt=""` + `aria-hidden` keeps the accessible name from being announced
 * twice. Title and subtitle come from the general settings (see
 * `resolveEnterpriseBrand`), which is why both are plain strings here — this
 * component never fetches anything.
 */
export function EnterpriseBrandSlot({ href, title, subtitle, logoSrc, testId, renderLink }: EnterpriseBrandSlotProps) {
  const children = (
    <>
      {logoSrc ? (
        /* 包内不依赖 next/image:宿主 logo 可能是 data: URL,尺寸也已由 class 固定。 */
        <img
          src={logoSrc}
          alt=""
          aria-hidden="true"
          width={56}
          height={34}
          decoding="async"
          className="h-9 w-auto shrink-0 object-contain"
          data-test-id={testId ? `${testId}-logo` : undefined}
        />
      ) : null}
      <div className="min-w-0">
        <div className="truncate text-[16px] font-semibold text-ink" data-test-id={testId ? `${testId}-title` : undefined}>
          {title}
        </div>
        {subtitle ? (
          /* The link's accessible name is the product name alone; the subtitle is
             a visible qualifier, not part of "where does this link go". */
          <p
            className="hidden text-[12px] text-ink-faint sm:block"
            aria-hidden="true"
            data-test-id={testId ? `${testId}-subtitle` : undefined}
          >
            {subtitle}
          </p>
        ) : null}
      </div>
    </>
  );
  if (renderLink) return <>{renderLink({ href, className: BRAND_LINK_CLASS, children, testId })}</>;
  return (
    <a href={href} className={BRAND_LINK_CLASS} data-test-id={testId}>
      {children}
    </a>
  );
}
