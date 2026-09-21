/**
 * 通知设置状态机的单测。这里钉住的全是"看不见但会咬人"的那一类:
 *
 * - 一次成功的保存回来的是**整个分组**,不能把另一个还在途的开关一起换回旧值;
 * - 一次失败只许丢它自己那条改动,期间成功的兄弟改动必须留着;
 * - 过期的加载结果(被更晚的加载顶掉、或读的过程中自己的写落了地)一律不准写进状态。
 */
import { describe, expect, it } from "vitest";

import {
  applyOps,
  initialNotificationState,
  notificationManagedKey,
  notificationOpKey,
  notificationSwitchKey,
  reduceNotifications,
  type NotificationAction,
  type NotificationOp,
  type NotificationState,
} from "./notification-settings-state";
import type { NotificationGroupView, NotificationPolicyView } from "./notification-settings-types";

const TEXT = { zh: "", en: "" };

const GROUP: NotificationGroupView = {
  key: "learner",
  title: TEXT,
  description: TEXT,
  managed: false,
  editable: true,
  scenes: [
    { key: "exam", title: TEXT, description: TEXT, channels: { dingtalk: false, in_app: false } },
    { key: "course", title: TEXT, description: TEXT, channels: { dingtalk: null, in_app: false } },
  ],
};

/** 第二个分组:409 的作废范围必须停在分组边界上,所以夹具里必须有两个。 */
const OTHER: NotificationGroupView = { ...GROUP, key: "manager" };

const VIEW: NotificationPolicyView = { channels: [], groups: [GROUP, OTHER] };

function switchOp(id: number, channel: "dingtalk" | "in_app", enabled: boolean): NotificationOp {
  return { id, kind: "switch", change: { group: "learner", scene: "exam", channel, enabled } };
}

function otherOp(id: number, enabled: boolean): NotificationOp {
  return { id, kind: "switch", change: { group: "manager", scene: "exam", channel: "dingtalk", enabled } };
}

function channelsOf(view: NotificationPolicyView | null, key = "learner") {
  return view?.groups.find((group) => group.key === key)?.scenes[0]?.channels;
}

function shown(state: NotificationState) {
  return applyOps(state.mine.confirmed, state.mine.ops);
}

function seeded(view: NotificationPolicyView = VIEW): NotificationState {
  const started = reduceNotifications(initialNotificationState(), { type: "load-start", tab: "mine", loadId: 1 });
  return reduceNotifications(started, { type: "load-ok", tab: "mine", loadId: 1, view, canManage: true });
}

describe("applyOps", () => {
  it("按顺序重放多条改动,同一个分组的两个开关互不覆盖", () => {
    const view = applyOps(VIEW, [switchOp(1, "dingtalk", true), switchOp(2, "in_app", true)]);
    expect(channelsOf(view)).toEqual({ dingtalk: true, in_app: true });
    // 原对象不动:回滚靠重新计算,不靠快照。
    expect(channelsOf(VIEW)).toEqual({ dingtalk: false, in_app: false });
  });

  it("托管改动重放在分组上", () => {
    const view = applyOps(VIEW, [{ id: 1, kind: "managed", group: "learner", managed: true }]);
    expect(view?.groups[0]?.managed).toBe(true);
  });

  it("分组已经不在了就原样返回,不凭空造一个", () => {
    const view = applyOps(VIEW, [{ id: 1, kind: "switch", change: { group: "gone", scene: "exam", channel: "dingtalk", enabled: true } }]);
    expect(view).toEqual(VIEW);
  });

  it("没有已确认值时显示值也是 null", () => {
    expect(applyOps(null, [switchOp(1, "dingtalk", true)])).toBeNull();
  });
});

describe("reduceNotifications — 保存落地", () => {
  it("成功只换掉这一条 op,兄弟改动继续重放在新的已确认值之上", () => {
    let state = seeded();
    state = reduceNotifications(state, { type: "op-add", tab: "mine", op: switchOp(1, "dingtalk", true) });
    state = reduceNotifications(state, { type: "op-add", tab: "mine", op: switchOp(2, "in_app", true) });
    // 服务端只知道 A 那一次改动(B 还没发出去),回来的整组快照里 in_app 仍是 false。
    const served: NotificationGroupView = {
      ...GROUP,
      scenes: [{ ...GROUP.scenes[0]!, channels: { dingtalk: true, in_app: false } }, GROUP.scenes[1]!],
    };
    state = reduceNotifications(state, { type: "op-ok", tab: "mine", opId: 1, group: served });
    expect(state.mine.ops.map((op) => op.id)).toEqual([2]);
    // 旧写法(整组替换 + 无重放)会在这里把 in_app 打回 false。
    expect(channelsOf(applyOps(state.mine.confirmed, state.mine.ops))).toEqual({ dingtalk: true, in_app: true });
    expect(state.mine.revision).toBe(1);
  });

  it("失败只丢自己那条,期间成功的改动留在显示值里", () => {
    let state = seeded();
    state = reduceNotifications(state, { type: "op-add", tab: "mine", op: switchOp(1, "dingtalk", true) });
    state = reduceNotifications(state, { type: "op-add", tab: "mine", op: switchOp(2, "in_app", true) });
    const served: NotificationGroupView = {
      ...GROUP,
      scenes: [{ ...GROUP.scenes[0]!, channels: { dingtalk: false, in_app: true } }, GROUP.scenes[1]!],
    };
    state = reduceNotifications(state, { type: "op-ok", tab: "mine", opId: 2, group: served });
    state = reduceNotifications(state, { type: "op-fail", tab: "mine", opId: 1 });
    expect(state.mine.ops).toEqual([]);
    // A 回到原位,B 保留 —— 快照回滚会把 B 一起吞掉。
    expect(channelsOf(applyOps(state.mine.confirmed, state.mine.ops))).toEqual({ dingtalk: false, in_app: true });
  });

  it("409 丢掉出事分组的全部待落地改动", () => {
    let state = seeded();
    state = reduceNotifications(state, { type: "op-add", tab: "mine", op: switchOp(1, "dingtalk", true) });
    state = reduceNotifications(state, { type: "op-add", tab: "mine", op: switchOp(2, "in_app", true) });
    state = reduceNotifications(state, { type: "op-conflict", tab: "mine", group: "learner" });
    expect(state.mine.ops).toEqual([]);
    expect(channelsOf(shown(state))).toEqual({ dingtalk: false, in_app: false });
  });

  it("409 **只**丢出事的那个分组:别的分组排着的改动照旧重放", () => {
    let state = seeded();
    state = reduceNotifications(state, { type: "op-add", tab: "mine", op: switchOp(1, "dingtalk", true) });
    state = reduceNotifications(state, { type: "op-add", tab: "mine", op: otherOp(2, true) });
    state = reduceNotifications(state, { type: "op-conflict", tab: "mine", group: "learner" });
    // 连坐会把用户刚在另一个分组上点的那一下悄悄吃掉。
    expect(state.mine.ops.map((op) => op.id)).toEqual([2]);
    expect(channelsOf(shown(state))?.dingtalk).toBe(false);
    expect(channelsOf(shown(state), "manager")?.dingtalk).toBe(true);
  });

  it("冲突后重读回来的已确认值上,幸存的改动继续重放", () => {
    let state = seeded();
    state = reduceNotifications(state, { type: "op-add", tab: "mine", op: otherOp(2, true) });
    state = reduceNotifications(state, { type: "op-conflict", tab: "mine", group: "learner" });
    state = reduceNotifications(state, { type: "load-start", tab: "mine", loadId: 2 });
    const reloaded: NotificationPolicyView = { channels: [], groups: [{ ...GROUP, managed: true }, OTHER] };
    state = reduceNotifications(state, { type: "load-ok", tab: "mine", loadId: 2, view: reloaded, canManage: true });
    expect(shown(state)?.groups[0]?.managed).toBe(true);
    expect(channelsOf(shown(state), "manager")?.dingtalk).toBe(true);
  });

  it("两个页签各存各的 ops,互不影响", () => {
    let state = seeded();
    state = reduceNotifications(state, { type: "op-add", tab: "policy", op: switchOp(1, "dingtalk", true) });
    expect(state.mine.ops).toEqual([]);
    expect(state.policy.ops).toHaveLength(1);
  });
});

describe("reduceNotifications — 平台写让「我的通知」失效", () => {
  const settledWrites: NotificationAction[] = [
    { type: "op-ok", tab: "policy", opId: 1, group: GROUP },
    { type: "op-fail", tab: "policy", opId: 1 },
    { type: "op-conflict", tab: "policy", group: "learner" },
  ];

  it.each(settledWrites)("平台写落地($type)把「我的通知」标记为过期", (action) => {
    let state = seeded();
    state = reduceNotifications(state, { type: "op-add", tab: "policy", op: switchOp(1, "dingtalk", true) });
    expect(state.mine.needsReload).toBe(false);
    // 平台值变了,本人的**生效值**只有 `GET ``` 知道 —— 不标记就会一直停在旧值上。
    const next = reduceNotifications(state, action);
    expect(next.mine.needsReload).toBe(true);
    expect(next.mine.revision).toBe(state.mine.revision + 1);
  });

  it("平台写落地时已经在路上的那次「我的通知」加载会被丢掉", () => {
    let state = seeded();
    state = reduceNotifications(state, { type: "load-start", tab: "mine", loadId: 2 });
    state = reduceNotifications(state, { type: "op-add", tab: "policy", op: switchOp(1, "dingtalk", true) });
    state = reduceNotifications(state, { type: "op-ok", tab: "policy", opId: 1, group: GROUP });
    const stalePersonal: NotificationPolicyView = { channels: [], groups: [{ ...GROUP, managed: true }, OTHER] };
    state = reduceNotifications(state, { type: "load-ok", tab: "mine", loadId: 2, view: stalePersonal, canManage: true });
    // 这次 GET 是平台写落地之前发出去的,带回来的是旧的生效值。
    expect(state.mine.confirmed).toEqual(VIEW);
    expect(state.mine.needsReload).toBe(true);
    expect(state.mine.loading).toBe(false);
  });

  it("「我的通知」自己的写不去碰平台页签", () => {
    let state = seeded();
    state = reduceNotifications(state, { type: "op-add", tab: "mine", op: switchOp(1, "dingtalk", true) });
    state = reduceNotifications(state, { type: "op-ok", tab: "mine", opId: 1, group: GROUP });
    expect(state.policy.needsReload).toBe(false);
    expect(state.policy.revision).toBe(0);
  });
});

describe("reduceNotifications — 过期的加载", () => {
  it("被更晚的加载顶掉的响应整条丢弃,连 loading 都不动", () => {
    let state = seeded();
    state = reduceNotifications(state, { type: "load-start", tab: "mine", loadId: 2 });
    state = reduceNotifications(state, { type: "load-start", tab: "mine", loadId: 3 });
    const stale: NotificationPolicyView = { channels: [], groups: [] };
    state = reduceNotifications(state, { type: "load-ok", tab: "mine", loadId: 2, view: stale, canManage: false });
    expect(state.mine.confirmed).toEqual(VIEW);
    expect(state.mine.loading).toBe(true);
    expect(state.mine.canManage).toBe(true);
  });

  it("过期的失败响应也不许把页面翻成失败态", () => {
    let state = seeded();
    state = reduceNotifications(state, { type: "load-start", tab: "mine", loadId: 2 });
    state = reduceNotifications(state, { type: "load-start", tab: "mine", loadId: 3 });
    state = reduceNotifications(state, { type: "load-fail", tab: "mine", loadId: 2 });
    expect(state.mine.failed).toBe(false);
    expect(state.mine.loading).toBe(true);
  });

  it("读的过程中自己的写落了地:丢掉这份数据并标记补拉", () => {
    let state = seeded();
    state = reduceNotifications(state, { type: "load-start", tab: "mine", loadId: 2 });
    state = reduceNotifications(state, { type: "op-add", tab: "mine", op: switchOp(1, "dingtalk", true) });
    const served: NotificationGroupView = {
      ...GROUP,
      scenes: [{ ...GROUP.scenes[0]!, channels: { dingtalk: true, in_app: false } }, GROUP.scenes[1]!],
    };
    state = reduceNotifications(state, { type: "op-ok", tab: "mine", opId: 1, group: served });
    // 这份响应是写之前发出去的,比本地还旧。
    const beforeWrite: NotificationPolicyView = { channels: [], groups: [GROUP] };
    state = reduceNotifications(state, { type: "load-ok", tab: "mine", loadId: 2, view: beforeWrite, canManage: true });
    expect(channelsOf(state.mine.confirmed)).toEqual({ dingtalk: true, in_app: false });
    expect(state.mine.needsReload).toBe(true);
    expect(state.mine.loading).toBe(false);
  });

  it("重新开始加载会清掉补拉标记", () => {
    let state = seeded();
    state = reduceNotifications(state, { type: "load-start", tab: "mine", loadId: 2 });
    state = reduceNotifications(state, { type: "op-add", tab: "mine", op: switchOp(1, "dingtalk", true) });
    state = reduceNotifications(state, { type: "op-fail", tab: "mine", opId: 1 });
    state = reduceNotifications(state, { type: "load-ok", tab: "mine", loadId: 2, view: VIEW, canManage: true });
    expect(state.mine.needsReload).toBe(true);
    state = reduceNotifications(state, { type: "load-start", tab: "mine", loadId: 3 });
    expect(state.mine.needsReload).toBe(false);
    expect(state.mine.loadRevision).toBe(state.mine.revision);
  });
});

describe("在途键", () => {
  it("带页签前缀:两个页签上的同一个开关不是同一个键", () => {
    expect(notificationSwitchKey("mine", "learner", "exam", "dingtalk")).not.toBe(
      notificationSwitchKey("policy", "learner", "exam", "dingtalk"),
    );
    expect(notificationManagedKey("mine", "learner")).not.toBe(notificationManagedKey("policy", "learner"));
    expect(notificationOpKey("mine", switchOp(1, "dingtalk", true))).toBe(
      notificationSwitchKey("mine", "learner", "exam", "dingtalk"),
    );
    expect(notificationOpKey("policy", { id: 1, kind: "managed", group: "learner", managed: true })).toBe(
      notificationManagedKey("policy", "learner"),
    );
  });
});
