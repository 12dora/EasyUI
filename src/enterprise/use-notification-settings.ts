"use client";

/**
 * 「设置 → 通知」的控制器:两份数据(我的 / 平台)、一套乐观保存。
 *
 * 要点:
 * - **两个页签各自一份资源**。「我的通知」读 `load()`,「平台配置」读 `loadPolicy()`;
 *   切页签一律重拉——平台值刚改完,本人的生效值就可能跟着变,拿缓存会给出一张过期的表。
 * - **即点即存,没有保存按钮**。先乐观改本地,再发请求;成功用服务端返回的整个分组替换,
 *   失败回滚并报错。在途期间只禁用**这一个**开关,同一张卡上的其他开关照常可点。
 * - **409 = 分组刚被改成托管**。回滚之外还要重拉「我的通知」:本地这份视图此刻已经不对了。
 */

import { useCallback, useEffect, useState } from "react";

import { toast } from "../toast";
import {
  isNotificationManagedConflict,
  type NotificationChannel,
  type NotificationGroupView,
  type NotificationPolicyView,
  type NotificationSettingsAdapter,
  type NotificationSettingsLabels,
  type NotificationSettingsView,
  type NotificationSwitchChange,
} from "./notification-settings-types";

export type NotificationSettingsTab = "mine" | "policy";

/** 在途开关的键:一个开关一个键,所以禁用永远只落在被点的那一个上。 */
export function notificationSwitchKey(group: string, scene: string, channel: NotificationChannel): string {
  return `${group}::${scene}::${channel}`;
}

/** 卡片标题行那枚「平台托管」开关的在途键。 */
export function notificationManagedKey(group: string): string {
  return `${group}::managed`;
}

function withChannelValue(
  channels: Record<NotificationChannel, boolean | null>,
  channel: NotificationChannel,
  enabled: boolean,
): Record<NotificationChannel, boolean | null> {
  const next: Record<NotificationChannel, boolean | null> = { ...channels };
  next[channel] = enabled;
  return next;
}

/** 把一次渠道改动套进分组,得到乐观值(不改原对象,回滚就是把原对象放回去)。 */
export function withNotificationChannel(
  group: NotificationGroupView,
  change: NotificationSwitchChange,
): NotificationGroupView {
  return {
    ...group,
    scenes: group.scenes.map((scene) =>
      scene.key === change.scene
        ? { ...scene, channels: withChannelValue(scene.channels, change.channel, change.enabled) }
        : scene,
    ),
  };
}

export interface NotificationSettingsController {
  tab: NotificationSettingsTab;
  canManage: boolean;
  /** 当前页签的数据;两个页签的形状相同(`canManage` 只在「我的通知」上多一个字段)。 */
  view: NotificationPolicyView | null;
  /** 只在「一次都还没读到」时为真:重拉时页面保留已有内容,不闪回骨架屏。 */
  loading: boolean;
  loadFailed: boolean;
  isPending(key: string): boolean;
  selectTab(next: NotificationSettingsTab): void;
  reload(): void;
  setChannel(group: NotificationGroupView, change: NotificationSwitchChange): void;
  setManaged(group: NotificationGroupView, managed: boolean): void;
}

interface NotificationResource<T extends NotificationPolicyView> {
  data: T | null;
  loading: boolean;
  failed: boolean;
  reload(): Promise<void>;
  applyGroup(group: NotificationGroupView): void;
}

const NO_PENDING: ReadonlySet<string> = new Set<string>();

/** 一份可重拉、可按分组局部替换的只读视图。两个页签各持有一份。 */
function useNotificationResource<T extends NotificationPolicyView>(load: () => Promise<T>): NotificationResource<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const reload = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      setData(await load());
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [load]);
  const applyGroup = useCallback((group: NotificationGroupView) => {
    setData((current) => {
      if (!current) return current;
      return { ...current, groups: current.groups.map((item) => (item.key === group.key ? group : item)) } as T;
    });
  }, []);
  return { data, loading, failed, reload, applyGroup };
}

interface NotificationSaveOperation {
  key: string;
  /** 请求发出前的分组;失败时原样放回去。 */
  before: NotificationGroupView;
  /** 乐观值;请求还没回来时先画它。 */
  after: NotificationGroupView;
  apply(group: NotificationGroupView): void;
  mark(key: string, active: boolean): void;
  saveFailed: string;
  run(): Promise<NotificationGroupView>;
  onConflict(): void;
}

/** 乐观保存的唯一实现:两个页签、两种改动(渠道 / 托管)都走这一条路径。 */
async function runNotificationSave(operation: NotificationSaveOperation): Promise<void> {
  operation.mark(operation.key, true);
  operation.apply(operation.after);
  try {
    operation.apply(await operation.run());
  } catch (error) {
    operation.apply(operation.before);
    toast.error(operation.saveFailed);
    if (isNotificationManagedConflict(error)) operation.onConflict();
  } finally {
    operation.mark(operation.key, false);
  }
}

export function useNotificationSettings(
  adapter: NotificationSettingsAdapter,
  labels: NotificationSettingsLabels,
): NotificationSettingsController {
  const [tab, setTab] = useState<NotificationSettingsTab>("mine");
  const [pending, setPending] = useState<ReadonlySet<string>>(NO_PENDING);
  const mine = useNotificationResource<NotificationSettingsView>(useCallback(() => adapter.load(), [adapter]));
  const policy = useNotificationResource<NotificationPolicyView>(useCallback(() => adapter.loadPolicy(), [adapter]));
  const { reload: reloadMine, applyGroup: applyMine } = mine;
  const { reload: reloadPolicy, applyGroup: applyPolicy } = policy;
  const onPolicy = tab === "policy";
  const saveFailed = labels.saveFailed;

  useEffect(() => {
    void reloadMine();
  }, [reloadMine]);

  const mark = useCallback((key: string, active: boolean) => {
    setPending((current) => {
      const next = new Set(current);
      if (active) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  // 切页签一律重拉:平台值刚改完,本人的生效值也跟着变了。
  const selectTab = useCallback(
    (next: NotificationSettingsTab) => {
      setTab(next);
      void (next === "policy" ? reloadPolicy() : reloadMine());
    },
    [reloadMine, reloadPolicy],
  );

  const setChannel = useCallback(
    (group: NotificationGroupView, change: NotificationSwitchChange) => {
      void runNotificationSave({
        key: notificationSwitchKey(change.group, change.scene, change.channel),
        before: group,
        after: withNotificationChannel(group, change),
        apply: onPolicy ? applyPolicy : applyMine,
        mark,
        saveFailed,
        run: () => (onPolicy ? adapter.savePolicy(change) : adapter.savePreference(change)),
        onConflict: () => void reloadMine(),
      });
    },
    [adapter, applyMine, applyPolicy, mark, onPolicy, reloadMine, saveFailed],
  );

  const setManaged = useCallback(
    (group: NotificationGroupView, managed: boolean) => {
      void runNotificationSave({
        key: notificationManagedKey(group.key),
        before: group,
        after: { ...group, managed },
        apply: applyPolicy,
        mark,
        saveFailed,
        run: () => adapter.savePolicy({ group: group.key, managed }),
        onConflict: () => void reloadMine(),
      });
    },
    [adapter, applyPolicy, mark, reloadMine, saveFailed],
  );

  const active = onPolicy ? policy : mine;
  return {
    tab,
    canManage: mine.data?.canManage ?? false,
    view: active.data,
    loading: active.loading && !active.data,
    loadFailed: active.failed,
    isPending: (key) => pending.has(key),
    selectTab,
    reload: () => void (onPolicy ? reloadPolicy() : reloadMine()),
    setChannel,
    setManaged,
  };
}
