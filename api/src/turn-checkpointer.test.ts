// TurnCheckpointer 编排层测试：真 git 仓库 + 真 CheckpointService 走全链路。断言锚在
// refs 树（refs/ar/checkpoints/<sessionKey>/<ordinal>/<phase>）与 commit message 的
// meta JSON 上——编排层的产出物就是这些 ref；listCheckpoints 的 summary 只投影
// endpoint 且无 phase/isError 字段，表达力不够，只在两处反向断言使用（非 git 降级、
// isError 不外泄到 summary）。

import { afterEach, beforeEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CheckpointService } from "./checkpoint-service";
import { TurnCheckpointer } from "./turn-checkpointer";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "agents-remote-turn-checkpointer-"));
  await mkdir(join(root, "demo"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

// 固定时间注入：meta 的 at 与 commit 的 author/committer date 都由它驱动，断言可复现。
const now = () => new Date("2026-11-14T00:00:00.000Z");

const SESSION = "test-session-1";
const RUNTIME = "runtime-1";

const git = async (projectPath: string, args: string[]) => {
  const process = Bun.spawn({
    cmd: ["git", "-C", projectPath, ...args],
    stderr: "pipe",
    stdout: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${stderr || stdout}`);
  }
  return stdout;
};

const initRepository = async (projectPath: string) => {
  await git(projectPath, ["init"]);
  await git(projectPath, ["config", "user.email", "test@example.com"]);
  await git(projectPath, ["config", "user.name", "Test User"]);
  // 给一个 initial commit：贴近真实会话形态（checkpoint commit 挂在有 HEAD 的仓库上，
  // 走 -p HEAD 而非 orphan），也让 endpoint numstat 有稳定的参照树。
  await writeFile(join(projectPath, "base.txt"), "base\n");
  await git(projectPath, ["add", "."]);
  await git(projectPath, ["commit", "-m", "initial"]);
};

// sessionKey 用独立实现而非被测方的同名导出——测试锚点不该信任被测方自己的推导
//（若 checkpointSessionKey 算错，依赖它的测试会跟着一起错，等于没测）。
const sessionKey = (sessionId: string) =>
  createHash("sha256").update(sessionId).digest("hex").slice(0, 16);

const refPath = (sessionId: string, ordinal: number, phase: string) =>
  `refs/ar/checkpoints/${sessionKey(sessionId)}/${ordinal}/${phase}`;

/** 列 session 下全部 checkpoint ref 的尾段（`<ordinal>/<phase>`），排序保证断言稳定。 */
const listRefs = async (projectPath: string, sessionId: string): Promise<string[]> => {
  const out = await git(projectPath, [
    "for-each-ref",
    `refs/ar/checkpoints/${sessionKey(sessionId)}`,
    "--format=%(refname)",
  ]);
  const prefix = `refs/ar/checkpoints/${sessionKey(sessionId)}/`;
  return out
    .split("\n")
    .filter(Boolean)
    .map((refname) => refname.slice(prefix.length))
    .sort();
};

type RefMeta = {
  ar: number;
  sessionId: string;
  ordinal: number;
  phase: string;
  anchorUuid: string | null;
  endUuid?: string;
  isError?: boolean;
  at: string;
};

/** 读 ref 指向 commit 的 message meta（cat-file 输出 = headers + 空行 + message）。 */
const readRefMeta = async (projectPath: string, ref: string): Promise<RefMeta> => {
  const raw = await git(projectPath, ["cat-file", "commit", ref]);
  const message = raw.slice(raw.indexOf("\n\n") + 2);
  return JSON.parse(message.trim()) as RefMeta;
};

const checkpointer = () => new TurnCheckpointer({ checkpoints: new CheckpointService(), now });

// 真 git 全链路的重测试统一显式放宽超时：bun test 默认 5s，机器负载抖动即假挂。
test("beginTurn captures baseline, endTurn captures endpoint with last noted uuid", async () => {
  const projectPath = join(root, "demo");
  await initRepository(projectPath);
  const tc = checkpointer();

  await tc.beginTurn({ runtimeKey: RUNTIME, sessionId: SESSION, projectPath, anchorUuid: "a1" });
  expect(await listRefs(projectPath, SESSION)).toEqual(["1/baseline"]);
  const baseline = await readRefMeta(projectPath, refPath(SESSION, 1, "baseline"));
  expect(baseline).toMatchObject({
    ar: 1,
    sessionId: SESSION,
    ordinal: 1,
    phase: "baseline",
    anchorUuid: "a1",
  });

  // endUuid 取最后一次 noteOutputUuid 的值——截断锚必须是「最后一条真实消息」。
  tc.noteOutputUuid(RUNTIME, "uuid-1");
  tc.noteOutputUuid(RUNTIME, "uuid-2");
  await tc.endTurn(RUNTIME, false);

  expect(await listRefs(projectPath, SESSION)).toEqual(["1/baseline", "1/endpoint"]);
  const endpoint = await readRefMeta(projectPath, refPath(SESSION, 1, "endpoint"));
  expect(endpoint).toMatchObject({
    sessionId: SESSION,
    ordinal: 1,
    phase: "endpoint",
    anchorUuid: "a1",
    endUuid: "uuid-2",
    at: "2026-11-14T00:00:00.000Z",
  });

  // 二次 endTurn：in-flight 已在首次收口时删除 → no-op，不产生第二个 endpoint ref。
  await tc.endTurn(RUNTIME, false);
  expect(await listRefs(projectPath, SESSION)).toEqual(["1/baseline", "1/endpoint"]);
}, 30000);

test("concurrent beginTurn calls share one ordinal and one baseline", async () => {
  const projectPath = join(root, "demo");
  await initRepository(projectPath);
  const tc = checkpointer();

  // 快速连发两帧上行：判重与占位必须同步完成。若中间有 await（refs 扫描），两帧会
  // 各自越过 inFlight.has 并都拿到 ordinal 1 → 第二条 baseline 覆盖第一条。
  await Promise.all([
    tc.beginTurn({ runtimeKey: RUNTIME, sessionId: SESSION, projectPath, anchorUuid: "a1" }),
    tc.beginTurn({ runtimeKey: RUNTIME, sessionId: SESSION, projectPath, anchorUuid: "a2" }),
  ]);

  expect(await listRefs(projectPath, SESSION)).toEqual(["1/baseline"]);
  const baseline = await readRefMeta(projectPath, refPath(SESSION, 1, "baseline"));
  expect(baseline.anchorUuid).toBe("a1");

  // 该 turn 收口后下一轮照常续编（占位路径不污染 lastOrdinal）。
  await tc.endTurn(RUNTIME, false);
  await tc.beginTurn({ runtimeKey: RUNTIME, sessionId: SESSION, projectPath, anchorUuid: "a3" });
  expect(await listRefs(projectPath, SESSION)).toEqual(["1/baseline", "1/endpoint", "2/baseline"]);
}, 30000);

test("ordinal continues past a baseline-only half turn (maxOrdinal scans all phases)", async () => {
  const projectPath = join(root, "demo");
  await initRepository(projectPath);
  const tcA = checkpointer();
  // 半 turn：baseline 写了，endpoint 因崩溃没写。
  await tcA.beginTurn({ runtimeKey: RUNTIME, sessionId: SESSION, projectPath, anchorUuid: "a1" });

  // 重启后新实例必须看到 baseline_1 并续编到 2——只从 endpoint 推导会重新用回 ordinal 1，
  // 把上一轮唯一的快照覆盖掉。
  const tcB = checkpointer();
  await tcB.beginTurn({ runtimeKey: RUNTIME, sessionId: SESSION, projectPath, anchorUuid: "a2" });
  expect(await listRefs(projectPath, SESSION)).toEqual(["1/baseline", "2/baseline"]);
  const baseline1 = await readRefMeta(projectPath, refPath(SESSION, 1, "baseline"));
  expect(baseline1.anchorUuid).toBe("a1");
}, 30000);

test("mid-turn queued messages merge into the current turn without new ordinal", async () => {
  const projectPath = join(root, "demo");
  await initRepository(projectPath);
  const tc = checkpointer();

  // 同一 runtimeKey 的第二次 beginTurn 是排队消息：归当前 turn，不分配新 ordinal、
  // 不覆盖 anchor（Claude 原生 "Messages sent mid-turn not checkpointed" 语义）。
  await tc.beginTurn({ runtimeKey: RUNTIME, sessionId: SESSION, projectPath, anchorUuid: "a1" });
  await tc.beginTurn({ runtimeKey: RUNTIME, sessionId: SESSION, projectPath, anchorUuid: "a2" });

  expect(await listRefs(projectPath, SESSION)).toEqual(["1/baseline"]);
  const baseline = await readRefMeta(projectPath, refPath(SESSION, 1, "baseline"));
  expect(baseline.anchorUuid).toBe("a1");
}, 30000);

test("consecutive turns increment ordinal with paired baseline+endpoint refs", async () => {
  const projectPath = join(root, "demo");
  await initRepository(projectPath);
  const tc = checkpointer();

  await tc.beginTurn({ runtimeKey: RUNTIME, sessionId: SESSION, projectPath, anchorUuid: "a1" });
  await tc.endTurn(RUNTIME, false);
  await tc.beginTurn({ runtimeKey: RUNTIME, sessionId: SESSION, projectPath, anchorUuid: "a2" });
  await tc.endTurn(RUNTIME, false);

  expect(await listRefs(projectPath, SESSION)).toEqual([
    "1/baseline",
    "1/endpoint",
    "2/baseline",
    "2/endpoint",
  ]);
  const endpoint2 = await readRefMeta(projectPath, refPath(SESSION, 2, "endpoint"));
  expect(endpoint2).toMatchObject({ ordinal: 2, anchorUuid: "a2" });
}, 30000);

test("restart derives next ordinal from existing refs max, not from 1", async () => {
  const projectPath = join(root, "demo");
  await initRepository(projectPath);
  const tcA = checkpointer();
  await tcA.beginTurn({ runtimeKey: RUNTIME, sessionId: SESSION, projectPath, anchorUuid: "a1" });
  await tcA.endTurn(RUNTIME, false);

  // 全新实例模拟 API 重启：内存 lastOrdinal 清零，ordinal 必须从 refs 现状续编，
  // 否则 ordinal 1 会被重捕获覆盖、历史 checkpoint 全部丢失。
  const tcB = checkpointer();
  await tcB.beginTurn({ runtimeKey: RUNTIME, sessionId: SESSION, projectPath, anchorUuid: "a2" });

  expect(await listRefs(projectPath, SESSION)).toEqual(["1/baseline", "1/endpoint", "2/baseline"]);
  const baseline2 = await readRefMeta(projectPath, refPath(SESSION, 2, "baseline"));
  expect(baseline2).toMatchObject({ ordinal: 2, anchorUuid: "a2" });
  const baseline1 = await readRefMeta(projectPath, refPath(SESSION, 1, "baseline"));
  expect(baseline1.anchorUuid).toBe("a1");
}, 30000);

test("resetSession clears in-flight so later endTurn is a no-op", async () => {
  const projectPath = join(root, "demo");
  await initRepository(projectPath);
  const tc = checkpointer();
  await tc.beginTurn({ runtimeKey: RUNTIME, sessionId: SESSION, projectPath, anchorUuid: "a1" });

  // CLI 销毁/respawn 清 in-flight：残留会让下一 turn 被误判为排队消息。
  tc.resetSession(RUNTIME);
  await tc.endTurn(RUNTIME, false);

  expect(await listRefs(projectPath, SESSION)).toEqual(["1/baseline"]);
}, 30000);

test("non-git project degrades silently through the whole orchestration", async () => {
  // 非 git 目录：capture 内部抛 CHECKPOINT_NOT_GIT，编排层吞掉照常推进状态机。
  const projectPath = join(root, "plain");
  await mkdir(projectPath);
  const tc = checkpointer();

  await tc.beginTurn({ runtimeKey: RUNTIME, sessionId: SESSION, projectPath, anchorUuid: "a1" });
  await tc.endTurn(RUNTIME, false);

  const service = new CheckpointService();
  expect(await service.listCheckpoints(projectPath, SESSION)).toEqual({
    repository: false,
    projectName: "",
    reason: "not_git_repository",
  });
}, 30000);

test("runtimeKeys do not clobber each other across sessions", async () => {
  const projectPath = join(root, "demo");
  await initRepository(projectPath);
  const tc = checkpointer();

  // 两个 runtime 并发同仓：ordinal 各自从自己 sessionKey 子树推导，互不覆盖。
  await tc.beginTurn({ runtimeKey: "r1", sessionId: "s1", projectPath, anchorUuid: "a1" });
  await tc.beginTurn({ runtimeKey: "r2", sessionId: "s2", projectPath, anchorUuid: "b1" });
  await tc.endTurn("r1", false);
  await tc.endTurn("r2", false);

  expect(await listRefs(projectPath, "s1")).toEqual(["1/baseline", "1/endpoint"]);
  expect(await listRefs(projectPath, "s2")).toEqual(["1/baseline", "1/endpoint"]);
  const s1 = await readRefMeta(projectPath, refPath("s1", 1, "endpoint"));
  const s2 = await readRefMeta(projectPath, refPath("s2", 1, "endpoint"));
  expect(s1).toMatchObject({ sessionId: "s1", anchorUuid: "a1" });
  expect(s2).toMatchObject({ sessionId: "s2", anchorUuid: "b1" });
}, 30000);

test("endTurn(true) records isError in ref meta, summary projection omits it", async () => {
  const projectPath = join(root, "demo");
  await initRepository(projectPath);
  const tc = checkpointer();
  await tc.beginTurn({ runtimeKey: RUNTIME, sessionId: SESSION, projectPath, anchorUuid: "a1" });
  await tc.endTurn(RUNTIME, true);

  // isError 只落在 commit message meta 里（供回滚 UI 判定），不进 listCheckpoints
  // summary——summary 投影面没有该字段。
  const endpoint = await readRefMeta(projectPath, refPath(SESSION, 1, "endpoint"));
  expect(endpoint.isError).toBe(true);

  const list = await new CheckpointService().listCheckpoints(projectPath, SESSION);
  if (list.repository !== true) throw new Error("expected repository");
  const summary = list.checkpoints.find((c) => c.ordinal === 1);
  if (!summary) throw new Error("expected endpoint summary for turn 1");
  expect("isError" in summary).toBe(false);
  expect(summary).toMatchObject({ ordinal: 1, anchorUuid: "a1", status: "ready" });
}, 30000);

test("capture failure never propagates: beginTurn/endTurn both resolve", async () => {
  // 故障注入桩必须带上 TurnCheckpointer 实际触到的另外两个方法：beginTurn 先
  // maxOrdinal 定 ordinal、endTurn 尾部 fire-and-forget prune，两者都在捕获
  // try/catch 之外——缺了会在「捕获失败不上抛」断言之前先以 TypeError 挂掉。
  // prune 也注入拒绝：fire-and-forget 的 .catch 必须吞掉它，endTurn 照样 resolve。
  const failing = {
    capture: () => Promise.reject(new Error("boom")),
    prune: () => Promise.reject(new Error("boom")),
    maxOrdinal: async () => 0,
  } as unknown as CheckpointService;
  const tc = new TurnCheckpointer({ checkpoints: failing, now });

  // 不抛即断言：await 一个 rejected promise 会让测试直接挂。
  await tc.beginTurn({
    runtimeKey: RUNTIME,
    sessionId: SESSION,
    projectPath: join(root, "demo"),
    anchorUuid: "a1",
  });
  await tc.endTurn(RUNTIME, false);
});
