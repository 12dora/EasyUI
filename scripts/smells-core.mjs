// `easyui-check-smells` 的纯逻辑内核:SLOC 统计、文件规模分类、基线棘轮比对。
//
// 拆成独立模块是为了能被 vitest 直接单测(见 smells-core.test.mjs)—— 门禁自身的判定逻辑
// 出错是最坏的一类缺陷:它会以"绿"的形式掩盖问题。CLI 的 IO 与 eslint 调用留在
// check-smells.mjs 里。
//
// SLOC 口径从 EasyTrade `frontend/tests/helpers/code-size-scanner.ts` 移植:用 TypeScript
// scanner 逐 token 标记"有代码的行",于是模板字符串里的 `//` 与 `/* */` 仍算代码,而只有
// `{/* … */}` 的 JSX 行不算。
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

/** 文件规模阈值(SLOC)。分类顺序即优先级,先命中先生效。 */
export const SIZE_THRESHOLDS = {
  messageJson: 400,
  test: 400,
  nextRoutePage: 250,
  wrapperOrFacade: 180,
  production: 500,
};

/** 文件规模在基线里的伪规则名(与 eslint 规则共用一套数据结构)。 */
export const FILE_SLOC_RULE = "file-sloc";

/** 走目录时永不进入的目录名。 */
export const IGNORED_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "coverage",
  "test-results",
  "playwright-report",
]);

const SCANNED_EXTENSIONS = /\.(?:ts|tsx|mts|cts|json)$/;

const TRIVIA_TOKENS = new Set([
  ts.SyntaxKind.SingleLineCommentTrivia,
  ts.SyntaxKind.MultiLineCommentTrivia,
  ts.SyntaxKind.NewLineTrivia,
  ts.SyntaxKind.WhitespaceTrivia,
  ts.SyntaxKind.ShebangTrivia,
  ts.SyntaxKind.ConflictMarkerTrivia,
  ts.SyntaxKind.EndOfFileToken,
]);

/** eslint 消息里的违规数值提取。取不到数值的规则按 1 计条数(见 ruleViolationValue)。 */
export const RULE_VALUE_PATTERNS = {
  complexity: /complexity of (\d+)/,
  "max-lines-per-function": /too many lines \((\d+)\)/,
  "max-lines": /too many lines \((\d+)\)/,
  "max-depth": /nested too deeply \((\d+)\)/,
  "max-params": /too many parameters \((\d+)\)/,
  "max-nested-callbacks": /too many nested callbacks \((\d+)\)/i,
};

/** 本门禁统计的 eslint 规则。不在名单里的 eslint 报错不参与判定。 */
export const TRACKED_RULES = [
  "complexity",
  "max-lines-per-function",
  "max-lines",
  "max-depth",
  "max-params",
  "max-nested-callbacks",
  "@typescript-eslint/no-explicit-any",
  "no-console",
  "no-warning-comments",
];

const TRACKED_RULE_SET = new Set(TRACKED_RULES);

/**
 * 一条 eslint 违规折算成基线里的数值:能解析出数字的规则用数字(越大越坏),其余
 * (no-console / no-explicit-any / …)一律记 1,靠"条数"来棘轮。
 */
export function ruleViolationValue(ruleId, message) {
  const pattern = RULE_VALUE_PATTERNS[ruleId];
  if (!pattern) return 1;
  const match = pattern.exec(message);
  if (!match) {
    throw new Error(`无法从 eslint 消息里解析数值: ${ruleId} / ${message}`);
  }
  return Number(match[1]);
}

/**
 * eslint 结果数组 -> {文件相对路径: {规则: [违规数值]}}。
 * fatal(解析失败)一律抛错:统计失真时必须炸,不能当成零违规。
 */
export function collectEslintViolations(results, cwd) {
  const files = {};
  for (const result of results) {
    const rel = toPosixRelative(cwd, result.filePath);
    for (const message of result.messages ?? []) {
      if (message.fatal) {
        throw new Error(`eslint 解析失败: ${rel}:${message.line} ${message.message}`);
      }
      if (!TRACKED_RULE_SET.has(message.ruleId)) continue;
      addViolation(files, rel, message.ruleId, ruleViolationValue(message.ruleId, message.message));
    }
  }
  return files;
}

function toPosixRelative(cwd, filePath) {
  return path.relative(cwd, filePath).split(path.sep).join("/");
}

// ---------------------------------------------------------------- SLOC 统计

/** 源码行数(跳过空行、注释与纯 JSX 注释行)。 */
export function countSourceSloc(content) {
  return getSourceCodeLineNumbers(content).length;
}

/** 含代码的行号(1 起),升序。 */
export function getSourceCodeLineNumbers(content) {
  const lineStarts = getLineStarts(content);
  const codeLines = new Set();
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.JSX, content);

  while (scanner.scan() !== ts.SyntaxKind.EndOfFileToken) {
    const token = scanner.getToken();
    if (TRIVIA_TOKENS.has(token)) continue;
    if (token === ts.SyntaxKind.JsxText && scanner.getTokenText().trim().length === 0) continue;
    markTokenLines(content, lineStarts, scanner.getTokenStart(), scanner.getTokenEnd(), codeLines);
  }

  for (const jsxCommentLine of findJsxCommentOnlyLines(content)) {
    codeLines.delete(jsxCommentLine);
  }

  return Array.from(codeLines).sort((left, right) => left - right);
}

function getLineStarts(content) {
  const starts = [0];
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === "\n") starts.push(index + 1);
  }
  return starts;
}

function lineFromOffset(lineStarts, offset) {
  let low = 0;
  let high = lineStarts.length - 1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const lineStart = lineStarts[middle];
    const nextLineStart = lineStarts[middle + 1] ?? Number.POSITIVE_INFINITY;
    if (offset < lineStart) {
      high = middle - 1;
    } else if (offset >= nextLineStart) {
      low = middle + 1;
    } else {
      return middle + 1;
    }
  }

  return lineStarts.length;
}

function markTokenLines(content, lineStarts, startOffset, endOffset, codeLines) {
  const firstLine = lineFromOffset(lineStarts, startOffset);
  const lastLine = lineFromOffset(lineStarts, Math.max(startOffset, endOffset - 1));
  for (let lineNumber = firstLine; lineNumber <= lastLine; lineNumber += 1) {
    const lineStart = lineStarts[lineNumber - 1] ?? 0;
    const lineEnd = lineStarts[lineNumber] === undefined ? content.length : lineStarts[lineNumber] - 1;
    if (content.slice(lineStart, lineEnd).trim().length > 0) {
      codeLines.add(lineNumber);
    }
  }
}

function findJsxCommentOnlyLines(content) {
  const sourceFile = ts.createSourceFile("source.tsx", content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const lines = content.split(/\r?\n/);
  const lineStarts = getLineStarts(content);
  const commentLines = new Set();

  function markCommentOnlyLines(startOffset, endOffset) {
    const firstLine = lineFromOffset(lineStarts, startOffset);
    const lastLine = lineFromOffset(lineStarts, Math.max(startOffset, endOffset - 1));
    for (let lineNumber = firstLine; lineNumber <= lastLine; lineNumber += 1) {
      const line = lines[lineNumber - 1] ?? "";
      const lineStart = lineStarts[lineNumber - 1] ?? 0;
      const commentStart = Math.max(startOffset, lineStart) - lineStart;
      const commentEnd = Math.min(endOffset, lineStart + line.length) - lineStart;
      const outside = `${line.slice(0, commentStart)}${line.slice(commentEnd)}`;
      if (outside.trim().length === 0) commentLines.add(lineNumber);
    }
  }

  function visit(node) {
    if (ts.isJsxExpression(node) && !node.expression && content.slice(node.pos, node.end).trim().startsWith("{/*")) {
      markCommentOnlyLines(node.pos, node.end);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return Array.from(commentLines).sort((left, right) => left - right);
}

// ------------------------------------------------------- 文件规模分类与扫描

function isMessageJson(rel) {
  return /(?:^|\/)messages\/.*\.json$/.test(rel);
}

function isTestFile(rel) {
  return /(?:^|\/)tests?\//.test(rel) || /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(rel);
}

function isNextRoutePage(rel) {
  return /(?:^|\/)app\/.*\/page\.tsx$/.test(rel);
}

function isWrapperOrFacade(rel) {
  return (
    /(?:^|\/)index\.ts$/.test(rel) ||
    /(?:boundary|facade|guard|provider|wrapper)\.(?:ts|tsx)$/.test(rel) ||
    /(?:^|\/)app\/.*\/layout\.tsx$/.test(rel)
  );
}

/** 文件所属的规模档位。rel 必须是相对仓库根的 POSIX 路径。 */
export function fileThreshold(rel) {
  if (isMessageJson(rel)) {
    return { category: "messageJson", threshold: SIZE_THRESHOLDS.messageJson, reason: "message JSON hard cap" };
  }
  if (isTestFile(rel)) {
    return { category: "test", threshold: SIZE_THRESHOLDS.test, reason: "test/helper hard cap" };
  }
  if (isNextRoutePage(rel)) {
    return { category: "nextRoutePage", threshold: SIZE_THRESHOLDS.nextRoutePage, reason: "Next route page hard cap" };
  }
  if (isWrapperOrFacade(rel)) {
    return {
      category: "wrapperOrFacade",
      threshold: SIZE_THRESHOLDS.wrapperOrFacade,
      reason: "wrapper/facade hard cap",
    };
  }
  return { category: "production", threshold: SIZE_THRESHOLDS.production, reason: "production source hard cap" };
}

/** 递归收集受扫描的文件绝对路径。root 可以是目录也可以是单个文件。 */
export function walkFiles(root) {
  const stat = statSync(root, { throwIfNoEntry: false });
  if (!stat) return [];
  if (!stat.isDirectory()) return SCANNED_EXTENSIONS.test(root) ? [root] : [];

  return readdirSync(root).flatMap((entry) => {
    if (IGNORED_DIRECTORIES.has(entry)) return [];
    return walkFiles(path.join(root, entry));
  });
}

/**
 * targets 下超过所属档位阈值的文件,按 SLOC 降序。
 * -> [{ path, sloc, threshold, category, reason }]
 */
export function collectSizeIssues(cwd, targets) {
  return targets
    .flatMap((target) => walkFiles(path.resolve(cwd, target)))
    .map((filePath) => {
      const rel = toPosixRelative(cwd, filePath);
      return { path: rel, sloc: countSourceSloc(readFileSync(filePath, "utf8")), ...fileThreshold(rel) };
    })
    .filter((issue) => issue.sloc > issue.threshold)
    .sort((left, right) => right.sloc - left.sloc || left.path.localeCompare(right.path));
}

// ------------------------------------------------------------------ 基线棘轮

/**
 * 把 {文件: {规则: number[]}} 归一化:数值降序、文件与规则名排序、空条目丢掉。
 * 比对与写盘都走这里,于是基线里数值的书写顺序不影响判定。
 */
export function normalizeViolations(files) {
  const entries = Object.entries(files ?? {})
    .map(([filePath, rules]) => [filePath, normalizeFileRules(rules)])
    .filter(([, rules]) => Object.keys(rules).length > 0)
    .sort(([left], [right]) => left.localeCompare(right));
  return Object.fromEntries(entries);
}

function normalizeFileRules(rules) {
  const entries = Object.entries(rules ?? {})
    .map(([rule, values]) => [rule, [...(values ?? [])].sort((left, right) => right - left)])
    .filter(([, values]) => values.length > 0)
    .sort(([left], [right]) => left.localeCompare(right));
  return Object.fromEntries(entries);
}

/** 把一条违规累加进 {文件: {规则: number[]}} 结构。 */
export function addViolation(files, filePath, rule, value) {
  const rules = (files[filePath] ??= {});
  (rules[rule] ??= []).push(value);
  return files;
}

/**
 * 基线比对(只准变好):
 *   - 某文件某规则的违规条数比基线多 -> 回退
 *   - 既存违规的数值比基线更差       -> 回退
 *   - 基线里没有的文件 / 规则出现违规 -> 回退
 *   - 比基线好                      -> improvement,门禁仍然通过
 */
export function compareBaseline(found, baseline) {
  const current = normalizeViolations(found);
  const frozen = normalizeViolations(baseline);
  const regressions = [];
  const improvements = [];

  for (const filePath of sortedUnion(current, frozen)) {
    const currentRules = current[filePath] ?? {};
    const frozenRules = frozen[filePath] ?? {};
    for (const rule of sortedUnion(currentRules, frozenRules)) {
      const now = currentRules[rule] ?? [];
      const was = frozenRules[rule] ?? [];
      const verdict = compareValues(now, was);
      if (verdict === "regression") {
        regressions.push(formatRegression(filePath, rule, now, was));
      } else if (verdict === "improvement") {
        improvements.push(`${filePath} [${rule}] ${JSON.stringify(was)} -> ${JSON.stringify(now)}`);
      }
    }
  }

  return { regressions, improvements };
}

function compareValues(now, was) {
  if (now.length > was.length) return "regression";
  if (now.some((value, index) => value > was[index])) return "regression";
  if (now.length < was.length || now.some((value, index) => value !== was[index])) return "improvement";
  return "same";
}

function formatRegression(filePath, rule, now, was) {
  if (now.length > was.length) {
    return `${filePath} [${rule}] 违规 ${was.length} -> ${now.length} 条;当前数值 ${JSON.stringify(now)}`;
  }
  const worse = now
    .map((value, index) => [was[index], value])
    .filter(([baselineValue, value]) => value > baselineValue)
    .map(([baselineValue, value]) => `${baselineValue} -> ${value}`);
  return `${filePath} [${rule}] 既存违规继续变差:${worse.join(", ")}(基线 ${JSON.stringify(was)})`;
}

function sortedUnion(left, right) {
  return Array.from(new Set([...Object.keys(left), ...Object.keys(right)])).sort();
}
