// 测进入 Claude detail 的服务端耗时分解，回答"是否变慢、慢在哪"。
//   GET  agent-session/:id  → getAgentSession + parseClaudePermissionModes(首次 spawn claude --help，后续缓存)
//                             + settingsStore.read(每次 readFile 读盘，无缓存) + buildAvailableAliases(纯计算)
//   WS   claude-stream      → relay.activate(读 JSONL history) → seed_init(含 modelAlias) → history → live
// Part 3（v1.4 批8 工作台密度）：03b 滚动收敛 —— 上滚 1 屏 → .mini 迷你条出现（row2 折叠、
//   子 agent 条保留并存）、死区保持收敛（滞回 0.5 屏弹回）、连续微滚零翻转（禁逐帧 setState
//   守卫）、回底/点 ▾ 弹回。MutationObserver 计数折叠翻转次数 = 硬数据。
// Part 4（桌面）：同款收敛 + subbar 保留。双面板隔离场景不可构造（桌面「点左栏第二个实例」
//   会丢 leaf，存量问题）——atom Record scoping 隔离语义由 workbench-model 单测覆盖。
// 密码自读（env → config.yaml → /proc/<api-pid>/environ），不进 agent 上下文、不打印值。
// 用法：bun scripts/probe-claude-detail-perf.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const API = process.env.API_ORIGIN ?? "http://127.0.0.1:43011";
const PROJECTS = (process.env.PROBE_PROJECTS ?? "test,novels,lang-partner,简易会话").split(",");
const N = Number(process.env.N ?? 6);

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

// 找一个 claude session
let session = null;
let projectName = null;
for (const p of PROJECTS) {
  const r = await fetch(`${API}/api/projects/${encodeURIComponent(p)}/agent-sessions`, {
    headers: auth,
  });
  if (!r.ok) continue;
  const { sessions } = await r.json();
  const found = (sessions ?? []).find((s) => s.provider === "claude");
  if (found) {
    session = found;
    projectName = p;
    break;
  }
}
if (!session) {
  console.error("未找到 claude session，项目：", PROJECTS.join("/"));
  console.error("（test 项目没有 claude session；可先在 test 项目网页里建一个再测）");
  process.exit(1);
}
console.log(
  `[ok] project=${projectName} session=${session.id}\n` +
    `      claudeSessionId=${session.claudeSessionId ?? "none"} model=${session.model ?? "?"} modelAlias=${session.modelAlias ?? "?"} status=${session.status}`,
);

// ── GET agent-session/:id 多次计时 ──
const detailUrl = `${API}/api/projects/${encodeURIComponent(projectName)}/agent-sessions/${encodeURIComponent(session.id)}`;
console.log(
  `\n=== GET agent-session/:id 耗时（${N} 次，首次含 parseClaudePermissionModes spawn 'claude --help'）===`,
);
const times = [];
for (let i = 0; i < N; i++) {
  const t0 = performance.now();
  const r = await fetch(detailUrl, { headers: auth });
  const body = await r.json();
  const dt = performance.now() - t0;
  times.push(dt);
  const resolvedKeys = Object.keys(body.availableModelResolved ?? {});
  console.log(
    `  #${i + 1}: ${dt.toFixed(1).padStart(6)}ms  status=${r.status}  resolved=[${resolvedKeys.join(",")}]  models=${(body.availableModels ?? []).join("/")}`,
  );
}
const sorted = [...times].sort((a, b) => a - b);
const median = sorted[Math.floor(sorted.length / 2)];
console.log(
  `  → 首次=${times[0].toFixed(1)}ms  后续中位=${median.toFixed(1)}ms  min=${sorted[0].toFixed(1)}ms  max=${sorted[sorted.length - 1].toFixed(1)}ms`,
);
console.log(
  `  → 首次−后续 ≈ parseClaudePermissionModes 首次 spawn 成本（cachedPermissionModes 缓存前）`,
);
console.log(
  `  → 后续稳定值 ≈ getAgentSession + settingsStore.read(读盘) + buildAvailableAliases + 网络`,
);

// ── WS claude-stream 首帧延迟 ──
console.log(`\n=== WS /claude-stream 首帧延迟（token 走 query）===`);
const wsUrl = `ws://127.0.0.1:43011/api/projects/${encodeURIComponent(projectName)}/agent-sessions/${encodeURIComponent(session.id)}/claude-stream?token=${encodeURIComponent(token)}`;
await new Promise((resolve) => {
  const tOpen = { v: 0 };
  const milestones = {};
  let historyCount = 0;
  let firstHistoryAt = 0;
  const ws = new WebSocket(wsUrl);
  const stop = (reason) => {
    console.log(
      `  open=${fmt(tOpen.v)}ms  ${Object.entries(milestones)
        .map(([k, v]) => `${k}=${fmt(v)}ms`)
        .join("  ")}`,
    );
    console.log(`  history 行数=${historyCount}  首条history=${fmt(firstHistoryAt)}ms  ${reason}`);
    try {
      ws.close();
    } catch {}
    resolve();
  };
  const timer = setTimeout(() => stop("⏱ 8s 超时收尾"), 8000);
  ws.addEventListener("open", () => {
    tOpen.v = performance.now() - t0;
  });
  ws.addEventListener("error", (e) => {
    clearTimeout(timer);
    console.log("  WS error:", e.message ?? e);
    resolve();
  });
  ws.addEventListener("close", (e) => {
    clearTimeout(timer);
    stop(`close code=${e.code} reason=${e.reason ?? ""}`);
  });
  ws.addEventListener("message", (ev) => {
    const now = performance.now() - t0;
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (msg.type === "system" && msg.subtype === "seed_init") milestones.seed_init = now;
    if (msg.type === "history_start") milestones.history_start = now;
    if (msg.type === "live_start") {
      milestones.live_start = now;
      clearTimeout(timer);
      stop("✓ live_start（回放完成进入实时）");
    }
    if (msg.type === "history_end") milestones.history_end = now;
    if (msg.type === "assistant" || msg.type === "user") {
      historyCount += 1;
      if (!firstHistoryAt) firstHistoryAt = now;
    }
  });
  const t0 = performance.now();
});
console.log("\n[done]");

// ── Part 3: 03b 滚动收敛（批8 工作台密度）─────────────────────────────────────
// mock claude-stream 注入足量长内容（虚拟化 totalSize ≫ 2.5 屏，才落进滞回死区），
// 断言：上滚 1 屏 → .mini 出现 + row2/子 agent 条折叠；死区内逐帧微滚零翻转
//（MutationObserver 计数 .mini 增删 = 1/0，即禁逐帧 setState）；回底/点 ▾ 弹回。
let passCount = 0;
let failCount = 0;
function ok(cond, msg) {
  if (cond) {
    passCount++;
    console.log(`  ✓ ${msg}`);
  } else {
    failCount++;
    console.error(`  ✗ ${msg}`);
  }
}

const PROBE_SESSION_ID = "agent_perf-collapse";
const PROBE_SESSION = {
  id: PROBE_SESSION_ID,
  projectName: "proj-perf",
  provider: "claude",
  displayName: "Perf Collapse Probe",
  status: "running",
  createdAt: "2026-09-27T00:00:00.000Z",
};
// B 面板隔离场景注：桌面「点左栏第二个实例」会丢 leaf（面板区空，存量问题、非本批范围），
// 双面板并存在当前导航下不可构造——atom Record scoping 的隔离语义由 workbench-model 单测覆盖。
const PROBE_PROJECT = "proj-perf";

const pageJson = (body) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(body),
});

/** 页面内：从虚拟化 item 沿父链找真正的滚动容器（overflowY:auto）。 */
const FIND_SCROLLER = `(() => {
  let el = document.querySelector("[data-turn-message-ids]");
  while (el) { if (getComputedStyle(el).overflowY === "auto") return el; el = el.parentElement; }
  return null;
})()`;

async function setupCollapseMocks(page) {
  await page.route(/\/api\/overview$/, (r) =>
    r.fulfill(pageJson({ projectNames: [PROBE_PROJECT], candidates: [] })),
  );
  await page.route(/\/api\/state\/overview\/pinned-sessions$/, (r) =>
    r.fulfill(pageJson({ sessions: [] })),
  );
  await page.route(/\/api\/state\/overview\/pinned-sessions\/[^/]+$/, (r) =>
    r.fulfill(pageJson({ sessions: [] })),
  );
  await page.route(/\/api\/approvals$/, (r) => r.fulfill(pageJson({ approvals: [] })));
  await page.route(/\/api\/approvals\/stream$/, (r) => r.abort());
  await page.route(new RegExp(`/api/projects/${PROBE_PROJECT}/agent-history(?:\\?.*)?$`), (r) =>
    r.fulfill(pageJson({ entries: [] })),
  );
  await page.route(new RegExp(`/api/projects/${PROBE_PROJECT}/agent-sessions(?:\\?.*)?$`), (r) =>
    r.fulfill(pageJson({ sessions: [PROBE_SESSION] })),
  );
  await page.route(
    new RegExp(`/api/projects/${PROBE_PROJECT}/agent-sessions/${PROBE_SESSION_ID}$`),
    (r) =>
      r.fulfill(
        pageJson({
          session: PROBE_SESSION,
          availableModels: ["sonnet"],
          availablePermissionModes: ["default"],
        }),
      ),
  );
  await page.route(
    new RegExp(
      `/api/projects/${PROBE_PROJECT}/agent-sessions/${PROBE_SESSION_ID}/auto-retry/status$`,
    ),
    (r) => r.fulfill(pageJson({ scheduled: false })),
  );
  const sockets = [];
  await page.routeWebSocket(new RegExp(`/claude-stream$`), (ws) => {
    sockets.push(ws);
  });
  return { socketsRef: () => sockets };
}

/** 注入足量长内容：12 turn（user+assistant 交替）+ 一个 running 子 agent（产 .subbar）。 */
async function seedLongSession(socket) {
  const send = (d) => socket.send(JSON.stringify(d));
  send({ type: "session_init", resume: false });
  send({
    type: "assistant",
    uuid: "uuid-probe-agent",
    message: {
      id: "msg-probe-agent",
      role: "assistant",
      content: [
        {
          type: "tool_use",
          id: "toolu-probe-agent",
          name: "Agent",
          input: { subagent_type: "Explore", description: "扫描收敛路径" },
        },
      ],
    },
  });
  send({
    type: "assistant",
    uuid: "uuid-probe-agent-body",
    parent_tool_use_id: "toolu-probe-agent",
    message: {
      id: "msg-probe-agent-body",
      role: "assistant",
      content: [{ type: "text", text: "子 agent 仍在工作" }],
    },
  });
  const filler = "长文本回放内容用于撑高输出流，验证收敛阈值与滞回死区。".repeat(24);
  for (let i = 0; i < 12; i++) {
    send({
      type: "user",
      uuid: `uuid-probe-u${i}`,
      message: {
        id: `msg-probe-u${i}`,
        role: "user",
        content: [{ type: "text", text: `第 ${i + 1} 轮提问` }],
      },
    });
    send({
      type: "assistant",
      uuid: `uuid-probe-a${i}`,
      message: {
        id: `msg-probe-a${i}`,
        role: "assistant",
        content: [{ type: "text", text: `${filler}（第 ${i + 1} 轮）` }],
      },
    });
  }
}

async function loginUi(page) {
  await page.goto(`${ORIGIN_WEB}/`);
  await page.waitForSelector('input[type="password"]', { timeout: 15000 });
  await page.getByLabel("访问密码").fill(await readAppPassword());
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForTimeout(1500);
}

const ORIGIN_WEB = process.env.AR_WEB_ORIGIN ?? "http://127.0.0.1:43012";

const browser = await chromium.launch();
try {
  console.log("\n=== Part 3: 03b 滚动收敛（移动 390×844）===");
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    locale: "zh-CN",
  });
  const page = await ctx.newPage();
  const { socketsRef } = await setupCollapseMocks(page);
  await loginUi(page);
  await page.goto(`${ORIGIN_WEB}/projects/${PROBE_PROJECT}/session/${PROBE_SESSION_ID}`);
  await page.waitForTimeout(1500);
  const socket = socketsRef().at(-1);
  ok(socket != null, "claude-stream 连接建立");
  if (!socket) throw new Error("claude-stream WS 未建立");
  await seedLongSession(socket);
  await page.waitForSelector(".subbar", { timeout: 8000 });

  // 基线（贴底跟随）：无 .mini，row2 与 .subbar 都在。
  ok((await page.locator("button.mini").count()) === 0, "基线无 .mini（未收敛）");
  ok((await page.locator(".row2").count()) === 1, "基线 row2 在");
  ok((await page.locator(".subbar").count()) === 1, "基线 .subbar 在（running 子 agent）");

  const geom = await page.evaluate(`(() => {
    const el = ${FIND_SCROLLER};
    if (!el) return null;
    return { h: el.clientHeight, scroll: el.scrollHeight };
  })()`);
  ok(
    geom != null && geom.scroll > geom.h * 2.5,
    `内容高度可落进滞回死区（${geom?.scroll} > 2.5×${geom?.h}）`,
  );

  // 上滚越过 1 屏 → 收敛。
  const collapsed = await page.evaluate(`(async () => {
    const el = ${FIND_SCROLLER};
    el.scrollTop = el.clientHeight * 1.5;
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => setTimeout(r, 120));
    return { scrollTop: el.scrollTop, clientH: el.clientHeight };
  })()`);
  await page.waitForTimeout(300);
  ok((await page.locator("button.mini").count()) === 1, "上滚 1.5 屏 → .mini 出现（收敛）");
  ok((await page.locator(".row2").count()) === 0, "收敛 → row2 折叠（DOM 移除）");
  ok((await page.locator(".subbar").count()) === 1, "收敛 → 子 agent 条保留（03b mini+sub 并存）");
  ok(
    collapsed.scrollTop > collapsed.clientH,
    `滚动位越过一屏线（scrollTop ${collapsed.scrollTop} > ${collapsed.clientH}）`,
  );

  // 迷你条几何 + 内容（原型 03b：34px 胶囊 + 7px dot + 会话名 + ▾）。
  const miniGeo = await page.locator("button.mini").evaluate((el) => {
    const r = el.getBoundingClientRect();
    const dot = el.querySelector("span");
    const dr = dot?.getBoundingClientRect();
    return {
      h: r.height,
      w: r.width,
      dotW: dr?.width,
      dotH: dr?.height,
      text: el.textContent ?? "",
      radius: getComputedStyle(el).borderRadius,
    };
  });
  ok(Math.abs(miniGeo.h - 34) <= 1, `.mini 高 34px（实际 ${miniGeo.h.toFixed(1)}）`);
  ok(
    Math.abs((miniGeo.dotW ?? 0) - 7) <= 0.6 && Math.abs((miniGeo.dotH ?? 0) - 7) <= 0.6,
    `dot 7×7（实际 ${miniGeo.dotW?.toFixed(1)}×${miniGeo.dotH?.toFixed(1)}）`,
  );
  ok(miniGeo.text.includes(PROBE_SESSION.displayName), `.mini 含会话名（${miniGeo.text.trim()}）`);
  ok(miniGeo.text.includes("▾"), "▾ 展开指示在");
  ok(miniGeo.radius === "10px", `.mini 圆角 10px（实际 ${miniGeo.radius}）`);

  // 死区内逐帧微滚：零翻转（禁逐帧 setState 的硬数据）。
  await page.evaluate(`(() => {
    window.__collapseFlips = { added: 0, removed: 0 };
    const scroller = ${FIND_SCROLLER};
    const root = scroller.parentElement;
    const obs = new MutationObserver((muts) => {
      for (const m of muts) {
        for (const n of m.addedNodes) {
          if (n.nodeType === 1 && n.matches?.(".mini")) window.__collapseFlips.added++;
        }
        for (const n of m.removedNodes) {
          if (n.nodeType === 1 && n.matches?.(".mini")) window.__collapseFlips.removed++;
        }
      }
    });
    obs.observe(root, { childList: true, subtree: true });
    window.__collapseObserver = obs;
  })()`);
  const presence = await page.evaluate(`(async () => {
    const el = ${FIND_SCROLLER};
    const seen = [];
    const step = async (dy, n) => {
      for (let i = 0; i < n; i++) {
        el.scrollTop += dy;
        await new Promise((r) => requestAnimationFrame(r));
        seen.push(document.querySelectorAll("button.mini").length);
      }
    };
    await step(-5, 15); // 上滚 75px（仍在死区）
    await step(5, 15);  // 下滚 75px（仍在死区）
    return seen;
  })()`);
  await page.waitForTimeout(300);
  ok(
    presence.length === 30 && presence.every((n) => n === 1),
    "死区内 30 帧微滚 .mini 恒在（无抖动）",
  );
  const flips = await page.evaluate(`(() => {
    window.__collapseObserver?.disconnect();
    return window.__collapseFlips;
  })()`);
  ok(
    flips.added === 0 && flips.removed === 0,
    `逐帧微滚零状态翻转（add=${flips.added} remove=${flips.removed}）`,
  );

  // 回底 → 弹回完整工具区（任意方向生效）。
  await page.evaluate(`(() => {
    const el = ${FIND_SCROLLER};
    el.scrollTo({ top: el.scrollHeight });
  })()`);
  await page.waitForTimeout(300);
  ok((await page.locator("button.mini").count()) === 0, "回底 → .mini 消失（弹回）");
  ok((await page.locator(".row2").count()) === 1, "回底 → row2 恢复");
  ok((await page.locator(".subbar").count()) === 1, "回底 → 子 agent 条仍在");

  // 再收敛 → 点 ▾ 弹回。
  await page.evaluate(`(() => {
    const el = ${FIND_SCROLLER};
    el.scrollTop = el.clientHeight * 1.5;
  })()`);
  await page.waitForTimeout(300);
  ok((await page.locator("button.mini").count()) === 1, "再次上滚 → 复现收敛");
  await page.locator("button.mini").click();
  await page.waitForTimeout(300);
  ok((await page.locator("button.mini").count()) === 0, "点 ▾ → 弹回");
  ok((await page.locator(".row2").count()) === 1, "点 ▾ → row2 恢复");
  await ctx.close();

  console.log("\n=== Part 4: 03b 收敛（桌面 1600×1000）===");
  const dctx = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    locale: "zh-CN",
  });
  const dpage = await dctx.newPage();
  const { socketsRef: dSockets } = await setupCollapseMocks(dpage);
  await loginUi(dpage);
  // 桌面收敛断言（单面板）；双面板隔离场景不可构造（见 PROBE_SESSION_B 注释处），
  // atom Record scoping 语义由 workbench-model 单测覆盖。
  await dpage.goto(`${ORIGIN_WEB}/projects/${PROBE_PROJECT}`);
  await dpage.waitForTimeout(1200);
  const aside = dpage.locator("main > div > aside").nth(0);
  await aside.getByText(PROBE_SESSION.displayName).click(); // A 面板 + WS
  await dpage.waitForTimeout(1200);
  await seedLongSession(dSockets().at(-1));
  await dpage.waitForSelector(".subbar", { timeout: 8000 });
  ok((await dpage.locator("button.mini").count()) === 0, "桌面基线无 .mini");
  ok((await dpage.locator(".subbar").count()) === 1, "桌面基线 .subbar 在");
  // A 激活时滚收敛。
  await dpage.evaluate(`(async () => {
    const el = ${FIND_SCROLLER};
    el.scrollTop = el.clientHeight * 1.5;
    await new Promise((r) => requestAnimationFrame(r));
  })()`);
  await dpage.waitForTimeout(300);
  ok((await dpage.locator("button.mini").count()) === 1, "桌面上滚 → .mini 出现");
  ok(
    (await dpage.locator(".subbar").count()) === 1,
    "桌面收敛 → .subbar 保留（mini+sub 并存，03b L45）",
  );
  ok((await dpage.locator(".row2").count()) === 0, "桌面无 row2（移动专属）");
  await dctx.close();
} finally {
  await browser.close();
}
console.log(`\n结果: ${passCount} pass / ${failCount} fail`);
if (failCount > 0) process.exit(1);

function fmt(n) {
  return n ? n.toFixed(1) : "—";
}
