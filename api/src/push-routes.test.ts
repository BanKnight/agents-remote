import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PushKeyManager } from "./push-keys";
import { handlePushRoutes } from "./push-routes";
import { PushSubscriptionStore } from "./push-subscription-store";

// push REST 路由单测：keys/subscriptions 都注入临时目录（真 VAPID 生成很快，
// 但文件全落 os.tmpdir()，绝不触碰 ~/.agents-remote/）。
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const makeDeps = async () => {
  const dir = await mkdtemp(join(tmpdir(), "agents-remote-push-routes-"));
  tempDirs.push(dir);
  return {
    keys: new PushKeyManager({ path: join(dir, "push-vapid.json") }),
    subscriptions: new PushSubscriptionStore({ path: join(dir, "push-subscriptions.json") }),
  };
};

const makeUrl = (pathname: string) => new URL(`http://localhost${pathname}`);

const makeRequest = (method: string, pathname: string, body?: unknown) =>
  new Request(`http://localhost${pathname}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const VALID_SUBSCRIPTION = {
  subscription: {
    endpoint: "https://push.example/ep-1",
    keys: { p256dh: "p256dh-a", auth: "auth-a" },
  },
};

test("GET /api/push/vapid-public-key：只回 publicKey，响应体绝不含私钥", async () => {
  const deps = await makeDeps();

  const res = await handlePushRoutes(
    makeRequest("GET", "/api/push/vapid-public-key"),
    makeUrl("/api/push/vapid-public-key"),
    deps,
  );

  expect(res?.status).toBe(200);
  const body = (await res!.json()) as Record<string, unknown>;
  // 键集严格只有 publicKey（私钥字段/嵌套对象都不许出现）。
  expect(Object.keys(body)).toEqual(["publicKey"]);
  expect(typeof body.publicKey).toBe("string");
  // 私钥纪律：响应文本里不得出现 privateKey 字样，也不得等于落盘私钥值。
  const raw = JSON.stringify(body);
  expect(raw).not.toContain("privateKey");
  const { privateKey } = await deps.keys.readOrCreate();
  expect(raw).not.toContain(privateKey);
});

test("POST /api/push/subscriptions：缺字段 → 400 且不落盘", async () => {
  const deps = await makeDeps();
  const bad = [
    undefined,
    {},
    { subscription: {} },
    { subscription: { endpoint: "" } },
    { subscription: { endpoint: "https://push.example/ep-1" } },
    { subscription: { endpoint: "https://push.example/ep-1", keys: {} } },
    { subscription: { endpoint: "https://push.example/ep-1", keys: { p256dh: "k" } } },
    { subscription: { endpoint: "https://push.example/ep-1", keys: { p256dh: "", auth: "a" } } },
  ];

  for (const body of bad) {
    const res = await handlePushRoutes(
      makeRequest("POST", "/api/push/subscriptions", body),
      makeUrl("/api/push/subscriptions"),
      deps,
    );
    expect(res?.status).toBe(400);
    // jsonError 错误体形状：{ error: { code, message } }。
    const json = (await res!.json()) as { error: { code: string; message: string } };
    expect(json.error.code).toBe("SETTINGS_INVALID");
    expect(json.error.message).toBe("invalid subscription");
  }
  expect(await deps.subscriptions.list()).toEqual([]);
});

test("POST /api/push/subscriptions：合法订阅 upsert；重复 POST 同 endpoint 幂等（keys 覆盖不新增）", async () => {
  const deps = await makeDeps();

  const first = await handlePushRoutes(
    makeRequest("POST", "/api/push/subscriptions", VALID_SUBSCRIPTION),
    makeUrl("/api/push/subscriptions"),
    deps,
  );
  expect(first?.status).toBe(200);
  expect(await first!.json()).toEqual({ ok: true });

  let listed = await deps.subscriptions.list();
  expect(listed).toHaveLength(1);
  expect(listed[0]).toMatchObject({ endpoint: "https://push.example/ep-1", p256dh: "p256dh-a" });

  const repeat = await handlePushRoutes(
    makeRequest("POST", "/api/push/subscriptions", {
      subscription: {
        endpoint: "https://push.example/ep-1",
        keys: { p256dh: "p256dh-b", auth: "auth-b" },
      },
    }),
    makeUrl("/api/push/subscriptions"),
    deps,
  );
  expect(repeat?.status).toBe(200);
  listed = await deps.subscriptions.list();
  expect(listed).toHaveLength(1);
  expect(listed[0].p256dh).toBe("p256dh-b");
});

test("DELETE /api/push/subscriptions：幂等（重复删同 endpoint 都 200）；缺 endpoint → 400", async () => {
  const deps = await makeDeps();
  await handlePushRoutes(
    makeRequest("POST", "/api/push/subscriptions", VALID_SUBSCRIPTION),
    makeUrl("/api/push/subscriptions"),
    deps,
  );

  const del = () =>
    handlePushRoutes(
      makeRequest("DELETE", "/api/push/subscriptions", { endpoint: "https://push.example/ep-1" }),
      makeUrl("/api/push/subscriptions"),
      deps,
    );

  const first = await del();
  expect(first?.status).toBe(200);
  expect(await first!.json()).toEqual({ ok: true });
  expect(await deps.subscriptions.list()).toEqual([]);

  // 已不存在 → 仍然 200（幂等，客户端退订重试不报错）。
  const second = await del();
  expect(second?.status).toBe(200);
  expect(await second!.json()).toEqual({ ok: true });

  for (const body of [undefined, {}, { endpoint: "" }, { endpoint: 123 }]) {
    const res = await handlePushRoutes(
      makeRequest("DELETE", "/api/push/subscriptions", body),
      makeUrl("/api/push/subscriptions"),
      deps,
    );
    expect(res?.status).toBe(400);
  }
});

test("非本模块路径/方法 → 返回 undefined（交上层继续分发）", async () => {
  const deps = await makeDeps();
  expect(
    await handlePushRoutes(
      makeRequest("GET", "/api/push/subscriptions"),
      makeUrl("/api/push/subscriptions"),
      deps,
    ),
  ).toBeUndefined();
  expect(
    await handlePushRoutes(makeRequest("GET", "/api/settings"), makeUrl("/api/settings"), deps),
  ).toBeUndefined();
});
