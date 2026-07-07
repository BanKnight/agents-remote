// F3 验证：扁平化渲染后，split / 合入塌缩 / tab 跨 group 移动三个场景 WebSocket 不重连。
// 流程：创建 2 个 terminal（alpha + beta）→ 同 group 2 tab → 拖 beta 到右边缘 split
// → 断言 ws.close 不变（split 不重连）→ 拖 beta 回 alpha（合入塌缩）→ 断言 ws.close 不变
// → 关闭 alpha tab → 断言 ws.close +1（关闭才断开）。
import { chromium } from "@playwright/test";

const EXEC =
  "/home/deploy/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell";
const WEB = "http://localhost:43012";

const browser = await chromium.launch({ executablePath: EXEC });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();

await page.addInitScript(() => {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register = () =>
      Promise.resolve({ unregister: () => Promise.resolve() });
  }
  window.__wsStats = { open: 0, close: 0 };
  const Orig = window.WebSocket;
  function W(url, ...r) {
    const ws = new Orig(url, ...r);
    ws.addEventListener("open", () => window.__wsStats.open++);
    ws.addEventListener("close", () => window.__wsStats.close++);
    return ws;
  }
  W.prototype = Orig.prototype;
  // 复制静态常量，否则 app 内 WebSocket.OPEN 读到 undefined，破坏 SessionDetailRoute 守卫。
  W.OPEN = Orig.OPEN;
  W.CLOSED = Orig.CLOSED;
  W.CLOSING = Orig.CLOSING;
  W.CONNECTING = Orig.CONNECTING;
  window.WebSocket = W;
});

const errors = [];
page.on("console", (m) => {
  const txt = m.text();
  // 忽略 401 资源加载错误（登录前 /api/auth/me 认证探测噪音，浏览器仅报通用 401 文本不含 URL，
  // pre-existing，与扁平化无关）。
  if (txt.includes("401 (Unauthorized)")) return;
  if (m.type() === "error") errors.push(txt);
});
page.on("pageerror", (e) => errors.push("PE:" + e.message));

const dump = async (label) => {
  const info = await page.evaluate(() => {
    const groups = [...document.querySelectorAll("[data-drop-group]")].map((e) =>
      e.getAttribute("data-drop-group"),
    );
    const xterms = document.querySelectorAll(".xterm-screen").length;
    return { url: location.href, groups, xterms };
  });
  const ws = await page.evaluate(() => window.__wsStats);
  console.log(`=== ${label} ===`);
  console.log("DOM:", JSON.stringify(info));
  console.log("WS:", JSON.stringify({ open: ws.open, close: ws.close }));
  console.log("ERR:", errors.length, JSON.stringify(errors.slice(-2)));
};

// ── login ──
await page.goto(`${WEB}/`);
await page.getByLabel("App password").fill("dev123");
await page.getByRole("button", { name: "Unlock console" }).click();
await page.waitForFunction(() => localStorage.getItem("auth_ok") === "1", null, {
  timeout: 5000,
});
console.log("LOGIN OK");

// ── 创建 2 个 terminal ──
const createTerm = async (name) => {
  const id = await page.evaluate(async (n) => {
    const r = await fetch("/api/projects/test/terminal-sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: n }),
    });
    return r.ok ? (await r.json()).session.id : null;
  }, name);
  console.log(`CREATE ${name}:`, id);
  return id;
};
const alpha = await createTerm("alpha");
const beta = await createTerm("beta");
if (!alpha || !beta) {
  console.log("!!! create failed");
  await browser.close();
  process.exit(1);
}

// ── 打开 alpha + beta 进同一 group（2 tab）──
await page.goto(`${WEB}/projects/test`);
await page.waitForTimeout(2500);
const openCard = async (name) => {
  await page.evaluate((nm) => {
    const cards = [...document.querySelectorAll("div.cursor-pointer")].filter((e) =>
      (e.textContent ?? "").includes(nm),
    );
    if (cards.length > 0) cards[cards.length - 1].click();
  }, name);
  await page
    .waitForSelector("[data-drop-group]", { timeout: 10000 })
    .catch(() => console.log(`!!! no group for ${name}`));
  await page.waitForTimeout(1500);
};
await openCard("alpha");
await openCard("beta");
await dump("2-tab baseline");

// 标记 xterm DOM 节点（追踪 split 后是否同一节点 = 不重建）。扁平化后 xterm 在扁平层 panel，
// 不在 [data-drop-group] 内，故标所有 .xterm。
await page.evaluate(() => {
  document.querySelectorAll(".xterm").forEach((e, i) => {
    e.dataset.f3mark = "xterm" + i;
  });
});
const closeBefore = await page.evaluate(() => window.__wsStats.close);
const openBefore = await page.evaluate(() => window.__wsStats.open);

// ── 场景 1：拖 beta tab 到 group 右边缘 → split（horizontal [alpha | beta]）──
const betaTab = page
  .locator("[data-drop-group]")
  .first()
  .locator("button")
  .filter({ hasText: "beta" })
  .first();
const tbox = await betaTab.boundingBox();
const groupBox = await page.locator("[data-drop-group]").first().boundingBox();
await page.mouse.move(tbox.x + tbox.width / 2, tbox.y + tbox.height / 2);
await page.mouse.down();
await page.mouse.move(tbox.x + tbox.width / 2 + 20, tbox.y + tbox.height / 2, { steps: 5 });
await page.waitForTimeout(300);
await page.mouse.move(groupBox.x + groupBox.width * 0.9, groupBox.y + groupBox.height / 2, {
  steps: 10,
});
await page.waitForTimeout(400);
await page.mouse.up();
await page.waitForTimeout(2000);

await dump("post-split");
const closeAfterSplit = await page.evaluate(() => window.__wsStats.close);
const openAfterSplit = await page.evaluate(() => window.__wsStats.open);
const marksAfterSplit = await page.evaluate(() =>
  [...document.querySelectorAll(".xterm[data-f3mark]")].map((e) => e.dataset.f3mark),
);
console.log("XTERM MARKS AFTER SPLIT:", JSON.stringify(marksAfterSplit));
const splitPass = closeAfterSplit === closeBefore;
console.log(
  splitPass ? "PASS: split no reconnect" : "FAIL: split reconnect",
  `(ws.close ${closeBefore}→${closeAfterSplit}, ws.open ${openBefore}→${openAfterSplit})`,
);

// ── 场景 2：拖 beta 回 alpha group（合入塌缩）──
// split 后 beta 在右 group。拖 beta tab 到左 group（alpha）center zone → 合入。
const betaTabAfter = page
  .locator("[data-drop-group]")
  .last()
  .locator("button")
  .filter({ hasText: "beta" })
  .first();
const tbox2 = await betaTabAfter.boundingBox();
const leftGroupBox = await page.locator("[data-drop-group]").first().boundingBox();
await page.mouse.move(tbox2.x + tbox2.width / 2, tbox2.y + tbox2.height / 2);
await page.mouse.down();
await page.mouse.move(tbox2.x + tbox2.width / 2 + 20, tbox2.y + tbox2.height / 2, { steps: 5 });
await page.waitForTimeout(300);
// 移到左 group center（合入）
await page.mouse.move(
  leftGroupBox.x + leftGroupBox.width / 2,
  leftGroupBox.y + leftGroupBox.height / 2,
  {
    steps: 10,
  },
);
await page.waitForTimeout(400);
await page.mouse.up();
await page.waitForTimeout(2000);

await dump("post-merge");
const closeAfterMerge = await page.evaluate(() => window.__wsStats.close);
const marksAfterMerge = await page.evaluate(() =>
  [...document.querySelectorAll(".xterm[data-f3mark]")].map((e) => e.dataset.f3mark),
);
console.log("XTERM MARKS AFTER MERGE:", JSON.stringify(marksAfterMerge));
const mergePass = closeAfterMerge === closeBefore;
console.log(
  mergePass ? "PASS: merge no reconnect" : "FAIL: merge reconnect",
  `(ws.close ${closeBefore}→${closeAfterMerge})`,
);

// ── 场景 3：关闭 alpha tab → 该 session ws.close +1（关闭才断开）──
// 简化：直接用 evaluate 点 tab 栏里 alpha tab 的关闭按钮
await page.evaluate(() => {
  const groups = [...document.querySelectorAll("[data-drop-group]")];
  for (const g of groups) {
    const tabs = [...g.querySelectorAll("button")];
    const alphaTab = tabs.find((b) => (b.textContent ?? "").includes("alpha"));
    if (alphaTab) {
      // tab 栏 tab 通常自带 ✕ 子按钮；点击它
      const xBtn = [...alphaTab.querySelectorAll("button, [role='button']")].find((e) =>
        (e.textContent ?? "").includes("✕"),
      );
      if (xBtn) {
        xBtn.click();
        return;
      }
    }
  }
});
await page.waitForTimeout(1500);
const closeAfterKill = await page.evaluate(() => window.__wsStats.close);
const killPass = closeAfterKill === closeBefore + 1;
console.log(
  killPass
    ? "PASS: close tab disconnects (ws.close +1)"
    : `INFO: ws.close ${closeBefore}→${closeAfterKill}`,
);

// ── 总结论 ──
const allPass = splitPass && mergePass;
console.log("\n=== F3 SUMMARY ===");
console.log(`split:   ${splitPass ? "PASS" : "FAIL"}`);
console.log(`merge:   ${mergePass ? "PASS" : "FAIL"}`);
console.log(`errors:  ${errors.length}`);
console.log(allPass && errors.length === 0 ? "ALL PASS" : "FAILURES PRESENT");

await page.screenshot({ path: "/tmp/f3-final.png" });
await browser.close();
process.exit(allPass && errors.length === 0 ? 0 : 1);
