"use client";

/**
 * 「设置 → 通知」的控制器:把 `notification-settings-state.ts` 那台纯状态机接上 adapter。
 *
 * 三件这里才能做的事:
 *
 * 1. **每个页签一条串行队列**。一个页签同一时刻只有一个写请求在飞,后点的排队等着 ——
 *    但**乐观值立刻生效**,用户看到的是自己刚点的那一下,不是"等一等再动"。排队而不并发,
 *    是因为并发写同一个分组时,响应里的整组快照必然互相覆盖。
 * 2. **只禁用被点的那一个开关**。在途判定走 op 的键(键带页签前缀),所以同一张卡上的别的
 *    开关照常可点,另一个页签上的同名分组也不受牵连。
 * 3. **卸载后一律闭嘴**。`alive` 一翻,所有还在路上的加载 / 保存回调直接返回,不再 dispatch。
 */

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";

import { toast } from "../toast";
import {
  applyOps,
  initialNotificationState,
  notificationOpGroup,
  notificationOpKey,
  notificationTabOf,
  reduceNotifications,
  type NotificationAction,
  type NotificationOp,
  type NotificationSettingsTab,
} from "./notification-settings-state";
import {
  isNotificationManagedConflict,
  type NotificationGroupView,
  type NotificationPolicyView,
  type NotificationSettingsAdapter,
  type NotificationSettingsLabels,
  type NotificationSwitchChange,
} from "./notification-settings-types";

export {
  notificationManagedKey,
  notificationOpKey,
  notificationSwitchKey,
  type NotificationSettingsTab,
} from "./notification-settings-state";

export interface NotificationSettingsController {
  tab: NotificationSettingsTab;
  canManage: boolean;
  /** 已确认值 + 待落地改动重放之后的那一份;两个页签形状相同。 */
  view: NotificationPolicyView | null;
  /** 只在「一次都还没读到」时为真:重拉时页面保留已有内容,不闪回骨架屏。 */
  loading: boolean;
  loadFailed: boolean;
  isPending(key: string): boolean;
  selectTab(next: NotificationSettingsTab): void;
  reload(): void;
  setChannel(change: NotificationSwitchChange): void;
  setManaged(group: string, managed: boolean): void;
}

type Dispatch = (action: NotificationAction) => void;

interface SaveTask {
  tab: NotificationSettingsTab;
  op: NotificationOp;
  saveFailed: string;
  run(): Promise<NotificationGroupView>;
  dispatch: Dispatch;
  /** 卸载、或这条 op 已被同分组的 409 作废时返回 false,回调一律闭嘴。 */
  live(): boolean;
  /** 本条 op 落地:从在途登记里摘掉。 */
  settle(): void;
  /** 409:作废**同一分组**的所有待落地改动并重读;别的分组的照常继续发。 */
  onConflict(): void;
}

/**
 * 一次保存的落地:成功只把**这一条** op 换成服务端分组,失败只丢**这一条** op ——
 * 显示值由 `applyOps` 重新算,期间成功的兄弟改动自然留在上面,不需要快照回滚。
 */
async function runNotificationSave(task: SaveTask): Promise<void> {
  // 排在前面那条的 409 可能已经把本条作废了:那就连请求都不发。
  if (!task.live()) return;
  try {
    const group = await task.run();
    if (!task.live()) return;
    task.settle();
    task.dispatch({ type: "op-ok", tab: task.tab, opId: task.op.id, group });
  } catch (error) {
    if (!task.live()) return;
    if (isNotificationManagedConflict(error)) {
      task.onConflict();
    } else {
      task.settle();
      task.dispatch({ type: "op-fail", tab: task.tab, opId: task.op.id });
    }
    toast.error(task.saveFailed);
  }
}

/**
 * 在途登记:op id → 它属于哪个页签的哪个分组。
 *
 * 与 reducer 里的 `ops` 是同一串事件的两份投影:`ops` 供渲染(要走 React 的提交),这份
 * 供队列判定(必须在点击那一刻就能读到,不能等提交)。两边只在 enqueue / 落地 / 409
 * 这三处同步更新。
 */
type NotificationOpRegistry = Map<number, { tab: NotificationSettingsTab; group: string }>;

/** 作废同一页签同一分组的所有登记。遍历中删除 Map 是安全的。 */
function cancelGroupOps(registry: NotificationOpRegistry, tab: NotificationSettingsTab, group: string): void {
  for (const [id, entry] of registry) {
    if (entry.tab === tab && entry.group === group) registry.delete(id);
  }
}

interface NotificationRunners {
  load(tab: NotificationSettingsTab): void;
  enqueue(tab: NotificationSettingsTab, op: NotificationOp, run: () => Promise<NotificationGroupView>): void;
}

/** 加载与保存两条通路(队列、发号器、存活标记都在这里),与 reducer 分开以免任一函数过长。 */
function useNotificationRunners(
  adapter: NotificationSettingsAdapter,
  dispatch: Dispatch,
  saveFailed: string,
): NotificationRunners {
  const alive = useRef(true);
  const loadIds = useRef({ mine: 0, policy: 0 });
  const registry = useRef<NotificationOpRegistry>(new Map());
  const queues = useRef({ mine: Promise.resolve(), policy: Promise.resolve() });

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(
    (tab: NotificationSettingsTab) => {
      const loadId = (loadIds.current[tab] += 1);
      dispatch({ type: "load-start", tab, loadId });
      void (async () => {
        try {
          const view = tab === "policy" ? await adapter.loadPolicy() : await adapter.load();
          if (!alive.current) return;
          dispatch({ type: "load-ok", tab, loadId, view, canManage: "canManage" in view && view.canManage });
        } catch {
          if (alive.current) dispatch({ type: "load-fail", tab, loadId });
        }
      })();
    },
    [adapter, dispatch],
  );

  const enqueue = useCallback<NotificationRunners["enqueue"]>(
    (tab, op, run) => {
      const group = notificationOpGroup(op);
      registry.current.set(op.id, { tab, group });
      dispatch({ type: "op-add", tab, op });
      const live = () => alive.current && registry.current.has(op.id);
      const settle = () => registry.current.delete(op.id);
      // 只作废**同一分组**的待落地改动,然后重读本页签;别的分组排在队列里的照发不误。
      const onConflict = () => {
        cancelGroupOps(registry.current, tab, group);
        dispatch({ type: "op-conflict", tab, group });
        load(tab);
      };
      queues.current[tab] = queues.current[tab].then(() =>
        runNotificationSave({ tab, op, saveFailed, run, dispatch, live, settle, onConflict }),
      );
    },
    [dispatch, load, saveFailed],
  );

  return { load, enqueue };
}

export function useNotificationSettings(
  adapter: NotificationSettingsAdapter,
  labels: NotificationSettingsLabels,
): NotificationSettingsController {
  const [state, dispatch] = useReducer(reduceNotifications, initialNotificationState());
  const { load, enqueue } = useNotificationRunners(adapter, dispatch, labels.saveFailed);
  const opIds = useRef(0);
  const tab = state.tab;
  const current = notificationTabOf(state, tab);

  useEffect(() => {
    load("mine");
  }, [load]);

  // 本页签被标记为过期了(读的过程中自己的写落了地,或者平台侧刚改完平台值)。等**两条
  // 队列都空**再补拉:平台写还在路上时拉「我的通知」,拿回来的仍是旧的生效值。
  // `load-start` 会把 `needsReload` 清掉,所以一次失效只补拉一次,不会转圈。
  const policyBusy = state.policy.ops.length > 0;
  useEffect(() => {
    if (current.needsReload && current.ops.length === 0 && !policyBusy && !current.loading) load(tab);
  }, [current.needsReload, current.ops.length, current.loading, policyBusy, load, tab]);

  const pending = useMemo(() => {
    const keys = new Set<string>();
    for (const op of state.mine.ops) keys.add(notificationOpKey("mine", op));
    for (const op of state.policy.ops) keys.add(notificationOpKey("policy", op));
    return keys;
  }, [state.mine.ops, state.policy.ops]);

  // 切页签一律重拉:平台值刚改完,本人的生效值也跟着变了。
  const selectTab = useCallback(
    (next: NotificationSettingsTab) => {
      dispatch({ type: "tab", tab: next });
      load(next);
    },
    [load],
  );

  const setChannel = useCallback(
    (change: NotificationSwitchChange) => {
      opIds.current += 1;
      const op: NotificationOp = { id: opIds.current, kind: "switch", change };
      enqueue(tab, op, () => (tab === "policy" ? adapter.savePolicy(change) : adapter.savePreference(change)));
    },
    [adapter, enqueue, tab],
  );

  const setManaged = useCallback(
    (group: string, managed: boolean) => {
      opIds.current += 1;
      const op: NotificationOp = { id: opIds.current, kind: "managed", group, managed };
      enqueue(tab, op, () => adapter.savePolicy({ group, managed }));
    },
    [adapter, enqueue, tab],
  );

  return {
    tab,
    canManage: state.mine.canManage,
    view: applyOps(current.confirmed, current.ops),
    loading: current.loading && !current.confirmed,
    loadFailed: current.failed,
    isPending: (key) => pending.has(key),
    selectTab,
    reload: () => load(tab),
    setChannel,
    setManaged,
  };
}
