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

describe("红色承载文字时用 signal-ink", () => {
  it("InlineNotice 的 error:文字 signal-ink,边框与底色仍是 signal,role=alert 未变", async () => {
    view = await mount(<InlineNotice tone="error" title="导入失败" message="第 3 行邮箱重复" />);
    const notice = view.host.firstElementChild as HTMLElement;

    expect(notice.getAttribute("role")).toBe("alert");
    expect(notice.className).toContain("text-[rgb(var(--signal-ink))]");
    expect(notice.className).toContain("bg-[rgb(var(--signal))]/[0.08]");
    expect(notice.className).toContain("border-[rgb(var(--signal))]/30");
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
