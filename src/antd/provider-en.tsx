"use client";

/**
 * English antd environment — the en route never loads `zh_CN` or the dayjs zh
 * locale when a host mounts this one directly (see `provider-zh.tsx`).
 */

import enUS from "antd/locale/en_US";

import { EasyAntdConfig, type EasyAntdThemeProps } from "./easy-antd-config";

export function EasyAntdProviderEn(props: EasyAntdThemeProps) {
  return <EasyAntdConfig {...props} locale={enUS} />;
}
