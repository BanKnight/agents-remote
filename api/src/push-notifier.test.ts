import { afterEach, expect, test } from "bun:test";
import { createPublicKey, verify } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  NotificationSettings,
  PushMessagePayload,
  SettingsState,
} from "@agents-remote/shared";
import { PushNotifier, signVapidAuthorization, type PushSendFn } from "./push-notifier";
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
  expect(payload.title).toBe("demo-app · 重构登录页");
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

// ── VAPID JWT 自签名（无 sub；APNs 对 localhost 域 403 BadJwtToken 的根因修复）─────

test("signVapidAuthorization：无 sub JWT，本地 node:crypto 验签 PASS（raw→DER 转换）", () => {
  const { generateKeyPairSync } = require("node:crypto");
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const pubJwk = publicKey.export({ format: "jwk" }) as { x: string; y: string };
  const privJwk = privateKey.export({ format: "jwk" }) as { d: string };
  const vapid = {
    publicKey: Buffer.concat([
      Buffer.from([0x04]),
      Buffer.from(pubJwk.x, "base64url"),
      Buffer.from(pubJwk.y, "base64url"),
    ]).toString("base64url"),
    privateKey: privJwk.d,
  };

  const auth = signVapidAuthorization("https://web.push.apple.com/v1/abc", vapid);
  const m = /^vapid t=([^,]+), k=(.+)$/.exec(auth);
  expect(m).not.toBeNull();
  const [, token, key] = m!;
  expect(key).toBe(vapid.publicKey);

  const [h64, p64, s64] = token.split(".");
  expect(JSON.parse(Buffer.from(h64, "base64url").toString())).toEqual({
    typ: "JWT",
    alg: "ES256",
  });
  const payload = JSON.parse(Buffer.from(p64, "base64url").toString()) as {
    aud: string;
    exp: number;
    sub?: unknown;
  };
  expect(payload.aud).toBe("https://web.push.apple.com");
  expect(payload.exp).toBeGreaterThan(Date.now() / 1000);
  // sub 必须缺席（硬编码域名无法代表任意部署者的地址；APNs 对 localhost 拒 403）。
  expect("sub" in payload).toBe(false);

  const sig = Buffer.from(s64, "base64url");
  expect(sig.length).toBe(64); // ES256 raw（r||s 各 32B）
  const raw = Buffer.from(vapid.publicKey, "base64url");
  const pub = createPublicKey({
    key: {
      kty: "EC",
      crv: "P-256",
      x: raw.subarray(1, 33).toString("base64url"),
      y: raw.subarray(33, 65).toString("base64url"),
    },
    format: "jwk",
  });
  // crypto.verify 对 EC key 默认期待 DER：raw 签名须回转 DER 再验（验签方法教训见
  // redesign-v2 本批排障记档——raw 直喂恒 FAIL 曾致误诊）。
  const asInt = (b: Buffer): Buffer => {
    let v = b;
    if (v[0] === 0) v = v.subarray(1);
    if (v[0] & 0x80) v = Buffer.concat([Buffer.from([0]), v]);
    return Buffer.concat([Buffer.from([0x02, v.length]), v]);
  };
  const der = Buffer.concat([
    Buffer.from([0x30]),
    (() => {
      const body = Buffer.concat([asInt(sig.subarray(0, 32)), asInt(sig.subarray(32))]);
      return Buffer.concat([Buffer.from([body.length]), body]);
    })(),
  ]);
  expect(verify("sha256", Buffer.from(`${h64}.${p64}`), pub, der)).toBe(true);
});
