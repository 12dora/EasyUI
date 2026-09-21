// @vitest-environment happy-dom
/**
 * 「通知规则 / 通知渠道」页签条与钉钉渠道配置卡。「我的通知」「平台配置」本身的行为在另外两个
 * 用例文件里,夹具在 `notification-settings-fixtures.tsx`。
 *
 * 用户风险(按后果排序):
 *
 * 1. **凭据被回显或被误清**。通知凭据只写:输入框永远从空开始,留空保存不能把它清掉;
 *    只有勾了「清除」才发 `""`。
 * 2. **继承值被悄悄固化**。地址 / 标识沿用「登录与权限」时只当占位符,没动过的字段不进
 *    PUT 体 —— 否则以后改了那边的集成,这里还钉着一份旧值。
 * 3. **没权限的人看到一个点了就 403 的页签**。页签只给 `canManage` 且宿主接了渠道方法的页面画。
 * 4. 测试连接测的是**已保存**的配置:有未保存的改动时不发请求,提示先保存。
 * 5. **请求交错**。慢的旧读不许盖掉新读;保存在途时字段只读、双击只发一次 PUT。
 */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { toastBus } from "../toast";
import { byTestId, click, fill, mount, settle, type MountedView } from "./behavior-test-utils";
import { createEnterpriseLabelCatalog } from "./label-catalog";
import { deferred, LABELS, LEARNER, MANAGER, MINE, openNotificationSettings, POLICY } from "./notification-settings-fixtures";
import type {
  DingtalkChannelSettings,
  NotificationChannelTestResult,
  NotificationSettingsAdapter,
  NotificationSettingsView,
} from "./notification-settings-types";
import { useDingtalkChannel, type DingtalkChannelController } from "./use-dingtalk-channel";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CHANNEL_LABELS = LABELS.channel!;

/** 地址沿用「登录与权限」,标识单独保存过,凭据存在平台设置里。 */
const STORED: DingtalkChannelSettings = {
  baseUrl: "https://auth.example.com",
  appKey: "easylearning",
  baseUrlInherited: true,
  appKeyInherited: false,
  hasCredential: true,
  credentialSource: "settings",
  configured: true,
  updatedAt: "2026-09-01T00:00:00Z",
};

const DINGTALK_OFF: NotificationSettingsView = {
  ...MANAGER,
  channels: [{ key: "dingtalk", available: false }, { key: "in_app", available: true }],
};

function makeAdapter(mine: NotificationSettingsView = MANAGER, channel: DingtalkChannelSettings = STORED) {
  return {
    load: vi.fn().mockResolvedValue(mine),
    savePreference: vi.fn().mockResolvedValue(LEARNER),
    loadPolicy: vi.fn().mockResolvedValue(POLICY),
    savePolicy: vi.fn().mockResolvedValue(LEARNER),
    loadDingtalkChannel: vi.fn().mockResolvedValue(channel),
    saveDingtalkChannel: vi.fn().mockResolvedValue(channel),
    testDingtalkChannel: vi.fn<() => Promise<NotificationChannelTestResult>>().mockResolvedValue({ ok: true, latencyMs: 42 }),
  } satisfies NotificationSettingsAdapter;
}

function field(host: ParentNode, id: string): HTMLInputElement {
  const element = host.querySelector(`#${id}`);
  if (!(element instanceof HTMLInputElement)) throw new Error(`missing #${id}`);
  return element;
}

async function openChannels(adapter: NotificationSettingsAdapter): Promise<MountedView> {
  const mounted = await openNotificationSettings(adapter);
  await click(byTestId(mounted.host, "notification-settings-section-channels"));
  await settle(20);
  return mounted;
}

let view: MountedView | null = null;

beforeEach(() => {
  toastBus.clear();
});

afterEach(async () => {
  await view?.unmount();
  view = null;
  toastBus.clear();
});

describe("EnterpriseNotificationSettingsSurface — 页签条", () => {
  it("管理员 + 宿主接了渠道方法:两个页签,默认停在通知规则,渠道配置切过去才读", async () => {
    const adapter = makeAdapter();
    view = await openNotificationSettings(adapter);
    const strip = byTestId(view.host, "notification-settings-sections");
    expect(strip.getAttribute("role")).toBe("tablist");
    const tabs = Array.from(strip.querySelectorAll("[role='tab']")).map((tab) => tab.textContent);
    expect(tabs).toEqual(["通知规则", "通知渠道"]);
    expect(byTestId(view.host, "notification-settings-section-rules").getAttribute("aria-selected")).toBe("true");
    // 通知规则里的内容原样都在:分段控件与分组卡片。
    expect(byTestId(view.host, "notification-settings-tabs")).toBeTruthy();
    expect(byTestId(view.host, "notification-group-learner")).toBeTruthy();
    expect(adapter.loadDingtalkChannel).not.toHaveBeenCalled();

    await click(byTestId(view.host, "notification-settings-section-channels"));
    await settle(20);
    expect(adapter.loadDingtalkChannel).toHaveBeenCalledTimes(1);
    expect(byTestId(view.host, "notification-dingtalk-channel")).toBeTruthy();
    expect(view.host.querySelector("[data-test-id='notification-group-learner']")).toBeNull();
  });

  it("没有管理权限:没有页签条,也不读渠道配置", async () => {
    const adapter = makeAdapter(MINE);
    view = await openNotificationSettings(adapter);
    expect(view.host.querySelector("[data-test-id='notification-settings-sections']")).toBeNull();
    expect(byTestId(view.host, "notification-group-learner")).toBeTruthy();
    expect(adapter.loadDingtalkChannel).not.toHaveBeenCalled();
  });

  it("管理员但宿主没接渠道方法:页面与改版前一样,没有页签条", async () => {
    const full = makeAdapter();
    const legacy: NotificationSettingsAdapter = {
      load: full.load,
      savePreference: full.savePreference,
      loadPolicy: full.loadPolicy,
      savePolicy: full.savePolicy,
    };
    view = await openNotificationSettings(legacy);
    expect(view.host.querySelector("[data-test-id='notification-settings-sections']")).toBeNull();
    expect(byTestId(view.host, "notification-settings-tabs")).toBeTruthy();
  });
});

describe("EnterpriseNotificationSettingsSurface — 钉钉未配置的提示", () => {
  it("管理员:提示带「前往配置」,点了切到通知渠道并把焦点放到该页签上", async () => {
    const adapter = makeAdapter(DINGTALK_OFF);
    view = await openNotificationSettings(adapter);
    const notice = byTestId(view.host, "notification-channel-unavailable");
    expect(notice.textContent).toContain(LABELS.dingtalkUnavailable);
    await click(byTestId(notice, "notification-channel-configure"));
    await settle(20);
    const channelsTab = byTestId(view.host, "notification-settings-section-channels");
    expect(channelsTab.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(channelsTab);
    expect(byTestId(view.host, "notification-dingtalk-channel")).toBeTruthy();
  });

  it("没有管理权限:只有一句「请联系管理员」,没有跳转动作", async () => {
    view = await openNotificationSettings(makeAdapter({ ...DINGTALK_OFF, canManage: false }));
    const notice = byTestId(view.host, "notification-channel-unavailable");
    expect(notice.textContent).toBe(CHANNEL_LABELS.unavailableMember);
    expect(notice.querySelector("[data-test-id='notification-channel-configure']")).toBeNull();
  });

  it("渠道保存成功后切回通知规则,重读一次(提示可能已不成立)", async () => {
    const adapter = makeAdapter(DINGTALK_OFF);
    view = await openChannels(adapter);
    expect(adapter.load).toHaveBeenCalledTimes(1);
    await fill(field(view.host, "notification-dingtalk-credential-input"), "new-secret");
    await click(byTestId(view.host, "notification-dingtalk-save"));
    await settle(20);
    await click(byTestId(view.host, "notification-settings-section-rules"));
    await settle(20);
    expect(adapter.load).toHaveBeenCalledTimes(2);
  });
});

describe("EnterpriseNotificationSettingsSurface — 钉钉渠道配置", () => {
  it("状态徽标、继承值只当占位符、凭据不回显", async () => {
    view = await openChannels(makeAdapter());
    const status = byTestId(view.host, "notification-dingtalk-status");
    expect(status.textContent).toBe("已配置");
    expect(status.getAttribute("data-configured")).toBe("true");
    const baseUrl = field(view.host, "notification-dingtalk-base-url");
    expect(baseUrl.value).toBe("");
    expect(baseUrl.placeholder).toBe("https://auth.example.com");
    expect(byTestId(view.host, "notification-dingtalk-channel").textContent).toContain(CHANNEL_LABELS.inheritedHint);
    expect(field(view.host, "notification-dingtalk-app-key").value).toBe("easylearning");
    const credential = field(view.host, "notification-dingtalk-credential-input");
    expect(credential.type).toBe("password");
    expect(credential.value).toBe("");
    expect(credential.placeholder).toBe("已保存，留空则不修改");
    // 没改动时保存按钮不可点。
    expect((byTestId(view.host, "notification-dingtalk-save") as HTMLButtonElement).disabled).toBe(true);
  });

  it("只发改过的字段:改标识 + 填新凭据,继承的地址不进 PUT 体", async () => {
    const adapter = makeAdapter();
    adapter.saveDingtalkChannel.mockResolvedValue({ ...STORED, appKey: "trade" });
    view = await openChannels(adapter);
    await fill(field(view.host, "notification-dingtalk-app-key"), " trade ");
    await fill(field(view.host, "notification-dingtalk-credential-input"), "s3cret");
    await click(byTestId(view.host, "notification-dingtalk-save"));
    await settle(20);
    expect(adapter.saveDingtalkChannel).toHaveBeenCalledWith({ appKey: "trade", credential: "s3cret" });
    expect(byTestId(view.host, "notification-dingtalk-result").textContent).toBe(CHANNEL_LABELS.saved);
    // 保存之后凭据框回到空,仍不回显。
    expect(field(view.host, "notification-dingtalk-credential-input").value).toBe("");
  });

  it("勾「清除」才发空凭据;凭据来自部署环境时只给只读说明,没有清除项", async () => {
    const adapter = makeAdapter();
    view = await openChannels(adapter);
    await click(byTestId(view.host, "notification-dingtalk-credential-clear"));
    await click(byTestId(view.host, "notification-dingtalk-save"));
    await settle(20);
    expect(adapter.saveDingtalkChannel).toHaveBeenCalledWith({ credential: "" });
    await view.unmount();

    view = await openChannels(makeAdapter(MANAGER, { ...STORED, credentialSource: "env" }));
    expect(byTestId(view.host, "notification-dingtalk-credential-env").textContent).toBe(CHANNEL_LABELS.credentialFromEnv);
    expect(view.host.querySelector("[data-test-id='notification-dingtalk-credential-clear']")).toBeNull();
  });

  it("保存失败给错误反馈", async () => {
    const adapter = makeAdapter();
    adapter.saveDingtalkChannel.mockRejectedValue({ status: 422 });
    view = await openChannels(adapter);
    await fill(field(view.host, "notification-dingtalk-base-url"), "not-a-url");
    await click(byTestId(view.host, "notification-dingtalk-save"));
    await settle(20);
    expect(adapter.saveDingtalkChannel).toHaveBeenCalledWith({ baseUrl: "not-a-url" });
    const result = byTestId(view.host, "notification-dingtalk-result");
    expect(result.getAttribute("role")).toBe("alert");
    expect(result.textContent).toBe(CHANNEL_LABELS.saveFailed);
  });

  it("测试连接:成功带延迟,失败按 errorKind 给出原因", async () => {
    const adapter = makeAdapter();
    view = await openChannels(adapter);
    await click(byTestId(view.host, "notification-dingtalk-test"));
    await settle(20);
    expect(byTestId(view.host, "notification-dingtalk-result").textContent).toBe("连接正常 · 42 ms");

    adapter.testDingtalkChannel.mockResolvedValue({ ok: false, latencyMs: 0, errorKind: "auth", errorDetail: "401" });
    await click(byTestId(view.host, "notification-dingtalk-test"));
    await settle(20);
    expect(byTestId(view.host, "notification-dingtalk-result").textContent).toBe(CHANNEL_LABELS.testFailed.auth);

    // 未知类别只给通用的一句,上游原文(可能带内部地址)不上页面。
    adapter.testDingtalkChannel.mockResolvedValue({ ok: false, errorKind: "boom", errorDetail: "http://10.0.0.5 trace" });
    await click(byTestId(view.host, "notification-dingtalk-test"));
    await settle(20);
    expect(byTestId(view.host, "notification-dingtalk-result").textContent).toBe(CHANNEL_LABELS.testFailed.unexpected);

    adapter.testDingtalkChannel.mockRejectedValue(new Error("offline"));
    await click(byTestId(view.host, "notification-dingtalk-test"));
    await settle(20);
    expect(byTestId(view.host, "notification-dingtalk-result").textContent).toBe(CHANNEL_LABELS.testFailed.unexpected);
  });

  it("有未保存的改动时不发测试请求,提示先保存", async () => {
    const adapter = makeAdapter();
    view = await openChannels(adapter);
    await fill(field(view.host, "notification-dingtalk-app-key"), "other");
    await click(byTestId(view.host, "notification-dingtalk-test"));
    await settle(20);
    expect(adapter.testDingtalkChannel).not.toHaveBeenCalled();
    expect(toastBus.getSnapshot().map((item) => item.message)).toContain(CHANNEL_LABELS.saveBeforeTest);
  });

  it("读失败给重试,重试成功后出现配置卡", async () => {
    const adapter = makeAdapter();
    const retry = deferred<DingtalkChannelSettings>();
    adapter.loadDingtalkChannel.mockRejectedValueOnce(new Error("offline")).mockReturnValueOnce(retry.promise);
    view = await openChannels(adapter);
    expect(byTestId(view.host, "notification-dingtalk-load-failed").textContent).toContain(CHANNEL_LABELS.loadFailed);
    await click(byTestId(view.host, "notification-dingtalk-retry"));
    retry.resolve({ ...STORED, configured: false, hasCredential: false, credentialSource: "none" });
    await settle(20);
    expect(byTestId(view.host, "notification-dingtalk-status").textContent).toBe("未配置");
    expect(field(view.host, "notification-dingtalk-credential-input").placeholder).toBe(CHANNEL_LABELS.credentialEmpty);
  });
});

describe("通知渠道文案", () => {
  it("两种 copyMode、中英文都带渠道文案;系统服务认得 dingtalk_notify 与 upstream.not_configured", () => {
    const brand = { appName: "测试", appDescription: "测试" };
    for (const mode of ["legacy", "business"] as const) {
      const zh = createEnterpriseLabelCatalog("zh-CN", brand, mode);
      const en = createEnterpriseLabelCatalog("en", brand, mode);
      expect(zh.notificationSettings.channel?.sections).toEqual({ rules: "通知规则", channels: "通知渠道" });
      expect(en.notificationSettings.channel?.sections).toEqual({ rules: "Rules", channels: "Channels" });
      expect(zh.upstream.dependencyNames.dingtalk_notify).toBe("通知服务（钉钉）");
      expect(en.upstream.dependencyNames.dingtalk_notify).toBe("Notifications (DingTalk)");
      expect(zh.upstream.summaries.notConfigured).toBeTruthy();
      expect(en.upstream.summaries.notConfigured).toBe("Not configured");
    }
  });
});

/** 直接挂 hook:连发几次读的交错,页面上的按钮摆不出来(读的时候重试按钮是隐藏的)。 */
function ChannelHarness({ adapter, expose }: { adapter: NotificationSettingsAdapter; expose: (c: DingtalkChannelController) => void }) {
  const controller = useDingtalkChannel({ adapter, labels: CHANNEL_LABELS, active: true });
  expose(controller);
  return null;
}

describe("useDingtalkChannel — 请求交错", () => {
  it("慢的旧读(成功或失败)不覆盖更新的那一次", async () => {
    const adapter = makeAdapter();
    const first = deferred<DingtalkChannelSettings>();
    const second = deferred<DingtalkChannelSettings>();
    const third = deferred<DingtalkChannelSettings>();
    adapter.loadDingtalkChannel
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
      .mockReturnValueOnce(third.promise);
    let controller!: DingtalkChannelController;
    view = await mount(<ChannelHarness adapter={adapter} expose={(next) => (controller = next)} />);
    await act(async () => controller.reload());
    await act(async () => controller.reload());
    expect(adapter.loadDingtalkChannel).toHaveBeenCalledTimes(3);

    third.resolve({ ...STORED, appKey: "newest", appKeyInherited: false });
    await settle(20);
    second.resolve({ ...STORED, appKey: "stale", appKeyInherited: false });
    first.reject(new Error("offline"));
    await settle(20);
    expect(controller.settings?.appKey).toBe("newest");
    expect(controller.draft.appKey).toBe("newest");
    expect(controller.loadFailed).toBe(false);
  });

  it("保存在途:字段只读,双击只发一次 PUT,落地后恢复可编辑", async () => {
    const adapter = makeAdapter();
    const pending = deferred<DingtalkChannelSettings>();
    adapter.saveDingtalkChannel.mockReturnValue(pending.promise);
    view = await openChannels(adapter);
    await fill(field(view.host, "notification-dingtalk-app-key"), "trade");
    const save = byTestId(view.host, "notification-dingtalk-save");
    await act(async () => {
      save.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      save.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(adapter.saveDingtalkChannel).toHaveBeenCalledTimes(1);
    for (const id of ["notification-dingtalk-base-url", "notification-dingtalk-app-key", "notification-dingtalk-credential-input"]) {
      expect(field(view.host, id).disabled).toBe(true);
    }
    expect((byTestId(view.host, "notification-dingtalk-credential-clear") as HTMLInputElement).disabled).toBe(true);

    pending.resolve({ ...STORED, appKey: "trade" });
    await settle(20);
    expect(field(view.host, "notification-dingtalk-app-key").disabled).toBe(false);
    expect(field(view.host, "notification-dingtalk-app-key").value).toBe("trade");
  });
});
