import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

const customsRoot = resolve(import.meta.dirname, "../../apps/customs");

export default defineConfig({
  root: customsRoot,
  test: {
    environment: "node",
    globals: false,
    include: [resolve(import.meta.dirname, "src/enterprise/**/*.behavior.test.{ts,tsx}")],
  },
});
