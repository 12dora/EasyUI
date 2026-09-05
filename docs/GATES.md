# 代码坏味道门禁(EasyUI 共享口径)

EasyUI 把「函数规模 / 圈复杂度 / 文件规模」这套门禁定义在包里,宿主直接继承,不用各自
抄一份阈值。两个交付物:

- `@easy-enterprise/ui/eslint-smells` —— eslint flat-config **片段**(`eslint.smells.config.mjs`),
  只有规则,没有 parser / plugins / ignores;
- `easyui-check-smells` —— bin(`scripts/check-smells.mjs`),跑 eslint + 文件规模扫描,
  再跟 JSON 基线做棘轮比对。

## 边界:它只判坏味道,不替代宿主的 eslint

**`easyui-check-smells` 只统计下表里的那几条规则。** 它虽然用宿主的 config 跑了一遍 eslint,
但只挑 `TRACKED_RULES`(圈复杂度、函数 / 文件规模、`no-explicit-any`、`no-console`、
`no-warning-comments`)进判定;宿主 config 里其余规则报的错 —— `react-hooks/rules-of-hooks`、
`no-unused-vars`、import 顺序、jsx-a11y …… —— 一条都不会体现在它的输出和退出码里。

这是有意的:棘轮的语义是"存量冻结、只准变小",而 `react-hooks` 这类正确性规则不该有存量,
更不该被一份基线合法化。所以:

> **宿主必须在 `easyui-check-smells` 之外保留自己的 `eslint` / `next lint` 步骤。**
> 本 CLI 绿了只说明坏味道没变差,不说明 lint 干净。

```json
{
  "scripts": {
    "lint": "next lint && easyui-check-smells --config eslint.config.mjs --targets src app"
  }
}
```

唯一不会被漏掉的例外是**解析失败**:eslint 只要吐出一条 `fatal` 消息(语法错、parser 配错、
tsconfig 没覆盖到该文件),CLI 立刻退出码 `2` —— 一个解析不了的文件在统计里长得跟"零违规"
一模一样,那正是必须炸掉的情况。用例见 `scripts/check-smells.cli.test.mjs`。

## 依赖

片段与 CLI 都从**宿主的**依赖树里加载工具链,所以它们是 peer 依赖:

| 包 | 版本 | 谁用 |
| --- | --- | --- |
| `eslint` | ≥ 9 | 片段是 flat config;CLI 优先 `require` 宿主的 eslint,插件版本才对得上 |
| `typescript` | ≥ 5 | `scripts/smells-core.mjs` 用 `ts.createScanner` 数 SLOC |

本仓自己跑门禁用的是同名 devDependencies(`eslint` 9.39.4 / `typescript` ^5)。

## 阈值

| 项 | 阈值 | 备注 |
| --- | --- | --- |
| `complexity` | 10 | 与后端 ruff `max-complexity` 对齐 |
| `max-lines-per-function` | 80(`.ts`)/ 120(`.tsx`) | 跳空行与注释,含 IIFE |
| `max-lines` | 500 | 跳空行与注释 |
| `max-depth` | 4 | |
| `max-params` | 5 | 再多就收进一个对象参数 |
| `max-nested-callbacks` | 3 | `**/*.test.*`、`**/tests/**` 豁免 |
| `@typescript-eslint/no-explicit-any` | error | 需要宿主已注册该插件 |
| `no-console` | error | `scripts/**` 豁免 |
| `no-warning-comments` | error | `todo` / `fixme` / `xxx` / `hack`,欠账进 issue |

文件规模(SLOC,口径同 EasyTrade `code-size-static.spec.ts`:跳空行、注释与纯 `{/* */}`
JSX 注释行,模板字符串里的注释样子仍算代码),按分类取最先命中的档位:

| 分类 | 判定 | 阈值 |
| --- | --- | --- |
| message JSON | `messages/**/*.json` | 400 |
| 测试 / 夹具 | `tests?/` 目录或 `*.test.*` / `*.spec.*` | 400 |
| Next 路由页 | `app/**/page.tsx`,路由段可以一个都没有(`app/page.tsx`、`src/app/page.tsx` 也算) | 250 |
| wrapper / facade | `index.ts`、`*.{boundary,facade,guard,provider,wrapper}.{ts,tsx}`、`app/**/layout.tsx`(同样含 `app/layout.tsx`) | 180 |
| 生产代码 | 其余 `.ts` / `.tsx` / `.json` | 500 |

阈值都从 `eslint.smells.config.mjs`(eslint 规则)与 `scripts/smells-core.mjs`
(`SIZE_THRESHOLDS`)导出为常量,文档 / 测试要引用数字请 import,不要抄字面量。

## 宿主怎么接

`eslint.config.mjs`(片段放最后,于是 parser、globals、ignore 全沿用宿主自己的 base config;
前面必须有人注册过 `@typescript-eslint` 插件 —— `next/typescript` 或 `typescript-eslint` 的
任一 configs 都算):

```js
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import smells from "@easy-enterprise/ui/eslint-smells";

export default [...nextVitals, ...nextTs, ...smells];
```

`package.json`:

```json
{
  "scripts": {
    "lint": "easyui-check-smells --config eslint.config.mjs --targets src app --baseline .code-smells-baseline.json"
  }
}
```

首次落地:先 `pnpm lint --update`(或直接 `easyui-check-smells … --update`)把存量欠账冻结
进基线,然后把基线提交。CLI 参数:

- `--config <path>` 宿主的 eslint config(必须是展开了本片段的那份);
- `--targets <dir…>` 扫描目录,显式列举 —— 不要写 `.`,submodule / 生成物不该进门禁;
- `--baseline <path>` 基线 JSON,默认 `.code-smells-baseline.json`;
- `--update` 重写基线(只准变小,见下);
- `--no-cache` 关掉 eslint 缓存(默认开,缓存落在 `node_modules/.cache/easyui-check-smells/`)。

`--targets` 里的每个路径都会先做存在性校验,不存在直接退出码 `2`;带值的开关(`--config` /
`--targets` / `--baseline` / `--cwd`)后面缺值同样是 `2`。理由:一个拼错的目录会扫出 0 个文件,
比对结果读起来像"存量全修好了",`--update` 还会顺手把基线洗成空的 —— 门禁从此永远绿。

退出码:`0` 通过 / `1` 有回退 / `2` 无法判定(eslint 解析失败、缺基线、参数错、target 不存在)。
判定不了一定炸,不能当成零违规 —— 那是用绿色掩盖问题。

## 棘轮规则(只准变好)

基线不存行号(代码上下移动不该让门禁变红),比对前按数值降序归一化,所以书写顺序不影响判定。
key 分两种:

| 规则 | 基线 key | 值 |
| --- | --- | --- |
| `complexity`、`max-lines-per-function` | `文件::<函数名>`,eslint 消息没给名字(箭头函数)时是 `文件::<anonymous>#<该文件内匿名违规的序号>` | 该函数的数值 |
| `max-lines`、`file-sloc` 等文件级指标 | `文件` | 数值列表 |

函数级规则按符号分桶,是因为按文件堆一个数组时数值只能按大小配对:删掉一个复杂函数、同时
另一个函数变得更复杂,两者会在数组里互相抵消,门禁看不出回退。分桶之后:

- 某个符号消失(函数被删 / 改名 / 修好)→ **永远不算回退**,只提示可以收紧;
- 基线里没有的符号出现违规(新写了一个超阈值的函数)→ 红;
- 同一个符号的数值变大 → 红。

其余判定:

- 新文件出现违规、某 key 某规则违规条数变多 → 红;
- 既存违规的数值变大(函数更复杂 / 更长、文件更大)→ 红;
- 优于基线 → 绿,并提示可以 `--update` 收紧;
- 基线里的文件**已经不存在**(文件被删或移出 targets)→ 死 key,同样只提示收紧,不判失败;
- `--update` 会先按现有基线判定,**有回退就拒绝写**,所以基线只可能变小。

存量欠账只能通过重构变小,不准改阈值、不准手改基线数字。EasyUI 自己的存量冻结在
`.code-smells-baseline.json`(48 个 key / 25 个文件 / 62 条:35 圈复杂度、17 超长函数、
4 个超 500 SLOC 的文件、4 个 `max-lines`、2 处回调嵌套),CI 见 `.github/workflows/gates.yml`。
