// @vitest-environment happy-dom
/**
 * User risk: 8ad34bc 只把 `Field` 的标签/提示/错误抬到 12px,套件里另外十来处仍然是
 * 11px / 10px 的标签、`uppercase tracking-` 的眉标题、以及用 `--signal` 直出的红色文字。
 * 同一个界面里两套口径比任何一套单独存在都糟:用户会以为字号差异代表信息层级差异。
 *
 * 这里既钉住组件级的口径,也做一次全 src 静态扫描 —— 组件用例只能覆盖被 import 的那几个,
 * 而"12px 下限"和"不许再有 uppercase"是套件级不变量,必须整棵树一起看。
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { mount, type MountedView } from "../enterprise/behavior-test-utils";
import { AppErrorState } from "./app-error-state";
import { Badge } from "./badge";
import { InlineNotice } from "./inline-notice";
import { PageHeader } from "./page-header";
import { Section } from "./section";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SRC_ROOT = path.resolve(import.meta.dirname, "..");
const SCANNED = /\.(?:ts|tsx|css)$/;

/**
 * 允许留在 12px 以下的两处,理由都不是"文案太挤":
 * 它们是烤进固定几何里的字形,抬字号就等于改布局,而排版一致性不该顺手改版式。
 */
const SUB_12PX_EXEMPT: Record<string, string> = {
  "enterprise/topbar-actions.tsx": "未读数字长在 h-4 的红点里,抬字号会把圆点撑变形",
  "primitives/info-tooltip.tsx": "size-4 圆圈里的 ⓘ 字形是图标,不承载文案",
};

/**
 * `--signal` / `--status-pending` 是填充档,各自都有承载文字的 `-ink` 兄弟。它们一旦出现在
 * `text-` 工具类里,就说明有文字直接吃了填充色的对比度(红 4.83:1、琥珀 3.19:1,后者本来就不过
 * AA)。下面几处例外的共同点是:着色对象是 aria-hidden 的字形或必填星号 —— 是标记不是文案,
 * 按 1.4.11 的 3:1 图形口径走,而不是 4.5:1 的文本口径。
 */
const FILL_TOKEN_AS_TEXT_EXEMPT: Record<string, string> = {
  "primitives/field.tsx": "必填星号 *;同一行的 label 与 error 文案分别走 ink / signal-ink",
  "enterprise/topbar-actions.tsx": "通知条目的 × 关闭字形 hover 变红;可及名称在 aria-label 上,同文件的文案已走 signal-ink",
  "primitives/app-error-state.tsx": "圆标里的 ! 字形,aria-hidden;标题正文走 ink / ink-soft",
  "primitives/toaster.tsx": "OK/!/△/I 变体字形,aria-hidden;toast 正文走 ink",
  "enterprise-local-accounts/create-modal.tsx": "aria-hidden 的必填星号",
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    if (!SCANNED.test(entry.name) || /\.test\./.test(entry.name)) return [];
    return [full];
  });
}

/** 注释里出现"uppercase""11px"是在解释为什么不用,不该被当成违规。 */
function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function scan(): { rel: string; body: string }[] {
  return sourceFiles(SRC_ROOT).map((file) => ({
    rel: path.relative(SRC_ROOT, file).split(path.sep).join("/"),
    body: stripComments(readFileSync(file, "utf8")),
  }));
}

let view: MountedView | null = null;

afterEach(async () => {
  await view?.unmount();
  view = null;
});

describe("套件级排版下限", () => {
  it("除两处图标字形外,src 里没有 12px 以下的文本", () => {
    const offenders = scan().flatMap(({ rel, body }) => {
      if (rel in SUB_12PX_EXEMPT) return [];
      const utility = [...body.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)].filter(
        ([, size]) => Number(size) < 12,
      );
      const css = [...body.matchAll(/font-size:\s*([\d.]+)rem/g)].filter(
        ([, rem]) => Number(rem) < 0.75,
      );
      return [...utility, ...css].map(([match]) => `${rel}: ${match}`);
    });

    expect(offenders).toEqual([]);
  });

  it("src 里不再有 uppercase —— 对 CJK 是空操作,对拉丁是喊话", () => {
    const offenders = scan()
      .filter(({ body }) => /\buppercase\b/.test(body))
      .map(({ rel }) => rel);

    expect(offenders).toEqual([]);
  });

  it("填充档 --signal / --status-pending 不给文字上色(aria-hidden 字形除外)", () => {
    const offenders = scan().flatMap(({ rel, body }) => {
      if (rel in FILL_TOKEN_AS_TEXT_EXEMPT) return [];
      return [...body.matchAll(/text-\[rgb\(var\(--(?:signal|status-pending)\)\)\]/g)].map(
        ([match]) => `${rel}: ${match}`,
      );
    });

    expect(offenders).toEqual([]);
  });
});

describe("标签与眉标题", () => {
  it("Badge:12px、无 uppercase / tracking(状态词是文案,不是编码)", async () => {
    view = await mount(<Badge tone="signal">同步失败</Badge>);
    const badge = view.host.firstElementChild as HTMLElement;

    expect(badge.textContent).toBe("同步失败");
    expect(badge.className).toContain("text-[12px]");
    expect(badge.className).not.toContain("uppercase");
    expect(badge.className).not.toContain("tracking-");
    // 盒子没变:leading-4 + py-0.5 仍然是 22px 高。
    expect(badge.className).toContain("leading-4");
    expect(badge.className).toContain("py-0.5");
  });

  it("Section 序号:12px,且不再把两位数字用 tracking 撑散", async () => {
    view = await mount(
      <Section index="01" title="访问设置">
        <p>正文</p>
      </Section>,
    );
    const index = view.host.querySelector("header span") as HTMLElement;

    expect(index.textContent).toBe("01");
    expect(index.className).toContain("text-[12px]");
    expect(index.className).toContain("tabular-nums");
    expect(index.className).not.toContain("tracking-");
  });

  it("PageHeader:眉标题只靠 .eyebrow 一处定义,meta 行 12px", async () => {
    view = await mount(<PageHeader eyebrow="身份与权限" title="访问设置" meta={<span>ID 42</span>} />);
    const eyebrow = view.host.querySelector(".eyebrow") as HTMLElement;
    const meta = view.host.querySelector("div.font-mono") as HTMLElement;

    expect(eyebrow.textContent).toBe("身份与权限");
    expect(eyebrow.className).toBe("eyebrow mb-1.5");
    expect(meta.className).toContain("text-[12px]");
  });
});

describe("颜色承载文字时用 -ink 档", () => {
  it("InlineNotice 的 error:文字 signal-ink,边框与底色仍是 signal,role=alert 未变", async () => {
    view = await mount(<InlineNotice tone="error" title="导入失败" message="第 3 行邮箱重复" />);
    const notice = view.host.firstElementChild as HTMLElement;

    expect(notice.getAttribute("role")).toBe("alert");
    expect(notice.className).toContain("text-[rgb(var(--signal-ink))]");
    expect(notice.className).toContain("bg-[rgb(var(--signal))]/[0.08]");
    expect(notice.className).toContain("border-[rgb(var(--signal))]/30");
  });

  it("InlineNotice 的 warning:文字 status-pending-ink,边框与底色仍是 status-pending,role=status 未变", async () => {
    view = await mount(<InlineNotice tone="warning" title="同步延迟" message="队列已积压 12 分钟" />);
    const notice = view.host.firstElementChild as HTMLElement;

    expect(notice.getAttribute("role")).toBe("status");
    expect(notice.className).toContain("text-[rgb(var(--status-pending-ink))]");
    expect(notice.className).not.toContain("text-[rgb(var(--status-pending))]");
    expect(notice.className).toContain("bg-[rgb(var(--status-pending))]/[0.12]");
    expect(notice.className).toContain("border-[rgb(var(--status-pending))]/35");
  });

  it("AppErrorState 的 503 圆标是 aria-hidden 字形,所以留在填充档而不是 -ink 档", async () => {
    view = await mount(<AppErrorState kind="resourceUnavailable" title="服务暂不可用" />);
    const icon = view.host.querySelector('[data-test-id="app-error-icon"]') as HTMLElement;

    expect(icon.getAttribute("aria-hidden")).toBe("true");
    expect(icon.className).toContain("text-[rgb(var(--status-pending))]");
    expect(icon.className).not.toContain("status-pending-ink");
    // 这屏真正的文案不吃琥珀色:标题 ink、描述 ink-soft、状态码戳 ink-faint。
    const heading = view.host.querySelector("h1") as HTMLElement;
    expect(heading.className).toContain("text-ink");
  });

  it("AppErrorState 的状态码戳:12px、去掉对数字无效的 uppercase,tracking 是唯一保留的例外", async () => {
    view = await mount(<AppErrorState kind="notFound" title="页面不存在" />);
    const stamp = [...view.host.querySelectorAll("div")].find((el) => el.textContent === "404");

    expect(stamp?.className).toContain("text-[12px]");
    expect(stamp?.className).not.toContain("uppercase");
    // 纯数字 monospace 编码:字距是"逐位读"的设计,不是给译文加的装饰。
    expect(stamp?.className).toContain("tracking-[0.16em]");
  });
});

/**
 * 类名对了不等于对比度对了 —— 令牌值改一次就能把上面那些断言全部架空。所以直接从 theme.css
 * 读值、按 WCAG 2.1 的相对亮度公式算,把注释里写的比值钉成断言。
 */
type Rgb = [number, number, number];

function token(name: string): Rgb {
  const theme = readFileSync(path.join(SRC_ROOT, "theme.css"), "utf8");
  const found = new RegExp(String.raw`--${name}:\s*(\d+)\s+(\d+)\s+(\d+)\s*;`).exec(theme);
  if (!found) throw new Error(`theme.css 里找不到 --${name}`);
  return [Number(found[1]), Number(found[2]), Number(found[3])];
}

function contrast(fg: Rgb, bg: Rgb): number {
  const luminance = (rgb: Rgb) => {
    const [r, g, b] = rgb.map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

/** 半透明色块压在背景上之后的实际像素 —— 通知的底色就是这么来的。 */
function wash(tint: Rgb, base: Rgb, alpha: number): Rgb {
  return tint.map((c, i) => alpha * c + (1 - alpha) * base[i]) as Rgb;
}

describe("-ink 档的对比度(WCAG 2.1)", () => {
  const paper = token("paper");
  const paperDeep = token("paper-deep");

  it.each(["signal-ink", "status-pending-ink"])("--%s 在 paper 与 paper-deep 上都过 AA", (name) => {
    const ink = token(name);

    expect(contrast(ink, paper)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(ink, paperDeep)).toBeGreaterThanOrEqual(4.5);
  });

  it("琥珀文字压在 warning 通知自家 12% 底色上仍过 AA —— 填充档在这里本来是不过的", () => {
    const fill = token("status-pending");
    // InlineNotice 的 warning: bg-[rgb(var(--status-pending))]/[0.12],最差情况是铺在 paper-deep 上。
    const surface = wash(fill, paperDeep, 0.12);

    expect(contrast(token("status-pending-ink"), surface)).toBeGreaterThanOrEqual(4.5);
    // 这一条才是 --status-pending-ink 存在的理由:同一块底色上,填充档只有 2.69:1。
    expect(contrast(fill, surface)).toBeLessThan(3);
  });
});
