// v1.5 批 8 探针：微交互收尾（spec §5.0 / §7.2 / §4.1 附件双路径）。
// 覆盖单测验不到的真实浏览器行为（DOM 几何硬数据，禁截图）：
//   Part D（桌面 1280×800 agent 会话）：
//     - 浮层两族对齐（§5.0 标准档 45px 行 / 17px 图标 / gap 14 / --menu+sep-strong+r14
//       材质）——ActionMenu 桌面 popover（附件菜单）实测。
//     - 附件双路径（§4.1）：白名单小文本 ≤1MB → text chip（零上传请求）；超限/非白名单
//       → uploads 上传；⌫ 删 chip；发送帧 = 前导行 + fence 全等断言。
//   Part M（移动 390×844 agent 会话）：sheet item 45px + sheet 10px 侧距 + chips 横滚
//     （3 文件 chip 溢出 → wheel deltaY→scrollLeft 映射 + Shift 不映射 + 渐隐方向翻转）。
//   Part T（移动 280×568 终端会话）：qkeys 溢出同款 wheel/渐隐断言（§7.2 通用性）。
//
// mock 三铁律同批 7 探针；web DOM 探针前置过 ar-verify-css 三道闸；密码自读不打印。
// 用法：bun scripts/probe-v15-batch8-interactions.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";
import { verifyCssFlushed } from "./ar-verify-css.mjs";

const ORIGIN = process.env.AR_WEB_ORIGIN ?? "http://127.0.0.1:43012";

const AGENT = {
  id: "agent_b8-1",
  projectName: "proj1",
  provider: "claude",
  displayName: "Probe Agent",
  status: "idle",
  createdAt: "2026-10-06T00:00:00.000Z",
};
const TERM = {
  id: "terminal_b8-1",
  projectName: "proj1",
  displayName: "probe-term",
  status: "running",
  createdAt: "2026-10-06T01:00:00.000Z",
};
// 附件 fixture：白名单小文本（内联）/ 超 1MB 文本（uploads）/ pdf（uploads 对照）。
const TXT_FILE = {
  name: "probe-notes.txt",
  mimeType: "text/plain",
  buffer: Buffer.from("批 8 探针内联文本内容\n第二行"),
};
const BIG_LOG = {
  name: "probe-big.log",
  mimeType: "text/plain",
  buffer: Buffer.alloc(1024 * 1024 + 16, 0x61),
};
const PDF_FILE = {
  name: "probe-b8.pdf",
  mimeType: "application/pdf",
  buffer: Buffer.from("%PDF-1.4 batch8"),
};
const UPLOAD_DIR = "uploads";

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

/** agent 会话域 mock（上传计数器 = 分流断言数据源；sockets/frames 见 routeWebSocket 段）。 */
async function setupAgentMocks(page, uploadCountRef, sockets, frames) {
  await setupShellMocks(page);
  await page.route(/\/api\/projects$/, (r) =>
    r.fulfill(json([{ name: "proj1", path: "/srv/projects/proj1" }])),
  );
  await page.route(/\/api\/projects\/proj1\/agent-sessions(?:\?.*)?$/, (r) =>
    r.fulfill(json({ sessions: [AGENT] })),
  );
  await page.route(/\/api\/projects\/proj1\/agent-sessions\/agent_b8-1$/, (r) =>
    r.fulfill(json({ session: AGENT, availableModels: [], availablePermissionModes: [] })),
  );
  await page.route(/\/api\/projects\/proj1\/agent-sessions\/agent_b8-1\/auto-retry\/status$/, (r) =>
    r.fulfill(json({ scheduled: false })),
  );
  await page.route(new RegExp(`/api/projects/proj1/files/upload`), (r) => {
    uploadCountRef.count += 1;
    const name = String(r.request().postData()?.length ?? 0);
    r.fulfill(json({ entry: { path: `${UPLOAD_DIR}/${name}`, name, kind: "file" } }));
  });
  // sockets 收集（openAgentSession 手动 seed session_init）+ 可选上行帧捕获（发送组帧断言）。
  await page.routeWebSocket(/claude-stream$/, (ws) => {
    sockets.push(ws);
    if (frames) {
      ws.onMessage((data) => {
        try {
          frames.push(JSON.parse(String(data)));
        } catch {
          /* 非 JSON 帧忽略 */
        }
      });
    }
  });
}

/** 打开 agent 会话页：登录 + 导航 + seed（session_init + 欢迎行），等 composer 在场。 */
async function openAgentSession(page, sockets) {
  await login(page);
  await page.goto(`${ORIGIN}/projects/proj1/session/agent_b8-1`);
  const deadline = Date.now() + 10000;
  while (sockets.length === 0 && Date.now() < deadline) await page.waitForTimeout(100);
  const socket = sockets.at(-1);
  if (!socket) throw new Error("claude-stream WS 未建立");
  socket.send(JSON.stringify({ type: "session_init", resume: false }));
  socket.send(
    JSON.stringify({
      type: "assistant",
      uuid: "uuid-b8-hello",
      message: {
        id: "msg-b8-hello",
        role: "assistant",
        content: [{ type: "text", text: "批 8 探针欢迎行" }],
      },
    }),
  );
  await page
    .locator('textarea[placeholder="向 Claude 提问..."]')
    .waitFor({ state: "visible", timeout: 10000 });
}

/** 终端会话域 mock（qkeys 断言域；纯 mock stream 不开真实 tmux）。 */
async function setupTerminalMocks(page) {
  await setupShellMocks(page);
  await page.route(/\/api\/projects$/, (r) =>
    r.fulfill(json([{ name: "proj1", path: "/srv/projects/proj1" }])),
  );
  await page.route(/\/api\/projects\/proj1\/terminal-sessions(?:\?.*)?$/, (r) =>
    r.fulfill(json({ sessions: [TERM] })),
  );
  await page.route(/\/api\/projects\/proj1\/terminal-sessions\/terminal_b8-1$/, (r) =>
    r.fulfill(json({ session: TERM })),
  );
  await page.route(/\/api\/projects\/proj1\/agent-sessions(?:\?.*)?$/, (r) =>
    r.fulfill(json({ sessions: [AGENT] })),
  );
  await page.routeWebSocket(/\/stream/, () => {});
}

(async () => {
  const css = await verifyCssFlushed({
    expectClasses: ["hfade", "bg-menu"],
    origin: ORIGIN,
    rejectOnUnused: false,
    allowEmptyClasses: false,
  });
  if (!css.pass) {
    console.error(css.details.join("\n"));
    process.exit(1);
  }

  const browser = await chromium.launch();
  try {
    // ── Part D：桌面（浮层规格 + 附件双路径）──
    {
      const page = await (
        await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "zh-CN" })
      ).newPage();
      const frames = [];
      const sockets = [];
      const uploadCountRef = { count: 0 };
      await setupAgentMocks(page, uploadCountRef, sockets, frames);
      await openAgentSession(page, sockets);

      // P-D1 浮层规格（§5.0 标准档）
      await page.getByRole("button", { name: "添加附件" }).click();
      await page.getByRole("menuitem", { name: "文件" }).waitFor({ timeout: 6000 });
      // 弹出 spring 动画（150ms）进行中 getBoundingClientRect 采到中间帧（0.995 级缩放），
      // 行高/图标尺寸断言会亚像素假 fail——等动画播完再取几何。
      await page.waitForTimeout(250);
      const menu = await page.evaluate(() => {
        const item = [...document.querySelectorAll('[role="menuitem"]')].find((n) =>
          n.textContent?.includes("文件"),
        );
        const content = document.querySelector('[data-slot="dropdown-menu-content"]');
        const cs = content ? getComputedStyle(content) : null;
        // token 原文（#fff）与 computed（rgb(255,255,255)）格式不同：经探针元素走浏览器
        // 序列化归一（两边都成 rgb()）后再对比。
        const probe = document.createElement("span");
        document.body.appendChild(probe);
        const varColor = (name) => {
          probe.style.color = `var(${name})`;
          return getComputedStyle(probe).color;
        };
        const ics = item ? item.querySelector("svg") : null;
        const out = {
          itemH: item?.getBoundingClientRect().height ?? null,
          gap: item ? getComputedStyle(item).gap : null,
          iconW: ics?.getBoundingClientRect().width ?? null,
          iconH: ics?.getBoundingClientRect().height ?? null,
          bg: cs?.backgroundColor ?? null,
          menuVar: varColor("--menu"),
          border: cs?.borderTopColor ?? null,
          sepVar: varColor("--sep-strong"),
          radius: cs?.borderRadius ?? null,
        };
        probe.remove();
        return out;
      });
      ok(menu.itemH === 45, `P-D1a 桌面菜单 item 行高 45（实际 ${menu.itemH}）`);
      ok(menu.gap === "14px", `P-D1b item 行内 gap 14（实际 ${menu.gap}）`);
      ok(
        menu.iconW === 17 && menu.iconH === 17,
        `P-D1c item 图标 17×17（实际 ${menu.iconW}×${menu.iconH}）`,
      );
      ok(
        menu.bg === menu.menuVar,
        `P-D1d content 底 = --menu token 同源（${menu.bg} vs ${menu.menuVar}）`,
      );
      ok(
        menu.border === menu.sepVar,
        `P-D1e content 边框 = --sep-strong 同源（${menu.border} vs ${menu.sepVar}）`,
      );
      ok(menu.radius === "14px", `P-D1f content 圆角 14（实际 ${menu.radius}）`);
      await page.keyboard.press("Escape");

      // P-D2 白名单小文本 → 内联（零上传请求）
      await page.locator("input[data-composer-file-input]").setInputFiles(TXT_FILE);
      await page
        .locator("[data-attachment-chip]", { hasText: "probe-notes.txt" })
        .waitFor({ timeout: 8000 });
      ok(uploadCountRef.count === 0, "P-D2 白名单 txt → text chip 在场且零上传请求");
      const chipsRow = await page.evaluate(() => {
        const row = document.querySelector("[data-composer-attachments]");
        const cs = row ? getComputedStyle(row) : null;
        return { wrap: cs?.flexWrap ?? null, cls: row?.className ?? "" };
      });
      ok(
        chipsRow.wrap === "nowrap" && chipsRow.cls.includes("hfade"),
        `P-D2b chips 行 nowrap + hfade（wrap=${chipsRow.wrap}）`,
      );

      // P-D3 ⌫ 删 chip（聚焦 chip 按 Backspace）
      await page.locator("[data-attachment-chip]").focus();
      await page.keyboard.press("Backspace");
      await page.waitForTimeout(300);
      ok((await page.locator("[data-attachment-chip]").count()) === 0, "P-D3 聚焦 chip 按 ⌫ 删除");

      // P-D4 超限文本 → uploads 上传路径（提及行）
      await page.locator("input[data-composer-file-input]").setInputFiles(BIG_LOG);
      await page
        .locator("[data-attachment-chip]", { hasText: "uploads/" })
        .waitFor({ timeout: 10000 });
      ok(uploadCountRef.count === 1, "P-D4a 超 1MB 文本 → uploads 上传（计数 1）");
      await page.locator("input[data-composer-file-input]").setInputFiles(PDF_FILE);
      await page.locator("[data-attachment-chip]").nth(1).waitFor({ timeout: 8000 });
      ok(uploadCountRef.count === 2, "P-D4b 非白名单 pdf → uploads（计数 2）");

      // P-D5 发送组帧：提及行 + 内联 fence 全等
      // 去掉 pdf 保留大 log，填文本发送（其实两个都保留，帧文本两行都在）。
      await page.locator('textarea[placeholder="向 Claude 提问..."]').fill("看看附件");
      await page.locator('textarea[placeholder="向 Claude 提问..."]').press("Enter");
      const deadline = Date.now() + 8000;
      let frame = null;
      while (Date.now() < deadline && !frame) {
        frame =
          frames.find(
            (f) =>
              f.type === "user" && JSON.stringify(f.message?.content ?? []).includes("uploads/"),
          ) ?? null;
        if (!frame) await page.waitForTimeout(100);
      }
      if (frame) {
        const textBlock = frame.message.content.find((b) => b.type === "text");
        const txt = String(textBlock?.text ?? "");
        ok(
          txt.includes("附件：uploads/") && txt.includes("看看附件"),
          "P-D5a 帧文本含 uploads 提及行 + 用户文本",
        );
        ok(
          txt.includes("附件 probe-big.log 内容如下：") === false,
          "P-D5b 超 1MB 文本不走内联（无内联前导行）",
        );
      } else {
        ok(false, "P-D5 发送帧未捕获");
      }

      // P-D6 内联文本发送帧 = 前导行 + fence 全等
      await page.locator("input[data-composer-file-input]").setInputFiles(TXT_FILE);
      await page
        .locator("[data-attachment-chip]", { hasText: "probe-notes.txt" })
        .waitFor({ timeout: 8000 });
      await page.locator('textarea[placeholder="向 Claude 提问..."]').fill("读一下");
      await page.locator('textarea[placeholder="向 Claude 提问..."]').press("Enter");
      const deadline6 = Date.now() + 8000;
      let frame6 = null;
      while (Date.now() < deadline6 && !frame6) {
        frame6 =
          frames.find(
            (f) => f.type === "user" && JSON.stringify(f.message?.content ?? []).includes("```"),
          ) ?? null;
        if (!frame6) await page.waitForTimeout(100);
      }
      if (frame6) {
        const textBlock = frame6.message.content.find((b) => b.type === "text");
        const txt = String(textBlock?.text ?? "");
        const expected = `附件 probe-notes.txt 内容如下：\n\`\`\`\n批 8 探针内联文本内容\n第二行\n\`\`\``;
        ok(
          txt.includes("读一下") && txt.includes(expected),
          "P-D6 内联文本帧 = 前导行 + fence 全等",
        );
      } else {
        const userTexts = frames
          .filter((f) => f.type === "user")
          .map((f, i) => `#${i} ${JSON.stringify(f.message?.content ?? []).slice(0, 300)}`);
        console.error(`  [dump] frames=${frames.length}\n  ${userTexts.join("\n  ")}`);
        ok(false, "P-D6 内联发送帧未捕获");
      }
      await page.context().close();
    }

    // ── Part M：移动（sheet 规格 + chips 横滚 §7.2）──
    {
      const page = await (
        await browser.newContext({
          viewport: { width: 390, height: 844 },
          isMobile: true,
          hasTouch: true,
          locale: "zh-CN",
        })
      ).newPage();
      const uploadCountRef = { count: 0 };
      const sockets = [];
      await setupAgentMocks(page, uploadCountRef, sockets, null);
      await openAgentSession(page, sockets);

      // P-M1 sheet item 45 + sheet 10px 侧距（.msheet fixed 容器，v2-primitives 单源）
      await page.getByRole("button", { name: "添加附件" }).click();
      await page.getByRole("menuitem", { name: "文件" }).waitFor({ timeout: 6000 });
      const m = await page.evaluate(() => {
        const item = [...document.querySelectorAll('[role="menuitem"]')].find((n) =>
          n.textContent?.includes("文件"),
        );
        const sheet = document.querySelector(".msheet");
        const scs = sheet ? getComputedStyle(sheet) : null;
        return {
          itemH: item?.getBoundingClientRect().height ?? null,
          sheetLeft: scs?.left ?? null,
          sheetRight: scs?.right ?? null,
        };
      });
      ok(m.itemH === 45, `P-M1a 移动 sheet item 行高 45（实际 ${m.itemH}）`);
      ok(
        m.sheetLeft === "10px" && m.sheetRight === "10px",
        `P-M1b sheet 近贴边 10px 侧距（left=${m.sheetLeft} right=${m.sheetRight}）`,
      );
      await page.keyboard.press("Escape");
      await page.waitForTimeout(400);

      // P-M2 chips 横滚：3 个上传 chip（各 w-36=144px）在 ~342px 容器必溢出
      await page
        .locator("input[data-composer-file-input]")
        .setInputFiles([PDF_FILE, PDF_FILE, PDF_FILE]);
      await page.locator("[data-attachment-chip]").nth(2).waitFor({ timeout: 10000 });
      const wheel = await page.evaluate(() => {
        const row = document.querySelector("[data-composer-attachments]");
        if (!row) return { overflow: false };
        const before = { sl: row.scrollLeft, sw: row.scrollWidth, cw: row.clientWidth };
        // 初始渐隐方向须在 wheel 前读（wheel 后 scrollLeft>1 即翻转到左 on）。
        const fades = {
          left: row.getAttribute("data-fade-left"),
          right: row.getAttribute("data-fade-right"),
        };
        row.dispatchEvent(
          new WheelEvent("wheel", { deltaY: 120, bubbles: true, cancelable: true }),
        );
        const afterMapped = row.scrollLeft;
        row.dispatchEvent(
          new WheelEvent("wheel", { deltaY: 120, shiftKey: true, bubbles: true, cancelable: true }),
        );
        const afterShift = row.scrollLeft;
        return { overflow: before.sw > before.cw, before, afterMapped, afterShift, fades };
      });
      ok(wheel.overflow === true, `P-M2a chips 溢出成立（sw>cw）`);
      ok(wheel.afterMapped > 0, `P-M2b wheel deltaY→scrollLeft 映射（0→${wheel.afterMapped}）`);
      ok(
        wheel.afterMapped === wheel.afterShift,
        `P-M2c Shift+wheel 不额外映射（原生行为，${wheel.afterMapped}===${wheel.afterShift}）`,
      );
      ok(
        wheel.fades.left === "off" && wheel.fades.right === "on",
        `P-M2d 初始渐隐方向 左off/右on（${wheel.fades.left}/${wheel.fades.right}）`,
      );
      // 滚到最右 → 方向翻转
      await page.evaluate(() => {
        const row = document.querySelector("[data-composer-attachments]");
        if (row) row.scrollLeft = row.scrollWidth;
        row?.dispatchEvent(new Event("scroll"));
      });
      await page.waitForTimeout(200);
      const fadesAfter = await page.evaluate(() => {
        const row = document.querySelector("[data-composer-attachments]");
        return {
          left: row?.getAttribute("data-fade-left"),
          right: row?.getAttribute("data-fade-right"),
        };
      });
      ok(
        fadesAfter.left === "on" && fadesAfter.right === "off",
        `P-M2e 滚到头渐隐翻转 左on/右off（${fadesAfter.left}/${fadesAfter.right}）`,
      );
      await page.context().close();
    }

    // ── Part T：280×568 终端（qkeys §7.2 通用性）──
    {
      const page = await (
        await browser.newContext({
          viewport: { width: 280, height: 568 },
          isMobile: true,
          hasTouch: true,
          locale: "zh-CN",
        })
      ).newPage();
      await setupTerminalMocks(page);
      await login(page);
      await page.goto(`${ORIGIN}/projects/proj1/session/terminal_b8-1`);
      await page.locator(".qkey").first().waitFor({ timeout: 10000 });
      const q = await page.evaluate(() => {
        const row = document.querySelector(".qkey")?.parentElement;
        if (!row) return null;
        const before = { sw: row.scrollWidth, cw: row.clientWidth };
        // 渐隐方向在 wheel 前读（同 P-M2 时序原因）。
        const fades = {
          left: row.getAttribute("data-fade-left"),
          right: row.getAttribute("data-fade-right"),
        };
        row.dispatchEvent(
          new WheelEvent("wheel", { deltaY: 100, bubbles: true, cancelable: true }),
        );
        const after = row.scrollLeft;
        row.dispatchEvent(
          new WheelEvent("wheel", { deltaY: 100, shiftKey: true, bubbles: true, cancelable: true }),
        );
        return {
          cls: row.className,
          overflow: before.sw > before.cw,
          sw: before.sw,
          cw: before.cw,
          after,
          fades,
        };
      });
      ok(q != null && q.cls.includes("hfade"), "P-T1 qkeys 行 hfade 类在场");
      ok(q != null && q.overflow, `P-T2 qkeys 溢出成立（sw=${q?.sw} cw=${q?.cw}）`);
      ok(q != null && q.after > 0, `P-T3 wheel 映射 scrollLeft（0→${q?.after}）`);
      ok(
        q != null && q.fades.left === "off" && q.fades.right === "on",
        `P-T4 渐隐初始方向 左off/右on`,
      );
      await page.context().close();
    }
  } finally {
    await browser.close();
  }

  const failed = failCount;
  console.log(
    `\n${failed === 0 ? "ALL PASS" : `${failed} FAILED`} (${passCount + failCount} assertions)`,
  );
  process.exit(failed === 0 ? 0 : 1);
})();
