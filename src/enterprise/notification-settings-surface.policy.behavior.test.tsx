// @vitest-environment happy-dom
/**
 * 「平台配置」页签,以及页面级的状态与文案。另一半(「我的通知」的渲染与即点即存)在
 * `notification-settings-surface.behavior.test.tsx`,夹具在 `notification-settings-fixtures.tsx`。
 *
 * 用户风险:
 *
 * 1. **平台配置改完,「我的通知」还是老样子**。两份数据各拉各的;平台值一变,本人的生效值
 *    也可能跟着变,而那份数据只有 `GET ``` 知道 —— 切回去不重拉、或者 PATCH 比切页签还慢
 *    时不补拉,用户就会一直盯着一张过期的表。
 * 2. **过期响应覆盖新状态**。被更晚一次加载顶掉的响应不许写进状态。
 * 3. **在途禁用串页签**。两个页签上的同一个开关是两件事,不能互相锁死。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { toastBus } from "../toast";
import { byTestId, click, settle, type MountedView } from "./behavior-test-utils";
import { createEnterpriseLabelCatalog } from "./label-catalog";
import {
  deferred,
  EN_LABELS,
  LABELS,
  LEARNER,
  MANAGER,
  MINE,
  openNotificationSettings,
  POLICY,
  servedLearner,
  SUPERVISOR,
  switchAt,
  tabOption,
} from "./notification-settings-fixtures";
import type {
  NotificationGroupView,
  NotificationPolicyView,
  NotificationSettingsAdapter,
  NotificationSettingsView,
} from "./notification-settings-types";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function makeAdapter(mine: NotificationSettingsView = MINE) {
  return {
    load: vi.fn().mockResolvedValue(mine),
    savePreference: vi.fn().mockResolvedValue(LEARNER),
    loadPolicy: vi.fn().mockResolvedValue(POLICY),
    savePolicy: vi.fn().mockResolvedValue({ ...LEARNER, managed: true }),
  } satisfies NotificationSettingsAdapter;
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

describe("EnterpriseNotificationSettingsSurface — 平台配置", () => {
  it("切到平台配置读 policy、托管开关可操作,切回我的通知重新读一次", async () => {
    const adapter = makeAdapter(MANAGER);
    view = await openNotificationSettings(adapter);
    expect(adapter.loadPolicy).not.toHaveBeenCalled();

    await click(tabOption(view.host, "policy"));
    await settle(20);
    expect(adapter.loadPolicy).toHaveBeenCalledTimes(1);
    expect(byTestId(view.host, "notification-policy-description").textContent).toBe(LABELS.policyDescription);

    const managed = byTestId(view.host, "notification-group-learner-managed") as HTMLButtonElement;
    expect(managed.disabled).toBe(false);
    await click(managed);
    await settle(20);
    expect(adapter.savePolicy).toHaveBeenCalledWith({ group: "learner", managed: true });

    // 平台值改完,本人的生效值也可能变了 —— 切回来必须重拉。
    await click(tabOption(view.host, "mine"));
    await settle(20);
    expect(adapter.load).toHaveBeenCalledTimes(2);
  });

  it("平台配置里的场景开关走 savePolicy,托管中的分组在这里也不置灰(editable = true)", async () => {
    const adapter = makeAdapter(MANAGER);
    view = await openNotificationSettings(adapter);
    await click(tabOption(view.host, "policy"));
    await settle(20);
    const supervisor = byTestId(view.host, "notification-group-supervisor");
    expect(byTestId(supervisor, "notification-group-supervisor-table").getAttribute("data-readonly")).toBe("false");
    expect(switchAt(supervisor, "plan.overdue", "dingtalk").disabled).toBe(false);
    expect(supervisor.querySelector("[data-test-id='notification-group-supervisor-tag']")).toBeNull();

    await click(switchAt(view.host, "exam.result_released", "in_app"));
    await settle(20);
    expect(adapter.savePolicy).toHaveBeenCalledWith({
      group: "learner",
      scene: "exam.result_released",
      channel: "in_app",
      enabled: true,
    });
    expect(adapter.savePreference).not.toHaveBeenCalled();
  });

  it("在途禁用按页签隔离:平台页签上在途的开关不会把「我的通知」里的同一个开关一起禁掉", async () => {
    const adapter = makeAdapter(MANAGER);
    const hang = deferred<NotificationGroupView>();
    adapter.savePolicy.mockReturnValue(hang.promise);
    view = await openNotificationSettings(adapter);
    await click(tabOption(view.host, "policy"));
    await settle(20);
    await click(switchAt(view.host, "exam.result_released", "in_app"));
    expect(switchAt(view.host, "exam.result_released", "in_app").disabled).toBe(true);

    await click(tabOption(view.host, "mine"));
    await settle(20);
    // 在途键不带页签前缀时这里会是 true —— 另一个页签的在途请求不该锁住这一页的开关。
    expect(switchAt(view.host, "exam.result_released", "in_app").disabled).toBe(false);
    hang.resolve(LEARNER);
    await settle(20);
  });

  it("被顶掉的加载响应不许覆盖更晚那一次", async () => {
    const adapter = makeAdapter(MANAGER);
    const first = deferred<NotificationPolicyView>();
    const second = deferred<NotificationPolicyView>();
    adapter.loadPolicy.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    view = await openNotificationSettings(adapter);
    await click(tabOption(view.host, "policy")); // 第一次加载,挂着
    await click(tabOption(view.host, "mine"));
    await settle(20);
    await click(tabOption(view.host, "policy")); // 第二次加载

    const managedSwitch = () => byTestId(view!.host, "notification-group-learner-managed");
    second.resolve({ ...POLICY, groups: [{ ...LEARNER, editable: true, managed: true }] });
    await settle(20);
    expect(managedSwitch().getAttribute("aria-checked")).toBe("true");

    // 早发出的那次后回来:必须被整条丢掉,不许把页面打回旧值。
    first.resolve({ ...POLICY, groups: [{ ...LEARNER, editable: true, managed: false }] });
    await settle(20);
    expect(managedSwitch().getAttribute("aria-checked")).toBe("true");
  });

  // 平台写落地时,本人的**生效值**也可能变了 —— 用户在 PATCH 回来之前切回「我的通知」,
  // 那次 GET 带回的仍是旧值,必须补拉一次(且只补一次)。过期判定本身在状态机单测里。
  it("平台 PATCH 在切回「我的通知」之后才落地:补拉一次,不停在旧的生效值上", async () => {
    const adapter = makeAdapter(MANAGER);
    const patch = deferred<NotificationGroupView>();
    adapter.savePolicy.mockReturnValue(patch.promise);
    const fresh = { ...MANAGER, groups: [servedLearner(false, true), SUPERVISOR] };
    adapter.load.mockResolvedValueOnce(MANAGER).mockResolvedValueOnce(MANAGER).mockResolvedValue(fresh);
    view = await openNotificationSettings(adapter);
    await click(tabOption(view.host, "policy"));
    await settle(20);
    await click(switchAt(view.host, "exam.result_released", "in_app"));
    await click(tabOption(view.host, "mine"));
    await settle(20);
    // 这次 GET 早于 PATCH 落地,拿回来的是旧的生效值。
    expect(adapter.load).toHaveBeenCalledTimes(2);
    expect(switchAt(view.host, "exam.result_released", "in_app").getAttribute("aria-checked")).toBe("false");

    patch.resolve(LEARNER);
    await settle(20);
    expect(adapter.load).toHaveBeenCalledTimes(3);
    expect(switchAt(view.host, "exam.result_released", "in_app").getAttribute("aria-checked")).toBe("true");
    // 一次失效只补拉一次,不转圈。
    await settle(30);
    expect(adapter.load).toHaveBeenCalledTimes(3);
  });
});

describe("EnterpriseNotificationSettingsSurface — 状态与文案", () => {
  it("读失败之后才出现重试,重试成功后消失", async () => {
    const adapter = makeAdapter();
    adapter.load.mockRejectedValueOnce(new Error("offline"));
    view = await openNotificationSettings(adapter);
    expect(byTestId(view.host, "notification-settings-load-failed").textContent).toContain("无法加载通知设置");
    await click(byTestId(view.host, "notification-settings-retry"));
    await settle(20);
    expect(view.host.querySelector("[data-test-id='notification-settings-retry']")).toBeNull();
    expect(byTestId(view.host, "notification-group-learner")).toBeTruthy();
  });

  it("没有分组时给空状态,读成功时也没有重试按钮", async () => {
    view = await openNotificationSettings(makeAdapter({ ...MINE, groups: [] }));
    expect(byTestId(view.host, "notification-settings-empty").textContent).toContain("暂无可设置的通知");
    expect(view.host.querySelector("[data-test-id='notification-settings-retry']")).toBeNull();
  });

  it("钉钉未配置时页头下方只印一条说明", async () => {
    const channels = [{ key: "dingtalk", available: false }, { key: "in_app", available: true }] as const;
    view = await openNotificationSettings(makeAdapter({ ...MINE, channels: [...channels] }));
    expect(view.host.querySelectorAll("[data-test-id='notification-channel-unavailable']")).toHaveLength(1);
    expect(byTestId(view.host, "notification-channel-unavailable").textContent).toContain("钉钉通知尚未配置");
  });

  it("en locale 取 LocalizedText.en", async () => {
    view = await openNotificationSettings(makeAdapter(), "en", EN_LABELS);
    const card = byTestId(view.host, "notification-group-learner");
    expect(card.textContent).toContain("Learner");
    expect(card.textContent).toContain("Learning and exam notifications.");
    expect(card.textContent).toContain("Result released");
    expect(switchAt(card, "exam.result_released", "in_app").getAttribute("aria-label")).toBe("Result released · In-app");
  });

  it("两种 copyMode 用同一份中英文案,且与收件箱的 notifications 分开", async () => {
    const brand = { appName: "测试", appDescription: "测试" };
    const legacy = createEnterpriseLabelCatalog("zh-CN", brand).notificationSettings;
    const business = createEnterpriseLabelCatalog("zh-CN", brand, "business").notificationSettings;
    // switchLabel 是每次新建的函数,按引用比较必然不等:静态文案比序列化结果,函数比输出。
    expect(JSON.stringify(business)).toBe(JSON.stringify(legacy));
    expect(business.switchLabel("成绩发布", "钉钉")).toBe(legacy.switchLabel("成绩发布", "钉钉"));
    expect(legacy.title).toBe("通知");
    expect(legacy.managedTag).toBe("由平台统一管理");
    expect(createEnterpriseLabelCatalog("en", brand).notificationSettings.columns.inApp).toBe("In-app");
    // 收件箱仍是自己的一份文案,没有被改掉。
    expect(createEnterpriseLabelCatalog("zh-CN", brand).notifications.title).toBe("通知中心");
    // 设置导航多了一项「通知」。
    expect(createEnterpriseLabelCatalog("zh-CN", brand).navigation.notificationSettings).toBe("通知");
    expect(createEnterpriseLabelCatalog("en", brand).navigation.notificationSettings).toBe("Notifications");
  });
});
