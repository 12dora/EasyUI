"use client";

/**
 * 「设置 → 通知 → 通知渠道」里钉钉那张卡的控制器:读、改、存、测。
 *
 * 三条约定:
 *
 * 1. **只发改过的字段。** 地址 / 标识的基线是「本应用单独保存的值」——沿用「登录与权限」
 *    的继承值时基线是空串,输入框也是空的(继承值只当占位符)。于是没动过的字段永远不进
 *    PUT 体,不会把继承值悄悄固化成一份本地副本。
 * 2. **凭据只写。** 读模型里只有 `hasCredential`,输入框永远从空开始;留空 = 不改,
 *    勾「清除」= 发 `""`。
 * 3. **测试走已保存的配置。** 有未保存的改动时不发测试请求,先提示保存。
 * 4. **一次只有一个请求在飞。** 保存 / 测试期间字段只读、第二次点击直接忽略(判定走 ref,
 *    不等 state 提交);所以保存落地时拿服务端那份重置草稿,不会吞掉期间敲进去的字。
 *
 * 懒加载:页签第一次切到「通知渠道」时才读,之后切来切去草稿都留着(控制器挂在页面上,
 * 不随页签面板卸载)。
 */

import { useCallback, useEffect, useRef, useState } from "react";

import type {
  DingtalkChannelSettings,
  DingtalkChannelSettingsUpdate,
  NotificationChannelSettingsLabels,
  NotificationChannelTestResult,
  NotificationSettingsAdapter,
} from "./notification-settings-types";

export interface DingtalkChannelDraft {
  baseUrl: string;
  appKey: string;
  credential: string;
  clearCredential: boolean;
}

export interface DingtalkChannelOutcome {
  ok: boolean;
  message: string;
}

export interface DingtalkChannelController {
  settings: DingtalkChannelSettings | null;
  draft: DingtalkChannelDraft;
  /** 只在「一次都还没读到」时为真。 */
  loading: boolean;
  loadFailed: boolean;
  saving: boolean;
  testing: boolean;
  dirty: boolean;
  /** 最近一次保存 / 测试的结果;改动草稿时清掉。 */
  outcome: DingtalkChannelOutcome | null;
  /** 保存或测试在途:字段只读,落地时用服务端那份替换草稿不会吞掉期间的输入。 */
  busy: boolean;
  update(patch: Partial<DingtalkChannelDraft>): void;
  reload(): void;
  save(): Promise<void>;
  test(): Promise<void>;
}

/** 适配器三个渠道方法都实现了,才有「通知渠道」页签。 */
export function supportsNotificationChannels(adapter: NotificationSettingsAdapter): boolean {
  return Boolean(adapter.loadDingtalkChannel && adapter.saveDingtalkChannel && adapter.testDingtalkChannel);
}

const EMPTY_DRAFT: DingtalkChannelDraft = { baseUrl: "", appKey: "", credential: "", clearCredential: false };

/** 读模型 → 草稿:继承来的值不进输入框(它只是占位符),凭据永远从空开始。 */
export function dingtalkDraftFrom(settings: DingtalkChannelSettings): DingtalkChannelDraft {
  return {
    baseUrl: settings.baseUrlInherited ? "" : settings.baseUrl,
    appKey: settings.appKeyInherited ? "" : settings.appKey,
    credential: "",
    clearCredential: false,
  };
}

/** 只含改过的字段;空对象 = 没有改动。 */
export function buildDingtalkChannelPatch(
  settings: DingtalkChannelSettings | null,
  draft: DingtalkChannelDraft,
): DingtalkChannelSettingsUpdate {
  const base = settings ? dingtalkDraftFrom(settings) : EMPTY_DRAFT;
  const patch: DingtalkChannelSettingsUpdate = {};
  const baseUrl = draft.baseUrl.trim();
  const appKey = draft.appKey.trim();
  const credential = draft.credential.trim();
  if (baseUrl !== base.baseUrl) patch.baseUrl = baseUrl;
  if (appKey !== base.appKey) patch.appKey = appKey;
  if (draft.clearCredential) patch.credential = "";
  else if (credential) patch.credential = credential;
  return patch;
}

/** 测试结果 → 一句话。只按 `errorKind` 映射;未知值按「意外错误」处理。 */
export function describeDingtalkTest(
  result: NotificationChannelTestResult,
  labels: NotificationChannelSettingsLabels,
): DingtalkChannelOutcome {
  if (result.ok) {
    const latency = typeof result.latencyMs === "number" ? ` · ${result.latencyMs} ms` : "";
    return { ok: true, message: `${labels.testOk}${latency}` };
  }
  const failed = labels.testFailed;
  if (result.errorKind === "auth") return { ok: false, message: failed.auth };
  if (result.errorKind === "unreachable") return { ok: false, message: failed.unreachable };
  if (result.errorKind === "not_configured") return { ok: false, message: failed.notConfigured };
  // `errorDetail` 是上游原文,可能带内部地址或报错栈:页面上只给按类别的一句话。
  return { ok: false, message: failed.unexpected };
}

interface ChannelLoadState {
  settings: DingtalkChannelSettings | null;
  loading: boolean;
  loadFailed: boolean;
}

/**
 * 读的那一半:懒加载、卸载后闭嘴。拆出来是为了让主 hook 保持短小。
 *
 * 每次读发一个号,回调对不上号就整条丢弃 —— 否则一次慢的旧读(成功或失败)会盖掉更新的
 * 那一次,页面就会出现「表单是新值、上面却挂着读失败」这种拼出来的状态。
 */
function useDingtalkChannelLoad(
  adapter: NotificationSettingsAdapter,
  active: boolean,
  onLoaded: (settings: DingtalkChannelSettings) => void,
) {
  const alive = useRef(true);
  const requested = useRef(false);
  const loadId = useRef(0);
  const [state, setState] = useState<ChannelLoadState>({ settings: null, loading: false, loadFailed: false });

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(() => {
    const read = adapter.loadDingtalkChannel;
    if (!read) return;
    requested.current = true;
    const id = (loadId.current += 1);
    const current = () => alive.current && loadId.current === id;
    setState((previous) => ({ ...previous, loading: true, loadFailed: false }));
    read.call(adapter).then(
      (settings) => {
        if (!current()) return;
        setState({ settings, loading: false, loadFailed: false });
        onLoaded(settings);
      },
      () => {
        if (current()) setState((previous) => ({ ...previous, loading: false, loadFailed: true }));
      },
    );
  }, [adapter, onLoaded]);

  useEffect(() => {
    if (active && !requested.current) load();
  }, [active, load]);

  // 保存落地的那一份比任何还在路上的读都新:顺手作废它们。
  const replace = useCallback((settings: DingtalkChannelSettings) => {
    loadId.current += 1;
    setState({ settings, loading: false, loadFailed: false });
  }, []);

  return { state, load, replace, alive };
}

export interface DingtalkChannelOptions {
  adapter: NotificationSettingsAdapter;
  labels: NotificationChannelSettingsLabels | undefined;
  /** 页签当前是否在「通知渠道」:第一次为真时才发读请求。 */
  active: boolean;
  /** 保存成功:渠道可用性可能变了,「通知规则」那边的提示需要重读。 */
  onSaved?: () => void;
}

export function useDingtalkChannel({ adapter, labels, active, onSaved }: DingtalkChannelOptions): DingtalkChannelController {
  const [draft, setDraft] = useState<DingtalkChannelDraft>(EMPTY_DRAFT);
  const [outcome, setOutcome] = useState<DingtalkChannelOutcome | null>(null);
  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  // 在途判定走 ref:state 要等下一次提交才读得到,快速双击会在那之前发出第二个请求。
  const inFlight = useRef(false);
  const onLoaded = useCallback((settings: DingtalkChannelSettings) => setDraft(dingtalkDraftFrom(settings)), []);
  const { state, load, replace, alive } = useDingtalkChannelLoad(adapter, active, onLoaded);
  const patch = buildDingtalkChannelPatch(state.settings, draft);
  const dirty = Object.keys(patch).length > 0;

  const update = useCallback((next: Partial<DingtalkChannelDraft>) => {
    setDraft((current) => ({ ...current, ...next }));
    setOutcome(null);
  }, []);

  const save = async () => {
    const persist = adapter.saveDingtalkChannel;
    if (!persist || !labels || !dirty || inFlight.current) return;
    inFlight.current = true;
    setBusy("save");
    try {
      const next = await persist.call(adapter, patch);
      if (!alive.current) return;
      replace(next);
      setDraft(dingtalkDraftFrom(next));
      setOutcome({ ok: true, message: labels.saved });
      onSaved?.();
    } catch {
      if (alive.current) setOutcome({ ok: false, message: labels.saveFailed });
    } finally {
      inFlight.current = false;
      if (alive.current) setBusy(null);
    }
  };

  const test = async () => {
    const probe = adapter.testDingtalkChannel;
    if (!probe || !labels || dirty || inFlight.current) return;
    inFlight.current = true;
    setBusy("test");
    try {
      const result = await probe.call(adapter);
      if (alive.current) setOutcome(describeDingtalkTest(result, labels));
    } catch {
      if (alive.current) setOutcome({ ok: false, message: labels.testFailed.unexpected });
    } finally {
      inFlight.current = false;
      if (alive.current) setBusy(null);
    }
  };

  return {
    settings: state.settings,
    draft,
    loading: state.loading && !state.settings,
    loadFailed: state.loadFailed,
    saving: busy === "save",
    testing: busy === "test",
    busy: busy !== null,
    dirty,
    outcome,
    update,
    reload: load,
    save,
    test,
  };
}
