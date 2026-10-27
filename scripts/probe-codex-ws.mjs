// probe-codex-ws.mjs —— codex chat 流 WS 级端到端（真实 dev api + 真实 codex app-server）：
// 创建 codex 会话 → WS codex-stream（session_init/history/live 批处理 + codex_config）
// → user → echo/turn 事件/ended → 第二轮 user + interrupt → close → 重开 WS 断言
// thread/resume 合成 history 段（resume:true + count>0 + 回放行）→ close 会话清理。
//
// 需本机 codex 已登录（model/list 非空 = codex_config 帧的判据）；测试会话建在 test
// 项目（PROJECTS_ROOT/test），清理只 POST /close 关掉本探针创建的实例。
// 用法：bun scripts/probe-codex-ws.mjs
import { readFileSync, readlinkSync } from "node:fs";
import { readAppPassword } from "./lib/deploy-config.mjs";

const API = process.env.API_ORIGIN ?? "http://127.0.0.1:43011";
const WS = process.env.WS_ORIGIN ?? "ws://127.0.0.1:43011";
const PROJECT = process.env.CODEX_PROBE_PROJECT ?? "test";
const TURN_TIMEOUT_MS = Number(process.env.TURN_TIMEOUT_MS ?? 120_000); // 真实 LLM 一次 turn 上限

const results = [];
const check = (ok, name, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "[PASS]" : "[FAIL]"} ${name}${detail ? ` — ${detail}` : ""}`);
};
// 外部账号状态（限流/额度）不判 FAIL：真实 LLM 内容断言降级 SKIP，链路断言照常。
const skips = [];
const skip = (name, detail = "") => {
  skips.push(name);
  console.log(`[SKIP] ${name}${detail ? ` — ${detail}` : ""}`);
};

const pw = await readAppPassword();
const loginRes = await fetch(`${API}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ password: pw }),
});
if (!loginRes.ok) throw new Error(`login failed: ${loginRes.status}`);
const { token } = await loginRes.json();
const auth = { authorization: `Bearer ${token}` };
console.log("[ok] login");

// ── 1. 创建 codex 会话（threadId backfill 链 = API 层验证点） ──
const displayName = `codex-ws-probe-${Date.now()}`;
const createRes = await fetch(`${API}/api/projects/${PROJECT}/agent-sessions`, {
  method: "POST",
  headers: { ...auth, "content-type": "application/json" },
  body: JSON.stringify({ provider: "codex", displayName }),
});
if (!createRes.ok) {
  throw new Error(`create agent session failed: ${createRes.status} ${await createRes.text()}`);
}
const { session } = await createRes.json();
const UUID_SHAPE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
check(
  typeof session?.codexThreadId === "string" && UUID_SHAPE.test(session.codexThreadId),
  "create → codexThreadId 回填（UUID 形状）",
  session.codexThreadId,
);

// ── WS 帧收集器（镜像 probe-chat-e2e：gzip 批解压 + marker 入 frames + waitFor） ──
function openStream(sessionId) {
  const wsUrl = `${WS}/api/projects/${PROJECT}/agent-sessions/${encodeURIComponent(sessionId)}/codex-stream?token=${encodeURIComponent(token)}`;
  const ws = new WebSocket(wsUrl);
  ws.binaryType = "arraybuffer";

  const frames = [];
  const waiters = [];
  const maybeSettle = () => {
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i].pred(frames)) {
        waiters.splice(i, 1)[0].resolve(frames);
      }
    }
  };
  const waitFor = (pred, timeoutMs = TURN_TIMEOUT_MS) =>
    new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), timeoutMs);
      waiters.push({
        pred,
        resolve: (f) => {
          clearTimeout(timer);
          resolve(f);
        },
      });
      maybeSettle();
    });

  const decompressGzip = async (buf) => {
    const stream = new Response(buf).body.pipeThrough(new DecompressionStream("gzip"));
    return await new Response(stream).text();
  };

  let historyBatch = null;
  let liveBatch = null;
  const flush = (batch, marker) => {
    for (const msg of batch) frames.push(msg);
    if (marker) frames.push(marker);
    maybeSettle();
  };

  const handleTextFrame = (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.type === "history_start") {
      historyBatch = [];
      frames.push(msg);
      maybeSettle();
      return;
    }
    if (msg.type === "history_end") {
      flush(historyBatch ?? [], msg);
      historyBatch = null;
      return;
    }
    if (msg.type === "live_start") {
      liveBatch = [];
      frames.push(msg);
      maybeSettle();
      return;
    }
    if (msg.type === "live_end") {
      flush(liveBatch ?? [], msg);
      liveBatch = null;
      return;
    }
    frames.push(msg);
    maybeSettle();
  };

  // gzip 批解压是异步的：onmessage 各自 async 不保证串行，history_end/live_end 文本
  // marker 可能先于前一个批解压完成（把 batch 置 null 后行被丢——probe-chat-e2e 同款
  // 坑）。全部挂到 promise 链上严格串行。
  let chain = Promise.resolve();
  ws.onmessage = (event) => {
    chain = chain
      .then(async () => {
        if (event.data instanceof ArrayBuffer || event.data instanceof Uint8Array) {
          const text = await decompressGzip(
            event.data instanceof Uint8Array ? event.data : new Uint8Array(event.data),
          );
          for (const line of text.split("\n")) {
            if (line.trim()) handleTextFrame(line);
          }
          return;
        }
        handleTextFrame(String(event.data));
      })
      .catch(() => {});
  };

  return {
    ws,
    frames,
    waitFor,
    send: (msg) => ws.send(JSON.stringify(msg)),
    close: () => ws.close(),
  };
}

const methodOf = (f) => (f?.event && typeof f.event === "object" ? f.event.method : undefined);

/** 杀掉本探针项目目录下 codex app-server 进程（模拟崩溃/API 重启；只杀归属明确的）。 */
const killSessionAppServer = (project) => {
  const pids = new TextDecoder()
    .decode(Bun.spawnSync(["pgrep", "-f", "app-server"]).stdout)
    .trim()
    .split("\n")
    .filter(Boolean);
  let killed = 0;
  for (const pid of pids) {
    let cwd = "";
    let cmdline = "";
    try {
      cwd = readlinkSync(`/proc/${pid}/cwd`);
      cmdline = readFileSync(`/proc/${pid}/cmdline`, "utf8");
    } catch {
      continue;
    }
    // 归属确认：cmdline 是 codex app-server + cwd 是本探针项目目录（同机他项目不碰）。
    if (!cmdline.includes("app-server") || !cmdline.includes("codex")) continue;
    if (!cwd.endsWith(`/${project}`)) continue;
    try {
      process.kill(Number(pid), "SIGKILL");
      killed++;
    } catch {
      /* 已退出 */
    }
  }
  return killed;
};

try {
  // ── 2. WS open：开场 markers + codex_config（已登录 → models 非空） ──
  const s1 = openStream(session.id);
  await s1.waitFor(
    (fs) => fs.some((f) => f.type === "live_start") && fs.some((f) => f.type === "codex_config"),
    TURN_TIMEOUT_MS,
    "open markers + config",
  );
  const ms1 = s1.frames;
  check(
    ms1[0]?.type === "session_init" && ms1[0]?.resume === false,
    "open → session_init(resume:false)",
  );
  const hs1 = ms1.find((f) => f.type === "history_start");
  check(hs1?.count === 0, "open → history_start(count:0)", `count=${hs1?.count}`);
  const config = ms1.find((f) => f.type === "codex_config");
  check(
    !!config && Array.isArray(config.models) && config.models.length > 0,
    "open → codex_config（models 非空 = 已登录）",
    `models=${config?.models?.length}`,
  );

  // ── 3. 第一轮 user：echo → turn 事件 → ended ──
  s1.send({ type: "user", text: "Reply with exactly: pong", uuid: "probe-u1" });
  const afterTurn1 = await s1.waitFor(
    (fs) => fs.some((f) => f.type === "ended"),
    TURN_TIMEOUT_MS,
    "turn1 ended",
  );
  check(!!afterTurn1, "user → ended（turn/completed 收口）");
  check(
    ms1.some((f) => f.type === "codex_user_echo" && f.uuid === "probe-u1"),
    "user → codex_user_echo 回环",
  );
  check(
    ms1.some((f) => methodOf(f) === "turn/started") &&
      ms1.some((f) => methodOf(f) === "turn/completed"),
    "turn/started + turn/completed 通知透传",
  );
  const ended1 = ms1.find((f) => f.type === "ended");
  const turn1CompletedJson = JSON.stringify(
    ms1.find((f) => methodOf(f) === "turn/completed") ?? {},
  );
  const turn1RateLimited = /429|Too Many Requests|responseTooManyFail/i.test(turn1CompletedJson);
  const turn1Ok = ended1?.stopReason === "completed";
  if (turn1Ok) {
    check(true, "ended.stopReason === completed");
  } else if (turn1RateLimited) {
    skip("ended.stopReason === completed", "codex 账号限流（429）——外部状态，内容断言降级");
  } else {
    check(false, "ended.stopReason === completed", turn1CompletedJson.slice(0, 300));
  }

  // ── 4. 第二轮 user + 立即 interrupt：ended 必到（interrupted 或快速 completed 均可） ──
  s1.send({
    type: "user",
    text: "Count slowly from 1 to 50, one number per line.",
    uuid: "probe-u2",
  });
  await s1.waitFor(
    (fs) => fs.filter((f) => f.type === "codex_user_echo").length >= 2,
    15_000,
    "turn2 echo",
  );
  s1.send({ type: "interrupt" });
  const afterTurn2 = await s1.waitFor(
    (fs) => fs.filter((f) => f.type === "ended").length >= 2,
    TURN_TIMEOUT_MS,
    "turn2 ended",
  );
  const ended2 = ms1.filter((f) => f.type === "ended")[1];
  check(
    !!afterTurn2 && ended2?.stopReason !== undefined,
    "interrupt → 第二个 ended（stopReason 携带状态）",
    `stopReason=${ended2?.stopReason}`,
  );

  // ── 5. 杀 app-server 进程（模拟 API 重启/崩溃）→ 重开：thread/resume 全量恢复 ──
  // 不能用 POST /close（closeMetadata = 杀进程 + 删会话，语义是「结束会话」）；这里只杀
  // 进程、保留 metadata，重开 WS 的 ensureRunning 才走 thread/resume 分支。WS close 本身
  // 只断订阅（进程存活期重连 = relay live 回放，resume:false，与 claude/pi relay 同语义）。
  s1.close();
  const killed = killSessionAppServer(PROJECT);
  check(killed > 0, "kill app-server 进程（/proc cwd 校验归属）", `pids=${killed}`);
  await Bun.sleep(500);
  const s2 = openStream(session.id);
  await s2.waitFor(
    (fs) => fs.some((f) => f.type === "history_end") && fs.some((f) => f.type === "codex_config"),
    TURN_TIMEOUT_MS,
    "reopen markers",
  );
  const ms2 = s2.frames;
  check(
    ms2[0]?.type === "session_init" && ms2[0]?.resume === true,
    "reopen → session_init(resume:true)",
    `frames=${ms2.length} first=${JSON.stringify(ms2[0] ?? null).slice(0, 120)}`,
  );
  const hs2 = ms2.find((f) => f.type === "history_start");
  check(
    typeof hs2?.count === "number" && hs2.count > 0,
    "reopen → history_start(count>0)",
    `count=${hs2?.count}`,
  );
  const historyEndIdx = ms2.findIndex((f) => f.type === "history_end");
  const historyRows = ms2.slice(1, historyEndIdx);
  const replayedItems = historyRows.filter((f) => methodOf(f) === "item/completed");
  if (turn1Ok) {
    const replayedUser = replayedItems.some((f) =>
      JSON.stringify(f?.event?.params?.item ?? {}).includes("pong"),
    );
    check(replayedUser, "history 段含第一轮 user 消息回放（item/completed 合成帧）");
  } else {
    // 限流下 turn 可能无 items：仍断言回放行是合法合成帧（形状对），内容不判。
    check(
      replayedItems.length > 0,
      "history 段含 item/completed 合成帧（内容断言因限流降级）",
      `items=${replayedItems.length} rows=${historyRows
        .map((f) => `${f.type}/${methodOf(f) ?? "-"}`)
        .join(",")}`,
    );
  }
  const liveStartIdx = ms2.findIndex((f) => f.type === "live_start");
  check(liveStartIdx > historyEndIdx, "reopen 帧序：history 段在 live 段之前");

  // ── 6. 清理：只关本探针创建的实例（杀 app-server 进程，metadata 残留无害） ──
  s2.close();
  const closeRes = await fetch(
    `${API}/api/projects/${PROJECT}/agent-sessions/${encodeURIComponent(session.id)}/close`,
    { method: "POST", headers: auth },
  );
  check(closeRes.ok, "cleanup → POST /close", `status=${closeRes.status}`);
} finally {
  const passed = results.filter(Boolean).length;
  const failed = results.filter((r) => !r).length;
  const skipped = skips.length;
  console.log(
    `\n${passed}/${results.length + skipped} passed${skipped ? `（${skipped} skipped：外部限流）` : ""}`,
  );
  if (failed > 0) process.exit(1);
}
