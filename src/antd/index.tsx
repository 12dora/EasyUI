"use client";

/**
 * `@easy-enterprise/ui/antd` — the one antd `ConfigProvider` every Easy* host
 * mounts, instead of each copying its own theme bridge.
 *
 * antd is an **optional peer**: like `./table` and `./enterprise-local-accounts`
 * this entry is deliberately off the main barrel, so a host that never imports
 * it never pulls antd into its bundle.
 *
 *   import { EasyAntdProvider } from "@easy-enterprise/ui/antd";
 *
 *   <EasyAntdProvider locale={locale === "en" ? "en" : "zh-CN"}>{children}</EasyAntdProvider>
 *
 * Mount it **once**, around the app content (the protected shell plus any public
 * page that renders antd). Never nest a second `cssVar` `ConfigProvider` inside
 * it — antd would inject its `--ant-*` custom properties twice and the two
 * copies would fight; use the `token` / `components` props instead.
 *
 * This module pulls in both locale packs. A host that wants only the active one
 * in its bundle imports the single-locale components from their own subpaths and
 * code-splits them itself:
 *
 *   const Zh = dynamic(() => import("@easy-enterprise/ui/antd/provider-zh").then((m) => m.EasyAntdProviderZh), { ssr: true });
 */

import { EasyAntdProviderEn } from "./provider-en";
import { EasyAntdProviderZh } from "./provider-zh";
import type { EasyAntdThemeProps } from "./easy-antd-config";

export { EasyAntdConfig, type EasyAntdThemeProps } from "./easy-antd-config";
export { EasyAntdProviderEn } from "./provider-en";
export { EasyAntdProviderZh } from "./provider-zh";
export { EASY_ANTD_THEME_TOKEN, createEasyAntdTheme, type EasyAntdToken } from "./theme";

export type EasyAntdLocale = "zh-CN" | "en";

export interface EasyAntdProviderProps extends EasyAntdThemeProps {
  locale: EasyAntdLocale;
}

export function EasyAntdProvider({ locale, ...rest }: EasyAntdProviderProps) {
  return locale === "en" ? <EasyAntdProviderEn {...rest} /> : <EasyAntdProviderZh {...rest} />;
}
