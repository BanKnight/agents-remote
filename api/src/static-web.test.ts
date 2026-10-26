// 静态 web 产物 serve 测试（部署形态批）：fixture 是手工构造的最小 dist（index.html
// + 一个 hash 文件名的 asset + sw.js），逐条覆盖缓存策略、SPA fallback、路径穿越
// 拒绝与关闭语义（WEB_DIST_DIR 未配置）。
import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createStaticWebHandler, resolveWebDistDir } from "./static-web";

let dist: string;

beforeEach(async () => {
  dist = await mkdtemp(join(tmpdir(), "agents-remote-static-"));
  await mkdir(join(dist, "assets"));
  await writeFile(join(dist, "index.html"), "<!doctype html><html><body>spa</body></html>");
  await writeFile(join(dist, "sw.js"), "self.addEventListener('install', () => {});");
  await writeFile(join(dist, "assets", "app-a1b2c3.js"), "console.log('app')");
});

afterEach(async () => {
  await rm(dist, { recursive: true, force: true });
});

const handler = () => createStaticWebHandler(dist);
const get = (pathname: string, init?: RequestInit) =>
  new Request(`http://localhost${pathname}`, init);

test("根路径 → SPA 壳 index.html（no-cache）", async () => {
  const res = await handler()("/", get("/"));
  expect(res).not.toBeUndefined();
  expect(res!.status).toBe(200);
  expect(await res!.text()).toContain("spa");
  expect(res!.headers.get("Cache-Control")).toBe("no-cache");
});

test("/assets/*（hash 文件名）→ immutable 长缓存", async () => {
  const res = await handler()("/assets/app-a1b2c3.js", get("/assets/app-a1b2c3.js"));
  expect(res!.status).toBe(200);
  expect(await res!.text()).toBe("console.log('app')");
  expect(res!.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
});

test("/sw.js → 200 且 no-cache（PWA autoUpdate 依赖每次校验）", async () => {
  const res = await handler()("/sw.js", get("/sw.js"));
  expect(res!.status).toBe(200);
  expect(res!.headers.get("Cache-Control")).toBe("no-cache");
});

test("未知无扩展名路径 → SPA fallback 到 index.html", async () => {
  const res = await handler()("/projects/demo/session/s1", get("/projects/demo/session/s1"));
  expect(res!.status).toBe(200);
  expect(await res!.text()).toContain("spa");
  expect(res!.headers.get("Cache-Control")).toBe("no-cache");
});

test("未知有扩展名路径 → 404（不吞坏 asset 链接）", async () => {
  expect((await handler()("/missing.png", get("/missing.png")))?.status).toBe(404);
});

test("目录无 index.html → 404（无目录列表）", async () => {
  await mkdir(join(dist, "empty-dir"));
  expect((await handler()("/empty-dir", get("/empty-dir")))?.status).toBe(404);
});

test("路径穿越拒绝：%2e%2e 编码段与 null byte → 404", async () => {
  expect((await handler()("/%2e%2e/etc/passwd", get("/%2e%2e/etc/passwd")))?.status).toBe(404);
  expect(
    (await handler()("/assets/%2e%2e/%2e%2e/etc/passwd", get("/assets/%2e%2e/%2e%2e/etc/passwd")))
      ?.status,
  ).toBe(404);
  const nullByte = "/index.html%00.png";
  expect((await handler()(nullByte, get(nullByte)))?.status).toBe(404);
});

test("symlink 指向 dist 外 → resolve 前缀校验拦下（404）", async () => {
  const outside = await mkdtemp(join(tmpdir(), "agents-remote-static-outside-"));
  try {
    await writeFile(join(outside, "secret.txt"), "leak");
    await symlink(join(outside, "secret.txt"), join(dist, "leak.txt"));
    expect((await handler()("/leak.txt", get("/leak.txt")))?.status).toBe(404);
  } finally {
    await rm(outside, { recursive: true, force: true });
  }
});

test("HEAD → 200 无 body；POST → undefined（交回调用方管道）", async () => {
  const head = await handler()("/", get("/", { method: "HEAD" }));
  expect(head!.status).toBe(200);
  expect(await head!.text()).toBe("");
  expect(await handler()("/", get("/", { method: "POST" }))).toBeUndefined();
});

test("decodeURIComponent 失败 → 404", async () => {
  expect((await handler()("/%zz", get("/%zz")))?.status).toBe(404);
});

test("/api/* 防御：绝不进静态兜底", async () => {
  expect(await handler()("/api/health", get("/api/health"))).toBeUndefined();
});

test("resolveWebDistDir：未设 → 关闭；目录不存在 → 关闭 + 告警；合法目录 → 启用", async () => {
  expect(await resolveWebDistDir({})).toBeUndefined();
  expect(await resolveWebDistDir({ WEB_DIST_DIR: "  " })).toBeUndefined();
  expect(await resolveWebDistDir({ WEB_DIST_DIR: "/definitely/not/a/dir" })).toBeUndefined();
  expect(await resolveWebDistDir({ WEB_DIST_DIR: dist })).toBe(dist);
});

test("resolveWebDistDir 关闭语义：未配置时 handler 不该被创建（契约由调用方保证）", async () => {
  // startApi 的接线：webDistDir undefined → staticWeb undefined → 静态面全走原 404。
  // 此用例固化 resolveWebDistDir 的返回契约，防止有人把「目录不存在」改成抛错。
  const closed = await resolveWebDistDir({ WEB_DIST_DIR: "" });
  expect(closed).toBeUndefined();
});
