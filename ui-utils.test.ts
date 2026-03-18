import { test, expect, describe } from "bun:test";
import { badgeClass, shortCwd, langFromPath } from "./ui-utils";

describe("badgeClass", () => {
  test("Bash", () => expect(badgeClass("Bash")).toBe("badge-bash"));
  test("Write", () => expect(badgeClass("Write")).toBe("badge-write"));
  test("Edit", () => expect(badgeClass("Edit")).toBe("badge-edit"));
  test("ExitPlanMode", () => expect(badgeClass("ExitPlanMode")).toBe("badge-plan"));
  test("EnterPlanMode", () => expect(badgeClass("EnterPlanMode")).toBe("badge-plan"));
  test("unknown defaults", () => expect(badgeClass("Glob")).toBe("badge-default"));
  test("undefined defaults", () => expect(badgeClass(undefined)).toBe("badge-default"));
});

describe("shortCwd", () => {
  test("empty string", () => expect(shortCwd("")).toBe(""));
  test("1 part", () => expect(shortCwd("/foo")).toBe("/foo"));
  test("2 parts", () => expect(shortCwd("/foo/bar")).toBe("/foo/bar"));
  test("3 parts truncates", () => expect(shortCwd("/a/b/c")).toBe("…/b/c"));
  test("deep path", () => expect(shortCwd("/a/b/c/d/e")).toBe("…/d/e"));
});

describe("langFromPath", () => {
  test("ts", () => expect(langFromPath("foo.ts")).toBe("typescript"));
  test("tsx", () => expect(langFromPath("app.tsx")).toBe("typescript"));
  test("js", () => expect(langFromPath("foo.js")).toBe("javascript"));
  test("py", () => expect(langFromPath("script.py")).toBe("python"));
  test("sh", () => expect(langFromPath("run.sh")).toBe("bash"));
  test("yaml", () => expect(langFromPath("config.yaml")).toBe("yaml"));
  test("yml", () => expect(langFromPath("config.yml")).toBe("yaml"));
  test("unknown extension", () => expect(langFromPath("file.xyz")).toBe("plaintext"));
  test("no extension", () => expect(langFromPath("Makefile")).toBe("plaintext"));
});
