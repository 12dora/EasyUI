#!/usr/bin/env node
// 代码坏味道门禁 CLI(`easyui-check-smells`)。
//
// 做三件事:
//   1. 用宿主的 eslint config(它应当展开了 `@easy-enterprise/ui/eslint-smells`)跑一遍
//      eslint,只统计 TRACKED_RULES 里的规则;
//   2. 扫描同一批 targets 的文件规模(SLOC 按分类阈值,见 smells-core.mjs);
//   3. 把两者合并成 {key: {规则: [违规数值]}}(key = 文件,函数级规则则是 `文件::函数名`),
//      与 JSON 基线做"只准变好"的棘轮比对。
//
// 注意口径:这个 CLI **只**判定 TRACKED_RULES 里的坏味道规则。宿主 config 里其他规则
// (react-hooks、no-unused-vars、import 顺序 …)报的错这里一条都不会体现,宿主必须另外
// 保留自己的 `eslint` 运行 —— 本 CLI 绿了不等于 lint 干净。详见 docs/GATES.md。
//
// 用法:
//   easyui-check-smells --config eslint.config.mjs --targets src scripts \
//                       --baseline .code-smells-baseline.json [--update] [--no-cache]
//
// 退出码:0 通过(可能带"可收紧基线"提示)/ 1 有回退 / 2 无法判定(eslint 解析失败、缺
// 基线、参数错、`--targets` 指向不存在的路径)。判定不了的时候一定要炸,不能当成零违规
// —— 那是用绿色掩盖问题。
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  FILE_SLOC_RULE,
  addViolation,
  baselineKeyFile,
  collectEslintViolations,
  collectSizeIssues,
  compareBaseline,
  findMissingTargets,
  normalizeViolations,
} from "./smells-core.mjs";

const DEFAULT_BASELINE = ".code-smells-baseline.json";
const DEFAULT_CONFIG = "eslint.config.mjs";
const CACHE_LOCATION = "node_modules/.cache/easyui-check-smells/eslintcache";
const BASELINE_COMMENT =
  "代码坏味道门禁的存量基线,由 easyui-check-smells --update 生成。key 是文件路径,函数级规则" +
  "(complexity / max-lines-per-function)则是 `文件::函数名`(匿名函数为 `文件::<anonymous>#序号`)。" +
  "阈值见 eslint.smells.config.mjs(eslint 规则)与 scripts/smells-core.mjs(文件规模)。这份文件只应该变小。";

const VALUE_FLAGS = { "--baseline": "baseline", "--config": "config", "--cwd": "cwd" };

class UsageError extends Error {}

function parseArgs(argv) {
  const options = {
    targets: [],
    baseline: DEFAULT_BASELINE,
    config: DEFAULT_CONFIG,
    cwd: process.cwd(),
    cache: true,
    update: false,
  };
  const state = { pending: null, flag: null };

  for (const arg of argv) consumeArg(arg, options, state);

  // 末尾悬空的 `--config` / `--baseline` 必须炸:静默沿用默认值等于跑了一个跟命令行不符的门禁。
  if (state.pending && state.pending !== "targets") throw new UsageError(`${state.flag} 后面缺少值。`);
  if (options.targets.length === 0) throw new UsageError("必须用 --targets 指定至少一个扫描目录。");

  assertTargetsExist(options);
  return options;
}

function consumeArg(arg, options, state) {
  if (state.pending === "targets" && !arg.startsWith("--")) {
    options.targets.push(arg);
    return;
  }
  if (state.pending && state.pending !== "targets") {
    // `--config --targets src` 里 `--config` 的值被下一个开关吃掉了 —— 那是笔误,不是空值。
    if (arg.startsWith("--")) throw new UsageError(`${state.flag} 后面缺少值。`);
    options[state.pending] = arg;
    state.pending = null;
    state.flag = null;
    return;
  }
  state.pending = readFlag(arg, options);
  state.flag = state.pending ? arg : null;
}

/**
 * targets 必须真实存在。
 *
 * 拼错一个路径的代价太大:eslint 与 SLOC 扫描都会扫出 0 个文件,比对结果读起来是"存量
 * 全修好了",`--update` 还会顺手把基线洗成空的 —— 门禁从此永远绿。
 */
function assertTargetsExist(options) {
  const missing = findMissingTargets(options.cwd, options.targets);
  if (missing.length === 0) return;
  throw new UsageError(
    `--targets 里这些路径不存在(相对 ${options.cwd}):${missing.join(", ")}。` +
      "\n路径拼错会扫出 0 个文件,看起来像存量全清了 —— 所以这里直接退出,不给假绿。",
  );
}

function readFlag(arg, options) {
  if (arg === "--update") {
    options.update = true;
    return null;
  }
  if (arg === "--no-cache") {
    options.cache = false;
    return null;
  }
  if (arg === "--targets") return "targets";
  if (VALUE_FLAGS[arg]) return VALUE_FLAGS[arg];
  throw new UsageError(`无法识别的参数 ${arg};用法见 scripts/check-smells.mjs 顶部注释。`);
}

/** 优先用宿主自己的 eslint(版本与插件跟它的 config 匹配),兜底用本包的副本。 */
async function loadEslintClass(cwd) {
  try {
    const resolved = createRequire(path.join(cwd, "package.json")).resolve("eslint");
    const mod = await import(pathToFileURL(resolved).href);
    const HostEslint = mod.ESLint ?? mod.default?.ESLint;
    if (HostEslint) return HostEslint;
  } catch {
    // 宿主没装 eslint(或解析失败)就用本包的。
  }
  return (await import("eslint")).ESLint;
}

async function runEslint(options) {
  const ESLint = await loadEslintClass(options.cwd);
  const eslint = new ESLint({
    cwd: options.cwd,
    overrideConfigFile: path.resolve(options.cwd, options.config),
    cache: options.cache,
    cacheLocation: path.resolve(options.cwd, CACHE_LOCATION),
    // 有意保留 eslint 的默认值(true):一个匹配不到任何文件的 target 必须炸,不能静默变成 0 条违规。
    errorOnUnmatchedPattern: true,
  });
  try {
    return await eslint.lintFiles(options.targets);
  } catch (error) {
    throw new UsageError(`eslint 无法完成扫描(config ${options.config} / targets ${options.targets.join(" ")}):${error.message}`);
  }
}

function loadBaseline(baselinePath) {
  if (!existsSync(baselinePath)) {
    throw new UsageError(`缺少基线文件 ${baselinePath};先跑 easyui-check-smells … --update 生成。`);
  }
  try {
    return JSON.parse(readFileSync(baselinePath, "utf8")).files ?? {};
  } catch (error) {
    throw new UsageError(`基线文件无法解析: ${baselinePath} — ${error.message}`);
  }
}

function writeBaseline(baselinePath, files) {
  const payload = { _comment: BASELINE_COMMENT, files: normalizeViolations(files) };
  writeFileSync(baselinePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function countViolations(files) {
  return Object.values(files).reduce(
    (total, rules) => total + Object.values(rules).reduce((sum, values) => sum + values.length, 0),
    0,
  );
}

/** 基线 key 里的不同文件数(函数级规则一个文件会摊成多个 key)。 */
function countFiles(files) {
  return new Set(Object.keys(files).map(baselineKeyFile)).size;
}

function reportRegressions(regressions) {
  console.error(`代码坏味道门禁失败(${regressions.length} 处回退):`);
  for (const line of regressions) console.error(`  - ${line}`);
  console.error(
    "\n阈值见 eslint.smells.config.mjs 与 scripts/smells-core.mjs。请拆函数 / 拆文件,不要改阈值或手改基线;" +
      "\n基线只在存量被修好之后用 --update 收紧。",
  );
}

function reportImprovements(improvements) {
  if (improvements.length === 0) return;
  console.log(`有 ${improvements.length} 处优于基线,可以跑 easyui-check-smells … --update 收紧:`);
  for (const line of improvements.slice(0, 20)) console.log(`  - ${line}`);
  if (improvements.length > 20) console.log(`  ... 另有 ${improvements.length - 20} 处`);
}

async function collectAll(options) {
  const files = collectEslintViolations(await runEslint(options), options.cwd);
  for (const issue of collectSizeIssues(options.cwd, options.targets)) {
    addViolation(files, issue.path, FILE_SLOC_RULE, issue.sloc);
  }
  return files;
}

function updateBaseline(baselinePath, found, options) {
  // --update 只准收紧:先按现有基线判定,有回退就拒绝写,免得一键"洗白"新增欠账。
  if (existsSync(baselinePath)) {
    const { regressions } = compareBaseline(found, loadBaseline(baselinePath), fileExistsIn(options));
    if (regressions.length > 0) {
      reportRegressions(regressions);
      console.error("\n--update 拒绝执行:基线只能变小。先把上面的回退修掉。");
      return 1;
    }
  }
  writeBaseline(baselinePath, found);
  const total = countViolations(found);
  console.log(`基线已更新:${countFiles(found)} 个文件 / ${total} 条存量违规 -> ${options.baseline}`);
  return 0;
}

/** 基线里的死 key(文件已被删掉)只提示收紧,不判失败 —— 见 compareBaseline。 */
function fileExistsIn(options) {
  return { fileExists: (rel) => existsSync(path.resolve(options.cwd, rel)) };
}

async function main(argv) {
  const options = parseArgs(argv);
  const baselinePath = path.resolve(options.cwd, options.baseline);
  const found = await collectAll(options);

  if (options.update) return updateBaseline(baselinePath, found, options);

  const { regressions, improvements } = compareBaseline(found, loadBaseline(baselinePath), fileExistsIn(options));
  if (regressions.length > 0) {
    reportRegressions(regressions);
    return 1;
  }

  console.log(
    `代码坏味道门禁通过:${countFiles(found)} 个文件 / ${countViolations(found)} 条存量违规,未超基线。`,
  );
  reportImprovements(improvements);
  return 0;
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof UsageError ? error.message : (error?.stack ?? String(error)));
  process.exitCode = 2;
}
