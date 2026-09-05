import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: import.meta.dirname,
  esbuild: {
    jsx: "automatic",
  },
  test: {
    environment: "node",
    globals: false,
    include: [
      resolve(import.meta.dirname, "src/**/*.test.{ts,tsx}"),
      // 门禁脚本自身的单测(纯 .mjs 逻辑,见 scripts/smells-core.test.mjs)。
      resolve(import.meta.dirname, "scripts/**/*.test.mjs"),
    ],
    exclude: [
      // 这两个用例 import 宿主仓 EasyCustoms 的页面(../../apps/customs/...),
      // 只能在宿主 monorepo 里跑;独立仓中排除,迁回宿主前不要加回来。
      "**/timestamp-consumer.behavior.test.tsx",
      "**/overflow.behavior.test.tsx",
      "**/node_modules/**",
    ],
  },
});
