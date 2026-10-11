// 键位编辑面板探针（2026-10-11 真机反馈⑤「内容 + 顺序编排」+ 两域分离 v2）：覆盖单测
// 测不到的浏览器行为（DOM 几何硬数据，禁截图）。断言：
//   Part 1（移动 390×844 zh）：⚙ 开 MobileSheet 键盘 tab → 8 行（switch + grip）→ 行点按
//     toggle 显隐（hidden 落盘 + track 变灰 + sheet 不关）→ grip 拖拽排序（grip
//     stopPropagation 防 sheet 被拖走）→ order 落盘 + 关面板后 .qkey 条渲染序 = 新序
//     → 双 tab（SegmentedControl）+「可用按键」启用 Tab 预置键 → 条上出现 + 点按发 \t
//     （mock WS input 帧断言）→ 命令 tab 新建（含分组）→ tap 行 = 执行（script+\n 帧 +
//     面板关）→ 长按菜单四项 → 仅插入（script 无 \n 帧）→ 存量自定义键迁移（旧 custom
//     localStorage → commands 默认组渲染 + custom atom 清空）→ 根内滚长列表下滑手势分档
//     （中段下滑 = 列表回滚不接管 sheet；回顶后下滑接管收起——page.mouse 真实指针序列）。
//   Part 2（桌面 1280×900 en）：⚙ 开 Dialog → ⚙ 形态（28×28 无衬底）→ 拖拽行跟手中段
//     断言（transform = dy）+ 落位 + order 落盘 + 重开面板序保持 → Commands tab 同构
//     新建 + 右键菜单 Run → script+\n 帧。
//
// mock 照 probe-v15-batch7-skeleton（终端会话纯 mock WS——不开真实 tmux，铁律③）。
// 用法：bun scripts/probe-quick-keys-editor.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const ORIGIN = process.env.AR_WEB_ORIGIN ?? "http://127.0.0.1:43012";

const TERM = {
  id: "terminal_qke-1",
  projectName: "proj1",
  displayName: "probe-term",
  status: "running",
  createdAt: "2026-10-06T01:00:00.000Z",
};

let pass = 0;
let fail = 0;
function ok(cond, msg) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${msg}`);
  } else {
    fail++;
    console.error(`  ✗ ${msg}`);
  }
}

const json = (body) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(body),
});

/** 持久化清理（探针基线：order/hidden/custom/命令/预置启用集不受上次运行污染）。 */
function clean(page) {
  return page.addInitScript(() => {
    localStorage.removeItem("workbench.terminalQuickKeysHidden");
    localStorage.removeItem("workbench.terminalQuickKeysOrder");
    localStorage.removeItem("workbench.terminalQuickKeysCustom");
    localStorage.removeItem("workbench.terminalPresetKeysEnabled");
    localStorage.removeItem("workbench.terminalQuickCommands");
  });
}

/** 会话域公共 mock（照 batch7）：overview / pinned / approvals。 */
async function setupShellMocks(page) {
  await page.route(/\/api\/overview$/, (r) =>
    r.fulfill(json({ projectNames: ["proj1"], candidates: [] })),
  );
  await page.route(/\/api\/state\/overview\/pinned-sessions(\?.*)?$/, (r) =>
    r.fulfill(json({ sessions: [] })),
  );
  await page.route(/\/api\/approvals$/, (r) => r.fulfill(json({ approvals: [] })));
  await page.route(/\/api\/approvals\/stream$/, (r) => r.abort());
}

/** mock WS：onopen 即 connected（客户端可发），页面 send 的帧进 sentFrames 供断言。 */
async function setupTerminalMocks(page, sentFrames) {
  await setupShellMocks(page);
  await page.route(/\/api\/projects$/, (r) =>
    r.fulfill(json([{ name: "proj1", path: "/srv/projects/proj1" }])),
  );
  await page.route(/\/api\/projects\/proj1\/terminal-sessions(?:\?.*)?$/, (r) =>
    r.fulfill(json({ sessions: [TERM] })),
  );
  await page.route(/\/api\/projects\/proj1\/terminal-sessions\/terminal_qke-1$/, (r) =>
    r.fulfill(json({ session: TERM })),
  );
  // 纯 mock（不 connectToServer）：xterm 空白渲染但不开真实终端进程；捕获上行帧。
  await page.routeWebSocket(/\/stream/, (ws) => {
    ws.onMessage((data) => sentFrames.push(String(data)));
  });
}

/** 上行 input 帧的 data 序列（过滤心跳 ping 等）。 */
const inputDataOf = (sentFrames) =>
  sentFrames
    .map((f) => {
      try {
        return JSON.parse(f);
      } catch {
        return null;
      }
    })
    .filter((m) => m?.type === "input")
    .map((m) => m.data);

async function login(page) {
  await page.goto(`${ORIGIN}/`);
  await page.waitForSelector('input[type="password"]', { timeout: 15000 });
  await page
    .getByLabel("访问密码")
    .or(page.getByLabel("Access password"))
    .fill(await readAppPassword());
  await page
    .getByRole("button", { name: "登录" })
    .or(page.getByRole("button", { name: "Sign in" }))
    .click();
  await page.waitForTimeout(1200);
}

/** 面板主列表行序 → label 文本数组（主列表 ul = select-none；「可用按键」区 ul 不带）。 */
const rowLabels = (page) =>
  page.evaluate(() =>
    [...(document.querySelector("ul.select-none")?.querySelectorAll("li") ?? [])].map(
      (li) => li.querySelector("button > span:first-child")?.textContent.trim() ?? "",
    ),
  );

(async () => {
  const browser = await chromium.launch();
  try {
    console.log("\n=== Part 1: 移动 390×844（sheet 分流 + toggle + 拖拽 + 渲染序）===");
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      locale: "zh-CN",
    });
    const page = await ctx.newPage();
    page.on("pageerror", (err) => console.error("PAGEERROR:", err.message.slice(0, 300)));
    const sentFrames = [];
    await clean(page);
    await setupTerminalMocks(page, sentFrames);
    await login(page);
    await page.goto(`${ORIGIN}/projects/proj1/session/terminal_qke-1`);
    await page.waitForSelector(".qkey", { timeout: 10000 });

    // ⚙ 入口 + sheet 分流（⚙ 在展开态控制行——先展开输入抽屉）
    await page.getByRole("button", { name: "展开输入" }).click();
    await page.getByRole("button", { name: "键位自定义" }).click();
    await page.waitForSelector(".msheet", { timeout: 5000 });
    await page.waitForTimeout(500); // sheet enter 弹簧 + 余量（frontend-notes §18）
    ok((await rowLabels(page)).length === 8, "M1 sheet 开 + 8 行（shift+esc+ctrl+c/d+四向）");

    // 行结构：role=switch + track/knob + grip 手柄（li 内唯一含 svg 的 span）
    const rowShape = await page.evaluate(() => {
      const li = document.querySelector("ul.select-none li");
      const sw = li?.querySelector('button[role="switch"]');
      const grip = li?.querySelector("span.touch-none");
      return {
        sw: sw != null,
        track: sw?.querySelector("span > span") != null,
        gripSvg: grip?.querySelector("svg") != null,
      };
    });
    ok(
      rowShape.sw && rowShape.track && rowShape.gripSvg,
      "M2 行 = switch + track/knob + grip(svg)",
    );

    // 行点按 toggle：hidden 落盘 + track 变灰 + sheet 不关（断 track 自身：toggle 前 success
    // 绿 → toggle 后 elevated3 灰；knob 恒白不可作判据）。
    const trackBgOf = (page) =>
      page.evaluate(() => {
        const li = [...document.querySelectorAll("ul.select-none li")].find((n) =>
          n.textContent.includes("Ctrl+C"),
        );
        return getComputedStyle(li.querySelector('button[role="switch"] > span[aria-hidden]'))
          .backgroundColor;
      });
    const trackBefore = await trackBgOf(page);
    const rowBtn = page.locator("ul li button", { hasText: "Ctrl+C" }).first();
    await rowBtn.click();
    await page.waitForTimeout(200);
    const trackAfter = await trackBgOf(page);
    const hiddenState = await page.evaluate(() => ({
      ls: JSON.parse(localStorage.getItem("workbench.terminalQuickKeysHidden") ?? "[]"),
      qkeys: [...document.querySelectorAll(".qkey")].map((el) => el.textContent.trim()),
    }));
    ok(
      hiddenState.ls.includes("interrupt") && trackBefore !== trackAfter,
      `M3 行点按 → hidden 落盘 + track 变色（${trackBefore} → ${trackAfter}）`,
    );
    ok(
      !hiddenState.qkeys.includes("Ctrl+C") && hiddenState.qkeys.length === 7,
      `M4 关面板前快捷键条已少 Ctrl+C（${hiddenState.qkeys.join(" ")}）`,
    );

    // 拖拽排序：grip down → move 2.2 格 → up（shift=+2）
    const unit = await page.evaluate(() => {
      const lis = [...document.querySelectorAll("ul.select-none li")];
      return lis[1].getBoundingClientRect().top - lis[0].getBoundingClientRect().top;
    });
    const grip0 = page.locator("ul.select-none li").nth(0).locator("span.touch-none").first();
    const gb = await grip0.boundingBox();
    await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2);
    await page.mouse.down();
    await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2 + unit * 2.2, { steps: 10 });
    const midDrag = await page.evaluate(() => {
      const li = document.querySelector("ul.select-none li");
      return {
        transform: getComputedStyle(li).transform,
        sheetY: getComputedStyle(document.querySelector(".msheet")).transform,
      };
    });
    const m5Expected = unit * 2.2;
    const m5Actual = Number.parseFloat(midDrag.transform.split(",").pop() ?? "0");
    ok(
      Math.abs(m5Actual - m5Expected) < 1,
      `M5 拖拽行跟手（transform=${midDrag.transform}，期望≈${m5Expected.toFixed(1)}）`,
    );
    ok(midDrag.sheetY === "none", "M6 拖 grip 期间 sheet 不动（stopPropagation 生效）");
    await page.mouse.up();
    await page.waitForTimeout(250);
    const after = await rowLabels(page);
    ok(
      after[2] === "Shift+Tab" && after.length === 8,
      `M7 落位 shift=+2（序=${after.slice(0, 4).join(" ")}…）`,
    );
    const orderLs = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("workbench.terminalQuickKeysOrder") ?? "[]"),
    );
    ok(
      orderLs[0] === "escape" && orderLs[1] === "interrupt" && orderLs[2] === "shifttab",
      `M8 order 落盘（${JSON.stringify(orderLs.slice(0, 3))}…）`,
    );
    ok((await page.locator(".msheet").count()) === 1, "M9 拖完 sheet 仍开（未被拖走）");

    // 关面板 → .qkey 条渲染序 = 新序（单一管道终验）
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    const barOrder = await page.evaluate(() =>
      [...document.querySelectorAll(".qkey")].map((el) => el.textContent.trim()),
    );
    ok(
      barOrder[0] === "Esc" && barOrder[1] === "Shift+Tab",
      `M10 .qkey 条渲染序 = 新序（${barOrder.slice(0, 3).join(" ")}）`,
    );
    ok(!barOrder.includes("Ctrl+C"), "M11 hidden 过滤在渲染序之后（Ctrl+C 保持隐藏）");

    // ===== 双 tab + 预置键启用（两域分离 v2）：M10 已关面板，重开后继续 =====
    await page.getByRole("button", { name: "键位自定义" }).click();
    await page.waitForSelector(".msheet", { timeout: 5000 });
    await page.waitForTimeout(500); // sheet enter 弹簧 + 余量

    // 双 tab SegmentedControl：键盘默认激活 + 命令 tab 存在
    const tabs = await page.evaluate(
      () =>
        [...document.querySelectorAll(".msheet button")].filter(
          (b) => b.textContent === "键盘" || b.textContent === "命令",
        ).length,
    );
    ok(tabs === 2, "M12 双 tab SegmentedControl（键盘/命令）在场");

    // 键盘 tab「可用按键」分区：标题 + 24 预置键全默认停用
    const availCount = await page.evaluate(() => {
      // 精确匹配：hint 文案含「可用按键」字样，includes 会误中 hint p
      const p = [...document.querySelectorAll(".msheet p")].find(
        (n) => n.textContent.trim() === "可用按键",
      );
      const ul = p?.nextElementSibling;
      return ul?.tagName === "UL" ? ul.querySelectorAll("li").length : -1;
    });
    ok(availCount === 24, `M13「可用按键」分区 24 预置键全停用（实际 ${availCount}）`);

    // 启用 Tab 预置键 → 主列表 9 行（尾补）+ enabled 落盘 + 条上出现
    await page.locator('p:text-is("可用按键") + ul button', { hasText: /^Tab/ }).first().click();
    await page.waitForTimeout(200);
    const enabledState = await page.evaluate(() => ({
      ls: JSON.parse(localStorage.getItem("workbench.terminalPresetKeysEnabled") ?? "[]"),
      rows: document.querySelector("ul.select-none")?.querySelectorAll("li").length,
      qkeys: [...document.querySelectorAll(".qkey")].map((el) => el.textContent.trim()),
    }));
    ok(
      enabledState.ls.includes("preset-tab") &&
        enabledState.rows === 9 &&
        enabledState.qkeys.includes("Tab"),
      `M14 启用 Tab → 主列表 9 行 + enabled 落盘 + 条上出现（行=${enabledState.rows}）`,
    );

    // 关面板 → 点条上 Tab 键 → WS input 帧 = \t（mock 帧断言）
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    sentFrames.length = 0;
    await page.locator(".qkey", { hasText: /^Tab$/ }).first().click();
    await page.waitForTimeout(200);
    const tabFrames = inputDataOf(sentFrames);
    ok(
      tabFrames.length === 1 && tabFrames[0] === "\t",
      `M15 条上 Tab 点按 → input 帧 = \\t（${JSON.stringify(tabFrames)}）`,
    );

    // ===== 命令 tab（命令域 CRUD + 双发送行为）=====
    await page.getByRole("button", { name: "键位自定义" }).click();
    await page.waitForSelector(".msheet", { timeout: 5000 });
    await page.waitForTimeout(500); // sheet enter 弹簧 + 余量
    await page.getByRole("button", { name: "命令", exact: true }).click();
    await page.waitForTimeout(200);
    const emptyState = await page.evaluate(() =>
      [...document.querySelectorAll(".msheet p")].some((n) => n.textContent.includes("暂无命令")),
    );
    ok(emptyState, "M16 命令 tab 切换 + 空态文案");

    // 新建命令（含分组）：表单展开 → 填名称/分组/脚本 → 保存 → 分区标题渲染
    await page.getByRole("button", { name: "新建命令" }).click();
    await page.waitForTimeout(200);
    await page.locator("#qc-form-label").fill("部署检查");
    await page.locator("#qc-form-group").fill("部署");
    await page.locator("#qc-form-script").fill("systemctl status app");
    await page.getByRole("button", { name: "保存" }).click();
    await page.waitForTimeout(200);
    const cmdRendered = await page.evaluate(() => {
      const ps = [...document.querySelectorAll(".msheet p")].map((n) => n.textContent);
      const rows = [...document.querySelectorAll(".msheet ul li button > span:first-child")].map(
        (n) => n.textContent.trim(),
      );
      return { groupTitle: ps.includes("部署"), row: rows.some((r) => r.includes("部署检查")) };
    });
    ok(
      cmdRendered.groupTitle && cmdRendered.row,
      "M17 新建命令（分组「部署」）→ 分区标题 + 行渲染",
    );

    // tap 行 = 执行：input 帧 = script + \n + 面板关闭（用户要看终端输出）
    sentFrames.length = 0;
    await page.locator(".msheet ul li button", { hasText: "部署检查" }).first().click();
    await page.waitForSelector(".msheet", { state: "detached", timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(200);
    const runFrames = inputDataOf(sentFrames);
    const sheetsAfterRun = await page.locator(".msheet").count();
    ok(
      runFrames.length === 1 && runFrames[0] === "systemctl status app\n",
      `M18 tap 命令行 → 帧 = script+\\n（${JSON.stringify(runFrames)}）`,
    );
    ok(sheetsAfterRun === 0, `M18b 执行后面板关闭（.msheet 残留=${sheetsAfterRun}）`);

    // 长按（触屏 500ms 阈值 + 合成 pointerType:touch pointerdown）→ 菜单四项
    await page.getByRole("button", { name: "键位自定义" }).click();
    await page.waitForSelector(".msheet", { timeout: 5000 });
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: "命令", exact: true }).click();
    await page.waitForTimeout(200);
    const cmdRow = page.locator(".msheet ul li button", { hasText: "部署检查" }).first();
    await cmdRow.dispatchEvent("pointerdown", {
      pointerType: "touch",
      clientX: 190,
      clientY: 400,
      bubbles: true,
      pointerId: 7,
    });
    await page.waitForTimeout(800);
    const menuItems = await page.evaluate(() =>
      [...document.querySelectorAll('[role="menuitem"]')].map((n) => n.textContent.trim()),
    );
    ok(
      ["执行", "仅插入", "编辑命令", "删除命令"].every((m) => menuItems.includes(m)),
      `M19 长按 → 菜单四项（${menuItems.join("/")}）`,
    );

    // 仅插入：input 帧 = script 无 \n（可补参数再跑）；主面板同关
    sentFrames.length = 0; // 清掉 M18 的 run 帧，只看本步
    await page
      .getByRole("menuitem", { name: "仅插入" })
      .dispatchEvent("click")
      .catch(async () => {
        await page.getByRole("button", { name: "仅插入" }).first().dispatchEvent("click");
      });
    await page.waitForTimeout(600);
    const insertFrames = inputDataOf(sentFrames);
    const sheetsLeft = await page.locator(".msheet").count();
    ok(
      insertFrames.length === 1 && insertFrames[0] === "systemctl status app",
      `M20 仅插入 → 帧 = script 无 \\n（${JSON.stringify(insertFrames)}）`,
    );
    ok(sheetsLeft === 0, `M21 仅插入后主面板同关（.msheet 残留=${sheetsLeft}）`);

    // ===== 起手面分档 ③：sheet 根自身内滚的长列表下滑手势（2026-10-11 真机反馈）=====
    // ⚙ 面板 8+24 行远超 sheet 高 → 滚动容器是 `.msheet` 根自身（hasScrollableContent 只扫
    // 后代判 false）→ 中段下滑曾把浮层拖下去关掉。修复后：滚离顶部时下滑 = 列表回滚
    //（sheet 不接管），滚回顶部（无可滚量）才归 sheet 下拉收起。输入用真实鼠标指针
    //（CDP 合成 touch 在此环境的 hit-test/原生滚动不可靠——touchstart 命中行手柄、不触发
    // 原生滚动，勿走），起点在 sheet 左缘 6px 内边距条（无按钮面，target = 根）。
    console.log("Part 1 M22: 根内滚长列表下滑 = 列表回滚，不接管 sheet");
    await page.getByRole("button", { name: "键位自定义" }).click();
    await page.waitForSelector(".msheet", { timeout: 5000 });
    await page.waitForTimeout(500); // sheet enter 弹簧 + 余量（frontend-notes §18）
    const rootGeom = await page.evaluate(() => {
      const root = document.querySelector(".msheet");
      return {
        overflowY: getComputedStyle(root).overflowY,
        scrollHeight: root.scrollHeight,
        clientHeight: root.clientHeight,
        // 与生产谓词 hasScrollableContent 同条件（溢出 + overflow-y auto/scroll）——
        // 无差别查 scrollHeight 会把 visible 溢出的非滚容器后代误计入，将来假挂。
        descendantOverflow: [...root.querySelectorAll("*")].filter((n) => {
          if (n.scrollHeight <= n.clientHeight + 1) return false;
          const oy = getComputedStyle(n).overflowY;
          return oy === "auto" || oy === "scroll";
        }).length,
      };
    });
    ok(
      rootGeom.overflowY === "auto" &&
        rootGeom.scrollHeight > rootGeom.clientHeight + 100 &&
        rootGeom.descendantOverflow === 0,
      `M22a 滚动容器 = .msheet 根自身（${rootGeom.scrollHeight} > ${rootGeom.clientHeight}，后代无可滚容器）`,
    );
    // 内容区起手点：sheet 左缘 6px 内边距条（button 面从 20px 起，此条上 target = 根）。
    const startX = await page.evaluate(() => {
      const r = document.querySelector(".msheet").getBoundingClientRect();
      return Math.round(r.left + 6);
    });
    /** 鼠标下滑手势：down → 6 步拖 dy → 逐帧采 sheet inline → 移开指针再 up（防 click）。 */
    const mouseDragDown = async (y0, dy) => {
      await page.mouse.move(startX, y0);
      await page.mouse.down();
      const frames = [];
      for (let i = 1; i <= 6; i++) {
        await page.mouse.move(startX, y0 + (dy * i) / 6, { steps: 1 });
        await page.waitForTimeout(40);
        frames.push(await page.evaluate(() => document.querySelector(".msheet").style.transform));
      }
      await page.mouse.move(startX, 10);
      await page.mouse.up();
      return frames;
    };
    await page.evaluate(() => {
      document.querySelector(".msheet").scrollTop = 220;
    });
    await page.waitForTimeout(150);
    const startY = await page.evaluate(() => {
      const r = document.querySelector(".msheet").getBoundingClientRect();
      return Math.round(r.top + r.height / 2);
    });
    const midFrames = await mouseDragDown(startY, 90);
    ok(
      midFrames.every((f) => f === ""),
      `M22b 已滚离顶部下滑 → sheet 不接管（逐帧 inline ${JSON.stringify(midFrames)}）`,
    );
    // 原生滚动通道未被劫持：指针悬列表上滚轮回滚，scrollTop 减小、sheet 不动。
    await page.mouse.move(startX + 100, startY);
    await page.mouse.wheel(0, -150);
    await page.waitForTimeout(150);
    const wheelScroll = await page.evaluate(() => document.querySelector(".msheet").scrollTop);
    ok(wheelScroll < 220, `M22c 滚轮回滚列表（scrollTop 220 → ${wheelScroll}，滚到 0 亦通过）`);
    // 滚回顶部：无可滚量 → 下滑交还 sheet 下拉收起（原「不可滚整面可拖」档保留）。
    await page.evaluate(() => {
      document.querySelector(".msheet").scrollTop = 0;
    });
    await page.waitForTimeout(150);
    // 拖距按实时 dismiss 阈值导出（预置假设漂移防假挂，同 1b7 教训）：6 步 ×40ms 匀速拖的
    // 松手投影 ≈ dy × 2.25（位移 + 窗口速度 × 300ms），dy = 0.4 × 阈值 → 投影 0.9 × 阈值，
    // 接管成立且慢速松手回弹（M22e 面板保持开）留 10% 余量。
    const topDragY = Math.round(Math.max(64, rootGeom.clientHeight * 0.25) * 0.4);
    const topFrames = await mouseDragDown(startY, topDragY);
    ok(
      topFrames.some((f) => f !== ""),
      `M22d 已回顶部下滑 → sheet 接管（inline 逐帧 ${JSON.stringify(topFrames)}）`,
    );
    await page.waitForTimeout(400); // 慢速松手回弹，面板保持开
    ok(
      (await page.locator('.msheet[data-state="open"]').count()) === 1,
      "M22e 接管后慢速松手回弹、面板保持开",
    );
    await page.keyboard.press("Escape");
    await page.locator(".msheet").waitFor({ state: "detached", timeout: 3000 });

    // ===== 存量自定义键一次性迁移（两域分离 v2）=====
    const ctxM = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      locale: "zh-CN",
    });
    const pageM = await ctxM.newPage();
    pageM.on("pageerror", (err) => console.error("PAGEERROR:", err.message.slice(0, 300)));
    await clean(pageM);
    // 预置旧版 custom 数据（第三轮遗留形态）→ 进页面挂载即迁移
    await pageM.addInitScript(() => {
      localStorage.setItem(
        "workbench.terminalQuickKeysCustom",
        JSON.stringify([{ id: "custom-x", label: "旧键", sequence: "echo old" }]),
      );
    });
    await setupTerminalMocks(pageM, []);
    await login(pageM);
    await pageM.goto(`${ORIGIN}/projects/proj1/session/terminal_qke-1`);
    await pageM.waitForSelector(".qkey", { timeout: 10000 });
    await pageM.waitForTimeout(400);
    const migrated = await pageM.evaluate(() => ({
      commands: JSON.parse(localStorage.getItem("workbench.terminalQuickCommands") ?? "[]"),
      custom: localStorage.getItem("workbench.terminalQuickKeysCustom"),
      bar: [...document.querySelectorAll(".qkey")].map((el) => el.textContent.trim()),
    }));
    ok(
      migrated.commands.length === 1 &&
        migrated.commands[0].id === "custom-x" &&
        migrated.commands[0].script === "echo old" &&
        migrated.commands[0].group === "",
      `TM1 旧 custom → commands（id 复用 + sequence→script + 默认组）`,
    );
    ok(
      (migrated.custom === "[]" || migrated.custom === null) && !migrated.bar.includes("旧键"),
      "TM2 custom atom 清空 + 条上不再显示自定义键",
    );
    // 迁移条目在命令 tab「默认分组」分区可见（渲染层终验）
    await pageM.getByRole("button", { name: "展开输入" }).click();
    await pageM.getByRole("button", { name: "键位自定义" }).click();
    await pageM.waitForSelector(".msheet", { timeout: 5000 });
    await pageM.waitForTimeout(500);
    await pageM.getByRole("button", { name: "命令", exact: true }).click();
    await pageM.waitForTimeout(200);
    const migratedRendered = await pageM.evaluate(() => {
      const ps = [...document.querySelectorAll(".msheet p")].map((n) => n.textContent);
      const rows = [...document.querySelectorAll(".msheet ul li button > span:first-child")].map(
        (n) => n.textContent.trim(),
      );
      return { def: ps.includes("默认分组"), row: rows.some((r) => r.includes("旧键")) };
    });
    ok(migratedRendered.def && migratedRendered.row, "TM3 迁移条目命令 tab「默认分组」分区渲染");
    await ctxM.close();
    await ctx.close();

    {
      console.log("\n=== Part 2: 桌面 1280×900（Dialog 分流 + 跟手几何 + 重开保持）===");
      const ctx2 = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        locale: "en-US",
      });
      const page = await ctx2.newPage();
      // 合成 pointerdown 的 setPointerCapture 抛 InvalidPointerId（合成指针非 active）——
      // 手势仍由后续合成 move/up 驱动（D3-D5 全绿），已知噪声非回归信号。
      page.on("pageerror", (err) => {
        if (err.message.includes("setPointerCapture")) return;
        console.error("PAGEERROR:", err.message.slice(0, 300));
      });
      const sentFrames2 = [];
      await clean(page);
      await setupTerminalMocks(page, sentFrames2);
      await login(page);
      await page.goto(`${ORIGIN}/projects/proj1/session/terminal_qke-1`);
      await page.waitForSelector(".qkey", { timeout: 10000 });

      // Dialog 分流（桌面 = 居中卡，无 .msheet；桌面 terminal 输入抽屉同默认收起——先展开）
      await page.getByRole("button", { name: "Expand input" }).click();
      // ⚙ 恒显形态（第三轮反馈③：.iicn.gear 例外类——桌面 28×28 无衬底，不被
      //   min-width:1024 的 .iicn{display:none} 吞掉；本轮探针曾实抓 display:none 回归）
      const gearShape = await page.evaluate(() => {
        const el = document.querySelector(".iicn.gear");
        const r = el?.getBoundingClientRect();
        const cs = el ? getComputedStyle(el) : null;
        return { w: r?.width, h: r?.height, bg: cs?.backgroundColor };
      });
      ok(
        gearShape.w === 28 && gearShape.h === 28 && gearShape.bg === "rgba(0, 0, 0, 0)",
        `D0 ⚙ = 28×28 无衬底恒显（w=${gearShape.w} h=${gearShape.h} bg=${gearShape.bg}）`,
      );
      await page.getByRole("button", { name: "Customize keys" }).click();
      await page.waitForSelector('div[data-slot="dialog-content"]', { timeout: 5000 });
      ok((await page.locator(".msheet").count()) === 0, "D1 桌面分流 = Dialog（.msheet 不在场）");
      ok((await rowLabels(page)).length === 8, "D2 Dialog 内 8 行");

      // D2b 桌面卡片内滚（max-h-[85vh] 修复回归）：键盘 tab 32 行内容远超视口——
      // 无内滚则卡片居中定位溢出视口顶，底部行不可达（本批实抓的真 bug）。
      const scrollShape = await page.evaluate(() => {
        const card = document.querySelector('div[data-slot="dialog-content"] > div');
        const scroller = card?.querySelector('[class*="overflow-y-auto"]');
        if (!card || !scroller) return null;
        scroller.scrollTop = 99999;
        const reached = scroller.scrollTop;
        scroller.scrollTop = 0;
        return {
          cardH: card.getBoundingClientRect().height,
          scrollH: scroller.scrollHeight,
          clientH: scroller.clientHeight,
          reached,
        };
      });
      ok(
        scrollShape != null && scrollShape.cardH <= 900 * 0.85 + 1,
        `D2b 卡片高 ≤ 85vh（cardH=${scrollShape?.cardH.toFixed(0)}）`,
      );
      ok(
        scrollShape != null && scrollShape.scrollH > scrollShape.clientH && scrollShape.reached > 0,
        `D2c 内滚生效（scrollH=${scrollShape?.scrollH} > clientH=${scrollShape?.clientH}，scrollTop 可达 ${scrollShape?.reached}）`,
      );

      // 拖拽行跟手（桌面鼠标）：dy = 1.4 格 → shift=+1
      const unit2 = await page.evaluate(() => {
        const lis = [...document.querySelectorAll("ul.select-none li")];
        return lis[1].getBoundingClientRect().top - lis[0].getBoundingClientRect().top;
      });
      const grip02 = page.locator("ul.select-none li").nth(0).locator("span.touch-none").first();
      const gb2 = await grip02.boundingBox();
      // 合成 pointer 序列驱动拖拽（CDP 真实指针会触发 Radix Dialog 焦点链副作用把面板
      // 关掉——已实测 dialogOpen 在 move 期间翻 false；合成事件直接命中 handler，绕开
      // hit-test 焦点副作用，手势状态机/transform 投影/落位断言面不变）。
      const gx = gb2.x + gb2.width / 2;
      const gy = gb2.y + gb2.height / 2;
      await grip02.dispatchEvent("pointerdown", {
        bubbles: true,
        pointerId: 3,
        pointerType: "mouse",
        clientX: gx,
        clientY: gy,
      });
      const dragUl = page.locator("ul.select-none").first();
      for (let i = 1; i <= 8; i++) {
        await dragUl.dispatchEvent("pointermove", {
          bubbles: true,
          pointerId: 3,
          pointerType: "mouse",
          clientX: gx,
          clientY: gy + (unit2 * 1.4 * i) / 8,
        });
      }
      const midDrag2 = await page.evaluate(() => {
        const li = document.querySelector("ul.select-none li");
        return {
          transform: getComputedStyle(li).transform,
          cls: li.className,
          gripCursor: getComputedStyle(li.querySelector("span.touch-none")).cursor,
        };
      });
      const dyExpected = unit2 * 1.4;
      const dyActual = Number.parseFloat(midDrag2.transform.split(",").pop() ?? "0");
      ok(
        Math.abs(dyActual - dyExpected) < 1,
        `D3 拖拽行跟手（transform=${midDrag2.transform}，期望≈${dyExpected.toFixed(1)}）`,
      );
      ok(
        midDrag2.cls.includes("bg-elevated2") && midDrag2.cls.includes("shadow-lg"),
        "D4 拖拽行提升态（bg-elevated2 + shadow）",
      );
      // 绘制层级：拖拽行 translateY(1.4u) 与静止第三行交叠（[2u, 2.4u] 带）——
      // elementFromPoint 须返回拖拽行（z-index 在 static 元素上不生效，li 必须 relative）。
      const paintOrder = await page.evaluate(() => {
        const lis = [...document.querySelectorAll("ul.select-none li")];
        const dragged = lis[0].getBoundingClientRect();
        const hit = document.elementFromPoint(
          dragged.left + dragged.width / 2,
          dragged.bottom - dragged.height * 0.2,
        );
        return lis[0].contains(hit);
      });
      ok(paintOrder, "D4b 重叠带绘制层级 = 拖拽行在上（relative + z-1 生效）");
      await dragUl.dispatchEvent("pointerup", {
        bubbles: true,
        pointerId: 3,
        pointerType: "mouse",
        clientX: gx,
        clientY: gy + unit2 * 1.4,
      });
      await page.waitForTimeout(250);
      const after2 = await rowLabels(page);
      ok(after2[1] === "Shift+Tab", `D5 落位 shift=+1（序=${after2.slice(0, 3).join(" ")}…）`);
      const orderLs2 = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("workbench.terminalQuickKeysOrder") ?? "[]"),
      );
      ok(
        orderLs2[0] === "escape" && orderLs2[1] === "shifttab",
        `D6 order 落盘（${JSON.stringify(orderLs2.slice(0, 2))}…）`,
      );

      // 重开面板序保持（order atom → localStorage → 重挂载归一化消费）
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);
      await page.getByRole("button", { name: "Customize keys" }).click();
      await page.waitForSelector('div[data-slot="dialog-content"]', { timeout: 5000 });
      const afterReopen = await rowLabels(page);
      ok(
        afterReopen[0] === "Esc" && afterReopen[1] === "Shift+Tab",
        `D7 重开面板序保持（${afterReopen.slice(0, 2).join(" ")}）`,
      );

      // ===== Commands tab 同构（多端同构：Dialog 容器内同一套命令域内容）=====
      await page.getByRole("button", { name: "Commands", exact: true }).click();
      await page.waitForTimeout(200);
      await page.getByRole("button", { name: "New command" }).click();
      await page.waitForTimeout(200);
      await page.locator("#qc-form-label").fill("Run tests");
      await page.locator("#qc-form-group").fill("ops");
      await page.locator("#qc-form-script").fill("bun run test");
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await page.waitForTimeout(200);
      const savedCmd = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("workbench.terminalQuickCommands") ?? "[]"),
      );
      ok(
        savedCmd.some((c) => c.label === "Run tests" && c.group === "ops"),
        "D8 Commands tab 同构：新建命令（含分组）→ localStorage 落盘",
      );
      // 右键命令行 → 菜单四项（Run/Insert only/Edit command/Delete command）→ Run → 帧
      const cmdRow2 = page
        .locator('div[data-slot="dialog-content"] ul li button', { hasText: "Run tests" })
        .first();
      await cmdRow2.dispatchEvent("contextmenu", {
        bubbles: true,
        clientX: 640,
        clientY: 400,
      });
      await page.waitForTimeout(300);
      const menuItems2 = await page.evaluate(() =>
        [...document.querySelectorAll('[role="menuitem"]')].map((n) => n.textContent.trim()),
      );
      ok(
        ["Run", "Insert only", "Edit command", "Delete command"].every((m) =>
          menuItems2.includes(m),
        ),
        `D9 桌面右键 → 菜单四项（${menuItems2.join("/")}）`,
      );
      await page.getByRole("menuitem", { name: "Run" }).first().dispatchEvent("click");
      await page.waitForTimeout(300);
      const runFrames2 = inputDataOf(sentFrames2);
      ok(
        runFrames2.includes("bun run test\n"),
        `D10 右键 Run → input 帧 = script+\\n（${JSON.stringify(runFrames2)}）`,
      );
      await ctx2.close();
    }
  } finally {
    await browser.close();
  }
  console.log(`\n总计: PASS ${pass} / FAIL ${fail} — ${fail === 0 ? "ALL PASS" : "有 FAIL"}`);
  process.exit(fail === 0 ? 0 : 1);
})();
