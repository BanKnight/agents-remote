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
});
