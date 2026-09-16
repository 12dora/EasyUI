"use client";

/**
 * Chinese antd environment.
 *
 * Exported separately so a host can load *only* the active locale pack
 * (`next/dynamic(() => import("@easy-enterprise/ui/antd/provider-zh"), { ssr: true })`);
 * `ssr: true` keeps the server HTML and the hydrated tree on the same locale.
 */

import zhCN from "antd/locale/zh_CN";
// rc-picker normalises zh_CN to "zh" through parseLocale — registering only
// zh-cn leaves the month names in English.
import "dayjs/locale/zh";
import "dayjs/locale/zh-cn";

import { EasyAntdConfig, type EasyAntdThemeProps } from "./easy-antd-config";

export function EasyAntdProviderZh(props: EasyAntdThemeProps) {
  return <EasyAntdConfig {...props} locale={zhCN} />;
}
