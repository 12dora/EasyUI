/**
 * 用户风险:侧栏把 href 原样当成路径比,带 `?query` / `#hash` 的入口点下去就永远
 * 匹配不上真实 pathname,标记会在导航落地前"跳回原处"。
 */
import { describe, expect, it } from "vitest";

import { intentPathOf } from "./nav-intent";

describe("intentPathOf", () => {
  it("原样返回纯路径", () => {
    expect(intentPathOf("/orders")).toBe("/orders");
    expect(intentPathOf("/zh/orders/list")).toBe("/zh/orders/list");
  });

  it("剥掉 query 与 hash", () => {
    expect(intentPathOf("/orders?status=open")).toBe("/orders");
    expect(intentPathOf("/orders#top")).toBe("/orders");
    expect(intentPathOf("/orders?status=open#top")).toBe("/orders");
    expect(intentPathOf("/orders#top?status=open")).toBe("/orders");
  });

  it("不做 locale 改写、不补斜杠", () => {
    expect(intentPathOf("orders")).toBe("orders");
    expect(intentPathOf("/orders/")).toBe("/orders/");
    expect(intentPathOf("?status=open")).toBe("");
  });
});
