// 探针：验证 claude composer 卡片内 Stop/Send 的 isEmpty 同步、send 点击不丢焦、selectors
// 留卡片内（H1/H2/H3/H4 的 React/DOM 部分）。iOS 软键盘行为 Playwright 模拟不了，归真机；
// 本探针只验桌面可复现的 DOM 行为。
//
// 密码由脚本自读（env → config.yaml → api 进程 environ），不进 agent 上下文、不打印值。
// 用法：node scripts/probe-claude-composer-toolbar.mjs
import { chromium } from "@playwright/test";
import { readAppPassword, readAppPasswordSource } from "./lib/deploy-config.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const projectName = process.env.PROBE_PROJECT ?? "test";
const fakeSessionId = "agent_probe-composer-toolbar";

async function setupMocks(page) {
  const session = {
    id: fakeSessionId,
    projectName,
    provider: "claude",
    displayName: "Probe Agent",
    status: "idle",
    permissionMode: "default",
    createdAt: new Date().toISOString(),
  };
  const detail = {
    session,
    availableModels: ["sonnet", "opus", "haiku"],
    availablePermissionModes: ["default", "bypassPermissions"],
  };
  await page.route(
    new RegExp(`/api/projects/${projectName}/agent-sessions/${fakeSessionId}$`),
    (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(detail) }),
  );
  await page.route(new RegExp(`/api/projects/${projectName}/agent-sessions$`), (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sessions: [session] }),
    }),
  );
  await page.route(new RegExp("/api/overview$"), (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        projectNames: [projectName],
        candidates: [
          {
            type: "agent",
            projectName,
            sessionId: fakeSessionId,
            displayName: "Probe Agent",
            status: "idle",
            provider: "claude",
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    }),
  );
  // WS 全 mock（无 connectToServer）：fake session 不存在于真实 server（upgrade → 404），
  // 7c2f975 起 composer disconnected 时禁用输入——与 e2e claude-windowing 同款：全 mock 使
  // socket open（→ connected → composer enabled），回 pong 防 half-open 自愈关连接。
  await page.routeWebSocket(/claude-stream/, (ws) => {
    ws.onMessage((data) => {
      try {
        const msg = JSON.parse(String(data));
        if (msg.type === "ping") ws.send(JSON.stringify({ type: "pong" }));
      } catch {
        /* 非 JSON 帧忽略 */
      }
    });
  });
}

async function probe(browser, label, contextOptions) {
  const ctx = await browser.newContext(contextOptions);
  const page = await ctx.newPage();
  await setupMocks(page);
  const sentFrames = [];
  page.on("websocket", (ws) => {
    ws.on("framesent", (f) => sentFrames.push(String(f.payload)));
  });

  const pw = await readAppPasswordSource(); // 只用 source 标记，不取 value 进日志
  await page.goto(`${WEB_ORIGIN}/`);
  await page.getByLabel("Password").fill(await readAppPassword());
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.goto(`${WEB_ORIGIN}/projects/${projectName}/agent-sessions/${fakeSessionId}/claude`);

  const textarea = page.locator("[data-composer-float] textarea").first();
  await textarea.waitFor({ state: "visible", timeout: 15000 });

  const coarse = await page.evaluate(() => window.matchMedia("(pointer: coarse)").matches);
  console.log(`[${label}] (pointer: coarse) = ${coarse}  (密码源: ${pw})`);

  await textarea.focus();
  await page.waitForTimeout(120);
  const boxBefore = await textarea.boundingBox();
  await textarea.fill("hi");
  await page.waitForTimeout(180);
  const boxAfter = await textarea.boundingBox();
  const jump = Math.abs((boxAfter?.y ?? 0) - (boxBefore?.y ?? 0));
  console.log(
    `[${label}] 输入"hi"前后 textarea Y 跳变 = ${jump.toFixed(1)}px (before=${boxBefore?.y.toFixed(1)} after=${boxAfter?.y.toFixed(1)})`,
  );

  const sendBtn = page.locator(
    '[data-composer-float] button[aria-label="Send"], [data-composer-float] button[aria-label="发送"]',
  );
  const sendCount = await sendBtn.count();
  console.log(`[${label}] focus+输入"hi"后 sendButton count = ${sendCount}`);

  // 卡片内底行 selectors 计数：回退后 selectors 恒留卡片内底行（不再移出到外部工具栏）。
  // 统计卡片边框 div 内（含 textarea）的 Model/Perm/Effort selector trigger 数。
  const floatRoot = page.locator("[data-composer-float]");
  const cardBorder = floatRoot.locator("div.rounded-xl, .rounded-xl").first();
  const cardSelectorCount = await cardBorder
    .locator("button[aria-haspopup]")
    .count()
    .catch(() => 0);
  console.log(`[${label}] 获焦后 卡片内 selector trigger 数 = ${cardSelectorCount}（3=留卡片内）`);

  // .send2 几何在「输入态」测（send 可见时）；点 send 后输入清空 .send2 即 unmount，
  // v14 段（点击后）只能拿到 null——desktop idle 无 Stop/Send，无 .send2 = 产品行为。
  const send2Box = await page
    .locator(".send2")
    .first()
    .evaluate((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return { w: r.width, h: r.height, radius: cs.borderRadius };
    })
    .catch(() => null);
  const send2Ok =
    send2Box === null ||
    (Math.abs(send2Box.w - 28) < 0.6 &&
      Math.abs(send2Box.h - 28) < 0.6 &&
      Math.abs(parseFloat(send2Box.radius) - 12) < 0.6);
  console.log(
    `[${label}] send2 几何: ${send2Ok ? "PASS" : "FAIL"} (${send2Box ? `${send2Box.w.toFixed(0)}x${send2Box.h.toFixed(0)} r${send2Box.radius}` : "无 .send2（desktop idle 无 Stop/Send = 产品行为）"})`,
  );

  let focusedAfterClick = null;
  let sendCountAfterClick = null;
  let userFrameSent = null;
  if (sendCount > 0) {
    await sendBtn.first().click();
    await page.waitForTimeout(200);
    sendCountAfterClick = await sendBtn.count();
    focusedAfterClick = await page.evaluate(
      () => !!document.activeElement && document.activeElement.tagName === "TEXTAREA",
    );
    userFrameSent = sentFrames.some((f) => f.includes('"type":"user"'));
    console.log(
      `[${label}] 点send后: textarea保焦=${focusedAfterClick}  sendButton仍在=${sendCountAfterClick}  WS user帧已发=${userFrameSent}`,
    );
  }

  // ── v1.4 控制行形态断言（03a/04）：窄端 .iicn 三彩图标 / 宽端 .ipill 三 pill / anchored
  // 菜单原位上方 / .send2 28×28 r12。窄宽断言按 viewport 分派（CSS @media 1024 切换）。
  const v14 = {};
  const permBtn = page.locator(
    'button[aria-label="权限模式"], button[aria-label="Permission mode"]',
  );
  const iicnCount = await page.locator(".iicn").count();
  const ipillCount = await page.locator(".ipill").count();
  const iicnVisible = await page
    .locator(".iicn")
    .first()
    .evaluate((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return { display: cs.display, w: r.width, h: r.height, radius: cs.borderRadius };
    })
    .catch(() => null);
  const ipillDisplay = await page
    .locator(".ipill")
    .first()
    .evaluate((el) => getComputedStyle(el).display)
    .catch(() => null);
  const wide = await page.evaluate(() => window.innerWidth >= 1024);
  v14.wide = wide;
  v14.iicnCount = iicnCount;
  v14.ipillCount = ipillCount;
  v14.narrowFormOk =
    !wide &&
    iicnCount === 3 &&
    ipillDisplay === "none" &&
    !!iicnVisible &&
    Math.abs(iicnVisible.w - 28) < 0.6 &&
    Math.abs(iicnVisible.h - 28) < 0.6 &&
    Math.abs(parseFloat(iicnVisible.radius) - 12) < 0.6;
  v14.wideFormOk =
    wide && ipillCount === 3 && ipillDisplay !== "none" && iicnVisible?.display === "none";
  console.log(
    `[${label}] v1.4 控制行: wide=${wide} iicn=${iicnCount}(${iicnVisible ? `${iicnVisible.w.toFixed(0)}x${iicnVisible.h.toFixed(0)} r${iicnVisible.radius}` : "n/a"}) ipill=${ipillCount}(${ipillDisplay})`,
  );

  // iicn 三色语义（perm 紫 / model 蓝 / eff 橙 tint）
  if (!wide && iicnCount === 3) {
    const tints = await page.evaluate(() =>
      [...document.querySelectorAll(".iicn")].map((el) => {
        const cs = getComputedStyle(el);
        return { color: cs.color, bg: cs.backgroundColor };
      }),
    );
    const distinct = new Set(tints.map((t) => `${t.color}|${t.bg}`));
    v14.iicnTints = distinct.size === 3;
    console.log(
      `[${label}] iicn 三色语义: distinct=${distinct.size} ${v14.iicnTints ? "PASS" : "FAIL"}`,
    );
  }

  // anchored 菜单：窄端点权限 iicn → 菜单弹在图标上方（03a 原位上方，不落底部 sheet）
  if (!wide && (await permBtn.count()) === 1) {
    await permBtn.first().click();
    const menu = page.locator('[role="menu"]').first();
    const menuShown = await menu.waitFor({ state: "visible", timeout: 4000 }).then(
      () => true,
      () => false,
    );
    if (menuShown) {
      const geo = await page.evaluate(() => {
        const trigger = document.querySelector(
          'button[aria-label="权限模式"], button[aria-label="Permission mode"]',
        );
        const icon = trigger?.querySelector(".iicn") ?? trigger;
        const content = [...document.querySelectorAll('[role="menu"]')].find(
          (el) => el.getBoundingClientRect().height > 0,
        );
        const tr = icon?.getBoundingClientRect();
        const cr = content?.getBoundingClientRect();
        return tr && cr
          ? {
              menuBottom: cr.bottom,
              iconTop: tr.top,
              menuInViewport: cr.top >= 0 && cr.bottom <= innerHeight,
              mhText: content.querySelector(".mh")?.textContent?.trim() ?? null,
              // 批 14 design review P1-1：.mh 头非 .row 不参与 .row+.row 线链——.menu-sep
              // 规则内 :not(.mh) 排除（v2-primitives），头无 border 也无伪元素线。
              mhBorderBottom: content.querySelector(".mh")
                ? getComputedStyle(content.querySelector(".mh")).borderBottomWidth
                : null,
            }
          : null;
      });
      v14.mhOk = geo?.mhText === "权限模式" || geo?.mhText === "Permission mode";
      v14.mhNoBorder = geo?.mhBorderBottom === "0px";
      v14.anchoredAbove = !!geo && geo.menuBottom <= geo.iconTop + 4 && geo.menuInViewport;
      console.log(
        `[${label}] .mh 头下无分割线: ${v14.mhNoBorder ? "PASS" : "FAIL"} (borderBottom=${geo?.mhBorderBottom})`,
      );
      console.log(
        `[${label}] anchored 菜单在图标上方: ${v14.anchoredAbove ? "PASS" : "FAIL"} (menuBottom=${geo?.menuBottom?.toFixed(1)} iconTop=${geo?.iconTop?.toFixed(1)})`,
      );
      await page.keyboard.press("Escape");
      await page.waitForTimeout(120);
    } else {
      v14.anchoredAbove = false;
      console.log(`[${label}] anchored 菜单未出现: FAIL`);
    }
  }

  // .send2 几何已在输入态（send 点击前）测过（send2Ok）；此处只记录进 v14 结果。
  v14.send2Ok = send2Ok;

  await ctx.close();
  return {
    label,
    coarse,
    sendCount,
    cardSelectorCount,
    focusedAfterClick,
    sendCountAfterClick,
    userFrameSent,
    jump,
    v14,
  };
}

(async () => {
  const browser = await chromium.launch();
  try {
    const desktop = await probe(browser, "desktop", {});
    const mobile = await probe(browser, "mobile", {
      isMobile: true,
      hasTouch: true,
      viewport: { width: 390, height: 844 },
    });

    console.log("\n=== 判定 ===");
    // H3: 桌面 coarse=false 且输入后无独立 Send（桌面 Enter=发送，isCoarsePointer=false → showSend=false）
    const h3 = desktop.coarse === false && desktop.sendCount === 0;
    console.log(
      `H3 桌面无独立 Send: ${h3 ? "PASS" : "FAIL"} (coarse=${desktop.coarse}, sendCount=${desktop.sendCount})`,
    );
    // H2: mobile coarse=true 且 focus+输入后卡片内 sendButton 渲染（hasInput && isCoarsePointer → showSend）
    const h2 = mobile.coarse === true && mobile.sendCount === 1;
    console.log(
      `H2 mobile hasInput 触发卡片内 Send: ${h2 ? "PASS" : "FAIL"} (coarse=${mobile.coarse}, sendCount=${mobile.sendCount})`,
    );
    // H1: 点 send 后 textarea 保焦（onMouseDown preventDefault 阻止焦点转移→键盘不收）+ sendButton
    // 消失（composer.send() → onNew → 清空输入 → isEmpty=true → hasInput=false → showSend=false）。
    const h1 = mobile.focusedAfterClick === true && mobile.sendCountAfterClick === 0;
    console.log(
      `H1 send点击不丢焦点+send触发清空: ${h1 ? "PASS" : "FAIL"} (保焦=${mobile.focusedAfterClick}, 点后sendCount=${mobile.sendCountAfterClick})`,
    );
    // H1b: 输入时发送按钮出现，textarea Y 位置不变（卡片底行恒渲染，高度稳定，不顶起底部锚定的 float）
    const h1b = mobile.jump < 1;
    console.log(
      `H1b 发送按钮出现不导致textarea跳变: ${h1b ? "PASS" : "FAIL"} (跳变=${mobile.jump.toFixed(1)}px)`,
    );
    // H4: selectors 恒留卡片内底行（不再移出到外部工具栏）——3 个 selector trigger 在卡片边框内
    const h4 = mobile.cardSelectorCount === 3;
    console.log(
      `H4 selectors 留卡片内: ${h4 ? "PASS" : "FAIL"} (卡片内selector=${mobile.cardSelectorCount})`,
    );
    if (mobile.userFrameSent !== null) {
      console.log(
        `   (链路) onNew→sendToSocket→WS user帧: ${mobile.userFrameSent ? "PASS" : "未捕到（WS 可能未 open，不影响 H1 DOM 判定）"}`,
      );
    }

    // v1.4 控制行换代断言（03a/04）：窄端 iicn 三彩图标 + 三色语义 + anchored 菜单原位上方；
    // 宽端 ipill 三 pill；send2 28×28 r12。
    const v14n = mobile.v14;
    const v14d = desktop.v14;
    const h5 =
      v14n.narrowFormOk === true &&
      v14n.iicnTints === true &&
      v14n.anchoredAbove === true &&
      v14n.mhOk === true &&
      v14n.mhNoBorder === true &&
      v14n.send2Ok === true;
    console.log(
      `H5 窄端 .iicn 形态+三色+anchored菜单+.mh菜单头(无线)+send2几何: ${h5 ? "PASS" : "FAIL"} (narrowFormOk=${v14n.narrowFormOk}, tints=${v14n.iicnTints}, anchored=${v14n.anchoredAbove}, mh=${v14n.mhOk}, mhNoBorder=${v14n.mhNoBorder}, send2=${v14n.send2Ok})`,
    );
    const h6 = v14d.wideFormOk === true && v14d.send2Ok === true;
    console.log(
      `H6 宽端 .ipill 形态+send2几何: ${h6 ? "PASS" : "FAIL"} (wideFormOk=${v14d.wideFormOk}, send2=${v14d.send2Ok})`,
    );
    if (!h5 || !h6) process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
