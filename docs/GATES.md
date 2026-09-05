# 代码坏味道门禁(EasyUI 共享口径)

EasyUI 把「函数规模 / 圈复杂度 / 文件规模」这套门禁定义在包里,宿主直接继承,不用各自
抄一份阈值。两个交付物:

- `@easy-enterprise/ui/eslint-smells` —— eslint flat-config **片段**(`eslint.smells.config.mjs`),
  只有规则,没有 parser / plugins / ignores;
- `easyui-check-smells` —— bin(`scripts/check-smells.mjs`),跑 eslint + 文件规模扫描,
  再跟 JSON 基线做棘轮比对。

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
| Next 路由页 | `app/**/page.tsx` | 250 |
| wrapper / facade | `index.ts`、`*.{boundary,facade,guard,provider,wrapper}.{ts,tsx}`、`app/**/layout.tsx` | 180 |
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

退出码:`0` 通过 / `1` 有回退 / `2` 无法判定(eslint 解析失败、缺基线、参数错)。判定不了
一定炸,不能当成零违规 —— 那是用绿色掩盖问题。

## 棘轮规则(只准变好)

基线存的是**每文件每规则的违规数值列表**,不存行号(代码上下移动不该让门禁变红),比对
前按数值降序归一化,所以书写顺序不影响判定。

- 新文件出现违规、某文件某规则违规条数变多 → 红;
- 既存违规的数值变大(函数更复杂 / 更长、文件更大)→ 红;
- 优于基线 → 绿,并提示可以 `--update` 收紧;
- `--update` 会先按现有基线判定,**有回退就拒绝写**,所以基线只可能变小。

存量欠账只能通过重构变小,不准改阈值、不准手改基线数字。EasyUI 自己的存量冻结在
`.code-smells-baseline.json`(25 个文件 / 62 条:35 圈复杂度、17 超长函数、4 个超 500 SLOC
的文件),CI 见 `.github/workflows/gates.yml`。
