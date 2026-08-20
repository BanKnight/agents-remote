import { afterEach, expect, test } from "bun:test";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ChatSessionRegistry } from "./chat-session-registry";

const tempDirs: string[] = [];

const newRegistry = (options: { now?: () => Date; createId?: () => string } = {}) => {
  // 生成唯一路径，实际目录由 registry.ensureSessionsDir（mkdir recursive）创建。
  const dir = join(tmpdir(), `agents-remote-chat-sessions-${Math.random().toString(36).slice(2)}`);
  tempDirs.push(dir);
  return { registry: new ChatSessionRegistry({ sessionsDir: dir, ...options }), dir };
};

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

test("createChatSession: 默认 displayName + id 持久化落盘", async () => {
  const fixedNow = new Date("2026-08-18T00:00:00Z");
  const { registry, dir } = newRegistry({
    now: () => fixedNow,
    createId: () => "chat_test1",
  });
  const session = await registry.createChatSession();
  expect(session).toEqual({
    id: "chat_test1",
    displayName: "新对话",
    status: "idle",
    createdAt: fixedNow.toISOString(),
    updatedAt: fixedNow.toISOString(),
  });
  const files = await readdir(dir);
  expect(files).toEqual(["chat_test1.json"]);
  const raw = await readFile(join(dir, "chat_test1.json"), "utf8");
  expect(JSON.parse(raw).id).toBe("chat_test1");
});

test("createChatSession: 自定义 displayName trim + 空回退默认", async () => {
  const { registry } = newRegistry({ createId: () => "chat_test2" });
  const a = await registry.createChatSession("  我的对话  ");
  expect(a.displayName).toBe("我的对话");
  const b = await registry.createChatSession("   ");
  expect(b.displayName).toBe("新对话");
  const c = await registry.createChatSession(undefined);
  expect(c.displayName).toBe("新对话");
});

test("listChatSessions: createdAt 升序", async () => {
  let t = new Date("2026-08-18T00:00:00Z");
  const { registry } = newRegistry({
    now: () => t,
    createId: (() => {
      let n = 0;
      return () => `chat_${++n}`;
    })(),
  });
  await registry.createChatSession("B");
  t = new Date("2026-08-18T01:00:00Z");
  await registry.createChatSession("A");
  const list = await registry.listChatSessions();
  expect(list.map((s) => s.displayName)).toEqual(["B", "A"]);
});

test("持久化 round-trip: 新实例从磁盘加载已有会话", async () => {
  const { registry: r1, dir } = newRegistry({ createId: () => "chat_persist" });
  await r1.createChatSession("持久化测试");
  // 新 registry 实例（模拟重启），同目录应读回
  const r2 = new ChatSessionRegistry({ sessionsDir: dir });
  const list = await r2.listChatSessions();
  expect(list).toHaveLength(1);
  expect(list[0].displayName).toBe("持久化测试");
  expect(list[0].id).toBe("chat_persist");
});

test("renameChatSession: 更新 displayName + updatedAt", async () => {
  const fixedNow = new Date("2026-08-18T00:00:00Z");
  const later = new Date("2026-08-18T02:00:00Z");
  let t = fixedNow;
  const { registry } = newRegistry({
    now: () => t,
    createId: () => "chat_rename",
  });
  await registry.createChatSession("旧名");
  t = later;
  const renamed = await registry.renameChatSession("chat_rename", "新名");
  expect(renamed?.displayName).toBe("新名");
  expect(renamed?.updatedAt).toBe(later.toISOString());
  const detail = await registry.getChatSession("chat_rename");
  expect(detail?.displayName).toBe("新名");
});

test("renameChatSession: 不存在的 id → undefined", async () => {
  const { registry } = newRegistry();
  const result = await registry.renameChatSession("chat_nope", "x");
  expect(result).toBeUndefined();
});

test("closeChatSession: 删除元数据 + 返回 closed 态", async () => {
  const { registry, dir } = newRegistry({ createId: () => "chat_close" });
  await registry.createChatSession();
  const closed = await registry.closeChatSession("chat_close");
  expect(closed?.status).toBe("closed");
  const files = await readdir(dir);
  expect(files).toEqual([]);
  const after = await registry.getChatSession("chat_close");
  expect(after).toBeUndefined();
});

test("closeChatSession: 不存在的 id → undefined", async () => {
  const { registry } = newRegistry();
  const result = await registry.closeChatSession("chat_nope");
  expect(result).toBeUndefined();
});

test("parseMetadata 容错: 损坏 JSON 文件被跳过", async () => {
  const { registry, dir } = newRegistry();
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "chat_bad.json"), "{not valid json", { mode: 0o600 });
  const list = await registry.listChatSessions();
  expect(list).toEqual([]);
});

test("parseMetadata 容错: 缺少 id/displayName 字段被跳过", async () => {
  const { registry, dir } = newRegistry();
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "chat_bad2.json"), JSON.stringify({ status: "idle" }), {
    mode: 0o600,
  });
  const list = await registry.listChatSessions();
  expect(list).toEqual([]);
});

test("closeChatSession: closeHook 在 removeMetadata 前 await，hook 顺序可见", async () => {
  const { registry, dir } = newRegistry({ createId: () => "chat_hook" });
  await registry.createChatSession();
  const order: string[] = [];
  registry.setCloseHook(async (id) => {
    order.push(`hook:${id}`);
  });
  const closed = await registry.closeChatSession("chat_hook");
  expect(order).toEqual(["hook:chat_hook"]);
  expect(closed?.status).toBe("closed");
  const files = await readdir(dir);
  expect(files).toEqual([]);
});

test("closeChatSession: hook throw 不阻塞元数据清理", async () => {
  const { registry, dir } = newRegistry({ createId: () => "chat_hookerr" });
  await registry.createChatSession();
  registry.setCloseHook(() => {
    throw new Error("hook boom");
  });
  // console.warn 会输出，但清理必须完成
  await registry.closeChatSession("chat_hookerr");
  const files = await readdir(dir);
  expect(files).toEqual([]);
});

test("setPiSessionId: backfill 幂等 + 落盘 round-trip", async () => {
  const { registry, dir } = newRegistry({ createId: () => "chat_backfill" });
  await registry.createChatSession();
  registry.setPiSessionId("chat_backfill", "pi-sess-1");
  // 内存 index 立即可见
  expect((await registry.getChatSession("chat_backfill"))?.piSessionId).toBe("pi-sess-1");
  // 等 fire-and-forget 写盘落定
  await new Promise((r) => setTimeout(r, 20));
  const raw = await readFile(join(dir, "chat_backfill.json"), "utf8");
  expect(JSON.parse(raw).piSessionId).toBe("pi-sess-1");
  // 幂等：同值不重复写（piSessionId 保持 + 文件仍在）
  registry.setPiSessionId("chat_backfill", "pi-sess-1");
  expect((await registry.getChatSession("chat_backfill"))?.piSessionId).toBe("pi-sess-1");
});

test("setPiSessionId: 空值 / 不存在会话 → no-op", async () => {
  const { registry } = newRegistry();
  registry.setPiSessionId("chat_nope", "pi-sess-x");
  registry.setPiSessionId("chat_nope", "");
  expect(await registry.getChatSession("chat_nope")).toBeUndefined();
});

test("setChatTitle: 落盘 round-trip + 幂等 + no-op 边界", async () => {
  const { registry, dir } = newRegistry({ createId: () => "chat_title" });
  await registry.createChatSession();
  expect((await registry.getChatSession("chat_title"))?.displayName).toBe("新对话");

  registry.setChatTitle("chat_title", "问候测试");
  expect((await registry.getChatSession("chat_title"))?.displayName).toBe("问候测试");
  // 等 fire-and-forget 写盘落定
  await new Promise((r) => setTimeout(r, 20));
  const raw = await readFile(join(dir, "chat_title.json"), "utf8");
  expect(JSON.parse(raw).displayName).toBe("问候测试");

  // 幂等：同值不重复写
  registry.setChatTitle("chat_title", "问候测试");
  expect((await registry.getChatSession("chat_title"))?.displayName).toBe("问候测试");

  // 边界：空标题 / 不存在会话 → no-op
  registry.setChatTitle("chat_title", "");
  registry.setChatTitle("chat_nope", "x");
  expect((await registry.getChatSession("chat_title"))?.displayName).toBe("问候测试");
});

test("recordActivityChat: 整分钟截断 + 同分钟短路", async () => {
  const base = new Date("2026-08-18T00:00:00.000Z");
  const t1 = new Date("2026-08-18T00:00:30.000Z"); // 同分钟
  const t2 = new Date("2026-08-18T00:02:10.000Z"); // 跨分钟
  let t = base;
  const { registry, dir } = newRegistry({
    now: () => t,
    createId: () => "chat_activity",
  });
  await registry.createChatSession();

  // 同分钟：updatedAt 不变（截断后 == createdAt 的整分钟值）
  t = t1;
  await registry.recordActivityChat("chat_activity");
  expect((await registry.getChatSession("chat_activity"))?.updatedAt).toBe(base.toISOString());

  // 跨分钟：updatedAt 更新为整分钟截断
  t = t2;
  await registry.recordActivityChat("chat_activity");
  const detail = await registry.getChatSession("chat_activity");
  expect(detail?.updatedAt).toBe("2026-08-18T00:02:00.000Z");
  const raw = await readFile(join(dir, "chat_activity.json"), "utf8");
  expect(JSON.parse(raw).updatedAt).toBe("2026-08-18T00:02:00.000Z");
});

test("recordActivityChat: 不存在的会话 → no-op", async () => {
  const { registry } = newRegistry();
  await registry.recordActivityChat("chat_nope");
  expect(await registry.getChatSession("chat_nope")).toBeUndefined();
});

test("setPinned: 置顶落盘 + round-trip + 不动 updatedAt", async () => {
  const fixedNow = new Date("2026-08-18T00:00:00Z");
  const later = new Date("2026-08-18T02:00:00Z");
  let t = fixedNow;
  const { registry, dir } = newRegistry({
    now: () => t,
    createId: () => "chat_pin",
  });
  await registry.createChatSession("置顶测试");
  t = later;
  const pinned = await registry.setPinned("chat_pin", true);
  expect(pinned?.pinned).toBe(true);
  // 管理操作不更新 updatedAt
  expect(pinned?.updatedAt).toBe(fixedNow.toISOString());
  // 落盘 round-trip
  const raw = await readFile(join(dir, "chat_pin.json"), "utf8");
  expect(JSON.parse(raw).pinned).toBe(true);
  const r2 = new ChatSessionRegistry({ sessionsDir: dir });
  expect((await r2.getChatSession("chat_pin"))?.pinned).toBe(true);
});

test("setPinned: 取消置顶清字段 + 幂等短路 + 不存在 → undefined", async () => {
  const { registry, dir } = newRegistry({ createId: () => "chat_unpin" });
  await registry.createChatSession();
  await registry.setPinned("chat_unpin", true);
  const unpinned = await registry.setPinned("chat_unpin", false);
  expect(unpinned?.pinned).toBe(false);
  // 幂等：同值短路（返回同 session，不再写盘）
  const again = await registry.setPinned("chat_unpin", false);
  expect(again?.pinned).toBe(false);
  const raw = await readFile(join(dir, "chat_unpin.json"), "utf8");
  expect(JSON.parse(raw).pinned).toBe(false);
  // 不存在 → undefined
  expect(await registry.setPinned("chat_nope", true)).toBeUndefined();
});

test("setArchived: 归档落盘 + round-trip + 不动 updatedAt", async () => {
  const fixedNow = new Date("2026-08-18T00:00:00Z");
  let t = fixedNow;
  const { registry, dir } = newRegistry({
    now: () => t,
    createId: () => "chat_arch",
  });
  await registry.createChatSession("归档测试");
  const archived = await registry.setArchived("chat_arch", "2026-08-20T00:00:00Z");
  expect(archived?.archivedAt).toBe("2026-08-20T00:00:00Z");
  // 管理操作不更新 updatedAt
  expect(archived?.updatedAt).toBe(fixedNow.toISOString());
  const raw = await readFile(join(dir, "chat_arch.json"), "utf8");
  expect(JSON.parse(raw).archivedAt).toBe("2026-08-20T00:00:00Z");
  const r2 = new ChatSessionRegistry({ sessionsDir: dir });
  expect((await r2.getChatSession("chat_arch"))?.archivedAt).toBe("2026-08-20T00:00:00Z");
});

test("setArchived: 恢复（null）清字段 + 幂等短路", async () => {
  const { registry, dir } = newRegistry({ createId: () => "chat_restore" });
  await registry.createChatSession();
  await registry.setArchived("chat_restore", "2026-08-20T00:00:00Z");
  const restored = await registry.setArchived("chat_restore", null);
  expect(restored?.archivedAt).toBeUndefined();
  // 幂等：null 短路
  const again = await registry.setArchived("chat_restore", null);
  expect(again?.archivedAt).toBeUndefined();
  // 落盘无 archivedAt key（undefined 被 JSON.stringify 省略）
  const raw = await readFile(join(dir, "chat_restore.json"), "utf8");
  expect("archivedAt" in JSON.parse(raw)).toBe(false);
  expect(await registry.setArchived("chat_nope", null)).toBeUndefined();
});

test("parseMetadata: pinned/archivedAt 缺失字段兼容（旧 JSON）", async () => {
  const { registry, dir } = newRegistry({ createId: () => "chat_legacy" });
  await registry.createChatSession();
  // 模拟旧版本 JSON（无 pinned/archivedAt）
  const legacy = {
    id: "chat_legacy2",
    displayName: "旧会话",
    status: "idle",
    createdAt: "2026-08-18T00:00:00Z",
    updatedAt: "2026-08-18T00:00:00Z",
  };
  await writeFile(join(dir, "chat_legacy2.json"), JSON.stringify(legacy), { mode: 0o600 });
  const session = await registry.getChatSession("chat_legacy2");
  expect(session?.pinned).toBeUndefined();
  expect(session?.archivedAt).toBeUndefined();
});
