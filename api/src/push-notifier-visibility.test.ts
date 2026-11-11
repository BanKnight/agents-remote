// PushNotifier 盯屏设备过滤单测（2026-11-11 根治批 B 段）：fail-open 语义矩阵。
import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PushNotifier, type PushSendFn } from "./push-notifier";
import { PushSubscriptionStore } from "./push-subscription-store";
import type { SettingsStore } from "./settings-store";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const makeSubscriptions = async () => {
  const dir = await mkdtemp(join(tmpdir(), "agents-remote-push-visibility-"));
  tempDirs.push(dir);
  return new PushSubscriptionStore({ path: join(dir, "push-subscriptions.json") });
};

// settings stub：notify 路径只读 notifications[kind]，最小对象即可（undefined = 全开缺省）。
const makeSettings = () => ({ read: async () => ({}) }) as unknown as SettingsStore;

const makeSend = () => {
  const calls: Array<{ subscription: { endpoint: string }; payload: unknown }> = [];
  const send: PushSendFn = async (subscription, payload) => {
    calls.push({ subscription, payload });
  };
  return { send, calls };
};

const makeNotifier = (options: {
  subscriptions: PushSubscriptionStore;
  send: PushSendFn;
  visibleDevices?: () => Set<string>;
}) =>
  new PushNotifier({
    keys: { readOrCreate: async () => ({ publicKey: "k", privateKey: "k" }) },
    subscriptions: options.subscriptions,
    settings: makeSettings(),
    send: options.send,
    visibleDevices: options.visibleDevices,
  });

/** upsert 一条带 deviceId 的订阅。 */
const upsertWithDevice = async (
  subscriptions: PushSubscriptionStore,
  endpoint: string,
  deviceId: string,
): Promise<void> => {
  await subscriptions.upsert({ endpoint, p256dh: "k", auth: "a", deviceId });
};

test("visibleDevices 命中 → 该设备订阅跳过，其他设备照发", async () => {
  const subscriptions = await makeSubscriptions();
  await upsertWithDevice(subscriptions, "https://push.example/ep-phone", "dev-phone");
  await upsertWithDevice(subscriptions, "https://push.example/ep-desk", "dev-desk");
  const { send, calls } = makeSend();
  const notifier = makeNotifier({
    subscriptions,
    send,
    visibleDevices: () => new Set(["dev-phone"]),
  });

  await notifier.notify("done", { projectName: "demo-app", sessionId: "agent_1" });
  expect(calls.map((c) => c.subscription.endpoint)).toEqual(["https://push.example/ep-desk"]);
});

test("fail-open：无 deviceId 记录 / 不在集合 / visible 空集 → 全照发", async () => {
  const subscriptions = await makeSubscriptions();
  await upsertWithDevice(subscriptions, "https://push.example/ep-phone", "dev-phone");
  await subscriptions.upsert({
    endpoint: "https://push.example/ep-legacy",
    p256dh: "k",
    auth: "a",
  });
  const { send, calls } = makeSend();
  const notifier = makeNotifier({
    subscriptions,
    send,
    visibleDevices: () => new Set(["dev-other"]),
  });

  await notifier.notify("done", { projectName: "demo-app", sessionId: "agent_1" });
  expect(calls.map((c) => c.subscription.endpoint)).toEqual([
    "https://push.example/ep-phone",
    "https://push.example/ep-legacy",
  ]);
});

test("visibleDevices 缺省 → 不过滤（存量装配兼容）", async () => {
  const subscriptions = await makeSubscriptions();
  await upsertWithDevice(subscriptions, "https://push.example/ep-phone", "dev-phone");
  const { send, calls } = makeSend();
  const notifier = makeNotifier({ subscriptions, send });

  await notifier.notify("done", { projectName: "demo-app", sessionId: "agent_1" });
  expect(calls).toHaveLength(1);
});

test("visibleDevices 抛错 → fail-open 照发（发送面不被 getter 拖垮）", async () => {
  const subscriptions = await makeSubscriptions();
  await upsertWithDevice(subscriptions, "https://push.example/ep-phone", "dev-phone");
  const { send, calls } = makeSend();
  const notifier = makeNotifier({
    subscriptions,
    send,
    visibleDevices: () => {
      throw new Error("hub gone");
    },
  });

  await notifier.notify("done", { projectName: "demo-app", sessionId: "agent_1" });
  expect(calls).toHaveLength(1);
});

test("全命中 → 零 send、零 removeMany（全跳过短路）", async () => {
  const subscriptions = await makeSubscriptions();
  await upsertWithDevice(subscriptions, "https://push.example/ep-phone", "dev-phone");
  const { send, calls } = makeSend();
  const removedCalls: string[][] = [];
  const originalRemoveMany = subscriptions.removeMany.bind(subscriptions);
  subscriptions.removeMany = async (endpoints: string[]) => {
    removedCalls.push(endpoints);
    return originalRemoveMany(endpoints);
  };
  const notifier = makeNotifier({
    subscriptions,
    send,
    visibleDevices: () => new Set(["dev-phone"]),
  });

  await notifier.notify("done", { projectName: "demo-app", sessionId: "agent_1" });
  expect(calls).toHaveLength(0);
  expect(removedCalls).toHaveLength(0);
});

test("部分命中 + 被发送者 410 → 只 prune 发送过的 endpoint（targets 索引回归锁）", async () => {
  const subscriptions = await makeSubscriptions();
  await upsertWithDevice(subscriptions, "https://push.example/ep-phone", "dev-phone");
  await upsertWithDevice(subscriptions, "https://push.example/ep-desk", "dev-desk");
  const removedCalls: string[][] = [];
  const originalRemoveMany = subscriptions.removeMany.bind(subscriptions);
  subscriptions.removeMany = async (endpoints: string[]) => {
    removedCalls.push(endpoints);
    return originalRemoveMany(endpoints);
  };
  const calls: Array<{ subscription: { endpoint: string }; payload: unknown }> = [];
  const send: PushSendFn = async (subscription, payload) => {
    calls.push({ subscription, payload });
    const error = new Error("push send failed: 410") as Error & { statusCode: number };
    error.statusCode = 410;
    throw error;
  };
  const notifier = makeNotifier({
    subscriptions,
    send,
    visibleDevices: () => new Set(["dev-phone"]),
  });

  await notifier.notify("done", { projectName: "demo-app", sessionId: "agent_1" });
  expect(calls.map((c) => c.subscription.endpoint)).toEqual(["https://push.example/ep-desk"]);
  expect(removedCalls).toEqual([["https://push.example/ep-desk"]]);
  const rest = await subscriptions.list();
  expect(rest.map((s) => s.endpoint)).toEqual(["https://push.example/ep-phone"]);
});
