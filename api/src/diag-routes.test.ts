import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleDiagRoutes } from "./diag-routes";

// 诊断日志接收单测：uploadsDir 注入临时目录（绝不触碰 ~/.agents-remote/）。
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const makeUrl = (pathname: string) => new URL(`http://localhost${pathname}`);

const makeRequest = (method: string, pathname: string, body?: unknown) =>
  new Request(`http://localhost${pathname}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

test("POST /api/diag：合法 entries 落盘 + ok:true；文件不含时间戳以外的客户端无关字段", async () => {
  const dir = await mkdtemp(join(tmpdir(), "agents-remote-diag-"));
  tempDirs.push(dir);

  const entries = [
    { t: 1, scope: "replay", text: "init replay=delta anchor=live" },
    { t: 2, scope: "perf", text: "render audit tool=45 withResult=45 interrupted=0" },
  ];
  const res = await handleDiagRoutes(
    makeRequest("POST", "/api/diag", { entries }),
    makeUrl("/api/diag"),
    {
      uploadsDir: dir,
    },
  );
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });

  const files = await readdir(dir);
  expect(files).toHaveLength(1);
  const stored = JSON.parse(await readFile(join(dir, files[0]!), "utf8"));
  expect(stored.entries).toEqual(entries);
});

test("POST /api/diag：entries 缺失/空/超量 → 400", async () => {
  const dir = await mkdtemp(join(tmpdir(), "agents-remote-diag-"));
  tempDirs.push(dir);
  const call = (body: unknown) =>
    handleDiagRoutes(makeRequest("POST", "/api/diag", body), makeUrl("/api/diag"), {
      uploadsDir: dir,
    });

  expect((await call(undefined)).status).toBe(400);
  expect((await call({})).status).toBe(400);
  expect((await call({ entries: [] })).status).toBe(400);
  expect((await call({ entries: [{ t: 1, scope: "replay", text: "x" }] })).status).toBe(200);
  const tooMany = Array.from({ length: 65 }, (_, i) => ({ t: i, scope: "s", text: "x" }));
  expect((await call({ entries: tooMany })).status).toBe(400);
});

test("POST /api/diag：字段形状/超长 → 400（不截断伪造证据）", async () => {
  const dir = await mkdtemp(join(tmpdir(), "agents-remote-diag-"));
  tempDirs.push(dir);
  const call = (entries: unknown[]) =>
    handleDiagRoutes(makeRequest("POST", "/api/diag", { entries }), makeUrl("/api/diag"), {
      uploadsDir: dir,
    });

  expect((await call([{ t: "x", scope: "replay", text: "x" }])).status).toBe(400);
  expect((await call([{ t: 1, scope: "", text: "x" }])).status).toBe(400);
  expect((await call([{ t: 1, scope: "replay", text: "x".repeat(4097) }])).status).toBe(400);
  expect((await call([{ t: 1, scope: "replay" }])).status).toBe(400);
  expect((await call(["str"])).status).toBe(400);
  expect(await readdir(dir)).toHaveLength(0);
});

test("POST /api/diag：body 超 64KB → 413", async () => {
  const dir = await mkdtemp(join(tmpdir(), "agents-remote-diag-"));
  tempDirs.push(dir);
  const big = [{ t: 1, scope: "replay", text: "x".repeat(64 * 1024 + 1) }];
  const res = await handleDiagRoutes(
    makeRequest("POST", "/api/diag", { entries: big }),
    makeUrl("/api/diag"),
    {
      uploadsDir: dir,
    },
  );
  expect(res.status).toBe(413);
  expect(await readdir(dir)).toHaveLength(0);
});

test("POST /api/diag：坏 JSON → 400", async () => {
  const dir = await mkdtemp(join(tmpdir(), "agents-remote-diag-"));
  tempDirs.push(dir);
  const res = await handleDiagRoutes(
    new Request("http://localhost/api/diag", {
      method: "POST",
      body: "{broken",
      headers: { "content-type": "application/json" },
    }),
    makeUrl("/api/diag"),
    { uploadsDir: dir },
  );
  expect(res.status).toBe(400);
});

test("非 /api/diag 路径返回 undefined（不劫持路由链）", async () => {
  const res = await handleDiagRoutes(makeRequest("GET", "/api/other"), makeUrl("/api/other"), {
    uploadsDir: "/tmp/unused-diag-test",
  });
  expect(res).toBeUndefined();
});
