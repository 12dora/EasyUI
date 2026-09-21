/**
 * 通知设置页的状态机(纯函数,不碰 React、不发请求,所以能单测)。
 *
 * 核心模型是**已确认值 + 待落地操作**,而不是"把整个分组换成最后一次响应":
 *
 * - `confirmed` 是服务端那一份,只有保存成功(或加载成功)才会动;
 * - `ops` 是一串还没落地的改动,按点击顺序排;
 * - 页面显示的是 `applyOps(confirmed, ops)` —— 把待落地的改动重放在已确认值之上。
 *
 * 这样一来,同一个分组上连点两个开关时:先回来的那次响应只更新 `confirmed`,另一个开关
 * 的改动仍然在 `ops` 里重放,不会被"整组替换"抹掉;某一次失败也只丢它自己那条 op,
 * 期间已经成功的兄弟改动不受影响(旧写法回滚的是一张过期的快照,会把它一起吞掉)。
 *
 * 两个计数器管"响应过期":
 *
 * - `loadId` —— 每次开始加载 +1。响应回来时对不上就是被更晚的加载顶掉了,整条丢弃;
 * - `revision` —— 每次保存落地 +1。加载开始时记下当时的 `revision`(`loadRevision`),
 *   响应回来时对不上,说明这份数据在读的过程中已经被自己的写改过了,同样丢弃,并标记
 *   `needsReload`,等队列清空后补拉一次。
 */

import type {
  NotificationGroupView,
  NotificationPolicyView,
  NotificationSwitchChange,
} from "./notification-settings-types";

export type NotificationSettingsTab = "mine" | "policy";

export interface NotificationSwitchOp {
  id: number;
  kind: "switch";
  change: NotificationSwitchChange;
}

export interface NotificationManagedOp {
  id: number;
  kind: "managed";
  group: string;
  managed: boolean;
}

/** 一次还没落地的改动。`id` 由调用方单调递增地发,用来在响应回来时认领自己那条。 */
export type NotificationOp = NotificationSwitchOp | NotificationManagedOp;

/** 在途开关的键。**带页签前缀**:两个页签各有一份 ops,同名分组不能互相把对方禁用掉。 */
export function notificationSwitchKey(
  tab: NotificationSettingsTab,
  group: string,
  scene: string,
  channel: string,
): string {
  return `${tab}::${group}::${scene}::${channel}`;
}

/** 卡片标题行那枚「平台托管」开关的在途键。 */
export function notificationManagedKey(tab: NotificationSettingsTab, group: string): string {
  return `${tab}::${group}::managed`;
}

export function notificationOpKey(tab: NotificationSettingsTab, op: NotificationOp): string {
  return op.kind === "switch"
    ? notificationSwitchKey(tab, op.change.group, op.change.scene, op.change.channel)
    : notificationManagedKey(tab, op.group);
}

function withChannelValue(group: NotificationGroupView, change: NotificationSwitchChange): NotificationGroupView {
  return {
    ...group,
    scenes: group.scenes.map((scene) => {
      if (scene.key !== change.scene) return scene;
      const channels = { ...scene.channels };
      channels[change.channel] = change.enabled;
      return { ...scene, channels };
    }),
  };
}

function replaceGroup(view: NotificationPolicyView, group: NotificationGroupView): NotificationPolicyView {
  return { ...view, groups: view.groups.map((item) => (item.key === group.key ? group : item)) };
}

/** 单条 op 重放。分组已经不在(重拉之后消失了)就原样返回,不凭空造一个分组出来。 */
export function applyOp(view: NotificationPolicyView, op: NotificationOp): NotificationPolicyView {
  const groupKey = op.kind === "switch" ? op.change.group : op.group;
  const group = view.groups.find((item) => item.key === groupKey);
  if (!group) return view;
  return replaceGroup(view, op.kind === "switch" ? withChannelValue(group, op.change) : { ...group, managed: op.managed });
}

/** 页面真正显示的那一份:已确认值 + 按顺序重放的待落地改动。 */
export function applyOps(
  confirmed: NotificationPolicyView | null,
  ops: readonly NotificationOp[],
): NotificationPolicyView | null {
  if (!confirmed) return null;
  return ops.reduce<NotificationPolicyView>(applyOp, confirmed);
}

export interface NotificationTabState {
  confirmed: NotificationPolicyView | null;
  /** 只有「我的通知」用得上;平台页签这一份没人读。 */
  canManage: boolean;
  ops: readonly NotificationOp[];
  loading: boolean;
  failed: boolean;
  /** 每次保存落地 +1。 */
  revision: number;
  /** 每次开始加载 +1,由调用方发号。 */
  loadId: number;
  /** 在途那次加载**开始时**的 revision。 */
  loadRevision: number;
  /** 丢过一次加载结果,队列空了要补拉。 */
  needsReload: boolean;
}

export interface NotificationState {
  tab: NotificationSettingsTab;
  mine: NotificationTabState;
  policy: NotificationTabState;
}

export type NotificationAction =
  | { type: "tab"; tab: NotificationSettingsTab }
  | { type: "load-start"; tab: NotificationSettingsTab; loadId: number }
  | { type: "load-ok"; tab: NotificationSettingsTab; loadId: number; view: NotificationPolicyView; canManage: boolean }
  | { type: "load-fail"; tab: NotificationSettingsTab; loadId: number }
  | { type: "op-add"; tab: NotificationSettingsTab; op: NotificationOp }
  | { type: "op-ok"; tab: NotificationSettingsTab; opId: number; group: NotificationGroupView }
  | { type: "op-fail"; tab: NotificationSettingsTab; opId: number }
  | { type: "op-conflict"; tab: NotificationSettingsTab };

function emptyTab(): NotificationTabState {
  return {
    confirmed: null,
    canManage: false,
    ops: [],
    loading: false,
    failed: false,
    revision: 0,
    loadId: 0,
    loadRevision: 0,
    needsReload: false,
  };
}

export function initialNotificationState(): NotificationState {
  return { tab: "mine", mine: emptyTab(), policy: emptyTab() };
}

function reduceLoad(state: NotificationTabState, action: NotificationAction): NotificationTabState {
  if (action.type === "load-start") {
    return { ...state, loading: true, failed: false, loadId: action.loadId, loadRevision: state.revision, needsReload: false };
  }
  if (action.type !== "load-ok" && action.type !== "load-fail") return state;
  // 被更晚的一次加载顶掉了:整条丢弃,连 loading / failed 都不许动 —— 那次加载还在路上。
  if (action.loadId !== state.loadId) return state;
  if (action.type === "load-fail") return { ...state, loading: false, failed: true };
  // 读的过程中自己的写已经落地了:这份数据比本地还旧,丢掉并补拉一次。
  if (state.loadRevision !== state.revision) return { ...state, loading: false, needsReload: true };
  return { ...state, confirmed: action.view, canManage: action.canManage, loading: false, failed: false, needsReload: false };
}

function reduceOps(state: NotificationTabState, action: NotificationAction): NotificationTabState {
  switch (action.type) {
    case "op-add":
      return { ...state, ops: [...state.ops, action.op] };
    case "op-ok": {
      const confirmed = state.confirmed ? replaceGroup(state.confirmed, action.group) : state.confirmed;
      return { ...state, confirmed, ops: dropOp(state.ops, action.opId), revision: state.revision + 1 };
    }
    case "op-fail":
      return { ...state, ops: dropOp(state.ops, action.opId), revision: state.revision + 1 };
    case "op-conflict":
      // 分组刚被改成托管:本地这些待落地的改动一条都不作数了,整串丢掉再重读。
      return { ...state, ops: [], revision: state.revision + 1 };
    default:
      return state;
  }
}

function dropOp(ops: readonly NotificationOp[], opId: number): readonly NotificationOp[] {
  return ops.filter((op) => op.id !== opId);
}

function reduceTab(state: NotificationTabState, action: NotificationAction): NotificationTabState {
  return action.type.startsWith("load") ? reduceLoad(state, action) : reduceOps(state, action);
}

export function reduceNotifications(state: NotificationState, action: NotificationAction): NotificationState {
  if (action.type === "tab") return state.tab === action.tab ? state : { ...state, tab: action.tab };
  if (action.tab === "mine") {
    const mine = reduceTab(state.mine, action);
    return mine === state.mine ? state : { ...state, mine };
  }
  const policy = reduceTab(state.policy, action);
  return policy === state.policy ? state : { ...state, policy };
}

export function notificationTabOf(state: NotificationState, tab: NotificationSettingsTab): NotificationTabState {
  return tab === "policy" ? state.policy : state.mine;
}
