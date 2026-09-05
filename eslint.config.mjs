// EasyUI 自己吃自己的狗粮:本仓的 eslint config = TypeScript parser + 共享坏味道片段。
//
// 片段(eslint.smells.config.mjs)刻意不带 parser / plugins,所以这里负责两件事:
//   1. `tseslint.configs.base` —— 注册 @typescript-eslint 的 parser 与插件(片段里的
//      `@typescript-eslint/no-explicit-any` 需要它);
//   2. scripts/ 下的 .mjs 用内置 espree 解析(不需要 TS parser)。
//
// 门禁不是"eslint 全绿",而是 `pnpm lint`(= easyui-check-smells)按 .code-smells-baseline.json
// 做棘轮比对。宿主怎么接见 docs/GATES.md。
import tseslint from "typescript-eslint";

import smells from "./eslint.smells.config.mjs";

export default [
  { ignores: ["node_modules/**", "**/*.d.ts"] },
  tseslint.configs.base,
  {
    files: ["**/*.{mjs,cjs,js}"],
    languageOptions: { ecmaVersion: "latest", sourceType: "module" },
  },
  ...smells,
];
