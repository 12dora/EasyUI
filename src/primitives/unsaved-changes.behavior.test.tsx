// @vitest-environment happy-dom
/**
 * User risk: 填了半小时的询盘,点一下侧边栏就没了。守卫的价值全在「该问的时候问、
 * 不该问的时候别烦人」这两件事上,所以这里断言的都是可观察行为 —— 对话框有没有出现、
 * `confirmLeave` 到底 resolve 成什么、`beforeunload` 挂上没挂上 —— 而不是内部状态。
 *
 * 反向用例同样重要:干净时弹窗 = 每次点导航都要多点一下,用户很快就会条件反射地点「离开」,
 * 守卫也就失效了。
 */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 测试专用:复用 enterprise 层的挂载工具(仅测试期依赖,不构成运行时的层级反向引用)。
import { click, installReducedMotion, mount, type MountedView } from "../enterprise/behavior-test-utils";
import {
  structuralEqual,
  UnsavedChangesProvider,
  useDirtyState,
  useLeaveConfirmation,
  useUnsavedChanges,
  type LeaveConfirmation,
} from "./unsaved-changes";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LABELS = { title: "放弃未保存的改动?", description: "此表单有尚未保存的改动。", stay: "继续编辑", leave: "放弃改动" };

let view: MountedView | null = null;
let gate: LeaveConfirmation | null = null;

beforeEach(() => {
  // 关掉退场动画:对话框在 stay/leave 之后立刻卸载,后续断言不必等 250ms 的计时器。
  installReducedMotion(true);
  gate = null;
});

afterEach(async () => {
  await view?.unmount();
  view = null;
  vi.restoreAllMocks();
});

/** 探针:把 context 暴露给用例,免得每个断言都要现搭一个宿主组件。 */
function Gate() {
  gate = useLeaveConfirmation();
  return null;
}

function DirtySource({ dirty, id }: { dirty: boolean; id?: string }) {
  useUnsavedChanges(dirty, { id });
  return null;
}

function tree(children: React.ReactNode, onLeaveConfirmed?: () => void) {
  return (
    <UnsavedChangesProvider labels={LABELS} onLeaveConfirmed={onLeaveConfirmed}>
      <Gate />
      {children}
    </UnsavedChangesProvider>
  );
}

function dialogs(): Element[] {
  return Array.from(document.body.querySelectorAll("[role='dialog']"));
}

function buttonOf(testId: string): HTMLElement {
  const element = document.body.querySelector(`[data-test-id='${testId}']`);
  if (!(element instanceof HTMLElement)) throw new Error(`Missing [data-test-id='${testId}']`);
  return element;
}

/**
 * 发起一次确认。结果裹在对象里返回:直接返回 promise 的话,外层的 `await` 会把它一并展开,
 * 用例就再也拿不到那个「还悬着」的 promise 了。
 */
async function startConfirm(): Promise<{ result: Promise<boolean> }> {
  let result!: Promise<boolean>;
  await act(async () => {
    result = (gate as LeaveConfirmation).confirmLeave();
  });
  return { result };
}

describe("UnsavedChangesProvider 的离开确认", () => {
  it("没有脏来源:直接放行,一个对话框都不渲染", async () => {
    view = await mount(tree(<DirtySource dirty={false} />));

    const { result } = await startConfirm();

    expect(dialogs()).toHaveLength(0);
    await expect(result).resolves.toBe(true);
    expect(gate?.hasUnsavedChanges).toBe(false);
  });

  it("有脏来源:弹出对话框,选「继续编辑」resolve false 且注册表原样保留", async () => {
    view = await mount(tree(<DirtySource dirty />));
    expect(gate?.hasUnsavedChanges).toBe(true);

    const { result } = await startConfirm();
    expect(dialogs()).toHaveLength(1);
    expect(document.body.textContent).toContain(LABELS.description);

    await click(buttonOf("unsaved-changes-stay"));

    await expect(result).resolves.toBe(false);
    // 留下之后草稿还在:再问一次仍然要弹窗,不能因为「问过一次」就放行。
    expect(gate?.hasUnsavedChanges).toBe(true);
    const { result: again } = await startConfirm();
    expect(dialogs()).toHaveLength(1);
    await click(buttonOf("unsaved-changes-stay"));
    await expect(again).resolves.toBe(false);
  });

  it("选「放弃改动」resolve true,并回调 onLeaveConfirmed", async () => {
    const onLeaveConfirmed = vi.fn();
    view = await mount(tree(<DirtySource dirty />, onLeaveConfirmed));

    const { result } = await startConfirm();
    await click(buttonOf("unsaved-changes-leave"));

    await expect(result).resolves.toBe(true);
    expect(onLeaveConfirmed).toHaveBeenCalledTimes(1);
  });

  it("Esc 等于「继续编辑」—— 误触键盘不会丢草稿", async () => {
    view = await mount(tree(<DirtySource dirty />));
    const { result } = await startConfirm();

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    await expect(result).resolves.toBe(false);
  });

  it("遮罩点击等于「继续编辑」", async () => {
    view = await mount(tree(<DirtySource dirty />));
    const { result } = await startConfirm();

    await click(buttonOf("app-dialog-overlay"));

    await expect(result).resolves.toBe(false);
  });

  it("两个脏来源 + 并发调用:只有一个对话框,一次选择把所有等待者一起 resolve", async () => {
    view = await mount(
      tree(
        <>
          <DirtySource dirty id="header" />
          <DirtySource dirty id="line-items" />
        </>,
      ),
    );

    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    await act(async () => {
      first = (gate as LeaveConfirmation).confirmLeave();
      second = (gate as LeaveConfirmation).confirmLeave();
    });

    expect(dialogs()).toHaveLength(1);

    await click(buttonOf("unsaved-changes-leave"));

    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
  });

  it("dirty 转 false 与卸载都会注销来源:两个来源走干净之后直接放行", async () => {
    const render = (headerDirty: boolean, withLines: boolean) =>
      tree(
        <>
          <DirtySource dirty={headerDirty} id="header" />
          {withLines ? <DirtySource dirty id="line-items" /> : null}
        </>,
      );
    view = await mount(render(true, true));
    expect(gate?.hasUnsavedChanges).toBe(true);

    // 表单被保存 → dirty 落回 false;另一个来源整块卸载。
    await view.rerender(render(false, true));
    expect(gate?.hasUnsavedChanges).toBe(true);
    await view.rerender(render(false, false));

    expect(gate?.hasUnsavedChanges).toBe(false);
    const { result } = await startConfirm();
    expect(dialogs()).toHaveLength(0);
    await expect(result).resolves.toBe(true);
  });
});

describe("beforeunload 守卫", () => {
  function listenerSpies() {
    return {
      add: vi.spyOn(window, "addEventListener"),
      remove: vi.spyOn(window, "removeEventListener"),
    };
  }

  function beforeUnloadCalls(spy: ReturnType<typeof vi.spyOn>): unknown[][] {
    return spy.mock.calls.filter((call) => call[0] === "beforeunload");
  }

  it("有脏来源时挂上、全部干净后摘掉,而且只挂一个", async () => {
    const spies = listenerSpies();
    const render = (dirty: boolean) =>
      tree(
        <>
          <DirtySource dirty={dirty} id="header" />
          <DirtySource dirty={dirty} id="line-items" />
        </>,
      );

    view = await mount(render(true));
    const added = beforeUnloadCalls(spies.add);
    expect(added).toHaveLength(1);
    expect(beforeUnloadCalls(spies.remove)).toHaveLength(0);

    await view.rerender(render(false));
    const removed = beforeUnloadCalls(spies.remove);
    expect(removed).toHaveLength(1);
    // 摘掉的必须是挂上的那一个,否则页面上会残留一个永远弹原生确认框的监听器。
    expect(removed[0][1]).toBe(added[0][1]);
  });

  it("卸载时摘掉监听器", async () => {
    const spies = listenerSpies();
    view = await mount(tree(<DirtySource dirty />));
    expect(beforeUnloadCalls(spies.add)).toHaveLength(1);

    await view.unmount();
    view = null;

    expect(beforeUnloadCalls(spies.remove)).toHaveLength(1);
  });

  it("处理函数同时 preventDefault 并写 returnValue(新旧浏览器都拦得住)", async () => {
    const spies = listenerSpies();
    view = await mount(tree(<DirtySource dirty />));
    const handler = beforeUnloadCalls(spies.add)[0][1] as (event: BeforeUnloadEvent) => void;

    const event = { preventDefault: vi.fn(), returnValue: undefined } as unknown as BeforeUnloadEvent;
    handler(event);

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.returnValue).toBe("");
  });
});

describe("structuralEqual / useDirtyState", () => {
  function Probe<T>({ initial, current, isEqual }: { initial: T; current: T; isEqual?: (a: T, b: T) => boolean }) {
    const dirty = useDirtyState(initial, current, isEqual);
    return <span data-test-id="dirty">{String(dirty)}</span>;
  }

  async function dirtyOf<T>(initial: T, current: T, isEqual?: (a: T, b: T) => boolean): Promise<boolean> {
    const mounted = await mount(<Probe initial={initial} current={current} isEqual={isEqual} />);
    const text = mounted.host.textContent;
    await mounted.unmount();
    return text === "true";
  }

  it("值相等(含嵌套、键序不同)时不脏", async () => {
    expect(await dirtyOf({ a: 1, b: { c: [1, 2] } }, { b: { c: [1, 2] }, a: 1 })).toBe(false);
  });

  it("嵌套深处改一个字就脏", async () => {
    expect(await dirtyOf({ a: 1, b: { c: [1, 2] } }, { a: 1, b: { c: [1, 3] } })).toBe(true);
  });

  it("显式 undefined 与缺失的键等价", async () => {
    expect(await dirtyOf({ note: undefined, name: "王二" }, { name: "王二" })).toBe(false);
    expect(await dirtyOf({ nested: { note: undefined } }, { nested: {} })).toBe(false);
  });

  it("数组按下标比较:元素顺序、长度、null 与 undefined 都算改动", async () => {
    expect(await dirtyOf({ tags: ["a", "b"] }, { tags: ["b", "a"] })).toBe(true);
    expect(await dirtyOf({ tags: ["a"] }, { tags: ["a", undefined] })).toBe(true);
    expect(await dirtyOf({ tags: [null] }, { tags: [undefined] })).toBe(true);
    expect(await dirtyOf({ tags: [{ id: 1 }] }, { tags: [{ id: 1 }] })).toBe(false);
  });

  it("自定义比较器优先于默认的结构比较", async () => {
    const ignoreCase = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
    expect(await dirtyOf("SHANGHAI", "shanghai", ignoreCase)).toBe(false);
    expect(await dirtyOf("SHANGHAI", "shanghai")).toBe(true);
  });

  it("数组与对象、不同类型之间不会误判成相等", () => {
    expect(structuralEqual([], {})).toBe(false);
    expect(structuralEqual({ a: 1 }, { a: "1" })).toBe(false);
    expect(structuralEqual(0, false)).toBe(false);
    expect(structuralEqual(null, undefined)).toBe(false);
  });

  it("Date 这类非纯对象按引用判定 —— 宁可多问一次,也不静默吞掉改动", () => {
    const at = new Date("2026-09-05T00:00:00.000Z");
    expect(structuralEqual({ at }, { at })).toBe(true);
    expect(structuralEqual({ at }, { at: new Date("2026-09-05T00:00:00.000Z") })).toBe(false);
  });
});
