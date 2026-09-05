/**
 * `easyui-check-smells` 的端到端用例(真的 spawn 一次 CLI,真的跑一遍 eslint)。
 *
 * 这里只盯**退出码**,因为门禁的价值全在退出码上:判不了必须是 2,回退必须是 1,而"宿主
 * config 里的其他规则报错"必须**不**影响判定 —— 那条边界是文档承诺(docs/GATES.md),
 * 承诺就得有用例钉住。smells-core.test.mjs 负责纯判定逻辑,这里负责参数与 IO 那一层。
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const CLI = fileURLToPath(new URL("./check-smells.mjs", import.meta.url));

// 宿主 config 的最小替身:一条门禁在管的规则(complexity)+ 一条它不管的(eqeqeq)。
const HOST_CONFIG = `export default [
  {
    files: ["**/*.js"],
    languageOptions: { ecmaVersion: "latest", sourceType: "module" },
    rules: { complexity: ["error", { max: 3 }], eqeqeq: "error" },
  },
];
`;

/** 圈复杂度 4 —— 刚好越过上面配的上限。 */
const COMPLEX_SOURCE = `export function grade(score, bonus) {
  if (score > 90) return "A";
  if (score > 80) return "B";
  if (bonus && score > 70) return "C";
  return "D";
}
`;

function fixture(files = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "easyui-smells-cli-"));
  mkdirSync(path.join(root, "src"), { recursive: true });
  writeFileSync(path.join(root, "eslint.config.mjs"), HOST_CONFIG);
  writeFileSync(path.join(root, ".code-smells-baseline.json"), `${JSON.stringify({ files: {} })}\n`);
  for (const [rel, content] of Object.entries(files)) writeFileSync(path.join(root, rel), content);
  return root;
}

function run(root, args) {
  const result = spawnSync(process.execPath, [CLI, "--no-cache", ...args], { cwd: root, encoding: "utf8" });
  return { code: result.status, output: `${result.stdout}${result.stderr}` };
}

describe("参数校验", () => {
  it("targets 里有不存在的路径 -> 退出码 2", () => {
    const { code, output } = run(fixture(), ["--config", "eslint.config.mjs", "--targets", "src", "scr"]);

    expect(code).toBe(2);
    expect(output).toContain("scr");
    expect(output).toContain("不存在");
  });

  it("末尾悬空的 --config -> 退出码 2,不静默用默认值", () => {
    const { code, output } = run(fixture(), ["--targets", "src", "--config"]);

    expect(code).toBe(2);
    expect(output).toContain("--config");
  });

  it("末尾悬空的 --targets -> 退出码 2,不静默扫零个目录", () => {
    const { code, output } = run(fixture(), ["--config", "eslint.config.mjs", "--targets"]);

    expect(code).toBe(2);
    expect(output).toContain("--targets");
  });

  it("带值开关的值被下一个开关吃掉 -> 退出码 2", () => {
    const { code, output } = run(fixture(), ["--baseline", "--targets", "src"]);

    expect(code).toBe(2);
    expect(output).toContain("--baseline");
  });
});

describe("判定口径", () => {
  it("eslint 解析失败 -> 退出码 2,不当成零违规", () => {
    const root = fixture({ "src/broken.js": "export function (((\n" });

    const { code, output } = run(root, ["--config", "eslint.config.mjs", "--targets", "src"]);

    expect(code).toBe(2);
    expect(output).toContain("eslint 解析失败");
  });

  it("门禁只管坏味道规则:宿主 config 的其他规则报错不影响退出码", () => {
    const root = fixture({ "src/loose.js": "export const same = (a, b) => a == b;\n" });

    const { code, output } = run(root, ["--config", "eslint.config.mjs", "--targets", "src"]);

    expect(code).toBe(0);
    expect(output).not.toContain("eqeqeq");
  });

  it("基线里没有的函数超阈值 -> 退出码 1,且按符号报点位", () => {
    const root = fixture({ "src/grade.js": COMPLEX_SOURCE });

    const { code, output } = run(root, ["--config", "eslint.config.mjs", "--targets", "src"]);

    expect(code).toBe(1);
    expect(output).toContain("src/grade.js::grade");
  });
});
