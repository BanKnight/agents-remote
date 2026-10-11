// 键位编辑面板探针（2026-10-11 真机反馈⑤「内容 + 顺序编排」）：覆盖单测验不到的浏览器
// 行为（DOM 几何硬数据，禁截图）。断言：
//   Part 1（移动 390×844 zh）：⚙ 开 MobileSheet → 8 行（switch + grip）→ 行点按 toggle
//     显隐（hidden 落盘 + track 变灰 + sheet 不关）→ grip 拖拽排序（grip stopPropagation
//     防 sheet 被拖走）→ order 落盘 + 关面板后 .qkey 条渲染序 = 新序（单一管道终验）
//     → 自定义键增删改全流程（第三轮反馈④：新建表单展开/添加行隐藏 → 保存尾补渲染
//     → 拖拽提交 order 含 custom id → pencil 改名同步 → 删除后条上消失 + 存储清空）。
//   Part 2（桌面 1280×900 en）：⚙ 开 Dialog → 拖拽行跟手中段断言（transform = dy）+ 落位
//     + order 落盘 + 重开面板序保持 + 自定义键同构抽验（新建 → 行数 +1）。
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

/** 持久化清理（探针基线：order/hidden/custom 不受上次运行污染）。 */
function clean(page) {
  return page.addInitScript(() => {
    localStorage.removeItem("workbench.terminalQuickKeysHidden");
    localStorage.removeItem("workbench.terminalQuickKeysOrder");
    localStorage.removeItem("workbench.terminalQuickKeysCustom");
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

async function setupTerminalMocks(page) {
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
  // 纯 mock（不 connectToServer）：xterm 空白渲染但不开真实终端进程。
  await page.routeWebSocket(/\/stream/, () => {});
}

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

/** 面板行序 → label 文本数组。 */
const rowLabels = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("ul li button > span:first-child")].map((el) =>
      el.textContent.trim(),
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
    await clean(page);
    await setupTerminalMocks(page);
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
      const li = document.querySelector("ul li");
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
        const li = [...document.querySelectorAll("ul li")].find((n) =>
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
      const lis = [...document.querySelectorAll("ul li")];
      return lis[1].getBoundingClientRect().top - lis[0].getBoundingClientRect().top;
    });
    const grip0 = page.locator("ul li").nth(0).locator("span.touch-none").first();
    const gb = await grip0.boundingBox();
    await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2);
    await page.mouse.down();
    await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2 + unit * 2.2, { steps: 10 });
    const midDrag = await page.evaluate(() => {
      const li = document.querySelector("ul li");
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

    // ===== 自定义键增删改（第三轮反馈④；grip 行首重排后同面板内继续）=====
    await page.getByRole("button", { name: "键位自定义" }).click();
    await page.waitForSelector(".msheet", { timeout: 5000 });
    await page.waitForTimeout(500); // sheet enter 弹簧 + 余量

    // 新建：添加行 → 表单展开（添加行隐藏 = 非添加语境）+ 保存初始 disabled
    await page.getByRole("button", { name: "新建快捷键" }).click();
    await page.waitForTimeout(200);
    const addRowHidden = await page.evaluate(() => {
      const btn = [...document.querySelectorAll(".msheet button")].find((b) =>
        b.textContent.includes("新建快捷键"),
      );
      return btn != null && getComputedStyle(btn).display === "none";
    });
    ok(addRowHidden, "M12 表单展开后添加行隐藏（非添加语境）");
    const formShape = await page.evaluate(() => ({
      input: document.querySelector(".msheet #qk-custom-label") != null,
      textarea: document.querySelector(".msheet #qk-custom-content") != null,
      saveDisabled: [...document.querySelectorAll(".msheet button")].find((b) =>
        b.textContent.includes("保存"),
      )?.disabled,
    }));
    ok(
      formShape.input && formShape.textarea && formShape.saveDisabled === true,
      "M13 表单 = 名称 input + 内容 textarea + 保存初始 disabled",
    );
    await page.locator("#qk-custom-label").fill("跑测试");
    await page.locator("#qk-custom-content").fill("bun run test");
    const saveEnabled = await page.evaluate(
      () =>
        ![...document.querySelectorAll(".msheet button")].find((b) =>
          b.textContent.includes("保存"),
        )?.disabled,
    );
    ok(saveEnabled, "M14 名称+内容填后保存 enabled");
    await page.getByRole("button", { name: "保存" }).click();
    await page.waitForTimeout(200);
    const afterAdd = await rowLabels(page);
    ok(
      afterAdd.length === 9 && afterAdd[8] === "跑测试",
      `M15 保存 → 行 9 尾补渲染（${afterAdd.slice(7).join("/")}）`,
    );
    const barAfterAdd = await page.evaluate(() =>
      [...document.querySelectorAll(".qkey")].map((el) => el.textContent.trim()),
    );
    ok(barAfterAdd.includes("跑测试"), "M16 快捷键条渲染自定义键（单一管道）");

    // 拖拽提交全序（commitReorder 用 ordered 全量 id）→ order 落盘含 custom id
    const grip0b = page.locator("ul li").nth(0).locator("span.touch-none").first();
    const gb0b = await grip0b.boundingBox();
    await page.mouse.move(gb0b.x + gb0b.width / 2, gb0b.y + gb0b.height / 2);
    await page.mouse.down();
    await page.mouse.move(gb0b.x + gb0b.width / 2, gb0b.y + gb0b.height / 2 + unit * 1.6, {
      steps: 8,
    });
    await page.mouse.up();
    await page.waitForTimeout(250);
    const orderWithCustom = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("workbench.terminalQuickKeysOrder") ?? "[]"),
    );
    ok(
      orderWithCustom.at(-1)?.startsWith("custom-"),
      `M17 拖拽提交 order 含 custom id（尾位=${orderWithCustom.at(-1)}）`,
    );

    // 编辑改名（pencil 唯一——仅自定义键行有）：面板行 + 条同步更新
    await page.locator('ul li button[aria-label="编辑快捷键"]').first().click();
    await page.waitForTimeout(200);
    await page.locator("#qk-custom-label").fill("跑全量测试");
    await page.getByRole("button", { name: "保存" }).click();
    await page.waitForTimeout(200);
    const afterRename = await rowLabels(page);
    const barAfterRename = await page.evaluate(() =>
      [...document.querySelectorAll(".qkey")].map((el) => el.textContent.trim()),
    );
    ok(
      afterRename.includes("跑全量测试") && barAfterRename.includes("跑全量测试"),
      "M18 pencil 改名 → 面板行 + 条同步",
    );

    // 删除（表单左下红字钮）：行回 8、条上消失、custom 存储清空
    await page.locator('ul li button[aria-label="编辑快捷键"]').first().click();
    await page.waitForTimeout(200);
    await page.getByRole("button", { name: "删除快捷键" }).click();
    await page.waitForTimeout(200);
    const afterDel = await rowLabels(page);
    const customLs = await page.evaluate(() =>
      localStorage.getItem("workbench.terminalQuickKeysCustom"),
    );
    const barAfterDel = await page.evaluate(() =>
      [...document.querySelectorAll(".qkey")].map((el) => el.textContent.trim()),
    );
    ok(
      afterDel.length === 8 &&
        !afterDel.includes("跑全量测试") &&
        JSON.parse(customLs ?? "[]").length === 0 &&
        !barAfterDel.includes("跑全量测试"),
      `M19 删除 → 行 8 + 存储清空 + 条上消失（行=${afterDel.length}）`,
    );
    await ctx.close();

    {
      console.log("\n=== Part 2: 桌面 1280×900（Dialog 分流 + 跟手几何 + 重开保持）===");
      const ctx2 = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        locale: "en-US",
      });
      const page = await ctx2.newPage();
      page.on("pageerror", (err) => console.error("PAGEERROR:", err.message.slice(0, 300)));
      await clean(page);
      await setupTerminalMocks(page);
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

      // 拖拽行跟手（桌面鼠标）：dy = 1.4 格 → shift=+1
      const unit2 = await page.evaluate(() => {
        const lis = [...document.querySelectorAll("ul li")];
        return lis[1].getBoundingClientRect().top - lis[0].getBoundingClientRect().top;
      });
      const grip02 = page.locator("ul li").nth(0).locator("span.touch-none").first();
      const gb2 = await grip02.boundingBox();
      await page.mouse.move(gb2.x + gb2.width / 2, gb2.y + gb2.height / 2);
      await page.mouse.down();
      await page.mouse.move(gb2.x + gb2.width / 2, gb2.y + gb2.height / 2 + unit2 * 1.4, {
        steps: 8,
      });
      const midDrag2 = await page.evaluate(() => {
        const li = document.querySelector("ul li");
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
        const lis = [...document.querySelectorAll("ul li")];
        const dragged = lis[0].getBoundingClientRect();
        const hit = document.elementFromPoint(
          dragged.left + dragged.width / 2,
          dragged.bottom - dragged.height * 0.2,
        );
        return lis[0].contains(hit);
      });
      ok(paintOrder, "D4b 重叠带绘制层级 = 拖拽行在上（relative + z-1 生效）");
      await page.mouse.up();
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

      // 自定义键同构抽验（多端同构：Dialog 容器内同一套增删改内容，第三轮反馈④）
      await page.getByRole("button", { name: "New key" }).click();
      await page.locator("#qk-custom-label").fill("Run tests");
      await page.locator("#qk-custom-content").fill("bun run test");
      await page.getByRole("button", { name: "Save" }).click();
      await page.waitForTimeout(200);
      ok((await rowLabels(page)).length === 9, "D8 自定义键同构：新建 → Dialog 内行 9（容器无关）");
      await ctx2.close();
    }
  } finally {
    await browser.close();
  }
  console.log(`\n总计: PASS ${pass} / FAIL ${fail} — ${fail === 0 ? "ALL PASS" : "有 FAIL"}`);
  process.exit(fail === 0 ? 0 : 1);
})();
