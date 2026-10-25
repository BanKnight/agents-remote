// 探针：composer 附件取证通道自证（2026-10-25）——at2 哨兵角标、attach-debug 事件链
//（dispatch→listener→localStorage）、debounce 上报 fetch payload。真机「服务端零样本」
// 排障用：本探针桌面全绿 ⇒ 前端链路端到端通，差异收敛到设备侧（SW 缓存 / 版本）。
// attach-report 在页面 route 拦截断言（不 POST 真实后端，守「只登录只读」纪律）；
// 定案拆除取证件时本探针一并拆。用法：bun scripts/probe-attach-debug.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";
import { verifyCssFlushed } from "./ar-verify-css.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const PROBE_SESSION_ID = "agent_attach-probe";
const PROBE_PROJECT = "proj-attach";

const PROBE_SESSION = {
  id: PROBE_SESSION_ID,
  projectName: PROBE_PROJECT,
  provider: "claude",
  displayName: "Attach Debug Probe",
  status: "idle",
  createdAt: "2026-10-25T00:00:00.000Z",
};

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const PNG_FILE = {
  name: "probe.png",
  mimeType: "image/png",
  buffer: Buffer.from(TINY_PNG_BASE64, "base64"),
};
const COMPOSER_TEXTAREA = 'textarea[placeholder="向 Claude 提问..."]';

const results = [];
function check(name, cond, detail = "") {
  results.push(Boolean(cond));
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

const pageJson = (body) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(body),
});

async function login(page) {
  await page.goto(`${WEB_ORIGIN}/`);
  await page.getByLabel("访问密码").fill(await readAppPassword());
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForSelector('input[type="password"]', { state: "detached", timeout: 15000 });
}

async function setupMocks(page) {
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
  // 取证上报：页面侧拦截记录 payload，不触真实后端（只读纪律）。
  const attachReports = [];
  await page.route(/\/api\/debug\/attach-report$/, (r) => {
    try {
      attachReports.push(JSON.parse(r.request().postData() ?? "[]"));
    } catch {
      attachReports.push([]);
    }
    r.fulfill(pageJson({ ok: true }));
  });
  await page.routeWebSocket(new RegExp(`/claude-stream$`), () => {});
  return { attachReports };
}

(async () => {
  const css = await verifyCssFlushed({
    expectClasses: ["bg-surface-inset"],
    origin: WEB_ORIGIN,
  });
  if (!css.pass) {
    console.error(css.details.join("\n"));
    process.exit(1);
  }

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  // 探针 lang 坑：默认语言随浏览器，登录页/文案会变英文——固定 zh。
  await page.addInitScript(() => localStorage.setItem("lang", "zh"));
  const { attachReports } = await setupMocks(page);
  await login(page);
  await page.goto(`${WEB_ORIGIN}/projects/${PROBE_PROJECT}/session/${PROBE_SESSION_ID}`);
  await page.locator(COMPOSER_TEXTAREA).waitFor({ state: "visible", timeout: 10000 });

  // 1. 挂载哨兵：at2 armed 在场（选图前即可见）。
  const badgeText = async () =>
    page.evaluate(() => {
      const spans = [...document.querySelectorAll("span")].filter(
        (n) => n.style.position === "fixed" && n.style.top === "17px",
      );
      return spans.at(-1)?.textContent ?? "";
    });
  check("at2 armed 哨兵角标在场", (await badgeText()).startsWith("at2 armed"), await badgeText());

  // 2. 选 2 张图 → 事件链：角标内容离开 armed（batch/…）。
  await page
    .locator('input[type="file"][accept="image/*"][multiple]')
    .setInputFiles([PNG_FILE, PNG_FILE]);
  await page.waitForTimeout(400);
  const afterPick = await badgeText();
  check(
    "选图后角标内容更新（事件到监听器）",
    afterPick.startsWith("at2") && !afterPick.includes("armed"),
    afterPick,
  );

  // 3. localStorage 样本落盘：batch n=2 + ready（小 PNG 走 passthrough→ready）。
  await page.waitForTimeout(300);
  const samples = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("attachDebugLog") ?? "[]"),
  );
  const stages = samples.map((s) => s.stage);
  check(
    "localStorage 含 batch n=2",
    samples.some((s) => s.stage === "batch" && s.n === 2),
    stages.join(","),
  );
  check("localStorage 含 ready 终态", stages.includes("ready"), stages.join(","));

  // 4. debounce 2s 后上报 fetch 发出，payload 含这些样本。
  await page.waitForTimeout(2600);
  const flat = attachReports.flat();
  check(
    "attach-report fetch payload 含 batch",
    flat.some((s) => s.stage === "batch" && s.n === 2),
    `${attachReports.length} 次上报 ${flat.length} 条样本`,
  );
  check(
    "上报样本带 v=at2 标记",
    flat.every((s) => s.v === "at2"),
  );

  await browser.close();
  const pass = results.length > 0 && results.every(Boolean);
  console.log(pass ? "\nPASS 全部断言通过" : "\nFAIL 存在失败断言");
  process.exit(pass ? 0 : 1);
})();
