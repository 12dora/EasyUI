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
  /** 卸载 / 这批 op 已被 409 作废 时返回 false,回调一律闭嘴。 */
  live(): boolean;
  onConflict(): void;
}

/**
 * 一次保存的落地:成功只把**这一条** op 换成服务端分组,失败只丢**这一条** op ——
 * 显示值由 `applyOps` 重新算,期间成功的兄弟改动自然留在上面,不需要快照回滚。
 */
async function runNotificationSave(task: SaveTask): Promise<void> {
  if (!task.live()) return;
  try {
    const group = await task.run();
    if (!task.live()) return;
    task.dispatch({ type: "op-ok", tab: task.tab, opId: task.op.id, group });
  } catch (error) {
    if (!task.live()) return;
    if (isNotificationManagedConflict(error)) {
      task.dispatch({ type: "op-conflict", tab: task.tab });
      task.onConflict();
    } else {
      task.dispatch({ type: "op-fail", tab: task.tab, opId: task.op.id });
    }
    toast.error(task.saveFailed);
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
  // 409 作废整批 op 时 epoch +1,还排在队列里、尚未发出的那些任务据此自行放弃。
  const epochs = useRef({ mine: 0, policy: 0 });
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
      dispatch({ type: "op-add", tab, op });
      const epoch = epochs.current[tab];
      const live = () => alive.current && epochs.current[tab] === epoch;
      // 整批作废:还排在队列里、尚未发出的任务靠 epoch 自行放弃,然后重读当前页签。
      const onConflict = () => {
        epochs.current[tab] += 1;
        load(tab);
      };
      queues.current[tab] = queues.current[tab].then(() =>
        runNotificationSave({ tab, op, saveFailed, run, dispatch, live, onConflict }),
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

  // 丢掉过一次加载结果(读的过程中自己的写落了地)。等队列空了补拉一次,不然页面会一直
  // 停在乐观值上,直到用户自己去点别的地方。
  useEffect(() => {
    if (current.needsReload && current.ops.length === 0 && !current.loading) load(tab);
  }, [current.needsReload, current.ops.length, current.loading, load, tab]);

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
