// McpCapabilitiesStore 单测：文件级语义（惰性导入 / 原子落盘 / 级联清理）。
// 断言锚在磁盘 JSON 与 get() 返回值上——store 的唯一对外契约就是这两面。

import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { McpCapabilitiesStore } from "./mcp-capabilities-store";

let root: string;
let path: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "ar-mcp-capabilities-"));
  await mkdir(join(root, "demo"), { recursive: true });
  path = join(root, ".capabilities.json");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const store = () => new McpCapabilitiesStore({ path, projectsRoot: root });

const writeLegacyConfig = async (capabilities: object) => {
  const dir = join(root, "demo", ".agents-remote");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "mcp.json"), JSON.stringify({ capabilities }));
};

const readFileJson = async () => JSON.parse(await readFile(path, "utf8"));

test("no record + no legacy mcp.json → all disabled", async () => {
  expect(await store().get("demo")).toEqual({});
  // 惰性导入落盘：imported 标记在场，此后 mcp.json 不再参与判定。
  const file = await readFileJson();
  expect(file.projects.demo).toEqual({ capabilities: {}, imported: true });
});

test("lazily imports legacy mcp.json once, then ignores the file", async () => {
  await writeLegacyConfig({ wiki: true, ui: true });
  const s = store();
  expect(await s.get("demo")).toEqual({ wiki: true, ui: true });

  // 导入后改 mcp.json 不再生效（真相源已迁到内部状态）。
  await writeLegacyConfig({ wiki: false, ui: false, admin: true });
  expect(await s.get("demo")).toEqual({ wiki: true, ui: true });
});

test("invalid legacy mcp.json imports as all-disabled instead of retrying", async () => {
  const dir = join(root, "demo", ".agents-remote");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "mcp.json"), "{ not json");
  expect(await store().get("demo")).toEqual({});
  expect((await readFileJson()).projects.demo.imported).toBe(true);
});

test("set merges into existing state and survives a new store instance", async () => {
  await store().set("demo", "wiki", true);
  expect(await store().set("demo", "skills", true)).toEqual({ wiki: true, skills: true });
  // 新实例（模拟 API 重启）读到同一份状态。
  expect(await store().get("demo")).toEqual({ wiki: true, skills: true });
  // 显式 false 也要落盘（与「未设置」区分：能力域菜单要报 disabled）。
  expect(await store().set("demo", "wiki", false)).toEqual({ wiki: false, skills: true });
});

test("set preserves lazily-imported values (import before write)", async () => {
  await writeLegacyConfig({ ui: true });
  // 首次写入前必须先把存量导入进来，否则只会剩这一个键。
  expect(await store().set("demo", "wiki", true)).toEqual({ ui: true, wiki: true });
});

test("removeProject clears only that project", async () => {
  await mkdir(join(root, "other"), { recursive: true });
  await store().set("demo", "wiki", true);
  await store().set("other", "ui", true);
  await store().removeProject("demo");
  expect(await store().get("demo")).toEqual({});
  expect(await store().get("other")).toEqual({ ui: true });
});

test("renameProject moves state to the new name", async () => {
  await mkdir(join(root, "renamed"), { recursive: true });
  await store().set("demo", "wiki", true);
  await store().renameProject("demo", "renamed");
  expect(await store().get("renamed")).toEqual({ wiki: true });
  // 旧名无记录 → 惰性导入（新目录无 mcp.json → 全关）。
  expect(await store().get("demo")).toEqual({});
});

test("corrupted state file degrades to empty (fails closed)", async () => {
  await writeFile(path, "<<<corrupt>>>");
  expect(await store().get("demo")).toEqual({});
  // 读坏后仍可写：恢复成合法 JSON。
  await store().set("demo", "wiki", true);
  expect(await store().get("demo")).toEqual({ wiki: true });
});

test("unknown capability keys in the file are ignored", async () => {
  await writeFile(
    path,
    JSON.stringify({
      projects: { demo: { capabilities: { wiki: true, browser: true }, imported: true } },
    }),
  );
  expect(await store().get("demo")).toEqual({ wiki: true });
});
