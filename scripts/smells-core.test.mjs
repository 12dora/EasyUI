/**
 * 门禁自身的判定逻辑单测。
 *
 * 为什么值得单测:门禁写错不会报错,只会变绿 —— 一条漏掉的回退判定等于把整套阈值静默
 * 关掉。这里盯三件事:基线棘轮的方向性(只准变好)、SLOC 口径(注释 / 模板串 / JSX 注释)、
 * 文件规模分类的优先级。
 */
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  FILE_SLOC_RULE,
  SIZE_THRESHOLDS,
  collectEslintViolations,
  collectSizeIssues,
  compareBaseline,
  countSourceSloc,
  fileThreshold,
  normalizeViolations,
  ruleViolationValue,
} from "./smells-core.mjs";

describe("compareBaseline 棘轮", () => {
  it("与基线完全一致时既不回退也不提示收紧", () => {
    const files = { "src/a.ts": { complexity: [12, 11] } };

    expect(compareBaseline(files, files)).toEqual({ regressions: [], improvements: [] });
  });

  it("同一文件多出一条违规算回退", () => {
    const { regressions } = compareBaseline(
      { "src/a.ts": { complexity: [12, 11] } },
      { "src/a.ts": { complexity: [12] } },
    );

    expect(regressions).toHaveLength(1);
    expect(regressions[0]).toContain("违规 1 -> 2 条");
  });

  it("既存违规数值变差算回退", () => {
    const { regressions } = compareBaseline(
      { "src/a.ts": { complexity: [14] } },
      { "src/a.ts": { complexity: [12] } },
    );

    expect(regressions[0]).toContain("12 -> 14");
  });

  it("基线里没有的文件或规则出现违规算回退", () => {
    const baseline = { "src/a.ts": { complexity: [12] } };

    expect(compareBaseline({ "src/b.ts": { complexity: [11] } }, baseline).regressions).toEqual([
      expect.stringContaining("src/b.ts"),
    ]);
    expect(compareBaseline({ "src/a.ts": { complexity: [12], "no-console": [1] } }, baseline).regressions).toEqual([
      expect.stringContaining("no-console"),
    ]);
  });

  it("变好只提示收紧,不算失败", () => {
    const { regressions, improvements } = compareBaseline(
      { "src/a.ts": { complexity: [11] } },
      { "src/a.ts": { complexity: [12, 12] } },
    );

    expect(regressions).toEqual([]);
    expect(improvements).toEqual([expect.stringContaining("[12,12] -> [11]")]);
  });

  it("文件被修好后基线里的死 key 只是 improvement", () => {
    const { regressions, improvements } = compareBaseline({}, { "src/a.ts": { complexity: [12] } });

    expect(regressions).toEqual([]);
    expect(improvements).toEqual([expect.stringContaining("src/a.ts")]);
  });

  it("数值书写顺序不影响判定(比对前归一化)", () => {
    const { regressions, improvements } = compareBaseline(
      { "src/a.ts": { complexity: [11, 13] } },
      { "src/a.ts": { complexity: [11, 13] } },
    );

    expect({ regressions, improvements }).toEqual({ regressions: [], improvements: [] });
  });

  it("文件规模与 eslint 规则共用一套棘轮", () => {
    const { regressions } = compareBaseline(
      { "src/big.tsx": { [FILE_SLOC_RULE]: [640] } },
      { "src/big.tsx": { [FILE_SLOC_RULE]: [620] } },
    );

    expect(regressions[0]).toContain("620 -> 640");
  });
});

describe("normalizeViolations", () => {
  it("数值降序、路径与规则名排序、空条目丢掉", () => {
    expect(
      normalizeViolations({
        "src/b.ts": { "max-lines": [], complexity: [11, 30, 12] },
        "src/a.ts": { "no-console": [1] },
        "src/empty.ts": {},
      }),
    ).toEqual({
      "src/a.ts": { "no-console": [1] },
      "src/b.ts": { complexity: [30, 12, 11] },
    });
  });
});

describe("collectEslintViolations", () => {
  const cwd = "/repo";

  it("只收 TRACKED_RULES,并按规则解析违规数值", () => {
    const results = [
      {
        filePath: "/repo/src/a.tsx",
        messages: [
          { ruleId: "complexity", message: "Function 'X' has a complexity of 17. Maximum allowed is 10.", line: 3 },
          { ruleId: "max-lines-per-function", message: "Function 'X' has too many lines (204). Maximum allowed is 120.", line: 3 },
          { ruleId: "no-console", message: "Unexpected console statement.", line: 9 },
          { ruleId: "react-hooks/exhaustive-deps", message: "不在门禁名单里", line: 10 },
        ],
      },
    ];

    expect(collectEslintViolations(results, cwd)).toEqual({
      "src/a.tsx": { complexity: [17], "max-lines-per-function": [204], "no-console": [1] },
    });
  });

  it("解析失败(fatal)必须炸,不能当成零违规", () => {
    const results = [{ filePath: "/repo/src/a.ts", messages: [{ fatal: true, message: "Parsing error", line: 1 }] }];

    expect(() => collectEslintViolations(results, cwd)).toThrow(/eslint 解析失败/);
  });

  it("认不出数值的门禁规则消息要炸而不是静默记 1", () => {
    expect(() => ruleViolationValue("complexity", "some unexpected wording")).toThrow(/无法从 eslint 消息里解析数值/);
    expect(ruleViolationValue("@typescript-eslint/no-explicit-any", "Unexpected any.")).toBe(1);
    expect(ruleViolationValue("max-depth", "Blocks are nested too deeply (6). Maximum allowed is 4.")).toBe(6);
    expect(ruleViolationValue("max-params", "Function 'f' has too many parameters (7). Maximum allowed is 5.")).toBe(7);
    expect(ruleViolationValue("max-nested-callbacks", "Too many nested callbacks (5). Maximum allowed is 3.")).toBe(5);
    expect(ruleViolationValue("max-lines", "File has too many lines (612). Maximum allowed is 500.")).toBe(612);
  });
});

describe("countSourceSloc", () => {
  it("跳过空行、行注释与块注释", () => {
    const source = ["const a = 1;", "", "// 注释", "/* 块", "   注释 */", "const b = 2;"].join("\n");

    expect(countSourceSloc(source)).toBe(2);
  });

  it("模板字符串里的注释样子仍算代码", () => {
    const source = ["const copy = `keeps // inside", "keeps /* block-looking */ too`;"].join("\n");

    expect(countSourceSloc(source)).toBe(2);
  });

  it("纯 JSX 注释行不算代码,同行有代码的算", () => {
    const source = [
      "const View = () => (",
      "  <section>",
      "    {/* 纯注释行 */}",
      "    {/* 混排 */}<span />",
      "  </section>",
      ");",
    ].join("\n");

    expect(countSourceSloc(source)).toBe(5);
  });
});

describe("fileThreshold 分类", () => {
  it("按优先级给出档位", () => {
    const category = (rel) => fileThreshold(rel).category;

    expect(category("messages/zh-CN.json")).toBe("messageJson");
    expect(category("src/enterprise/passkeys.behavior.test.tsx")).toBe("test");
    expect(category("tests/helpers/fixtures.ts")).toBe("test");
    expect(category("src/app/[locale]/admin/reports/page.tsx")).toBe("nextRoutePage");
    expect(category("src/app/[locale]/layout.tsx")).toBe("wrapperOrFacade");
    expect(category("src/primitives/index.ts")).toBe("wrapperOrFacade");
    expect(category("src/features/auth/current-user-provider.tsx")).toBe("wrapperOrFacade");
    expect(category("src/primitives/field.tsx")).toBe("production");
    expect(category("src/fixtures/data.json")).toBe("production");
  });

  it("测试文件的档位优先于 Next 路由页(app/ 下的测试不按 250 判)", () => {
    expect(fileThreshold("src/app/[locale]/admin/page.test.tsx").threshold).toBe(SIZE_THRESHOLDS.test);
  });
});

describe("collectSizeIssues", () => {
  it("只报超过所属档位的文件,按 SLOC 降序", () => {
    const root = mkdtempSync(path.join(tmpdir(), "easyui-smells-"));
    const line = "export const x = 1;\n";
    mkdirSync(path.join(root, "src", "app", "admin"), { recursive: true });
    writeFileSync(path.join(root, "src", "index.ts"), line.repeat(SIZE_THRESHOLDS.wrapperOrFacade + 5));
    writeFileSync(path.join(root, "src", "app", "admin", "page.tsx"), line.repeat(SIZE_THRESHOLDS.nextRoutePage + 1));
    writeFileSync(path.join(root, "src", "small.ts"), line.repeat(20));
    writeFileSync(path.join(root, "src", "notes.md"), line.repeat(900));

    const issues = collectSizeIssues(root, ["src"]);

    expect(issues.map((issue) => [issue.path, issue.sloc, issue.threshold])).toEqual([
      ["src/app/admin/page.tsx", 251, SIZE_THRESHOLDS.nextRoutePage],
      ["src/index.ts", 185, SIZE_THRESHOLDS.wrapperOrFacade],
    ]);
  });
});
