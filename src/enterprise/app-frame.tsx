"use client";

import type { ReactNode } from "react";
import { AppShell, type AppShellProps } from "../shell/AppShell";

export type EnterpriseAppFrameProps = Omit<AppShellProps, "footer"> & {
  /** Required on purpose — every enterprise host pins a footer inside the app frame. */
  footer: ReactNode;
  /**
   * The global footer switch (设置 → 外观), usually
   * `resolveEnterpriseShowFooter(settings)`. `false` renders no footer and no
   * footer wrapper, so the workspace takes the freed height. Default `true`.
   */
  showFooter?: boolean;
};

/**
 * Authenticated application frame for enterprise hosts.
 *
 * It is `AppShell` with `footer` promoted from optional to required. `AppShell`
 * keeps the optional prop for frames that deliberately omit one (EasyTrade's
 * custom fixed admin frame); every host that composes the standard shell must
 * use this frame instead, so "the footer is missing in this app" cannot happen
 * again by omission. Turning the footer off is an explicit `showFooter={false}`,
 * never a missing prop.
 */
export function EnterpriseAppFrame({ footer, showFooter = true, ...props }: EnterpriseAppFrameProps) {
  return <AppShell {...props} footer={showFooter ? footer : undefined} />;
}
