// EasyUI 共享「代码坏味道」门禁规则片段(flat config fragment)。
//
// 这份 config **不做任何 parser 假设**:没有 languageOptions、没有 plugins 注册、没有
// ignores。宿主把自己的 base config(Next / typescript-eslint / …)放在前面,再把它展开
// 在后面,于是 parser、globals、ignore 名单全部沿用宿主的既有口径:
//
//     import base from "./eslint.config.base.mjs";
//     import smells from "@easy-enterprise/ui/eslint-smells";
//     export default [...base, ...smells];
//
// 唯一的前置条件:数组里必须有人注册过 `@typescript-eslint` 插件(`next/typescript`、
// `typescript-eslint` 的任一 configs、或手写 `plugins` 都算),因为下面用了
// `@typescript-eslint/no-explicit-any`。本片段刻意不自己注册:flat config 里同名插件被两个
// 不同实例注册会直接抛 "Cannot redefine plugin",而宿主几乎一定已经注册过了。
//
// 阈值全部导出为常量,要在文档 / 测试里引用数字请 import,不要抄字面量。
// 门禁怎么跑见 docs/GATES.md;基线棘轮由 `easyui-check-smells` 负责。

/** 圈复杂度上限。与后端 ruff 的 [tool.ruff.lint.mccabe] max-complexity 对齐。 */
export const MAX_COMPLEXITY = 10;
/** 单函数行数上限(.ts / .mjs 等纯逻辑文件)。 */
export const MAX_LINES_TS = 80;
/** 单函数行数上限(.tsx / .jsx):JSX 会把同一件事摊成更多行,所以放宽到 120。 */
export const MAX_LINES_TSX = 120;
/** 单文件行数上限(eslint 口径,跳过空行与注释)。 */
export const MAX_LINES_FILE = 500;
/** 块嵌套深度上限。 */
export const MAX_DEPTH = 4;
/** 函数形参个数上限(超过就该收进一个对象参数)。 */
export const MAX_PARAMS = 5;
/** 回调嵌套层数上限。测试文件豁免(describe / it / beforeEach 天生就是嵌套回调)。 */
export const MAX_NESTED_CALLBACKS = 3;
/** `no-warning-comments` 盯的词:欠账要进 issue,不许留在代码里。 */
export const WARNING_COMMENT_TERMS = ["todo", "fixme", "xxx", "hack"];

/** 测试文件 glob:回调嵌套上限在这里豁免。 */
export const TEST_FILE_PATTERNS = ["**/*.test.*", "**/tests/**"];
/** 脚本目录 glob:`no-console` 在这里豁免(CLI 就是靠 stdout 说话的)。 */
export const SCRIPT_FILE_PATTERNS = ["scripts/**", "**/scripts/**"];

const lengthOptions = (max) => ({ max, skipBlankLines: true, skipComments: true, IIFEs: true });

const SHARED_RULES = {
  "max-lines": ["error", { max: MAX_LINES_FILE, skipBlankLines: true, skipComments: true }],
  "max-depth": ["error", { max: MAX_DEPTH }],
  "max-params": ["error", { max: MAX_PARAMS }],
  "max-nested-callbacks": ["error", { max: MAX_NESTED_CALLBACKS }],
  "no-console": "error",
  "no-warning-comments": ["error", { terms: WARNING_COMMENT_TERMS, location: "anywhere" }],
};

/** 规则片段。顺序有意义:后面的对象覆盖前面的,两个豁免块必须留在最后。 */
export const smellsConfig = [
  {
    name: "easyui/smells/logic",
    files: ["**/*.{ts,mts,cts,js,mjs,cjs}"],
    rules: {
      ...SHARED_RULES,
      complexity: ["error", { max: MAX_COMPLEXITY }],
      "max-lines-per-function": ["error", lengthOptions(MAX_LINES_TS)],
    },
  },
  {
    name: "easyui/smells/jsx",
    files: ["**/*.{tsx,jsx}"],
    rules: {
      ...SHARED_RULES,
      complexity: ["error", { max: MAX_COMPLEXITY }],
      "max-lines-per-function": ["error", lengthOptions(MAX_LINES_TSX)],
    },
  },
  {
    // `any` 只在 TypeScript 文件里有意义;.mjs / .js 走不到这条规则,也就不需要插件。
    name: "easyui/smells/typescript",
    files: ["**/*.{ts,mts,cts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    name: "easyui/smells/tests-exempt",
    files: TEST_FILE_PATTERNS,
    rules: {
      "max-nested-callbacks": "off",
    },
  },
  {
    name: "easyui/smells/scripts-exempt",
    files: SCRIPT_FILE_PATTERNS,
    rules: {
      "no-console": "off",
    },
  },
];

export default smellsConfig;
