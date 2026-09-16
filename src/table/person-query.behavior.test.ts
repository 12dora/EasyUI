/**
 * User risk: this is the only person matcher every host shares, so "search 胡玉琴"
 * has to mean the same thing everywhere. Three things have to hold: the full
 * pinyin and the initials both find the person; a CJK keyword still matches the
 * name (and never reaches the pinyin columns); and rows whose pinyin columns are
 * missing keep being findable by name instead of vanishing from the list.
 */
import { describe, expect, it } from "vitest";

import { matchesPersonQuery, normalizeQuery } from "./person-query";

const HU = { name: "胡玉琴A", namePinyin: "huyuqina", namePinyinInitials: "hyqa" };

describe("normalizeQuery", () => {
  it("trims and lowercases", () => {
    expect(normalizeQuery("  HuYuQin  ")).toBe("huyuqin");
  });

  it("collapses a blank query to an empty string", () => {
    expect(normalizeQuery("   ")).toBe("");
  });
});

describe("matchesPersonQuery", () => {
  it("matches everyone on an empty query", () => {
    expect(matchesPersonQuery("", HU)).toBe(true);
    expect(matchesPersonQuery("   ", HU)).toBe(true);
  });

  it("matches the full pinyin, including a prefix", () => {
    expect(matchesPersonQuery("huyuqin", HU)).toBe(true);
    expect(matchesPersonQuery("HuYu", HU)).toBe(true);
  });

  it("matches the initials", () => {
    expect(matchesPersonQuery("hyq", HU)).toBe(true);
    expect(matchesPersonQuery("HYQA", HU)).toBe(true);
  });

  it("ignores spaces inside a latin query", () => {
    expect(matchesPersonQuery("hu yu qin", HU)).toBe(true);
    expect(matchesPersonQuery("h y q", HU)).toBe(true);
  });

  it("matches a name that carries latin characters itself", () => {
    expect(matchesPersonQuery("a", { name: "胡玉琴A" })).toBe(true);
    expect(matchesPersonQuery("zw", { name: "Zhang Wei" })).toBe(false);
    expect(matchesPersonQuery("zhang", { name: "Zhang Wei" })).toBe(true);
  });

  it("matches a CJK query against the name only", () => {
    expect(matchesPersonQuery("玉琴", HU)).toBe(true);
    expect(matchesPersonQuery("玉琴", { name: "张伟", namePinyin: "zhangwei", namePinyinInitials: "zw" })).toBe(false);
  });

  it("does not let a CJK query reach the pinyin columns", () => {
    expect(matchesPersonQuery("胡y", HU)).toBe(false);
  });

  it("falls back to the name when the pinyin columns are missing", () => {
    expect(matchesPersonQuery("玉琴", { name: "胡玉琴A" })).toBe(true);
    expect(matchesPersonQuery("hyq", { name: "胡玉琴A" })).toBe(false);
    expect(matchesPersonQuery("hyq", { name: "胡玉琴A", namePinyin: null, namePinyinInitials: null })).toBe(false);
  });

  it("misses when neither the name nor the pinyin contains the query", () => {
    expect(matchesPersonQuery("lisi", HU)).toBe(false);
    expect(matchesPersonQuery("李四", HU)).toBe(false);
  });

  it("matches digits inside a name", () => {
    expect(matchesPersonQuery("2", { name: "张伟2", namePinyin: "zhangwei", namePinyinInitials: "zw" })).toBe(true);
  });
});
