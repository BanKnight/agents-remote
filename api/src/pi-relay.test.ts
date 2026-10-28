import { describe, expect, test } from "bun:test";
import { PiSessionRelay } from "./pi-relay";

const piEventLine = (type: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ type: "pi_event", event: { type, ...extra } });
const echoLine = (text: string, uuid: string) =>
  JSON.stringify({ type: "pi_user_echo", text, uuid });

describe("PiSessionRelay", () => {
  test("addSubscriber: 回放顺序 = session_init → history_start(0) → history_end → live_start(N) → live_end", () => {
    const relay = new PiSessionRelay();
    relay.appendAndBroadcast(piEventLine("agent_start"));
    relay.appendAndBroadcast(piEventLine("message_start"));

    const received: string[] = [];
    relay.addSubscriber(
      (line) => received.push(line),
      (err) => {
        throw err;
      },
    );
    const messages = received.map((line) => JSON.parse(line) as Record<string, unknown>);

    expect(messages[0]).toMatchObject({ type: "session_init", resume: false });
    expect(messages[1]).toMatchObject({ type: "history_start", count: 0 });
    expect(messages[2]).toMatchObject({ type: "history_end" });
    expect(messages[3]).toMatchObject({ type: "live_start", count: 2 });
    expect(messages.slice(4, 6)).toEqual([
      JSON.parse(piEventLine("agent_start")),
      JSON.parse(piEventLine("message_start")),
    ]);
    expect(messages[6]).toMatchObject({ type: "live_end" });

    relay.destroy();
  });

  test("setResume: session_init.resume 反映恢复语义", () => {
    const relay = new PiSessionRelay();
    relay.setResume(true);

    const received: string[] = [];
    relay.addSubscriber(
      (line) => received.push(line),
      (err) => {
        throw err;
      },
    );
    const messages = received.map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(messages[0]).toMatchObject({ type: "session_init", resume: true });

    relay.destroy();
  });

  test("loadHistory: addSubscriber 回放定格历史行（history_start count = 实际条数）", () => {
    const relay = new PiSessionRelay();
    const histA = piEventLine("message_start");
    const histB = piEventLine("message_end");
    relay.loadHistory([histA, histB]);
    relay.appendAndBroadcast(piEventLine("message_update"));

    const received: string[] = [];
    relay.addSubscriber(
      (line) => received.push(line),
      (err) => {
        throw err;
      },
    );
    const messages = received.map((line) => JSON.parse(line) as Record<string, unknown>);

    expect(messages[0]).toMatchObject({ type: "session_init", resume: false });
    expect(messages[1]).toMatchObject({ type: "history_start", count: 2 });
    expect(messages.slice(2, 4)).toEqual([JSON.parse(histA), JSON.parse(histB)]);
    expect(messages[4]).toMatchObject({ type: "history_end" });
    // live batch 只含 live 行（history 不重复进 live）。
    expect(messages[5]).toMatchObject({ type: "live_start", count: 1 });
    expect(messages[6]).toEqual(JSON.parse(piEventLine("message_update")));
    expect(messages[7]).toMatchObject({ type: "live_end" });

    relay.destroy();
  });

  test("appendAndBroadcast: 当前订阅者实时收 + 后续订阅者从 live batch 回放", () => {
    const relay = new PiSessionRelay();
    const live: string[] = [];
    relay.addSubscriber(
      (line) => live.push(line),
      (err) => {
        throw err;
      },
    );

    relay.appendAndBroadcast(echoLine("hi", "u1"));

    // 1) 当前订阅者在 live batch 之后收到实时行。
    const liveEnd = live.findIndex((l) => l.includes('"live_end"'));
    expect(live.slice(liveEnd + 1)).toContain(echoLine("hi", "u1"));

    // 2) 后续订阅者从 live batch 回放该行。
    const replayed: string[] = [];
    relay.addSubscriber(
      (line) => replayed.push(line),
      (err) => {
        throw err;
      },
    );
    const messages = replayed.map((line) => JSON.parse(line) as Record<string, unknown>);
    const liveStart = messages.findIndex((m) => m.type === "live_start");
    const liveEndIdx = messages.findIndex((m) => m.type === "live_end");
    expect(messages[liveStart]).toMatchObject({ type: "live_start", count: 1 });
    expect(messages.slice(liveStart + 1, liveEndIdx)).toEqual([JSON.parse(echoLine("hi", "u1"))]);

    relay.destroy();
  });

  test("broadcastOnly: 当前订阅者收到、后续订阅者不回放", () => {
    const relay = new PiSessionRelay();
    const live: string[] = [];
    relay.addSubscriber(
      (line) => live.push(line),
      (err) => {
        throw err;
      },
    );

    relay.broadcastOnly(JSON.stringify({ type: "ended" }));

    const liveEnd = live.findIndex((l) => l.includes('"live_end"'));
    expect(live.slice(liveEnd + 1)).toContain(JSON.stringify({ type: "ended" }));

    // 后续订阅者 live batch 为空（ended 未被回放）。
    const replayed: string[] = [];
    relay.addSubscriber(
      (line) => replayed.push(line),
      (err) => {
        throw err;
      },
    );
    const messages = replayed.map((line) => JSON.parse(line) as Record<string, unknown>);
    const liveStart = messages.findIndex((m) => m.type === "live_start");
    const liveEndIdx = messages.findIndex((m) => m.type === "live_end");
    expect(messages[liveStart]).toMatchObject({ type: "live_start", count: 0 });
    expect(messages.slice(liveStart + 1, liveEndIdx)).toEqual([]);

    relay.destroy();
  });

  test("reportError: 广播给所有订阅者", () => {
    const relay = new PiSessionRelay();
    const errors: Error[] = [];
    relay.addSubscriber(
      () => {},
      (err) => errors.push(err),
    );

    const boom = new Error("boom");
    relay.reportError(boom);
    expect(errors).toEqual([boom]);

    relay.destroy();
  });

  test("destroy: 后续 appendAndBroadcast/broadcastOnly/reportError 均 no-op", () => {
    const relay = new PiSessionRelay();
    const received: string[] = [];
    relay.addSubscriber(
      (line) => received.push(line),
      (err) => {
        throw err;
      },
    );
    relay.destroy();
    expect(relay.isDestroyed).toBe(true);

    relay.appendAndBroadcast(piEventLine("agent_start"));
    relay.broadcastOnly(JSON.stringify({ type: "ended" }));
    relay.reportError(new Error("after-destroy"));
    expect(received).toHaveLength(5); // 仅初始 5 个 marker 帧，无追加
  });

  test("hasSubscribers: addSubscriber 前后 + close 后", () => {
    const relay = new PiSessionRelay();
    expect(relay.hasSubscribers).toBe(false);
    const stream = relay.addSubscriber(
      () => {},
      () => {},
    );
    expect(relay.hasSubscribers).toBe(true);
    stream.close();
    expect(relay.hasSubscribers).toBe(false);
  });
});

// ── 增量回放锚（2026-10-28 codex 接入增量回放批）──
// 行形状 = codex（PiSessionRelay 是 codex 与 pi 共享 relay）：codex_user_echo /
// codex_event item/started|completed 可锚；不可锚行（turn/* 等）靠 needle 命中后的
// parse 确认跳过。
const codexEchoLine = (text: string, uuid: string) =>
  JSON.stringify({ type: "codex_user_echo", text, uuid });
const codexItemStartedLine = (id: string) =>
  JSON.stringify({
    type: "codex_event",
    event: { method: "item/started", params: { item: { id } } },
  });

describe("PiSessionRelay sinceId 增量回放（codex 行形状）", () => {
  test("锚在 history → replay=delta、history 只推锚后行、live 全推", () => {
    const relay = new PiSessionRelay();
    const h1 = codexEchoLine("q1", "h-echo-1");
    const h2 = codexItemStartedLine("h-item-1");
    relay.loadHistory([h1, h2]);
    relay.appendAndBroadcast(codexEchoLine("q2", "l-echo-1"));

    const received: string[] = [];
    relay.addSubscriber(
      (line) => received.push(line),
      (err) => {
        throw err;
      },
      { sinceId: "h-echo-1" },
    );
    const messages = received.map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(messages[0]).toMatchObject({ type: "session_init", replay: "delta" });
    expect(messages[1]).toMatchObject({ type: "history_start", count: 1 });
    expect(messages[2]).toEqual(JSON.parse(h2));
    expect(messages[3]).toMatchObject({ type: "history_end" });
    // 锚在 history → live 段全推（客户端无 live 内容）。
    expect(messages[4]).toMatchObject({ type: "live_start", count: 1 });
    expect(messages[5]).toEqual(JSON.parse(codexEchoLine("q2", "l-echo-1")));
    expect(messages[6]).toMatchObject({ type: "live_end" });

    relay.destroy();
  });

  test("锚在 live → history 空、live 只推锚后行", () => {
    const relay = new PiSessionRelay();
    relay.loadHistory([codexEchoLine("q1", "h-echo-1")]);
    relay.appendAndBroadcast(codexEchoLine("q2", "l-echo-1"));
    relay.appendAndBroadcast(codexItemStartedLine("l-item-1"));

    const received: string[] = [];
    relay.addSubscriber(
      (line) => received.push(line),
      (err) => {
        throw err;
      },
      { sinceId: "l-echo-1" },
    );
    const messages = received.map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(messages[0]).toMatchObject({ type: "session_init", replay: "delta" });
    // 锚在 live → history 段空 slice（客户端已持有全量 history）。
    expect(messages[1]).toMatchObject({ type: "history_start", count: 0 });
    expect(messages[2]).toMatchObject({ type: "history_end" });
    expect(messages[3]).toMatchObject({ type: "live_start", count: 1 });
    expect(messages[4]).toEqual(JSON.parse(codexItemStartedLine("l-item-1")));
    expect(messages[5]).toMatchObject({ type: "live_end" });

    relay.destroy();
  });

  test("needle 命中但 parse 确认失败（白名单外 method 带同值 id 键）→ 跳过、锚定真锚行", () => {
    const relay = new PiSessionRelay();
    // 不可锚行排在真锚行**之后**（尾扫先经过它）：锚白名单外 method 的行恰带
    // `"id":"<sinceId>"` 结构化键值对——needle 命中但 method 不在 item/started|
    // completed 白名单 → parse 确认拒绝、继续前扫 → 锚定真锚行。若去掉确认逻辑
    //（needle 命中即锚），锚会误落白名单外行。
    relay.appendAndBroadcast(codexItemStartedLine("l-item-9"));
    relay.appendAndBroadcast(
      JSON.stringify({
        type: "codex_event",
        event: { method: "turn/aborted", params: { id: "l-item-9" } },
      }),
    );

    const received: string[] = [];
    relay.addSubscriber(
      (line) => received.push(line),
      (err) => {
        throw err;
      },
      { sinceId: "l-item-9" },
    );
    const messages = received.map((l) => JSON.parse(l) as Record<string, unknown>);
    // 锚落 item 行（live 第 1 行）→ 其后剩 turn/aborted 行（锚后的 live 内容，照推）。
    expect(messages[0]).toMatchObject({ type: "session_init", replay: "delta" });
    expect(messages[3]).toMatchObject({ type: "live_start", count: 1 });
    expect(messages[4]).toMatchObject({
      type: "codex_event",
      event: { method: "turn/aborted" },
    });

    relay.destroy();
  });

  test("miss / 非法字符集 / 超长 sinceId → 全量回放（session_init 无 replay）", () => {
    const relay = new PiSessionRelay();
    relay.appendAndBroadcast(codexEchoLine("q1", "l-echo-1"));
    const fullReplay = (sinceId: string) => {
      const received: string[] = [];
      relay.addSubscriber(
        (line) => received.push(line),
        (err) => {
          throw err;
        },
        { sinceId },
      );
      const messages = received.map((l) => JSON.parse(l) as Record<string, unknown>);
      expect(messages[0]).not.toMatchObject({ replay: expect.anything() });
      expect(messages[1]).toMatchObject({ type: "history_start", count: 0 });
      // live 全量推（含锚前行）。
      expect(messages[3]).toMatchObject({ type: "live_start", count: 1 });
    };
    fullReplay("no-such-id"); // miss
    fullReplay("bad id with spaces"); // 非法字符集
    fullReplay("a".repeat(129)); // 超长
    relay.destroy();
  });
});
