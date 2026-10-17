import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  NotificationSettings,
  PushMessagePayload,
  SettingsState,
} from "@agents-remote/shared";
import { PushNotifier, type PushSendFn } from "./push-notifier";
import { PushSubscriptionStore } from "./push-subscription-store";
import type { SettingsStore } from "./settings-store";

// PushNotifier 单测：deps 全部可注入——subscriptions/settings 用临时目录真实实例
//（绝写不进 ~/.agents-remote/），send 换成 mock（绕开真实网络与 VAPID 加密）。
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const makeSubscriptions = async () => {
  const dir = await mkdtemp(join(tmpdir(), "agents-remote-push-notifier-"));
  tempDirs.push(dir);
  return new PushSubscriptionStore({ path: join(dir, "push-subscriptions.json") });
};

/** 构造 settings stub：notifications 传 undefined = settings.yaml 无该域（旧文件形态）。 */
const makeSettings = (notifications?: NotificationSettings) =>
  ({
    read: async () =>
      ({
        runtimes: {
          claude: {
            presets: [],
            activePresetId: "",
            enable1mContext: false,
            effort: "high",
          },
          pi: { presets: [], activePresetId: "" },
          acp: {},
        },
        skills: { sources: [] },
        ...(notifications === undefined ? {} : { notifications }),
      }) as SettingsState,
  }) as unknown as SettingsStore;

const makeSend = () => {
  const calls: Array<{
    subscription: { endpoint: string };
    payload: PushMessagePayload;
  }> = [];
  const send: PushSendFn = async (subscription, payload) => {
    calls.push({ subscription, payload });
  };
  return { send, calls };
};

const makeNotifier = (options: {
  subscriptions: PushSubscriptionStore;
  settings: SettingsStore;
  send: PushSendFn;
}) =>
  new PushNotifier({
    keys: { readOrCreate: async () => ({ publicKey: "k", privateKey: "k" }) },
    subscriptions: options.subscriptions,
    settings: options.settings,
    send: options.send,
  });

const INFO = {
  projectName: "demo-app",
  sessionId: "agent_1",
  sessionName: "重构登录页",
  toolName: "Bash",
  inputSummary: "rm -rf /tmp/x",
};

test("settings gate：notifications[kind] === false → 该类不发（其他类照发）", async () => {
  const subscriptions = await makeSubscriptions();
  await subscriptions.upsert({
    endpoint: "https://push.example/ep-1",
    p256dh: "k",
    auth: "a",
  });
  const { send, calls } = makeSend();
  const notifier = makeNotifier({
    subscriptions,
    settings: makeSettings({ blocked: false, done: true, error: true }),
    send,
  });

  await notifier.notify("blocked", INFO);
  expect(calls).toHaveLength(0);

  await notifier.notify("done", { projectName: "demo-app", sessionId: "agent_1" });
  expect(calls).toHaveLength(1);
  expect(calls[0].payload.kind).toBe("done");
});

test("settings gate：三类开关逐一 false 均拦截", async () => {
  const subscriptions = await makeSubscriptions();
  await subscriptions.upsert({
    endpoint: "https://push.example/ep-1",
    p256dh: "k",
    auth: "a",
  });
  const { send, calls } = makeSend();
  const notifier = makeNotifier({
    subscriptions,
    settings: makeSettings({ blocked: true, done: true, error: false }),
    send,
  });

  await notifier.notify("error", INFO);
  expect(calls).toHaveLength(0);
});

test("默认（无 notifications 域，旧 settings.yaml）→ 三类全发", async () => {
  const subscriptions = await makeSubscriptions();
  await subscriptions.upsert({
    endpoint: "https://push.example/ep-1",
    p256dh: "k",
    auth: "a",
  });
  const { send, calls } = makeSend();
  const notifier = makeNotifier({ subscriptions, settings: makeSettings(), send });

  for (const kind of ["blocked", "done", "error"] as const) {
    await notifier.notify(kind, INFO);
  }
  expect(calls.map((c) => c.payload.kind)).toEqual(["blocked", "done", "error"]);
});

test("payload 形状：title=sessionName、blocked body 拼工具名与摘要、url 为深链（特殊字符编码）", async () => {
  const subscriptions = await makeSubscriptions();
  await subscriptions.upsert({
    endpoint: "https://push.example/ep-1",
    p256dh: "k",
    auth: "a",
  });
  const { send, calls } = makeSend();
  const notifier = makeNotifier({ subscriptions, settings: makeSettings(), send });

  await notifier.notify("blocked", INFO);
  expect(calls).toHaveLength(1);
  const { payload, subscription } = calls[0];
  expect(subscription.endpoint).toBe("https://push.example/ep-1");
  expect(payload.kind).toBe("blocked");
  expect(payload.title).toBe("重构登录页");
  expect(payload.body).toBe("等待审批：Bash · rm -rf /tmp/x");
  // 深链：/projects/{projectName}/session/{sessionId}，各段 encodeURIComponent。
  expect(payload.url).toBe("/projects/demo-app/session/agent_1");
  expect(payload.projectName).toBe("demo-app");
  expect(payload.sessionId).toBe("agent_1");
  expect(payload.sessionName).toBe("重构登录页");
  expect(payload.toolName).toBe("Bash");
  expect(payload.inputSummary).toBe("rm -rf /tmp/x");
  expect(Number.isNaN(Date.parse(payload.sentAt))).toBe(false);

  // 项目名/会话名含特殊字符 → 编码进 url；title/body 保留原文。
  await notifier.notify("done", {
    projectName: "my proj",
    sessionId: "a/b",
  });
  expect(calls[1].payload.url).toBe("/projects/my%20proj/session/a%2Fb");
});

test("payload 缺省：无 sessionName → title 回落 projectName；done/error body 固定文案；无 inputSummary 不带摘要段", async () => {
  const subscriptions = await makeSubscriptions();
  await subscriptions.upsert({
    endpoint: "https://push.example/ep-1",
    p256dh: "k",
    auth: "a",
  });
  const { send, calls } = makeSend();
  const notifier = makeNotifier({ subscriptions, settings: makeSettings(), send });

  const bare = { projectName: "demo-app", sessionId: "agent_1" };
  await notifier.notify("done", bare);
  await notifier.notify("error", bare);
  await notifier.notify("blocked", { ...bare, toolName: "Write" });

  expect(calls[0].payload.title).toBe("demo-app");
  expect(calls[0].payload.body).toBe("任务已完成");
  expect(calls[1].payload.body).toBe("任务出错，请查看会话");
  // toolName 缺省兜底「工具调用」；无 inputSummary → 不拼「 · 」段。
  expect(calls[2].payload.body).toBe("等待审批：Write");
});

test("404/410（subscription gone）→ 订阅被清理（removeMany 收到 endpoint）；其他错误码不清", async () => {
  const subscriptions = await makeSubscriptions();
  await subscriptions.upsert({
    endpoint: "https://push.example/ep-gone",
    p256dh: "k",
    auth: "a",
  });
  await subscriptions.upsert({
    endpoint: "https://push.example/ep-500",
    p256dh: "k",
    auth: "a",
  });
  const removedCalls: string[][] = [];
  const originalRemoveMany = subscriptions.removeMany.bind(subscriptions);
  subscriptions.removeMany = async (endpoints: string[]) => {
    removedCalls.push(endpoints);
    return originalRemoveMany(endpoints);
  };

  const send: PushSendFn = async (subscription) => {
    if (subscription.endpoint === "https://push.example/ep-gone") {
      const error = new Error("push send failed: 410") as Error & { statusCode: number };
      error.statusCode = 410;
      throw error;
    }
    const error = new Error("push send failed: 500") as Error & { statusCode: number };
    error.statusCode = 500;
    throw error;
  };
  const notifier = makeNotifier({
    subscriptions,
    settings: makeSettings(),
    send,
  });

  // fire-and-forget 兜底 catch：单订阅 500 也不向上抛。
  await notifier.notify("done", { projectName: "demo-app", sessionId: "agent_1" });

  expect(removedCalls).toEqual([["https://push.example/ep-gone"]]);
  const rest = await subscriptions.list();
  expect(rest.map((s) => s.endpoint)).toEqual(["https://push.example/ep-500"]);
});

test("无订阅 → send 不被调（也不触发 removeMany）", async () => {
  const subscriptions = await makeSubscriptions();
  const { send, calls } = makeSend();
  const removedCalls: string[][] = [];
  const originalRemoveMany = subscriptions.removeMany.bind(subscriptions);
  subscriptions.removeMany = async (endpoints: string[]) => {
    removedCalls.push(endpoints);
    return originalRemoveMany(endpoints);
  };
  const notifier = makeNotifier({
    subscriptions,
    settings: makeSettings(),
    send,
  });

  await notifier.notify("blocked", INFO);
  expect(calls).toHaveLength(0);
  expect(removedCalls).toHaveLength(0);
});
