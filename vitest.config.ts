import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: import.meta.dirname,
  esbuild: {
    jsx: "automatic",
  },
  test: {
    environment: "node",
    // identity-check 的行为用例把 happy-dom 的 iframe 页面加载关掉(隐藏 iframe 绝不能真的联网),
    // 于是每挂一个 iframe,happy-dom 就往 stderr 打一条 "Iframe page loading is disabled"。
    // 这是环境的既定行为、不是失败,只滤掉这一句;其余日志照常打出来。
    onConsoleLog(log) {
      if (log.includes("Iframe page loading is disabled")) return false;
      return undefined;
    },
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
