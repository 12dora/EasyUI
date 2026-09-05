"use client";

/**
 * 未保存改动守卫 —— 把「离开前先问一句」收口成一套与框架无关的原语。
 *
 * 谁脏由组件自己说(`useUnsavedChanges`),问不问、怎么问由 Provider 统一决定
 * (一个 `Dialog`、一个 `beforeunload`),宿主只需要在自己的路由 / 链接 / 弹窗关闭处
 * `await confirmLeave()`。这里没有任何 `next/…` 依赖:路由是宿主的,守卫不是。
 *
 * 安全默认:Esc、遮罩、右上角关闭一律等于「留下」。用户想丢掉草稿必须显式点那个红字按钮。
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { ActionRow } from "./action-row";
import { Button } from "./button";
import { Dialog } from "./dialog";

export interface UnsavedChangesLabels {
  /** 对话框标题,例:Discard unsaved changes? */
  title: string;
  /** 正文:说清楚「不保存就会丢」。 */
  description: string;
  /** 安全动作(主按钮):留在当前页继续编辑。 */
  stay: string;
  /** 破坏性动作:丢弃草稿并离开。 */
  leave: string;
}

/**
 * 英文兜底文案 —— 只是兜底。产品里的每个宿主都应该传自己已本地化的 `labels`,
 * 让守卫说用户正在用的那门语言。
 */
export const DEFAULT_UNSAVED_CHANGES_LABELS: UnsavedChangesLabels = {
  title: "Discard unsaved changes?",
  description: "This form has changes that have not been saved. If you leave now, they will be lost.",
  stay: "Keep editing",
  leave: "Discard changes",
};

/** `useLeaveConfirmation()` 的返回值:宿主包路由 / 链接 / 关闭按钮时要的两样东西。 */
export interface LeaveConfirmation {
  /** 当前是否存在任何已登记的脏来源。 */
  hasUnsavedChanges: boolean;
  /**
   * 没有脏来源时立即 resolve `true`(不弹窗);否则弹出确认框,
   * 用户选「离开」resolve `true`,选「留下」/ Esc / 遮罩 resolve `false`。
   * 并发调用共用同一个对话框,一次选择把所有等待者一起 resolve。
   */
  confirmLeave: () => Promise<boolean>;
}

/** Context 值 = 对外的确认能力 + 供 `useUnsavedChanges` 用的登记入口。 */
export interface UnsavedChangesContextValue extends LeaveConfirmation {
  register: (id: string) => void;
  unregister: (id: string) => void;
}

export interface UnsavedChangesOptions {
  /** 显式来源 id。不传就用 `useId()`,同一组件的多次挂载互不覆盖。 */
  id?: string;
}

export interface UnsavedChangesProviderProps {
  children: ReactNode;
  /** 已本地化的文案;缺哪项就退回 `DEFAULT_UNSAVED_CHANGES_LABELS` 的英文兜底。 */
  labels?: Partial<UnsavedChangesLabels>;
  /** 用户确认离开后触发。注册表**不会**被自动清空 —— 脏来源随页面卸载自然注销。 */
  onLeaveConfirmed?: () => void;
}

const UnsavedChangesContext = createContext<UnsavedChangesContextValue | null>(null);

function useUnsavedChangesContext(): UnsavedChangesContextValue {
  const value = useContext(UnsavedChangesContext);
  if (!value) {
    throw new Error("useUnsavedChanges / useLeaveConfirmation must be used inside <UnsavedChangesProvider>.");
  }
  return value;
}

/**
 * 只要还有脏来源就挂一个 `beforeunload`(关标签页 / 刷新 / 外链跳转的最后一道拦截),
 * 全部干净时摘掉 —— 挂着不摘会让浏览器在没有草稿时也弹原生确认框。
 * 监听器由 Provider 独占安装,所以页面上永远只有一个,不随脏来源数量增长。
 */
function useBeforeUnloadGuard(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const handler = (event: BeforeUnloadEvent) => {
      // 现代浏览器认 preventDefault,老浏览器认 returnValue;两个都给才是全覆盖。
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [active]);
}

export function UnsavedChangesProvider({ children, labels, onLeaveConfirmed }: UnsavedChangesProviderProps) {
  // 注册表存在 state 初始化里而不是 ref:拿到的是同一个稳定实例,又不必在渲染期写 ref。
  const [sources] = useState<Map<string, true>>(() => new Map());
  const [dirtyCount, setDirtyCount] = useState(0);
  const [open, setOpen] = useState(false);
  const waitersRef = useRef<Array<(leave: boolean) => void>>([]);
  const onLeaveConfirmedRef = useRef(onLeaveConfirmed);

  useEffect(() => {
    onLeaveConfirmedRef.current = onLeaveConfirmed;
  }, [onLeaveConfirmed]);

  const register = useCallback(
    (id: string) => {
      sources.set(id, true);
      setDirtyCount(sources.size);
    },
    [sources],
  );

  const unregister = useCallback(
    (id: string) => {
      sources.delete(id);
      setDirtyCount(sources.size);
    },
    [sources],
  );

  // 读 `sources.size` 而不是 `dirtyCount`:同一个 tick 里刚登记完就问的调用方
  // 拿到的必须是此刻的真相,不能是上一次渲染的快照。
  const confirmLeave = useCallback(() => {
    if (sources.size === 0) return Promise.resolve(true);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      waitersRef.current.push(resolve);
    });
  }, [sources]);

  const settle = useCallback((leave: boolean) => {
    const waiters = waitersRef.current;
    waitersRef.current = [];
    setOpen(false);
    for (const resolve of waiters) resolve(leave);
    if (leave) onLeaveConfirmedRef.current?.();
  }, []);

  const value = useMemo<UnsavedChangesContextValue>(
    () => ({ hasUnsavedChanges: dirtyCount > 0, confirmLeave, register, unregister }),
    [dirtyCount, confirmLeave, register, unregister],
  );

  useBeforeUnloadGuard(dirtyCount > 0);

  return (
    <UnsavedChangesContext.Provider value={value}>
      {children}
      <UnsavedChangesConfirmDialog
        open={open}
        labels={{ ...DEFAULT_UNSAVED_CHANGES_LABELS, ...labels }}
        onStay={() => settle(false)}
        onLeave={() => settle(true)}
      />
    </UnsavedChangesContext.Provider>
  );
}

function UnsavedChangesConfirmDialog({
  open,
  labels,
  onStay,
  onLeave,
}: {
  open: boolean;
  labels: UnsavedChangesLabels;
  onStay: () => void;
  onLeave: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onStay}
      title={labels.title}
      size="sm"
      // 右上角的关闭按钮也是「留下」,所以它的无障碍名就用 stay 的文案,而不是泛泛的「关闭」。
      closeLabel={labels.stay}
      footer={
        <ActionRow>
          <Button type="button" variant="ghost-danger" onClick={onLeave} data-test-id="unsaved-changes-leave">
            {labels.leave}
          </Button>
          <Button type="button" variant="primary" autoFocus onClick={onStay} data-test-id="unsaved-changes-stay">
            {labels.stay}
          </Button>
        </ActionRow>
      }
    >
      <p className="text-[13px] leading-relaxed text-ink-soft" data-test-id="unsaved-changes-description">
        {labels.description}
      </p>
    </Dialog>
  );
}

/**
 * 把一个脏来源登记进守卫。`dirty` 为真时登记,转假或组件卸载时注销 ——
 * 表单只管说自己脏没脏,不需要知道谁会来问、怎么问。
 */
export function useUnsavedChanges(dirty: boolean, options?: UnsavedChangesOptions): void {
  const fallbackId = useId();
  const id = options?.id ?? fallbackId;
  const { register, unregister } = useUnsavedChangesContext();

  useEffect(() => {
    if (!dirty) return;
    register(id);
    return () => unregister(id);
  }, [dirty, id, register, unregister]);
}

/**
 * 宿主侧的出口:拿到 `confirmLeave` 去包路由跳转、链接点击与弹窗关闭。
 * 用法见 `src/README.md` 的「Unsaved-changes guard」一节。
 */
export function useLeaveConfirmation(): LeaveConfirmation {
  const { hasUnsavedChanges, confirmLeave } = useUnsavedChangesContext();
  return useMemo(() => ({ hasUnsavedChanges, confirmLeave }), [hasUnsavedChanges, confirmLeave]);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function arraysEqual(a: readonly unknown[], b: readonly unknown[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((item, index) => structuralEqual(item, b[index]));
}

function objectsEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  // 并集遍历 + Set:键序不影响结果,缺键读出 `undefined`,于是「缺失」与「显式 undefined」等价
  // —— 表单里 `{ note: undefined }` 和 `{}` 是同一份草稿,不该被当成改动。
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (!structuralEqual(a[key], b[key])) return false;
  }
  return true;
}

/**
 * JSON 安全的深比较:数组按下标、纯对象按键的并集递归,键序无关,
 * 缺失的键与显式 `undefined` 视为相等。
 *
 * 只有数组与**纯对象**走结构比较;`Date`、`Map`、类实例等按引用(`Object.is`)判定 ——
 * 宁可多问一次「要丢弃改动吗」,也不要把两个不同的 `Date` 判成一样而静默吞掉草稿。
 * 需要比较这类值时,先把它们快照成字符串 / 数字。
 */
export function structuralEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) return arraysEqual(a, b);
  if (isPlainObject(a) && isPlainObject(b)) return objectsEqual(a, b);
  return false;
}

/**
 * 手动快照式的脏判定:把「进入时的值」与「当前值」交给它,拿回一个布尔量,
 * 通常直接喂给 `useUnsavedChanges`。默认用 `structuralEqual`,也可以传自己的比较器
 * (例如需要忽略某些字段,或值里有 `Date`)。
 */
export function useDirtyState<T>(
  initial: T,
  current: T,
  isEqual: (a: T, b: T) => boolean = structuralEqual,
): boolean {
  return !isEqual(initial, current);
}
