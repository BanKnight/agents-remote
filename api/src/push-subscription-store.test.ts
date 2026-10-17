import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { PushSubscriptionStore, defaultSubscriptionsPath } from "./push-subscription-store";

// 临时目录注入测试：所有文件写 os.tmpdir() 下 mkdtemp，测试后清理。
// 绝不触碰 ~/.agents-remote/（用户真实数据目录）。
const tempDirs: string[] = [];

const makeTempDir = async () => {
  const dir = await mkdtemp(join(tmpdir(), "agents-remote-push-subs-"));
  tempDirs.push(dir);
  return dir;
};

const makeStore = async () => {
  const dir = await makeTempDir();
  const path = join(dir, "push-subscriptions.json");
  return { store: new PushSubscriptionStore({ path }), path };
};

const sub = (endpoint: string, p256dh = "p256dh-a", auth = "auth-a") => ({
  endpoint,
  p256dh,
  auth,
});

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

test("upsert 按 endpoint 去重：同 endpoint 覆盖 keys 不重复，createdAt 保留首订时间", async () => {
  const { store } = await makeStore();

  await store.upsert(sub("https://push.example/ep-1", "key-v1", "auth-v1"));
  const first = await store.list();
  expect(first).toHaveLength(1);
  const firstCreatedAt = first[0].createdAt;
  expect(firstCreatedAt).toBeTruthy();

  // 同设备重订阅（keys 轮换）→ 覆盖 p256dh/auth，不新增条目。
  await store.upsert(sub("https://push.example/ep-1", "key-v2", "auth-v2"));
  const after = await store.list();
  expect(after).toHaveLength(1);
  expect(after[0].p256dh).toBe("key-v2");
  expect(after[0].auth).toBe("auth-v2");
  // createdAt 保留首订时间（不是本次覆盖时间）。
  expect(after[0].createdAt).toBe(firstCreatedAt);
});

test("不同 endpoint 多设备并存", async () => {
  const { store } = await makeStore();

  await store.upsert(sub("https://push.example/ep-phone"));
  await store.upsert(sub("https://push.example/ep-pad"));
  await store.upsert(sub("https://push.example/ep-desktop"));

  const all = await store.list();
  expect(all.map((s) => s.endpoint).sort()).toEqual([
    "https://push.example/ep-desktop",
    "https://push.example/ep-pad",
    "https://push.example/ep-phone",
  ]);
});

test("remove 幂等：删存在的返回 true；删不存在的返回 false 不抛错", async () => {
  const { store } = await makeStore();
  await store.upsert(sub("https://push.example/ep-1"));
  await store.upsert(sub("https://push.example/ep-2"));

  await expect(store.remove("https://push.example/ep-1")).resolves.toBe(true);
  expect((await store.list()).map((s) => s.endpoint)).toEqual(["https://push.example/ep-2"]);

  // 再删同一个 / 删从未存在过的 endpoint：不炸不报，返回 false，存量不受影响。
  await expect(store.remove("https://push.example/ep-1")).resolves.toBe(false);
  await expect(store.remove("https://push.example/never-existed")).resolves.toBe(false);
  expect(await store.list()).toHaveLength(1);
});

test("removeMany 批量清理：返回清理数；无命中返回 0 不落盘", async () => {
  const { store } = await makeStore();
  await store.upsert(sub("https://push.example/ep-1"));
  await store.upsert(sub("https://push.example/ep-2"));
  await store.upsert(sub("https://push.example/ep-3"));

  await expect(
    store.removeMany(["https://push.example/ep-1", "https://push.example/ep-3"]),
  ).resolves.toBe(2);
  expect((await store.list()).map((s) => s.endpoint)).toEqual(["https://push.example/ep-2"]);

  // 无命中（含空数组）→ 0，文件不被重写。
  await expect(store.removeMany(["https://push.example/gone"])).resolves.toBe(0);
  await expect(store.removeMany([])).resolves.toBe(0);
  expect(await store.list()).toHaveLength(1);
});

test("落盘文件权限 0o600（目录 0o700）", async () => {
  const { store, path } = await makeStore();
  await store.upsert(sub("https://push.example/ep-1"));

  const fileStat = await stat(path);
  expect(fileStat.mode & 0o777).toBe(0o600);

  // 同目录 permissions 收敛（push-subscriptions.json 与 vapid 密钥同目录）。
  const dirStat = await stat(dirname(path));
  expect(dirStat.mode & 0o777).toBe(0o700);
});

test("损坏 JSON 容错：list 返回空表不抛错；后续 upsert 正常重建", async () => {
  const { store, path } = await makeStore();
  await writeFile(path, "这不是{{{合法 JSON", { mode: 0o600 });

  // 损坏即视为全部失效（安全方向），当空表处理。
  await expect(store.list()).resolves.toEqual([]);

  // 空表语义下 upsert 不受污染残留影响，重建单条。
  await store.upsert(sub("https://push.example/ep-1"));
  const after = await store.list();
  expect(after).toHaveLength(1);
  expect(after[0].endpoint).toBe("https://push.example/ep-1");
});

test("defaultSubscriptionsPath 指向 ~/.agents-remote/push-subscriptions.json（纯函数，不落盘）", () => {
  expect(defaultSubscriptionsPath()).toMatch(/\.agents-remote[/\\]push-subscriptions\.json$/);
});
