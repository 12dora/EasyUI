// @vitest-environment happy-dom
/**
 * 「我的通知」这一半:渲染、即点即存、同一分组上的并发改动。
 * 「平台配置」页签与页面状态/文案在 `notification-settings-surface.policy.behavior.test.tsx`,
 * 纯状态机在 `notification-settings-state.test.ts`,夹具在 `notification-settings-fixtures.tsx`。
 *
 * 用户风险(按后果排序):
 *
 * 1. **托管中的分组看起来可点**。成员点了一排开关、页面也跟着动,发出来的通知却一条没变 ——
 *    这类"假状态"比直接报错更伤。所以托管分组的每个开关都要 `disabled` + 整表置灰;但**不能**
 *    `inert`:开关展示的是当前真正生效的值,读屏用户同样得读得到"我还会收到哪些通知"。
 * 2. **乐观更新丢改动**。同一个分组上连点两个开关时,先回来的那份整组快照不许把后一个改动
 *    打回去;某一次失败也只许回滚它自己,期间成功的兄弟改动必须留着。在途期间只禁用被点的
 *    那一个开关。
 * 3. **一次 409 连坐**。冲突只作废出事的那个分组,队列里别的分组的改动照发不误。
 * 4. 不支持的渠道画成破折号,而不是一个永远打不开的开关。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { toastBus } from "../toast";
import { byTestId, click, settle, type MountedView } from "./behavior-test-utils";
import {
  deferred,
  EDITABLE_SUPERVISOR,
  LEARNER,
  MINE,
  openNotificationSettings,
  POLICY,
  servedLearner,
  switchAt,
  TWO_EDITABLE,
} from "./notification-settings-fixtures";
import type { NotificationGroupView, NotificationSettingsAdapter, NotificationSettingsView } from "./notification-settings-types";

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

describe("EnterpriseNotificationSettingsSurface — 我的通知", () => {
  it("一张卡片一个分组,表格三列,开关状态来自服务端", async () => {
    view = await openNotificationSettings(makeAdapter());
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
    // 没有管理权限就没有页签,连控件都不画。
    expect(view.host.querySelector("[data-test-id='notification-settings-tabs']")).toBeNull();
  });

  it("不支持的渠道画破折号,不画开关", async () => {
    view = await openNotificationSettings(makeAdapter());
    const card = byTestId(view.host, "notification-group-learner");
    expect(card.querySelector("[data-test-id='notification-switch-course.assigned-dingtalk']")).toBeNull();
    expect(card.querySelector("[role='img'][aria-label='不支持']")?.textContent).toBe("—");
  });

  it("托管中的分组置灰只读,但整张表留在无障碍树里 —— 生效状态必须读得到", async () => {
    view = await openNotificationSettings(makeAdapter());
    const card = byTestId(view.host, "notification-group-supervisor");
    // 这里刻意不用 `inert`:它会把场景名、说明与当前生效的开关值一起从无障碍树里摘掉,
    // 而这一页要让人(尤其读屏用户)读到"托管之下我还会收到哪些通知"。
    expect(card.querySelector("[inert]")).toBeNull();
    const table = byTestId(card, "notification-group-supervisor-table");
    expect(table.hasAttribute("inert")).toBe(false);
    expect(table.className).toContain("opacity-50");
    expect(table.getAttribute("data-readonly")).toBe("true");
    const dingtalk = switchAt(card, "plan.overdue", "dingtalk");
    expect(dingtalk.disabled).toBe(true);
    expect(dingtalk.getAttribute("aria-disabled")).toBe("true");
    expect(dingtalk.getAttribute("aria-checked")).toBe("true");
    expect(dingtalk.getAttribute("aria-label")).toBe("计划逾期 · 钉钉");
    expect(card.textContent).toContain("下属学习计划逾期时提醒。");
    // 状态开关 + 那句「由平台统一管理」都在表格之外,自己也不跟着变灰。
    expect((byTestId(card, "notification-group-supervisor-managed") as HTMLButtonElement).disabled).toBe(true);
    expect(byTestId(card, "notification-group-supervisor-tag").textContent).toBe("由平台统一管理");
    // 没托管的那张卡不挂标签,表格也不置灰。
    expect(view.host.querySelector("[data-test-id='notification-group-learner-tag']")).toBeNull();
    expect(byTestId(view.host, "notification-group-learner-table").getAttribute("data-readonly")).toBe("false");
  });
});

describe("EnterpriseNotificationSettingsSurface — 即点即存", () => {
  it("乐观更新、只禁用这一个开关、成功后用服务端返回的分组替换", async () => {
    const adapter = makeAdapter();
    const pending = deferred<NotificationGroupView>();
    adapter.savePreference.mockReturnValue(pending.promise);
    view = await openNotificationSettings(adapter);
    await click(switchAt(view.host, "exam.result_released", "in_app"));

    expect(adapter.savePreference).toHaveBeenCalledWith({
      group: "learner",
      scene: "exam.result_released",
      channel: "in_app",
      enabled: true,
    });
    // 乐观:请求还没回来,开关已经翻过去了;同一张卡上的别的开关不受牵连。
    expect(switchAt(view.host, "exam.result_released", "in_app").getAttribute("aria-checked")).toBe("true");
    expect(switchAt(view.host, "exam.result_released", "in_app").disabled).toBe(true);
    expect(switchAt(view.host, "exam.result_released", "dingtalk").disabled).toBe(false);

    pending.resolve(servedLearner(false, true));
    await settle(20);
    // 服务端那一份是权威:钉钉那格跟着回来的分组变了,不是本地乐观值。
    expect(switchAt(view.host, "exam.result_released", "dingtalk").getAttribute("aria-checked")).toBe("false");
    expect(switchAt(view.host, "exam.result_released", "in_app").disabled).toBe(false);
  });

  it("失败回滚到原位并报错", async () => {
    const adapter = makeAdapter();
    adapter.savePreference.mockRejectedValue(new Error("offline"));
    view = await openNotificationSettings(adapter);
    await click(switchAt(view.host, "exam.result_released", "dingtalk"));
    await settle(20);
    expect(switchAt(view.host, "exam.result_released", "dingtalk").getAttribute("aria-checked")).toBe("true");
    expect(switchAt(view.host, "exam.result_released", "dingtalk").disabled).toBe(false);
    expect(toastBus.getSnapshot().map((item) => item.message)).toContain("保存失败，请重试。");
  });

  it("409(分组刚被改成托管)回滚并重新读一次", async () => {
    const adapter = makeAdapter();
    adapter.savePreference.mockRejectedValue({ status: 409, code: "notification_group_managed" });
    view = await openNotificationSettings(adapter);
    expect(adapter.load).toHaveBeenCalledTimes(1);
    await click(switchAt(view.host, "exam.result_released", "dingtalk"));
    await settle(20);
    expect(switchAt(view.host, "exam.result_released", "dingtalk").getAttribute("aria-checked")).toBe("true");
    expect(adapter.load).toHaveBeenCalledTimes(2);
  });
});

describe("EnterpriseNotificationSettingsSurface — 同一分组上的并发改动", () => {
  it("连点两个开关:请求串行,先回来的整组快照不会把后一个改动打回去", async () => {
    const adapter = makeAdapter();
    const first = deferred<NotificationGroupView>();
    const second = deferred<NotificationGroupView>();
    adapter.savePreference.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    view = await openNotificationSettings(adapter);

    await click(switchAt(view.host, "exam.result_released", "dingtalk")); // A:true → false
    await click(switchAt(view.host, "exam.result_released", "in_app")); // B:false → true

    // 串行:B 的请求还没发出去(并发写同一个分组时,两份整组快照必然互相覆盖)。
    // 但两个乐观值立刻都画出来了 —— 用户不用等;没点过的开关照常可点。
    expect(adapter.savePreference).toHaveBeenCalledTimes(1);
    expect(switchAt(view.host, "exam.result_released", "dingtalk").getAttribute("aria-checked")).toBe("false");
    expect(switchAt(view.host, "exam.result_released", "in_app").getAttribute("aria-checked")).toBe("true");
    expect(switchAt(view.host, "course.assigned", "in_app").disabled).toBe(false);

    // A 的响应只知道 A 那一次改动(B 还没到过服务端);不重放的话 B 会被打回 false。
    first.resolve(servedLearner(false, false));
    await settle(20);
    expect(adapter.savePreference).toHaveBeenCalledTimes(2);
    expect(switchAt(view.host, "exam.result_released", "in_app").getAttribute("aria-checked")).toBe("true");
    expect(switchAt(view.host, "exam.result_released", "dingtalk").disabled).toBe(false);
    expect(switchAt(view.host, "exam.result_released", "in_app").disabled).toBe(true);

    second.resolve(servedLearner(false, true));
    await settle(20);
    expect(switchAt(view.host, "exam.result_released", "dingtalk").getAttribute("aria-checked")).toBe("false");
    expect(switchAt(view.host, "exam.result_released", "in_app").getAttribute("aria-checked")).toBe("true");
    expect(switchAt(view.host, "exam.result_released", "in_app").disabled).toBe(false);
  });

  it("后一次失败只回滚它自己,先成功的那次留着", async () => {
    const adapter = makeAdapter();
    const ok = deferred<NotificationGroupView>();
    const bad = deferred<NotificationGroupView>();
    adapter.savePreference.mockReturnValueOnce(ok.promise).mockReturnValueOnce(bad.promise);
    view = await openNotificationSettings(adapter);
    await click(switchAt(view.host, "exam.result_released", "in_app")); // 先点,会成功
    await click(switchAt(view.host, "exam.result_released", "dingtalk")); // 后点,会失败
    ok.resolve(servedLearner(true, true));
    await settle(20);
    bad.reject(new Error("offline"));
    await settle(20);
    // 钉钉回到原位,站内保持成功后的值 —— 按快照回滚会把后者一起吞掉。
    expect(switchAt(view.host, "exam.result_released", "dingtalk").getAttribute("aria-checked")).toBe("true");
    expect(switchAt(view.host, "exam.result_released", "in_app").getAttribute("aria-checked")).toBe("true");
    expect(toastBus.getSnapshot().map((item) => item.message)).toContain("保存失败，请重试。");
  });

  it("一个分组的 409 不连累排在后面的另一个分组", async () => {
    const adapter = makeAdapter(TWO_EDITABLE);
    const conflicted = deferred<NotificationGroupView>();
    const ok = deferred<NotificationGroupView>();
    adapter.savePreference.mockReturnValueOnce(conflicted.promise).mockReturnValueOnce(ok.promise);
    view = await openNotificationSettings(adapter);
    await click(switchAt(view.host, "exam.result_released", "dingtalk")); // A:learner,会 409
    await click(switchAt(view.host, "plan.overdue", "in_app")); // B:supervisor,排在后面

    conflicted.reject({ status: 409, code: "notification_group_managed" });
    await settle(20);
    // B 属于另一个分组:请求照发,不被连坐作废。
    expect(adapter.savePreference).toHaveBeenCalledTimes(2);
    expect(adapter.savePreference).toHaveBeenLastCalledWith({
      group: "supervisor",
      scene: "plan.overdue",
      channel: "in_app",
      enabled: false,
    });
    // A 回到原位(它的改动作废了),B 的乐观值还在。
    expect(switchAt(view.host, "exam.result_released", "dingtalk").getAttribute("aria-checked")).toBe("true");
    expect(switchAt(view.host, "plan.overdue", "in_app").getAttribute("aria-checked")).toBe("false");

    ok.resolve({
      ...EDITABLE_SUPERVISOR,
      scenes: [{ ...EDITABLE_SUPERVISOR.scenes[0]!, channels: { dingtalk: true, in_app: false } }],
    });
    await settle(20);
    expect(switchAt(view.host, "plan.overdue", "in_app").getAttribute("aria-checked")).toBe("false");
  });

  it("卸载之后落地的响应不再写状态、不再提示", async () => {
    const adapter = makeAdapter();
    const hang = deferred<NotificationGroupView>();
    adapter.savePreference.mockReturnValue(hang.promise);
    view = await openNotificationSettings(adapter);
    await click(switchAt(view.host, "exam.result_released", "in_app"));
    await view.unmount();
    view = null;
    hang.reject(new Error("offline"));
    await settle(20);
    expect(toastBus.getSnapshot()).toHaveLength(0);
  });
});
