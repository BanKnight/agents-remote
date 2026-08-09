import { afterEach, describe, expect, it } from "bun:test";
import { SkillTaskRegistry, handleSkillTaskEvents, skillTaskRegistry } from "./skill-tasks";
import type { SkillTaskFrame } from "@agents-remote/shared";

afterEach(() => {
  skillTaskRegistry.clear();
});

function freshRegistry(): SkillTaskRegistry {
  return new SkillTaskRegistry();
}

describe("SkillTaskRegistry.startOrJoin", () => {
  it("creates new task with unique taskId", () => {
    const r = freshRegistry();
    const a = r.startOrJoin("install", "install:claude-code:foo/bar", "bar");
    const b = r.startOrJoin("install", "install:claude-code:baz/qux", "qux");
    expect(a.joined).toBe(false);
    expect(b.joined).toBe(false);
    expect(a.taskId).not.toBe(b.taskId);
    expect(a.status).toBe("running");
    expect(r.get(a.taskId)?.status).toBe("running");
  });

  it("joins existing running task with same dedupKey", () => {
    const r = freshRegistry();
    const a = r.startOrJoin("update", "update:claude-code:tdd", "tdd");
    const b = r.startOrJoin("update", "update:claude-code:tdd", "tdd");
    expect(b.joined).toBe(true);
    expect(b.taskId).toBe(a.taskId);
  });

  it("starts fresh task after previous terminated (same key)", () => {
    const r = freshRegistry();
    const a = r.startOrJoin("install", "install:claude-code:foo/bar", "bar");
    r.finish(a.taskId, { status: "done", name: "bar" });
    const b = r.startOrJoin("install", "install:claude-code:foo/bar", "bar");
    expect(b.joined).toBe(false);
    expect(b.taskId).not.toBe(a.taskId);
  });
});

describe("SkillTaskRegistry.subscribe + finish", () => {
  it("delivers running frame immediately and done frame on finish", () => {
    const r = freshRegistry();
    const { taskId } = r.startOrJoin("install", "k1", "s1");
    const frames: SkillTaskFrame[] = [];
    r.subscribe(taskId, (f) => frames.push(f));
    expect(frames.length).toBe(1);
    expect(frames[0].status).toBe("running");
    r.finish(taskId, { status: "done", name: "s1" });
    expect(frames.length).toBe(2);
    expect(frames[1].status).toBe("done");
    expect(frames[1].name).toBe("s1");
  });

  it("delivers failed frame with error code", () => {
    const r = freshRegistry();
    const { taskId } = r.startOrJoin("update", "k2", "s2");
    const frames: SkillTaskFrame[] = [];
    r.subscribe(taskId, (f) => frames.push(f));
    r.finish(taskId, { status: "failed", code: "SKILL_UPDATE_FAILED", message: "boom" });
    expect(frames[1].status).toBe("failed");
    expect(frames[1].error?.code).toBe("SKILL_UPDATE_FAILED");
    expect(frames[1].error?.message).toBe("boom");
  });

  it("late subscriber gets terminal frame immediately", () => {
    const r = freshRegistry();
    const { taskId } = r.startOrJoin("install", "k3", "s3");
    r.finish(taskId, { status: "done", name: "s3" });
    const frames: SkillTaskFrame[] = [];
    r.subscribe(taskId, (f) => frames.push(f));
    expect(frames.length).toBe(1);
    expect(frames[0].status).toBe("done");
  });

  it("subscribe unknown task is no-op", () => {
    const r = freshRegistry();
    const frames: SkillTaskFrame[] = [];
    const unsub = r.subscribe("nonexistent", (f) => frames.push(f));
    expect(frames.length).toBe(0);
    unsub();
  });

  it("finish is idempotent (second finish ignored)", () => {
    const r = freshRegistry();
    const { taskId } = r.startOrJoin("install", "k4", "s4");
    const frames: SkillTaskFrame[] = [];
    r.subscribe(taskId, (f) => frames.push(f));
    r.finish(taskId, { status: "done", name: "s4" });
    r.finish(taskId, { status: "failed", code: "X", message: "y" });
    expect(frames.length).toBe(2); // running + done only
  });
});

// ── SSE handler ──

function makeServerSpy() {
  const timeouts: number[] = [];
  const server = {
    timeout: (_req: Request, seconds: number) => {
      timeouts.push(seconds);
    },
  };
  return { server, timeouts };
}

async function readStream(response: Response): Promise<string> {
  const reader = response.body!.getReader();
  const dec = new TextDecoder();
  let out = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    out += dec.decode(value, { stream: true });
  }
  return out + dec.decode();
}

function parseFrames(text: string): SkillTaskFrame[] {
  return text
    .split("\n")
    .filter((l) => l.startsWith("data: "))
    .map((l) => JSON.parse(l.slice(6)) as SkillTaskFrame);
}

function taskUrl(taskId: string): URL {
  return new URL(`http://x/api/skills/task/${taskId}/events`);
}

describe("handleSkillTaskEvents", () => {
  it("returns undefined for non-matching path", async () => {
    const { server } = makeServerSpy();
    const url = new URL("http://x/api/skills/installed");
    const res = await handleSkillTaskEvents(new Request(url), url, server);
    expect(res).toBeUndefined();
  });

  it("disables per-connection idle timeout via server.timeout(req, 0)", async () => {
    const { server, timeouts } = makeServerSpy();
    const url = taskUrl("abc");
    const res = await handleSkillTaskEvents(new Request(url), url, server);
    expect(res).toBeDefined();
    expect(timeouts).toEqual([0]);
  });

  it("unknown taskId → failed frame with SKILL_TASK_NOT_FOUND, then close", async () => {
    const { server } = makeServerSpy();
    const url = taskUrl("nonexistent");
    const res = await handleSkillTaskEvents(new Request(url), url, server);
    expect(res!.status).toBe(200);
    expect(res!.headers.get("content-type")).toBe("text/event-stream");
    expect(res!.headers.get("x-accel-buffering")).toBe("no");
    const frames = parseFrames(await readStream(res!));
    expect(frames).toHaveLength(1);
    expect(frames[0].status).toBe("failed");
    expect(frames[0].error?.code).toBe("SKILL_TASK_NOT_FOUND");
  });

  it("terminated task → late joiner gets terminal frame, then close", async () => {
    const { taskId } = skillTaskRegistry.startOrJoin("install", "sse:k1", "s1");
    skillTaskRegistry.finish(taskId, { status: "done", name: "s1" });
    const { server } = makeServerSpy();
    const url = taskUrl(taskId);
    const res = await handleSkillTaskEvents(new Request(url), url, server);
    const frames = parseFrames(await readStream(res!));
    expect(frames).toHaveLength(1);
    expect(frames[0].status).toBe("done");
    expect(frames[0].name).toBe("s1");
  });

  it("running task → first frame running; finish delivers done and closes", async () => {
    const { taskId } = skillTaskRegistry.startOrJoin("update", "sse:k2", "s2");
    const { server } = makeServerSpy();
    const url = taskUrl(taskId);
    const res = await handleSkillTaskEvents(new Request(url), url, server);
    const reader = res!.body!.getReader();
    const dec = new TextDecoder();

    // 首帧：running（subscribe 立即同步推）
    const first = await reader.read();
    const f1 = JSON.parse(
      dec
        .decode(first.value)
        .replace(/^data: /, "")
        .trim(),
    ) as SkillTaskFrame;
    expect(f1.status).toBe("running");

    // 触发终态 → subscriber 回调推 done + close
    skillTaskRegistry.finish(taskId, { status: "done", name: "s2" });
    const second = await reader.read();
    const f2 = JSON.parse(
      dec
        .decode(second.value)
        .replace(/^data: /, "")
        .trim(),
    ) as SkillTaskFrame;
    expect(f2.status).toBe("done");
    expect(f2.name).toBe("s2");

    await reader.cancel(); // 清理 heartbeat + unsubscribe
  });
});
