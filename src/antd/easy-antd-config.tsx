"use client";

/**
 * The single antd `ConfigProvider` shared by every Easy* host — the locale pack
 * is the only thing the two locale wrappers add on top.
 *
 * **Never nest a second cssVar `ConfigProvider` inside this one.** `cssVar: {}`
 * makes antd emit its `--ant-*` custom properties at runtime; a nested provider
 * emits a second copy and the two fight over the same variables (and over
 * `hashed: false`'s unhashed class names). Page-level theming goes through the
 * `token` / `components` props here, not through another provider.
 */

import { App, ConfigProvider, type ThemeConfig } from "antd";
import type { Locale } from "antd/es/locale";
import type { ReactNode } from "react";

import { EASY_ANTD_THEME_TOKEN, type EasyAntdToken } from "./theme";

export interface EasyAntdThemeProps {
  children: ReactNode;
  /** Token overrides merged over `EASY_ANTD_THEME_TOKEN` (see `createEasyAntdTheme`). */
  token?: EasyAntdToken;
  /** Per-component antd token overrides, passed through untouched. */
  components?: ThemeConfig["components"];
  /**
   * Mount antd's `<App component={false}>` so `App.useApp()` works (message /
   * notification / modal bound to the theme).
   *
   * Off by default: with `cssVar` enabled antd itself warns about
   * `component={false}` ("ensure `component` is assigned a valid React
   * component string"), which in Next dev surfaces as a console error on every
   * page — EasyTrade cannot turn it on today for exactly that reason. Opt in
   * only when the host actually calls `App.useApp()`.
   */
  withApp?: boolean;
}

export function EasyAntdConfig({ locale, children, token, components, withApp = false }: EasyAntdThemeProps & { locale: Locale }) {
  return (
    <ConfigProvider
      locale={locale}
      theme={{ cssVar: {}, hashed: false, token: { ...EASY_ANTD_THEME_TOKEN, ...token }, components }}
    >
      {withApp ? <App component={false}>{children}</App> : children}
    </ConfigProvider>
  );
}
