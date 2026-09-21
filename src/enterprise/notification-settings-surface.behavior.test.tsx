// @vitest-environment happy-dom
/**
 * 用户风险(按后果排序):
 *
 * 1. **托管中的分组看起来可点**。成员点了一排开关、页面也跟着动,发出来的通知却一条没变 ——
 *    这类"假状态"比直接报错更伤,所以托管分组的正文必须真的 inert + 置灰,而开关的状态
 *    照常可见(它解释的正是"为什么我改不了")。
 * 2. **乐观更新丢改动**。即点即存没有保存按钮,失败时必须回到原位并报错,不能留一个"我明明
 *    关过"的开关。在途期间只禁用被点的那一个,同一张卡上的其他开关不受牵连。
 * 3. **平台配置改完,「我的通知」还是老样子**。两份数据各拉各的,切回来不重拉就会给出一张
 *    过期的表。
 * 4. 不支持的渠道画成破折号,而不是一个永远打不开的开关。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { toastBus } from "../toast";
import { byTestId, click, mount, settle, type MountedView } from "./behavior-test-utils";
import { createEnterpriseLabelCatalog } from "./label-catalog";
import { EnterpriseNotificationSettingsSurface } from "./notification-settings-surface";
import type {
  NotificationGroupView,
  NotificationPolicyView,
  NotificationSettingsAdapter,
  NotificationSettingsLabels,
  NotificationSettingsView,
} from "./notification-settings-types";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LABELS: NotificationSettingsLabels = createEnterpriseLabelCatalog(
  "zh-CN",
  { appName: "测试", appDescription: "测试" },
).notificationSettings;

const EN_LABELS: NotificationSettingsLabels = createEnterpriseLabelCatalog(
  "en",
  { appName: "Test", appDescription: "Test" },
).notificationSettings;

const LEARNER: NotificationGroupView = {
  key: "learner",
  title: { zh: "学员", en: "Learner" },
  description: { zh: "学习与考试相关的通知。", en: "Learning and exam notifications." },
  managed: false,
  editable: true,
  scenes: [
    {
      key: "exam.result_released",
      title: { zh: "成绩发布", en: "Result released" },
      description: { zh: "考试成绩发布时提醒本人。", en: "When an exam result is released." },
      channels: { dingtalk: true, in_app: false },
    },
    {
      key: "course.assigned",
      title: { zh: "课程指派", en: "Course assigned" },
      description: { zh: "被指派新课程时提醒。", en: "When a course is assigned." },
      channels: { dingtalk: null, in_app: true },
    },
  ],
};

const SUPERVISOR: NotificationGroupView = {
  key: "supervisor",
  title: { zh: "主管", en: "Supervisor" },
  description: { zh: "下属的学习进度。", en: "Progress of your reports." },
  managed: true,
  editable: false,
  scenes: [
    {
      key: "plan.overdue",
      title: { zh: "计划逾期", en: "Plan overdue" },
      description: { zh: "下属学习计划逾期时提醒。", en: "When a plan is overdue." },
      channels: { dingtalk: true, in_app: true },
    },
  ],
};

const MINE: NotificationSettingsView = {
  canManage: false,
  channels: [{ key: "dingtalk", available: true }, { key: "in_app", available: true }],
  groups: [LEARNER, SUPERVISOR],
};

const POLICY: NotificationPolicyView = {
  channels: [{ key: "dingtalk", available: true }, { key: "in_app", available: true }],
  groups: [
    { ...LEARNER, editable: true },
    { ...SUPERVISOR, editable: true },
  ],
};

function makeAdapter(mine: NotificationSettingsView = MINE) {
  return {
    load: vi.fn().mockResolvedValue(mine),
    savePreference: vi.fn().mockResolvedValue(LEARNER),
    loadPolicy: vi.fn().mockResolvedValue(POLICY),
    savePolicy: vi.fn().mockResolvedValue({ ...LEARNER, managed: true }),
  } satisfies NotificationSettingsAdapter;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((settleOk, settleFail) => {
    resolve = settleOk;
    reject = settleFail;
  });
  return { promise, resolve, reject };
}

async function open(adapter: NotificationSettingsAdapter, locale = "zh-CN", labels = LABELS) {
  const view = await mount(<EnterpriseNotificationSettingsSurface adapter={adapter} labels={labels} locale={locale} />);
  await settle(20);
  return view;
}

function switchAt(host: ParentNode, scene: string, channel: string): HTMLButtonElement {
  return byTestId(host, `notification-switch-${scene}-${channel}`) as HTMLButtonElement;
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

describe("EnterpriseNotificationSettingsSurface — 我的通知", () => {
  it("一张卡片一个分组,表格三列,开关状态来自服务端", async () => {
    view = await open(makeAdapter());
    const card = byTestId(view.host, "notification-group-learner");
    expect(card.textContent).toContain("学员");
    expect(card.textContent).toContain("学习与考试相关的通知。");
    const headers = Array.from(card.querySelectorAll("th[scope='col']")).map((cell) => cell.textContent);
    expect(headers).toEqual(["通知场景", "钉钉", "站内通知"]);
    // 场景名是行头:读屏念某一格开关时会带上它。
    expect(card.querySelector("th[scope='row']")?.textContent).toContain("成绩发布");
    expect(switchAt(card, "exam.result_released", "dingtalk").getAttribute("aria-checked")).toBe("true");
    expect(switchAt(card, "exam.result_released", "in_app").getAttribute("aria-checked")).toBe("false");
    // 开关自己没有可见文案,名字由场景 + 渠道拼出来。
    expect(switchAt(card, "exam.result_released", "in_app").getAttribute("aria-label")).toBe("成绩发布 · 站内通知");
  });

  it("不支持的渠道画破折号,不画开关", async () => {
    view = await open(makeAdapter());
    const card = byTestId(view.host, "notification-group-learner");
    expect(card.querySelector("[data-test-id='notification-switch-course.assigned-dingtalk']")).toBeNull();
    const dash = card.querySelector("[role='img'][aria-label='不支持']");
    expect(dash?.textContent).toBe("—");
  });

  it("没有管理权限时没有页签", async () => {
    view = await open(makeAdapter());
    expect(view.host.querySelector("[data-test-id='notification-settings-tabs']")).toBeNull();
  });

  it("托管中的分组整表置灰只读,但开关状态照常可见;托管开关与标签留在灰区之外", async () => {
    view = await open(makeAdapter());
    const card = byTestId(view.host, "notification-group-supervisor");
    const gated = switchAt(card, "plan.overdue", "dingtalk").closest("[inert]");
    expect(gated).not.toBeNull();
    expect((gated as HTMLElement).className).toContain("opacity-50");
    expect(switchAt(card, "plan.overdue", "dingtalk").disabled).toBe(true);
    expect(switchAt(card, "plan.overdue", "dingtalk").getAttribute("aria-checked")).toBe("true");
    // 状态开关 + 那句「由平台统一管理」都在正文之外,否则"为什么改不了"也一起变灰了。
    const managed = byTestId(card, "notification-group-supervisor-managed") as HTMLButtonElement;
    expect(managed.disabled).toBe(true);
    expect(managed.closest("[inert]")).toBeNull();
    expect(byTestId(card, "notification-group-supervisor-tag").textContent).toBe("由平台统一管理");
    // 没托管的那张卡不挂标签。
    expect(view.host.querySelector("[data-test-id='notification-group-learner-tag']")).toBeNull();
  });
});

describe("EnterpriseNotificationSettingsSurface — 即点即存", () => {
  it("乐观更新、只禁用这一个开关、成功后用服务端返回的分组替换", async () => {
    const adapter = makeAdapter();
    const pending = deferred<NotificationGroupView>();
    adapter.savePreference.mockReturnValue(pending.promise);
    view = await open(adapter);
    await click(switchAt(view.host, "exam.result_released", "in_app"));

    expect(adapter.savePreference).toHaveBeenCalledWith({
      group: "learner",
      scene: "exam.result_released",
      channel: "in_app",
      enabled: true,
    });
    // 乐观:请求还没回来,开关已经翻过去了。
    expect(switchAt(view.host, "exam.result_released", "in_app").getAttribute("aria-checked")).toBe("true");
    expect(switchAt(view.host, "exam.result_released", "in_app").disabled).toBe(true);
    // 同一张卡上的别的开关不受牵连。
    expect(switchAt(view.host, "exam.result_released", "dingtalk").disabled).toBe(false);

    const served: NotificationGroupView = {
      ...LEARNER,
      scenes: [{ ...LEARNER.scenes[0]!, channels: { dingtalk: false, in_app: true } }, LEARNER.scenes[1]!],
    };
    pending.resolve(served);
    await settle(20);
    // 服务端那一份是权威:钉钉那格跟着回来的分组变了,不是本地乐观值。
    expect(switchAt(view.host, "exam.result_released", "dingtalk").getAttribute("aria-checked")).toBe("false");
    expect(switchAt(view.host, "exam.result_released", "in_app").disabled).toBe(false);
  });

  it("失败回滚到原位并报错", async () => {
    const adapter = makeAdapter();
    adapter.savePreference.mockRejectedValue(new Error("offline"));
    view = await open(adapter);
    await click(switchAt(view.host, "exam.result_released", "dingtalk"));
    await settle(20);
    expect(switchAt(view.host, "exam.result_released", "dingtalk").getAttribute("aria-checked")).toBe("true");
    expect(switchAt(view.host, "exam.result_released", "dingtalk").disabled).toBe(false);
    expect(toastBus.getSnapshot().map((item) => item.message)).toContain("保存失败，请重试。");
  });

  it("409(分组刚被改成托管)回滚并重新读一次", async () => {
    const adapter = makeAdapter();
    adapter.savePreference.mockRejectedValue({ status: 409, code: "notification_group_managed" });
    view = await open(adapter);
    expect(adapter.load).toHaveBeenCalledTimes(1);
    await click(switchAt(view.host, "exam.result_released", "dingtalk"));
    await settle(20);
    expect(switchAt(view.host, "exam.result_released", "dingtalk").getAttribute("aria-checked")).toBe("true");
    expect(adapter.load).toHaveBeenCalledTimes(2);
  });
});

describe("EnterpriseNotificationSettingsSurface — 平台配置", () => {
  const manager: NotificationSettingsView = { ...MINE, canManage: true };

  function tabOption(host: ParentNode, tab: string): HTMLElement {
    const element = byTestId(host, "notification-settings-tabs").querySelector(`[data-notification-tab='${tab}']`);
    if (!(element instanceof HTMLElement)) throw new Error(`missing tab ${tab}`);
    return element;
  }

  it("切到平台配置读 policy、托管开关可操作,切回我的通知重新读一次", async () => {
    const adapter = makeAdapter(manager);
    view = await open(adapter);
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

  it("平台配置里托管中的分组也不置灰(editable = true)", async () => {
    view = await open(makeAdapter(manager));
    await click(tabOption(view.host, "policy"));
    await settle(20);
    const card = byTestId(view.host, "notification-group-supervisor");
    expect(switchAt(card, "plan.overdue", "dingtalk").closest("[inert]")).toBeNull();
    expect(switchAt(card, "plan.overdue", "dingtalk").disabled).toBe(false);
    expect(card.querySelector("[data-test-id='notification-group-supervisor-tag']")).toBeNull();
  });

  it("平台配置里的场景开关走 savePolicy", async () => {
    const adapter = makeAdapter(manager);
    view = await open(adapter);
    await click(tabOption(view.host, "policy"));
    await settle(20);
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
});

describe("EnterpriseNotificationSettingsSurface — 状态与文案", () => {
  it("读失败之后才出现重试,重试成功后消失", async () => {
    const adapter = makeAdapter();
    adapter.load.mockRejectedValueOnce(new Error("offline"));
    view = await open(adapter);
    expect(byTestId(view.host, "notification-settings-load-failed").textContent).toContain("无法加载通知设置");
    await click(byTestId(view.host, "notification-settings-retry"));
    await settle(20);
    expect(view.host.querySelector("[data-test-id='notification-settings-retry']")).toBeNull();
    expect(byTestId(view.host, "notification-group-learner")).toBeTruthy();
  });

  it("读成功时没有重试按钮", async () => {
    view = await open(makeAdapter());
    expect(view.host.querySelector("[data-test-id='notification-settings-retry']")).toBeNull();
  });

  it("没有分组时给空状态", async () => {
    view = await open(makeAdapter({ ...MINE, groups: [] }));
    expect(byTestId(view.host, "notification-settings-empty").textContent).toContain("暂无可设置的通知");
  });

  it("钉钉未配置时页头下方只印一条说明", async () => {
    view = await open(makeAdapter({ ...MINE, channels: [{ key: "dingtalk", available: false }, { key: "in_app", available: true }] }));
    expect(view.host.querySelectorAll("[data-test-id='notification-channel-unavailable']")).toHaveLength(1);
    expect(byTestId(view.host, "notification-channel-unavailable").textContent).toContain("钉钉通知尚未配置");
  });

  it("en locale 取 LocalizedText.en", async () => {
    view = await open(makeAdapter(), "en", EN_LABELS);
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
