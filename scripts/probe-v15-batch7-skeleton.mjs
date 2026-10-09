// v1.5 批 7 探针：多端骨架与杂项（spec §4.1:118 / §4.7:182 / §6.2:237 / §9:327-328）。
// 覆盖单测验不到的真实浏览器行为（DOM 几何硬数据，禁截图）：
//   Part 1（移动 390×844 终端会话）：输入抽屉默认收起——.qkey 快捷键条常驻贴底、textarea
//          不渲染；展开钮（.xbtn aria-label「展开输入」）唤出双行 composer（textarea 回归 +
//          ⏎ 行）；再点收回；reload 后收起态保持（atomFamily per type 持久化，terminal 档）。
//   Part 2（桌面 1600×1000）：会话类型图标统一（spec §6.2）——侧栏 agent 行行首 .dicon
//          sparkles + 状态点移名称后（dicon < 名 < dot2 顺序）；terminal 行 square-terminal；
//          footnav 插件钮 puzzle；中栏 TabChip DOM 顺序 = marker < label < statusDot。
//          图标内容用 lucide-static@1.47.0 生成物 body 的独特 path 片段断言（版本锁定，
//          body 随源稳定）。
//   Part 3（桌面 1400×900 agent 会话）：子 agent 概览条——≥2 计数条「n 个子 agent · m 运行
//          中」点按展开 .slist 列表卡；行点按 = 跳转 + 一次性展开信号（body 展开恢复，概览
//          条展开态不变）；tool_result 到达 → 完成行置灰置底 + running 归零自动折叠回
//          「n 个子 agent 已完成」；新 user 消息落地 → 概览条清空（回合边界，spec「新回合
//          开始时清空」）。
//
// mock 三铁律：形状对齐 shared；approvals/stream abort（铁律③）；routeWebSocket 纯 mock
// （终端 stream 直连真实 api 会 ensureRunning tmux，探针禁开真实进程——只删自建数据纪律）。
// 用法：bun scripts/probe-v15-batch7-skeleton.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const ORIGIN = process.env.AR_WEB_ORIGIN ?? "http://127.0.0.1:43012";

const AGENT = {
  id: "agent_b7-1",
  projectName: "proj1",
  provider: "claude",
  displayName: "Probe Agent",
  status: "running",
  createdAt: "2026-10-06T00:00:00.000Z",
};
const CODEX = {
  // id 前缀必须 agent_（inferSessionTypeFromId 只认 agent_/terminal_ 前缀判面板类型；
  // provider 字段才区分 claude/codex 面板路由）。同 agent 档 = 输入抽屉默认展开。
  id: "agent_b7-2",
  projectName: "proj1",
  provider: "codex",
  displayName: "Probe Codex",
  status: "idle",
  codexThreadId: "thread_b7",
  createdAt: "2026-10-06T02:00:00.000Z",
};
const TERM = {
  id: "terminal_b7-1",
  projectName: "proj1",
  displayName: "probe-term",
  status: "running",
  createdAt: "2026-10-06T01:00:00.000Z",
};
// 图标 body 特征片段（scripts/build-icons.mjs 生成物，lucide-static@1.47.0 锁定）。
const ICON_SIGNS = {
  sparkles: "M11.017 2.814",
  puzzle: "M15.39 4.39",
  "square-terminal": "m7 11 2-2-2-2",
};

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

const json = (body) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(body),
});

async function login(page) {
  await page.goto(`${ORIGIN}/`);
  await page.waitForSelector('input[type="password"]', { timeout: 15000 });
  await page.getByLabel("访问密码").fill(await readAppPassword());
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForTimeout(1200);
}

/** 会话域公共 mock：overview / pinned / approvals（REST + WS abort）。 */
async function setupShellMocks(page) {
  await page.route(/\/api\/overview$/, (r) =>
    r.fulfill(
      json({
        projectNames: ["proj1"],
        candidates: [
          { ...AGENT, sessionId: AGENT.id, type: "agent" },
          { ...CODEX, sessionId: CODEX.id, type: "agent" },
          { ...TERM, sessionId: TERM.id, type: "terminal" },
        ],
      }),
    ),
  );
  await page.route(/\/api\/state\/overview\/pinned-sessions(\?.*)?$/, (r) =>
    r.fulfill(json({ sessions: [] })),
  );
  await page.route(/\/api\/approvals$/, (r) => r.fulfill(json({ approvals: [] })));
  await page.route(/\/api\/approvals\/stream$/, (r) => r.abort());
}

/** Part 1：终端会话域（列表 + 详情 + 纯 mock stream WS——不开真实 tmux）。 */
async function setupTerminalMocks(page) {
  await setupShellMocks(page);
  await page.route(/\/api\/projects$/, (r) =>
    r.fulfill(json([{ name: "proj1", path: "/srv/projects/proj1" }])),
  );
  await page.route(/\/api\/projects\/proj1\/terminal-sessions(?:\?.*)?$/, (r) =>
    r.fulfill(json({ sessions: [TERM] })),
  );
  await page.route(/\/api\/projects\/proj1\/terminal-sessions\/terminal_b7-1$/, (r) =>
    r.fulfill(json({ session: TERM })),
  );
  await page.route(/\/api\/projects\/proj1\/agent-sessions(?:\?.*)?$/, (r) =>
    r.fulfill(json({ sessions: [AGENT] })),
  );
  await page.route(/\/api\/projects\/proj1\/agent-sessions\/agent_b7-2$/, (r) =>
    r.fulfill(json({ session: CODEX, availableModels: [], availablePermissionModes: [] })),
  );
  // 纯 mock（不 connectToServer）：xterm 空白渲染但不开真实终端进程。
  await page.routeWebSocket(/\/stream/, () => {});
}

/** Part 3：agent 会话域（详情 + auto-retry + mock claude-stream WS 收集器）。 */
async function setupAgentMocks(page) {
  await setupShellMocks(page);
  await page.route(/\/api\/projects$/, (r) =>
    r.fulfill(json([{ name: "proj1", path: "/srv/projects/proj1" }])),
  );
  await page.route(/\/api\/projects\/proj1\/agent-sessions(?:\?.*)?$/, (r) =>
    r.fulfill(json({ sessions: [AGENT] })),
  );
  await page.route(/\/api\/projects\/proj1\/agent-sessions\/agent_b7-1$/, (r) =>
    r.fulfill(
      json({ session: AGENT, availableModels: ["sonnet"], availablePermissionModes: ["default"] }),
    ),
  );
  await page.route(/\/api\/projects\/proj1\/agent-sessions\/agent_b7-1\/auto-retry\/status$/, (r) =>
    r.fulfill(json({ scheduled: false })),
  );
  const sockets = [];
  await page.routeWebSocket(/claude-stream$/, (ws) => {
    sockets.push(ws);
  });
  return { socketsRef: () => sockets };
}

/** Part 3 注入：2 turn 撑上下文 → 同回合 2 个 running 子 agent（head + body）。
 * 顺序铁律：agent-container 必须在最后一条 user 消息之后（回合边界，见
 * claude-subagent-overview.tsx 头注释）。 */
function seedTwoAgents(socket) {
  const send = (d) => socket.send(JSON.stringify(d));
  send({ type: "session_init", resume: false });
  for (let i = 0; i < 2; i++) {
    send({
      type: "user",
      uuid: `uuid-b7-u${i}`,
      message: {
        id: `msg-b7-u${i}`,
        role: "user",
        content: [{ type: "text", text: `第 ${i + 1} 轮提问` }],
      },
    });
    send({
      type: "assistant",
      uuid: `uuid-b7-a${i}`,
      message: {
        id: `msg-b7-a${i}`,
        role: "assistant",
        content: [{ type: "text", text: `第 ${i + 1} 轮回答` }],
      },
    });
  }
  for (const [n, subType, desc] of [
    [1, "Explore", "扫描收敛路径"],
    [2, "Bash", "运行构建脚本"],
  ]) {
    send({
      type: "assistant",
      uuid: `uuid-b7-agent${n}`,
      message: {
        id: `msg-b7-agent${n}`,
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: `toolu-b7-${n}`,
            name: "Agent",
            input: { subagent_type: subType, description: desc },
          },
        ],
      },
    });
    send({
      type: "assistant",
      uuid: `uuid-b7-agent${n}-body`,
      parent_tool_use_id: `toolu-b7-${n}`,
      message: {
        id: `msg-b7-agent${n}-body`,
        role: "assistant",
        content: [{ type: "text", text: `子任务${n}仍在工作` }],
      },
    });
  }
}

(async () => {
  const browser = await chromium.launch();
  try {
    // ─────────────── Part 1 移动终端：输入抽屉默认收起 ───────────────
    console.log("\n=== Part 1: 移动终端输入抽屉（390×844，默认收起 spec §4.7:182）===");
    const ctx1 = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      locale: "zh-CN",
    });
    const p1 = await ctx1.newPage();
    p1.on("pageerror", (err) => console.error("PAGEERROR:", err.message.slice(0, 400)));
    await setupTerminalMocks(p1);
    await login(p1);
    await p1.goto(`${ORIGIN}/projects/proj1/session/terminal_b7-1`);
    await p1.waitForSelector(".qkey", { timeout: 10000 });

    const collapsedGeom = await p1.evaluate(() => ({
      qkeys: document.querySelectorAll(".qkey").length,
      textarea: document.querySelectorAll("textarea#session-input").length,
      xbtn: document.querySelector(".xbtn")?.getBoundingClientRect() ?? null,
      xbtnExpanded: document.querySelector(".xbtn")?.getAttribute("aria-expanded"),
      xbtnLabel: document.querySelector(".xbtn")?.getAttribute("aria-label"),
    }));
    ok(collapsedGeom.qkeys >= 8, `P1-1 收起态 .qkey 快捷键条常驻（${collapsedGeom.qkeys} 键 ≥ 8）`);
    ok(
      collapsedGeom.textarea === 0,
      `P1-2 默认收起 → textarea 不渲染（count ${collapsedGeom.textarea}）`,
    );
    ok(
      collapsedGeom.xbtn !== null && collapsedGeom.xbtnExpanded === "false",
      "P1-3 .xbtn 展开钮在场 aria-expanded=false",
    );
    ok(
      collapsedGeom.xbtnLabel === "展开输入",
      `P1-4 aria-label「展开输入」（实际 ${collapsedGeom.xbtnLabel}）`,
    );
    ok(
      collapsedGeom.xbtn !== null &&
        collapsedGeom.xbtn.width >= 30 &&
        collapsedGeom.xbtn.width <= 40 &&
        collapsedGeom.xbtn.height >= 28 &&
        collapsedGeom.xbtn.height <= 38,
      `P1-5 .xbtn 尺寸 ≈ 34×32（实际 ${collapsedGeom.xbtn?.width}×${collapsedGeom.xbtn?.height}）`,
    );

    // 展开：textarea 回归 + ⏎ 提交行 + 快捷键条仍在（常驻上移不消失）。
    await p1.locator(".xbtn").click();
    await p1.waitForTimeout(300);
    const expandedGeom = await p1.evaluate(() => ({
      qkeys: document.querySelectorAll(".qkey").length,
      textarea: document.querySelectorAll("textarea#session-input").length,
      submit: [...document.querySelectorAll('form button[type="submit"]')].length,
      xbtnExpanded: document.querySelector(".xbtn")?.getAttribute("aria-expanded"),
      xbtnLabel: document.querySelector(".xbtn")?.getAttribute("aria-label"),
    }));
    ok(expandedGeom.textarea === 1, "P1-6 展开态 textarea#session-input 渲染");
    ok(expandedGeom.submit === 1, "P1-7 展开态双行 composer 的提交钮在");
    // v1.6 send2 换装（workspace-terminal-input ③）：28×28 r12 主色方形 + 白 arrow-up，
    // 与会话版 composer-actions 同源形态；itext 纯 mono 无 $ 提示符。
    const sendBtn = p1.locator('form button[type="submit"]');
    ok(
      (await sendBtn.getAttribute("class"))?.includes("send2") === true,
      "P1-7b 发送钮 = .send2 形态",
    );
    const sendBox = await sendBtn.boundingBox();
    ok(
      sendBox !== null && Math.abs(sendBox.width - 28) <= 1 && Math.abs(sendBox.height - 28) <= 1,
      `P1-7c send2 28×28（实际 ${sendBox?.width}×${sendBox?.height}）`,
    );
    const sendGeo = await sendBtn.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        radius: s.borderRadius,
        bg: s.backgroundColor,
        svg: el.querySelector("svg") !== null,
      };
    });
    ok(
      sendGeo.radius === "12px" && sendGeo.bg !== "rgba(0, 0, 0, 0)" && sendGeo.svg === true,
      `P1-7d send2 r12 实心底 + svg 图标（${JSON.stringify(sendGeo)}）`,
    );
    const hasDollar = await p1.evaluate(() => {
      const row = document.querySelector("textarea#session-input")?.parentElement;
      return row?.textContent?.includes("$") ?? false;
    });
    ok(hasDollar === false, "P1-7e itext 行无 $ 提示符（原型 itext 纯 mono）");
    ok(expandedGeom.qkeys >= 8, `P1-8 展开态快捷键条仍在（${expandedGeom.qkeys} 键，上移不消失）`);
    ok(
      expandedGeom.xbtnExpanded === "true" && expandedGeom.xbtnLabel === "收回输入",
      `P1-9 展开钮翻转（aria-expanded=true / aria-label「${expandedGeom.xbtnLabel}」）`,
    );

    // 收回：textarea 消失、快捷键条保留。
    await p1.locator(".xbtn").click();
    await p1.waitForTimeout(300);
    const recollapsed = await p1.evaluate(() => ({
      qkeys: document.querySelectorAll(".qkey").length,
      textarea: document.querySelectorAll("textarea#session-input").length,
    }));
    ok(recollapsed.textarea === 0, "P1-10 再点收回 → textarea 消失");
    ok(recollapsed.qkeys >= 8, "P1-11 收回后快捷键条仍常驻");

    // 持久化：reload 后收起态保持（atomFamily per type，terminal 档默认 true）。
    await p1.reload();
    await p1.waitForSelector(".qkey", { timeout: 10000 });
    await p1.waitForTimeout(400);
    const afterReload = await p1.evaluate(
      () => document.querySelectorAll("textarea#session-input").length,
    );
    ok(afterReload === 0, `P1-12 reload 后收起态保持（textarea count ${afterReload}）`);

    // agent（codex 形态）默认展开（分族语义：spec 只约束终端默认收起；agent 档默认 false
    // 与旧行为一致）。codex 会话复用同一 mock 域。
    await p1.goto(`${ORIGIN}/projects/proj1/session/agent_b7-2`);
    await p1.waitForTimeout(1500);
    const agentDrawer = await p1.evaluate(() => ({
      textarea: document.querySelectorAll("textarea#session-input").length,
    }));
    ok(
      agentDrawer.textarea === 1,
      `P1-13 codex 会话输入抽屉默认展开（textarea count ${agentDrawer.textarea}）`,
    );
    await ctx1.close();

    // ─────────────── Part 2 桌面：会话类型图标统一 ───────────────
    console.log("\n=== Part 2: 桌面会话类型图标（1600×1000，spec §6.2）===");
    const ctx2 = await browser.newContext({
      viewport: { width: 1600, height: 1000 },
      locale: "zh-CN",
    });
    const p2 = await ctx2.newPage();
    p2.on("pageerror", (err) => console.error("PAGEERROR:", err.message.slice(0, 400)));
    await setupTerminalMocks(p2);
    await login(p2);
    await p2.goto(`${ORIGIN}/projects/proj1`);
    await p2.waitForTimeout(1800);

    const rowGeom = await p2.evaluate(
      ([signs]) => {
        const rows = [...document.querySelectorAll("aside button")].filter((b) =>
          /Probe Agent|probe-term/.test(b.textContent ?? ""),
        );
        const agentRow = rows.find((b) => (b.textContent ?? "").includes("Probe Agent"));
        const termRow = rows.find((b) => (b.textContent ?? "").includes("probe-term"));
        const describe = (row) => {
          if (!row) return null;
          const dicon = row.querySelector(".dicon svg");
          const dot = row.querySelector(".dot2");
          const kids = [...row.children];
          return {
            diconSign: dicon
              ? [...dicon.querySelectorAll("path, rect")]
                  .map((p) => p.getAttribute("d") ?? "")
                  .join(" ")
                  .slice(0, 200)
              : null,
            diconFirst: kids[0]?.classList.contains("dicon") ?? false,
            dotLast: dot
              ? kids.indexOf(dot) >
                kids.findIndex(
                  (k) => k.querySelector(":scope > .min-w-0") || k.classList.contains("min-w-0"),
                )
              : null,
            order: kids.map((k) => k.className.split(" ")[0] || k.tagName).join("|"),
          };
        };
        return {
          agent: describe(agentRow),
          term: describe(termRow),
          signs,
        };
      },
      [[ICON_SIGNS.sparkles, ICON_SIGNS["square-terminal"]]],
    );
    ok(rowGeom.agent !== null, "P2-1 侧栏 agent 行在场");
    ok(
      rowGeom.agent?.diconSign?.includes(ICON_SIGNS.sparkles) ?? false,
      "P2-2 agent 行 .dicon = sparkles（lucide body 特征片段命中）",
    );
    ok(rowGeom.agent?.diconFirst ?? false, "P2-3 agent 行 .dicon 行首（图标在名称前）");
    ok(
      typeof rowGeom.agent?.order === "string" &&
        rowGeom.agent.order.indexOf("dicon") < rowGeom.agent.order.indexOf("dot2"),
      `P2-4 agent 行顺序 dicon < dot2（状态点随名称后；实际 ${rowGeom.agent?.order}）`,
    );
    ok(rowGeom.term !== null, "P2-5 侧栏 terminal 行在场");
    ok(
      rowGeom.term?.diconSign?.includes(ICON_SIGNS["square-terminal"]) ?? false,
      "P2-6 terminal 行 .dicon = square-terminal",
    );

    // footnav 插件钮 = puzzlepiece（spec §3.5/§6.2）。
    const puzzleBtn = await p2.evaluate((sign) => {
      const btns = [...document.querySelectorAll("aside button")];
      const hit = btns.find((b) => b.querySelector("svg")?.innerHTML.includes(sign));
      return hit ? (hit.textContent?.trim() ?? "") : null;
    }, ICON_SIGNS.puzzle);
    ok(puzzleBtn !== null, "P2-7 footnav 插件钮 = puzzle 图标（body 特征命中）");
    ok((puzzleBtn ?? "").includes("插件"), `P2-8 插件钮文本「插件」（实际 ${puzzleBtn}）`);

    // TabChip DOM 顺序 = marker < label button < statusDot（进会话现场开 tab）。
    await p2.goto(`${ORIGIN}/projects/proj1/session/agent_b7-1`);
    await p2.waitForTimeout(1500);
    const chipOrder = await p2.evaluate(() => {
      const chip = document.querySelector(".tb");
      if (!chip) return null;
      const svg = chip.querySelector("svg");
      const btn = chip.querySelector("button");
      const dot = chip.querySelector('span[role="img"]'); // statusDot（h-1.5 圆点，无 .dot2 类）
      const rel = (el) => (el ? [...chip.children].findIndex((k) => k.contains(el)) : -1);
      return {
        hasSvg: !!svg,
        svgSign: svg
          ? (svg.getAttribute("d") ?? "") +
            [...svg.querySelectorAll("path")].map((p) => p.getAttribute("d") ?? "").join(" ")
          : "",
        order: { svg: rel(svg), btn: rel(btn), dot: rel(dot) },
      };
    });
    ok(
      chipOrder !== null && chipOrder.hasSvg,
      "P2-9 TabChip 行首 marker svg 在（§6.2 marker 回归）",
    );
    ok(
      (chipOrder?.svgSign ?? "").includes(ICON_SIGNS.sparkles),
      "P2-10 TabChip marker = sparkles（agent 会话）",
    );
    ok(
      chipOrder !== null &&
        chipOrder.order.svg >= 0 &&
        chipOrder.order.svg < chipOrder.order.btn &&
        chipOrder.order.btn < chipOrder.order.dot,
      `P2-11 TabChip 顺序 marker < label < statusDot（实际 ${JSON.stringify(chipOrder?.order)}）`,
    );
    await ctx2.close();

    // ─────────────── Part 3 agent 会话：子 agent 概览条 ───────────────
    console.log("\n=== Part 3: 子 agent 概览条（1400×900，spec §4.1:118）===");
    const ctx3 = await browser.newContext({
      viewport: { width: 1400, height: 900 },
      locale: "zh-CN",
    });
    const p3 = await ctx3.newPage();
    p3.on("pageerror", (err) => console.error("PAGEERROR:", err.message.slice(0, 400)));
    const { socketsRef } = await setupAgentMocks(p3);
    await login(p3);
    await p3.goto(`${ORIGIN}/projects/proj1/session/agent_b7-1`);
    await p3.waitForTimeout(1500);
    const socket = socketsRef().at(-1);
    ok(socket != null, "P3-0 claude-stream WS 连接建立");
    if (!socket) throw new Error("claude-stream WS 未建立");
    seedTwoAgents(socket);
    await p3.waitForSelector(".sub", { timeout: 8000 });

    // 计数条头行（≥2 → 计数条形态，非单 chip .subbar）。
    const headText = (await p3.locator(".sub").textContent()) ?? "";
    ok(
      headText.includes("2 个子 agent") && headText.includes("2 运行中"),
      `P3-1 计数条头行「▸ 2 个子 agent · 2 运行中」（实际 ${headText.trim()}）`,
    );
    ok((await p3.locator(".subbar").count()) === 0, "P3-2 多 agent → 旧单 chip .subbar 形态不渲染");

    // 展开 → .slist + 2 行（running 段在前）。
    await p3.locator(".sub").click();
    await p3.waitForTimeout(300);
    const listGeom = await p3.evaluate(() => {
      const rows = [...document.querySelectorAll(".subrow")];
      return {
        slist: document.querySelectorAll(".slist").length,
        rows: rows.length,
        first: rows[0]?.textContent ?? "",
        runningDots: rows.filter((r) => r.querySelector(".dot.bg-success")).length,
      };
    });
    ok(listGeom.slist === 1 && listGeom.rows === 2, "P3-3 展开 → .slist 列表卡 + 2 行");
    ok(
      listGeom.first.includes("Explore") && listGeom.first.includes("运行中"),
      `P3-4 首行 = Explore · 扫描收敛路径 + 「运行中」（实际 ${listGeom.first.slice(0, 60)}）`,
    );
    ok(listGeom.runningDots === 2, "P3-5 两行 running 绿点");

    // 行点按：跳转 + 一次性展开信号。先点容器 head 收起 body（running 默认展开），
    // 行点按后 body 应重新展开；概览条展开态不变。
    await p3.locator(".tb button", { hasText: "Probe Agent" }).first().click();
    await p3.waitForTimeout(800);
    // 前置：running 容器 body 默认展开；随后点容器 head（cursor-pointer 头部行）收起。
    const bodyVisible = await p3.evaluate(() =>
      document.body.textContent.includes("子任务1仍在工作"),
    );
    ok(bodyVisible, "P3-6 running 容器 body 默认展开（body 文本可见）");
    const headRow = p3
      .getByText("扫描收敛路径")
      .locator("xpath=ancestor::div[contains(@class,'cursor-pointer')][1]");
    await headRow.click();
    await p3.waitForTimeout(300);
    const bodyGone = await p3.evaluate(
      () => !document.body.textContent.includes("子任务1仍在工作"),
    );
    ok(bodyGone, "P3-7 点容器 head → body 收起（「子任务1仍在工作」不可见）");
    await p3.locator(".subrow").first().click();
    await p3.waitForTimeout(500);
    const signalGeom = await p3.evaluate(() => ({
      bodyBack: document.body.textContent.includes("子任务1仍在工作"),
      slistStill: document.querySelectorAll(".slist").length,
    }));
    ok(signalGeom.bodyBack, "P3-8 概览条行点按 → 容器 body 重新展开（一次性信号）");
    ok(signalGeom.slistStill === 1, "P3-9 跳转不改概览条展开状态（.slist 仍在）");

    // 完成态：tool_result ×2 → complete 置底 + running 归零自动折叠。
    const send = (d) => socket.send(JSON.stringify(d));
    send({
      type: "user",
      uuid: "uuid-b7-tr1",
      message: {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "toolu-b7-1", content: "子任务1完成" }],
      },
    });
    send({
      type: "user",
      uuid: "uuid-b7-tr2",
      message: {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "toolu-b7-2", content: "子任务2完成" }],
      },
    });
    await p3.waitForFunction(
      () => (document.querySelector(".sub")?.textContent ?? "").includes("已完成"),
      { timeout: 8000 },
    );
    const doneGeom = await p3.evaluate(() => ({
      head: document.querySelector(".sub")?.textContent ?? "",
      slist: document.querySelectorAll(".slist").length,
    }));
    ok(
      doneGeom.head.includes("2 个子 agent 已完成"),
      `P3-10 完成态头行「▸ 2 个子 agent 已完成」（实际 ${doneGeom.head.trim()}）`,
    );
    ok(doneGeom.slist === 0, "P3-11 running 归零 → 自动折叠（.slist 消失，入口保留）");

    // 再展开 → 完成行置灰置底（.subrow.done）。
    await p3.locator(".sub").click();
    await p3.waitForTimeout(300);
    const doneRows = await p3.evaluate(() => {
      const rows = [...document.querySelectorAll(".subrow")];
      const doneRow = rows.find((r) => r.classList.contains("done"));
      return {
        done: rows.filter((r) => r.classList.contains("done")).length,
        first: rows[0]?.textContent ?? "",
        // done 行状态字色 = --ink-3（原型 .srow.done 状态字无显式 color 继承行色；防回退成 ink-2）
        doneStColor: doneRow ? getComputedStyle(doneRow.querySelector(".st")).color : null,
        ink3: getComputedStyle(document.documentElement).getPropertyValue("--ink-3").trim(),
      };
    });
    ok(doneRows.done === 2, `P3-12 完成行 .done 置灰（${doneRows.done}/2）`);
    ok(
      doneRows.first.includes("完成 ✓"),
      `P3-13 行状态文案「完成 ✓」（实际 ${doneRows.first.slice(0, 50)}）`,
    );
    {
      // --ink-3 以 HEX 存储、computed color 是 rgb() —— hex→rgb 归一 + 去空白后比对同源。
      const toRgb = (hexOrRgb) => {
        const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hexOrRgb.trim());
        const rgb = m
          ? `rgb(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)})`
          : hexOrRgb;
        return rgb.replace(/\s+/g, "");
      };
      ok(
        doneRows.doneStColor != null && toRgb(doneRows.doneStColor) === toRgb(doneRows.ink3),
        `P3-15 done 行状态字色 = --ink-3（实际 ${doneRows.doneStColor} / ink3 ${doneRows.ink3}）`,
      );
    }

    // 新回合清空：新 user 消息落地 → 概览条消失（回合边界前移）。
    send({
      type: "user",
      uuid: "uuid-b7-newturn",
      message: { role: "user", content: [{ type: "text", text: "新回合提问" }] },
    });
    await p3.waitForFunction(() => document.querySelectorAll(".sub").length === 0, {
      timeout: 8000,
    });
    ok((await p3.locator(".sub").count()) === 0, "P3-14 新回合开始 → 概览条清空（回合边界）");

    await ctx3.close();
  } finally {
    await browser.close();
  }
  console.log(`\n结果: ${passCount} passed, ${failCount} failed`);
  process.exit(failCount > 0 ? 1 : 0);
})();
