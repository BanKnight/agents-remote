import { afterEach, expect, test } from "bun:test";
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { PushKeyManager, defaultPushKeysPath } from "./push-keys";

// VAPID 密钥管理单测：路径经 constructor options 注入临时目录，
// 绝不触碰 ~/.agents-remote/（用户真实数据目录）。
const tempDirs: string[] = [];

const makeTempDir = async () => {
  const dir = await mkdtemp(join(tmpdir(), "agents-remote-push-keys-"));
  tempDirs.push(dir);
  return dir;
};

const makeManager = async () => {
  const dir = await makeTempDir();
  const path = join(dir, "push-vapid.json");
  return { manager: new PushKeyManager({ path }), path };
};

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

test("readOrCreate 首次：生成密钥并持久化（publicKey/privateKey 齐全，互不相同）", async () => {
  const { manager, path } = await makeManager();

  const keys = await manager.readOrCreate();

  expect(typeof keys.publicKey).toBe("string");
  expect(keys.publicKey.length).toBeGreaterThan(0);
  expect(typeof keys.privateKey).toBe("string");
  expect(keys.privateKey.length).toBeGreaterThan(0);
  expect(keys.publicKey).not.toBe(keys.privateKey);

  // 落盘为合法 JSON（与内存密钥一致）。
  const persisted = JSON.parse(await readFile(path, "utf8"));
  expect(persisted).toEqual(keys);
});

test("readOrCreate 二次调用：同一实例复用缓存，跨实例读盘复用同一密钥（不重新生成）", async () => {
  const { manager, path } = await makeManager();
  const first = await manager.readOrCreate();

  // 同实例：缓存命中（即使文件被删，缓存语义仍成立）。
  const second = await manager.readOrCreate();
  expect(second).toEqual(first);

  // 新实例：读存量文件，密钥不换（换密钥 = 所有存量订阅全部失效）。
  const fresh = new PushKeyManager({ path });
  expect(await fresh.readOrCreate()).toEqual(first);
});

test("密钥文件权限 0o600（含目录 0o700）", async () => {
  const { manager, path } = await makeManager();
  await manager.readOrCreate();

  const fileStat = await stat(path);
  expect(fileStat.mode & 0o777).toBe(0o600);
  const dirStat = await stat(dirname(path));
  expect(dirStat.mode & 0o777).toBe(0o700);
});

test("存量文件权限过宽 → 读取时收敛回 0o600（密钥不变）", async () => {
  const { manager, path } = await makeManager();
  const keys = await manager.readOrCreate();

  // 模拟历史文件被放宽权限（如手工 cp 覆盖）。
  await chmod(path, 0o644);
  expect((await stat(path)).mode & 0o777).toBe(0o644);

  const fresh = new PushKeyManager({ path });
  expect(await fresh.readOrCreate()).toEqual(keys);
  expect((await stat(path)).mode & 0o777).toBe(0o600);
});

test("存量文件 JSON 损坏 → 重新生成并覆盖（旧密钥失效 = 安全方向）", async () => {
  const { manager, path } = await makeManager();
  const old = await manager.readOrCreate();

  // 文件被写坏（截断/乱码）→ 下一个实例读不到合法密钥 → 重新生成覆盖。
  await writeFile(path, "not-json{{{", { mode: 0o600 });
  const fresh = new PushKeyManager({ path });
  const regenerated = await fresh.readOrCreate();
  expect(regenerated.publicKey).not.toBe(old.publicKey);
  // 覆盖后文件恢复为合法 JSON + 0o600。
  expect(JSON.parse(await readFile(path, "utf8"))).toEqual(regenerated);
  expect((await stat(path)).mode & 0o777).toBe(0o600);
});

test("defaultPushKeysPath 指向 ~/.agents-remote/push-vapid.json（纯函数，不落盘）", () => {
  expect(defaultPushKeysPath()).toMatch(/\.agents-remote[/\\]push-vapid\.json$/);
});
