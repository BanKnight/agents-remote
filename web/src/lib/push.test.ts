// @vitest-environment jsdom

// push.ts 单测（PWA 通知批）。覆盖两块：
// ① urlBase64ToUint8Array 的 base64url 解码边界（VAPID 公钥形态）：无 padding 自动补齐、
//    -/_ 字符映射回 +//、输出长度与字节值。独立参照 = Buffer.from(input, "base64url")
//    （bun 内建 base64url 编解码，与被测实现的 replace+atob 路径不同源）。
// ② 支持性 gate 在 jsdom 下的降级契约：jsdom 无 navigator.serviceWorker 且非
//    standalone → canUsePush() 必须 false、getPushSubscription() 必须回 null（UI 层据此
//    显降级提示，不允许抛错）。
//
// client.ts 顶层无 window 访问（全部在函数体内），push.ts 静态 import 安全；
// window 只需在测试运行前建好（canUsePush 经 display-mode 读 window.matchMedia）。
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  canUsePush,
  getPushSubscription,
  reconcilePushSubscription,
  urlBase64ToUint8Array,
} from "./push";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://app.example/" });
// 本 jsdom 版本不实现 matchMedia，而 display-mode 的 standalone 判定第一跳就是它——
// stub 恒 false（测试环境语义 = 非 standalone）。
dom.window.matchMedia = (() => ({ matches: false })) as unknown as typeof dom.window.matchMedia;
globalThis.window = dom.window as unknown as Window & typeof globalThis;

describe("urlBase64ToUint8Array", () => {
  test("标准 base64（带 padding）解码：输出长度与字节值正确，与 atob 对照", () => {
    const out = urlBase64ToUint8Array("SGVsbG8=");
    expect(out).toBeInstanceOf(Uint8Array);
    expect(out.length).toBe(5);
    // "Hello" 的字节序列。
    expect(Array.from(out)).toEqual([72, 101, 108, 108, 111]);
    // 与 atob 原生解码路径逐字节对照。
    const viaAtob = Array.from(atob("SGVsbG8="), (c) => c.charCodeAt(0));
    expect(Array.from(out)).toEqual(viaAtob);
  });

  test("无 padding 输入自动补齐（VAPID 公钥常态：65 字节 = 87 字符）", () => {
    // 用 Buffer 生成一段 65 字节的确定性字节流与其 base64url 形态（模拟真实
    // applicationServerKey：P-256 未压缩公钥 65 字节、编码后无 padding）。
    const bytes = new Uint8Array(65).map((_, i) => (i * 37 + 11) % 256);
    const key = Buffer.from(bytes).toString("base64url");
    expect(key).not.toContain("=");

    const out = urlBase64ToUint8Array(key);
    expect(out.length).toBe(65);
    // 独立参照：Buffer 的 base64url 解码（与实现的补 padding + replace + atob 不同源）。
    expect(Array.from(out)).toEqual(Array.from(Buffer.from(key, "base64url")));
  });

  test("含 - 与 _ 字符正确映射回 + 与 /", () => {
    // 字节 [251, 255, 190] 的标准 base64 是 "+/++"（含 62/63 两个越界字符），
    // base64url 形态即 "-_--"。
    expect(Buffer.from([251, 255, 190]).toString("base64")).toBe("+/++");
    expect(Buffer.from([251, 255, 190]).toString("base64url")).toBe("-_--");

    const out = urlBase64ToUint8Array("-_--");
    expect(out.length).toBe(3);
    expect(Array.from(out)).toEqual([251, 255, 190]);
  });

  test("返回值是 ArrayBuffer 背书的 Uint8Array（BufferSource 契约）", () => {
    const out = urlBase64ToUint8Array("SGVsbG8=");
    expect(out.buffer).toBeInstanceOf(ArrayBuffer);
    expect(out.buffer.byteLength).toBe(5);
  });
});

describe("支持性 gate（jsdom：非 standalone 且无 serviceWorker）", () => {
  test("canUsePush 返回 false", () => {
    // 前置确认测试环境确实缺能力：jsdom 的 navigator 无 serviceWorker。
    expect("serviceWorker" in globalThis.navigator).toBe(false);
    expect(canUsePush()).toBe(false);
  });

  test("getPushSubscription 降级为 null（不抛错）", async () => {
    expect(await getPushSubscription()).toBeNull();
  });
});

// ── 订阅死亡静默对账（reconcilePushSubscription，2026-11-03 排障批）──────────
// 完整链路 mock 浏览器面（standalone / SW / PushManager / Notification / fetch），
// 断言「权限还在 + 订阅没了 → 静默重订阅上报」自愈主路径；gate 短路（订阅健在 /
// 权限未授权）断言零动作；受控 promise 验证 inflight 并发短路。

const MOCK_VAPID_KEY = Buffer.from(new Uint8Array(65).map((_, i) => (i * 37 + 11) % 256)).toString(
  "base64url",
);

const mockSubscriptionJson = (endpoint: string) => ({
  endpoint,
  keys: { p256dh: "mock-p256dh", auth: "mock-auth" },
});

function makeMockSubscription(endpoint: string): PushSubscription {
  return {
    endpoint,
    unsubscribe: async () => true,
    toJSON: () => mockSubscriptionJson(endpoint),
  } as unknown as PushSubscription;
}

interface MockRegistration {
  pushManager: {
    getSubscription: () => Promise<PushSubscription | null>;
    subscribe: () => Promise<PushSubscription>;
  };
}

function makeMockRegistration(existingEndpoint: string | null): MockRegistration {
  return {
    pushManager: {
      getSubscription: async () =>
        existingEndpoint ? makeMockSubscription(existingEndpoint) : null,
      subscribe: async () => makeMockSubscription("https://push.example/new-ep"),
    },
  };
}

describe("订阅死亡静默对账", () => {
  let realFetch: typeof globalThis.fetch;
  let realNavigator: Navigator;
  let standaloneOn = false;

  beforeEach(() => {
    realFetch = globalThis.fetch;
    realNavigator = globalThis.navigator;
    standaloneOn = false;
    // 可变 standalone stub（isStandaloneDisplay 每次运行时读 matchMedia，无缓存）。
    dom.window.matchMedia = ((query: string) => ({
      matches: standaloneOn && query.includes("standalone"),
    })) as unknown as typeof dom.window.matchMedia;
    // 关键：push.ts 读裸标识符 Notification / navigator（= globalThis；bun 内建全局
    // navigator 不是 dom.window.navigator、无 serviceWorker）。mock 挂 dom.window 时
    // gate 恒 false——短路用例假绿、两条主路径用例全挂（首版实锤），必须挂 globalThis。
    // canUsePush 还经 window.PushManager / window.Notification 读 dom.window
    //（globalThis.window 已指向 dom.window）——两面都 stub，缺一面即挂 gate。
    const notificationStub = {
      permission: "granted" as NotificationPermission,
      requestPermission: async () => "granted" as NotificationPermission,
    };
    Object.defineProperty(globalThis, "Notification", {
      configurable: true,
      value: notificationStub,
    });
    Object.defineProperty(dom.window, "Notification", {
      configurable: true,
      value: notificationStub,
    });
    const pushManagerStub = function MockPushManager() {};
    Object.defineProperty(globalThis, "PushManager", {
      configurable: true,
      value: pushManagerStub,
    });
    Object.defineProperty(dom.window, "PushManager", {
      configurable: true,
      value: pushManagerStub,
    });
    // 全局 navigator 换成 jsdom 的（与 window.navigator 同一对象），standalone 标 iOS PWA。
    Object.defineProperty(dom.window.navigator, "standalone", {
      configurable: true,
      value: true,
    });
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: dom.window.navigator,
    });
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: realNavigator,
    });
    standaloneOn = false;
    delete (globalThis as { Notification?: unknown }).Notification;
    delete (globalThis as { PushManager?: unknown }).PushManager;
    delete (dom.window as { Notification?: unknown }).Notification;
    delete (dom.window as { PushManager?: unknown }).PushManager;
    // navigator 注入同步还原：泄漏会破坏前段「支持性 gate」用例的前提（干净 jsdom 无 SW）。
    delete (dom.window.navigator as { standalone?: unknown }).standalone;
    delete (dom.window.navigator as { serviceWorker?: unknown }).serviceWorker;
  });

  /** 挂 mock SW 面 + fetch 拦截（vapid 公钥 / 订阅上报两路），返回 registration 供细调。 */
  function installPushEnv(existingEndpoint: string | null): {
    registration: MockRegistration;
    reportedEndpoints: string[];
  } {
    const registration = makeMockRegistration(existingEndpoint);
    Object.defineProperty(dom.window.navigator, "serviceWorker", {
      configurable: true,
      value: { getRegistration: async () => registration },
    });
    const reportedEndpoints: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/push/vapid-public-key")) {
        return new Response(JSON.stringify({ publicKey: MOCK_VAPID_KEY }), { status: 200 });
      }
      if (url.includes("/api/push/subscriptions")) {
        reportedEndpoints.push(url);
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as typeof globalThis.fetch;
    return { registration, reportedEndpoints };
  }

  test("订阅死了 + 权限在 → 静默重订阅并上报（自愈主路径）", async () => {
    standaloneOn = true;
    const { registration, reportedEndpoints } = installPushEnv(null);
    let subscribed = false;
    registration.pushManager.subscribe = async () => {
      subscribed = true;
      return makeMockSubscription("https://push.example/new-ep");
    };
    const result = await reconcilePushSubscription();
    expect(result).toBe(true);
    expect(subscribed).toBe(true);
    expect(reportedEndpoints.length).toBe(1);
    expect(reportedEndpoints[0]).toContain("/api/push/subscriptions");
  });

  test("订阅健在 → 跳过（不重新 subscribe 不重复上报）", async () => {
    standaloneOn = true;
    const { registration } = installPushEnv("https://push.example/live-ep");
    let subscribeCalls = 0;
    registration.pushManager.subscribe = async () => {
      subscribeCalls += 1;
      return makeMockSubscription("https://push.example/should-not-happen");
    };
    const result = await reconcilePushSubscription();
    expect(result).toBe(false);
    expect(subscribeCalls).toBe(0);
  });

  test("权限未授权 → 跳过（首次授权必须走设置页手势路径）", async () => {
    standaloneOn = true;
    // 覆盖权限（挂 globalThis——pushPermission 读裸标识符 Notification）。
    Object.defineProperty(globalThis, "Notification", {
      configurable: true,
      value: { permission: "denied", requestPermission: async () => "denied" },
    });
    const { registration } = installPushEnv(null);
    let getSubscriptionCalls = 0;
    registration.pushManager.getSubscription = async () => {
      getSubscriptionCalls += 1;
      return null;
    };
    const result = await reconcilePushSubscription();
    expect(result).toBe(false);
    expect(getSubscriptionCalls).toBe(0);
  });

  test("inflight 并发短路（visibility 抖动防重复订阅）", async () => {
    standaloneOn = true;
    const { registration } = installPushEnv(null);
    let releaseSubscribe: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      releaseSubscribe = resolve;
    });
    let subscribeCalls = 0;
    registration.pushManager.subscribe = async () => {
      subscribeCalls += 1;
      await gate;
      return makeMockSubscription("https://push.example/slow-ep");
    };
    const first = reconcilePushSubscription();
    // 第一发还在 subscribe 内飞行，第二发必须在 gate 检查处短路。
    const second = await reconcilePushSubscription();
    expect(second).toBe(false);
    releaseSubscribe?.();
    expect(await first).toBe(true);
    expect(subscribeCalls).toBe(1);
  });

  test("canUsePush 短路（非 standalone）→ 跳过且不探订阅", async () => {
    standaloneOn = false;
    // beforeEach 恒挂 navigator.standalone=true（iOS PWA 形态）；删掉 + matchMedia
    // false = 非 standalone，第一 gate 短路（second-gate 前置）。
    delete (dom.window.navigator as { standalone?: unknown }).standalone;
    const { registration } = installPushEnv(null);
    let getSubscriptionCalls = 0;
    registration.pushManager.getSubscription = async () => {
      getSubscriptionCalls += 1;
      return null;
    };
    const result = await reconcilePushSubscription();
    expect(result).toBe(false);
    expect(getSubscriptionCalls).toBe(0);
  });

  test("SW 查询 reject → 吞错返回 false（rejection 不向 void 调用点逃逸）", async () => {
    standaloneOn = true;
    const { registration } = installPushEnv(null);
    registration.pushManager.getSubscription = async () => {
      throw new Error("InvalidStateError");
    };
    const result = await reconcilePushSubscription();
    expect(result).toBe(false);
  });

  test("subscribe 抛错 → 吞错返回 false（enablePush 失败路径契约）", async () => {
    standaloneOn = true;
    const { registration } = installPushEnv(null);
    registration.pushManager.subscribe = async () => {
      throw new Error("NotAllowedError");
    };
    const result = await reconcilePushSubscription();
    expect(result).toBe(false);
  });
});
