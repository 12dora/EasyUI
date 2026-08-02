/**
 * 全站统一 Toast 通知 helper (7.0.1).
 *
 * 不依赖第三方库, 模块内维护一个轻量事件 bus, 由 `<Toaster />` 组件订阅渲染.
 * 详见 `frontend/packages/easy-enterprise/src/primitives/toaster.tsx`.
 *
 * 用法:
 * ```ts
 * import { toast } from "@easy-enterprise/ui/toast";
 * toast.success("报价已创建");
 * toast.error("提交失败, 请重试");
 * toast.info("操作已记录");
 * toast.warning("请确认收件人信息");
 * // Stable semantic id — polling / state transitions replace rather than stack:
 * toast.error("上游降级", { id: "customs-upstream-state" });
 * // Permanent until dismissed — cannot be FIFO-evicted by unrelated bursts:
 * toast.error("必须人工确认", { duration: 0 });
 * ```
 *
 * Toast 类型对应视觉:
 * - success → 绿色 (evergreen)
 * - error   → 红色 (signal)
 * - warning → 琥珀色
 * - info    → 蓝色 (primary action color)
 *
 * ## Stable semantic ids (FE-FB-09)
 *
 * Pass `{ id: "<domain>" }` so repeated updates of the same failure domain
 * replace the existing card instead of stacking. Convention: kebab-case,
 * product-prefixed domain names, e.g.
 * - `customs-upstream-state` — upstream health / degradation transitions
 * - `shell-notifications` — shell notification load failures
 * - `collection-poll` — collection job poll failures
 * - `query-cache:<code>` — query-layer failures (when not using the code gate)
 *
 * Without an id, the bus still dedupes an identical `(variant, message)` pair.
 *
 * ## Conservation invariant (FE-FB-09)
 *
 * **No toast is ever silently discarded.** Every accepted toast that has not
 * been explicitly dismissed or cleared is in exactly one observable state:
 * visible, queued, or represented by a counted overflow summary.
 *
 * This implementation caps the visible stack at {@link MAX_VISIBLE_TOASTS}
 * and deliberately leaves the FIFO queue unbounded, so the summary count is
 * currently always zero. That is an explicit memory-for-delivery trade-off:
 * stable-id / exact-message dedupe limits repeated domains, while every
 * distinct notification keeps its text and eventually paints. If a finite
 * queue is introduced later, entries beyond the bound must increment and
 * render a summary count; removing them is not a valid capacity policy.
 *
 * Replacement preserves the existing visible/queued slot and accepted count,
 * while its duration follows the replacement call's own variant/options.
 * Only explicit `dismiss(id)` / `clear()` calls are terminal removals.
 * Unmounting a `<Toaster />` only unsubscribes that renderer; the bus continues
 * to own all visible and queued items for the next mount.
 */

export type ToastVariant = "success" | "error" | "info" | "warning";

export interface ToastItem {
  id: string;
  variant: ToastVariant;
  message: string;
  /** 自动消失毫秒数, <=0 表示不自动消失 */
  duration: number;
  /** 创建时间戳, 仅用于排序 */
  createdAt: number;
}

export interface ToastOptions {
  /**
   * 自动消失毫秒数. 默认 success/info/warning 3000, error 15000.
   * 传 `0`(或负数)表示不自动消失, 只能手动关闭 —— 留给真正必须人工确认的失败.
   *
   * error 的 15s 是"可暂停"的 15s: 指针悬停在 toast 上或键盘焦点进入时倒计时暂停,
   * 移开后继续, 所以读长文案不会被计时器追着跑. 见 primitives/toaster.tsx.
   */
  duration?: number;
  /**
   * Optional stable id. Calling again with the same id replaces the existing
   * toast (preserves slot; resets duration via `createdAt`). Use semantic
   * domain ids (see module doc) so polling updates do not stack.
   */
  id?: string;
}

/** Maximum simultaneously visible toasts. Every later distinct toast waits FIFO. */
export const MAX_VISIBLE_TOASTS = 3;

/**
 * Queue bound decision: deliberately unbounded so every distinct toast keeps
 * its full message. A future finite value requires a rendered counted summary.
 */
export const MAX_QUEUED_TOASTS = Number.POSITIVE_INFINITY;

/** error 15 秒(可暂停); 其余 3 秒. 见 ToastOptions.duration. */
const DEFAULT_DURATION_MS: Record<ToastVariant, number> = {
  success: 3000,
  info: 3000,
  warning: 3000,
  error: 15000,
};

type Listener = (toasts: ToastItem[]) => void;

export interface ToastAccountingSnapshot {
  /** Accepted toasts that have not been explicitly dismissed or cleared. */
  accepted: number;
  visible: number;
  queued: number;
  /** Reserved for a future finite-queue policy; unbounded FIFO keeps this at zero. */
  summarized: number;
}

const EMPTY_ITEMS: ToastItem[] = [];

class ToastBus {
  /** Currently rendered toasts (≤ MAX_VISIBLE_TOASTS). */
  private items: ToastItem[] = [];
  /** Every distinct overflow toast waits here in insertion order. */
  private queue: ToastItem[] = [];
  /** Independent conservation counter; only explicit terminal removals reduce it. */
  private acceptedCount = 0;
  private listeners = new Set<Listener>();
  private seq = 0;

  /** useSyncExternalStore 风格订阅: 仅注册回调, 不立即触发. */
  subscribe = (listener: () => void): (() => void) => {
    const wrapped: Listener = () => listener();
    this.listeners.add(wrapped);
    return () => {
      this.listeners.delete(wrapped);
    };
  };

  /** useSyncExternalStore 风格快照: 客户端取当前可见数组(引用稳定). */
  getSnapshot = (): ToastItem[] => this.items;

  /** SSR 快照: 始终返回稳定空数组, 避免 hydration mismatch. */
  getServerSnapshot = (): ToastItem[] => EMPTY_ITEMS;

  /** Test / debug: queued overflow (not rendered). */
  getQueueSnapshot = (): ToastItem[] => this.queue;

  /** Test / debug: makes the no-silent-discard invariant directly inspectable. */
  getAccountingSnapshot = (): ToastAccountingSnapshot => ({
    accepted: this.acceptedCount,
    visible: this.items.length,
    queued: this.queue.length,
    summarized: 0,
  });

  push(variant: ToastVariant, message: string, options: ToastOptions = {}): string {
    // 无显式 id 时按 (variant, message) 去重: error 不再自动消失, 反复点同一个被阻断
    // 的按钮否则会把同一句话堆成一摞, 淹没其它通知.
    const existingVisibleIdx = options.id
      ? this.items.findIndex((it) => it.id === options.id)
      : this.items.findIndex((it) => it.variant === variant && it.message === message);
    const existingQueueIdx =
      existingVisibleIdx >= 0
        ? -1
        : options.id
          ? this.queue.findIndex((it) => it.id === options.id)
          : this.queue.findIndex((it) => it.variant === variant && it.message === message);

    const id =
      options.id ??
      this.items[existingVisibleIdx]?.id ??
      this.queue[existingQueueIdx]?.id ??
      `t-${Date.now().toString(36)}-${(this.seq++).toString(36)}`;
    const duration = options.duration ?? DEFAULT_DURATION_MS[variant];

    const item: ToastItem = {
      id,
      variant,
      message,
      duration,
      createdAt: Date.now(),
    };

    // 命中既有 toast 则原地刷新(保留 id/位置, createdAt 变化会重启倒计时)
    if (existingVisibleIdx >= 0) {
      this.items = this.items.map((it, idx) => (idx === existingVisibleIdx ? item : it));
      this.emit();
      return id;
    }
    if (existingQueueIdx >= 0) {
      this.queue = this.queue.map((it, idx) => (idx === existingQueueIdx ? item : it));
      this.emit();
      return id;
    }

    this.acceptedCount += 1;
    this.insertNew(item);
    this.emit();
    return id;
  }

  dismiss(id: string): void {
    const beforeVisible = this.items.length;
    const beforeQueue = this.queue.length;
    this.items = this.items.filter((it) => it.id !== id);
    this.queue = this.queue.filter((it) => it.id !== id);
    const removed = beforeVisible + beforeQueue - this.items.length - this.queue.length;
    this.acceptedCount -= removed;
    if (this.items.length < beforeVisible) {
      this.promoteFromQueue();
    }
    if (this.items.length !== beforeVisible || this.queue.length !== beforeQueue) {
      this.emit();
    }
  }

  clear(): void {
    // Explicit bulk dismissal is a terminal user/application action, not a
    // capacity path. Reset the accepted side of the conservation equation too.
    if (this.items.length === 0 && this.queue.length === 0) return;
    this.items = [];
    this.queue = [];
    this.acceptedCount = 0;
    this.emit();
  }

  private insertNew(item: ToastItem): void {
    if (this.items.length < MAX_VISIBLE_TOASTS) {
      this.items = [...this.items, item];
      return;
    }

    // Capacity never evicts: transient and permanent overflow use the same FIFO.
    this.enqueue(item);
  }

  private enqueue(item: ToastItem): void {
    this.queue = [...this.queue, item];
  }

  private promoteFromQueue(): void {
    while (this.queue.length > 0 && this.items.length < MAX_VISIBLE_TOASTS) {
      const [head, ...rest] = this.queue;
      this.queue = rest;
      this.items = [...this.items, head];
    }
  }

  private emit(): void {
    for (const l of this.listeners) l(this.items);
  }
}

export const toastBus = new ToastBus();

export const toast = {
  success(message: string, options?: ToastOptions): string {
    return toastBus.push("success", message, options);
  },
  /**
   * 系统级失败(网络中断、后端 4xx/5xx、未预期异常)。
   *
   * 语义:assertive 打断读屏 + 15 秒可暂停倒计时 + 可手动关闭。
   * - 真正必须由人确认的失败,显式传 `{ duration: 0 }` 让它常驻。
   * - **纯前端表单校验不要用它**(必填未填、格式不对、日期越界、两次密码不一致等):
   *   那类提示的判据是"没有任何请求发出去就在提交守卫里早退",应当用 `toast.warning`
   *   —— 3 秒自动消失、礼貌播报,不占用"必须人工确认"的语义位。
   *   `catch` 块里、或用于回显接口错误的调用,才属于本方法。
   */
  error(message: string, options?: ToastOptions): string {
    return toastBus.push("error", message, options);
  },
  info(message: string, options?: ToastOptions): string {
    return toastBus.push("info", message, options);
  },
  warning(message: string, options?: ToastOptions): string {
    return toastBus.push("warning", message, options);
  },
  dismiss(id: string): void {
    toastBus.dismiss(id);
  },
  clear(): void {
    toastBus.clear();
  },
};
