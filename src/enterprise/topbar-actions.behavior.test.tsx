// @vitest-environment happy-dom
/**
 * 用户风险:390px 的顶栏放不下"地球 + 铃铛 + 头像"三个入口,挤到品牌标题只剩两三个字。
 * 手机上语言切换要搬进用户菜单 —— 但如果搬的时候丢了 role/aria-checked 或者换了 test id,
 * 读屏用户就听不出当前语言,宿主 e2e 也会静默失效;反过来桌面上要是被顺手改成菜单项,
 * 所有桌面用户的切换路径就变了。这里把两侧各自的形态钉死。
 */
import { afterEach, describe, expect, it } from "vitest";

import { byTestId, click, mount, type MountedView } from "./behavior-test-utils";
import type { EnterpriseLinkRenderer, EnterpriseShellLabels } from "./models";
import { EnterpriseTopbarActions } from "./topbar-actions";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let view: MountedView | null = null;
const originalMatchMedia = Object.getOwnPropertyDescriptor(window, "matchMedia");

/** 视口 mock:只有 `(max-width: 767px)` 这条查询按 `phone` 回答,其余一律 false。 */
function installViewport(phone: boolean): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: phone && query.includes("max-width: 767px"),
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

const labels: EnterpriseShellLabels = {
  switchLanguage: "切换语言",
  notifications: "通知",
  notificationsEmpty: "暂无通知",
  notificationsLoadFailed: "加载失败",
  notificationsClearAll: "全部清除",
  notificationsViewAll: "查看全部",
  notificationsDismiss: "忽略",
  userMenu: "账户菜单",
  securitySettings: "安全设置",
  logout: "退出登录",
  loggingOut: "退出中",
};

const renderLink: EnterpriseLinkRenderer = ({ href, className, testId, role, children }) => (
  <a href={href} className={className} role={role} data-test-id={testId}>
    {children}
  </a>
);

const localeOptions = [
  { code: "zh-CN", label: "简体中文" },
  { code: "en", label: "English" },
] as const;

function renderActions(onLocaleChange: (locale: string) => void = () => undefined) {
  return (
    <EnterpriseTopbarActions
      locale="zh-CN"
      localeOptions={localeOptions}
      onLocaleChange={onLocaleChange}
      labels={labels}
      notifications={{ items: [], viewAllHref: "/notifications" }}
      user={{ name: "张三", identity: "管理员", permissionSummary: "3 项权限" }}
      securityHref="/security"
      renderLink={renderLink}
      onLogout={() => undefined}
    />
  );
}

function classesOf(node: Element | null | undefined): string[] {
  if (!(node instanceof HTMLElement)) throw new Error("节点不存在");
  return node.className.split(/\s+/);
}

afterEach(async () => {
  await view?.unmount();
  view = null;
  if (originalMatchMedia) Object.defineProperty(window, "matchMedia", originalMatchMedia);
});

describe("EnterpriseTopbarActions — 桌面", () => {
  it("语言切换仍是顶栏上的独立入口,用户菜单里没有它", async () => {
    installViewport(false);
    view = await mount(renderActions());
    const switcher = byTestId(view.host, "topbar-language-switcher");
    await click(switcher.querySelector("button") as HTMLElement);
    const option = byTestId(view.host, "topbar-language-option-en");
    expect(option.getAttribute("role")).toBe("menuitemradio");
    expect(byTestId(view.host, "topbar-language-option-zh-CN").getAttribute("aria-checked")).toBe("true");
    // 桌面独立菜单的行样式保持原样(圆角 + px-3 py-2)。
    expect(option.className).toContain("rounded");

    await click(byTestId(view.host, "topbar-user-trigger"));
    expect(view.host.querySelector("[data-test-id='topbar-user-menu-language']")).toBeNull();
    expect(byTestId(view.host, "topbar-user-menu-security")).toBeTruthy();
  });

  it("通知弹层的桌面定宽没有变", async () => {
    installViewport(false);
    view = await mount(renderActions());
    await click(byTestId(view.host, "topbar-notifications").querySelector("button") as HTMLElement);
    const classes = classesOf(byTestId(view.host, "topbar-notifications-menu"));
    expect(classes).toContain("w-[300px]");
    expect(classes).toContain("absolute");
    expect(classes).toContain("right-0");
    expect(classes).toContain("top-11");
  });
});

describe("EnterpriseTopbarActions — 手机", () => {
  it("顶栏不再有独立语言入口,铃铛与头像照旧", async () => {
    installViewport(true);
    view = await mount(renderActions());
    expect(view.host.querySelector("[data-test-id='topbar-language-switcher']")).toBeNull();
    const trigger = byTestId(view.host, "topbar-user-trigger");
    expect(trigger.getAttribute("aria-label")).toBe("账户菜单");
    // 手机上头像按钮至少 40×40 的点击区。
    expect(trigger.className).toContain("max-md:h-10");
    expect(trigger.className).toContain("max-md:min-w-10");
    expect(byTestId(view.host, "topbar-user-avatar")).toBeTruthy();
  });

  it("语言项落在用户菜单里,role/aria/test id 与桌面一致且可切换", async () => {
    installViewport(true);
    const picked: string[] = [];
    view = await mount(renderActions((locale) => picked.push(locale)));
    await click(byTestId(view.host, "topbar-user-trigger"));

    const section = byTestId(view.host, "topbar-user-menu-language");
    expect(section.textContent).toContain("切换语言");
    const current = byTestId(view.host, "topbar-language-option-zh-CN");
    expect(section.contains(current)).toBe(true);
    expect(current.getAttribute("role")).toBe("menuitemradio");
    expect(current.getAttribute("aria-checked")).toBe("true");

    const english = byTestId(view.host, "topbar-language-option-en");
    expect(english.getAttribute("aria-checked")).toBe("false");
    await click(english);
    expect(picked).toEqual(["en"]);
    // 切换后菜单收起,避免停在半开状态挡住内容。
    expect(view.host.querySelector("[data-test-id='topbar-user-menu']")).toBeNull();
  });

  it("弹层宽度受视口约束,不会从右锚点溢出到屏幕外", async () => {
    installViewport(true);
    view = await mount(renderActions());

    // 通知弹层:桌面定宽 300,手机改成「视口宽 - 24」且封顶 360。
    await click(byTestId(view.host, "topbar-notifications").querySelector("button") as HTMLElement);
    const notifications = classesOf(byTestId(view.host, "topbar-notifications-menu"));
    expect(notifications).toContain("max-md:w-[calc(100vw-24px)]");
    expect(notifications).toContain("max-md:max-w-[360px]");
    expect(notifications).toContain("w-[300px]");
    expect(notifications).toContain("right-0");

    // 用户菜单只有下限宽度,内容(权限摘要)可能把它撑过屏宽,补一个上限。
    await click(byTestId(view.host, "topbar-user-trigger"));
    const userMenu = classesOf(byTestId(view.host, "topbar-user-menu"));
    expect(userMenu).toContain("max-md:max-w-[calc(100vw-24px)]");
    expect(userMenu).toContain("min-w-[200px]");
  });
});
