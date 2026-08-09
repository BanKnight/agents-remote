// 探针：markdown frontmatter 渲染——置顶 metadata 卡片 + 正文。
// 验证 MarkdownString 的 frontmatter 解析 + FrontmatterCard 渲染集成。单测（parse-frontmatter.test.ts）
// 只覆盖 parse 纯函数；本探针覆盖 PreviewBody → MarkdownString → FrontmatterCard 的渲染集成 +
// 真实生产 build CSS 落盘（web 无组件渲染单测范式，渲染集成单测覆盖不到）。
// 断言（桌面 viewport，mock 文件内容）：
//  1. 带 frontmatter 的 .md：FrontmatterCard 渲染（dl/dt/dd，key 含 name/license/description，value 含 MIT）。
//  2. 带 frontmatter 的 .md：正文 h1 渲染 Demo Title。
//  3. 旧 bug 消失：frontmatter 的 yaml 不当正文段落（正文不含 'name: "demo-skill"'）。
//  4. 无 frontmatter 的 .md：不渲染卡片（dl count=0），正文 h1 正常。
// 密码自读不打印。用法：bun scripts/probe-markdown-frontmatter.mjs
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";
import { verifyCssFlushed } from "./ar-verify-css.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const EXEC =
  "/home/deploy/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell";
const PROJECT = "frontmatter-demo";

const FRONTMATTER_CONTENT = [
  "---",
  'name: "demo-skill"',
  "license: MIT",
  'description: "A long description that must wrap naturally without breaking layout."',
  "---",
  "# Demo Title",
  "",
  "Body paragraph after frontmatter.",
].join("\n");

const NO_FRONTMATTER_CONTENT = ["# Plain Title", "", "No frontmatter here."].join("\n");

let allPass = true;
function record(ok, label) {
  if (!ok) allPass = false;
  console.log(`  ${ok ? "✓" : "✗"} ${label}`);
  return ok;
}

// mock：overview 假项目 + 项目详情/sessions（否则真实后端 404 阻塞 workspace 渲染）+ files 根目录
// （README.md + plain.md）+ files/preview 按 path 返回 content。
async function setup(page, contentByPath) {
  await page.route(/\/api\/overview$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ projectNames: [PROJECT], candidates: [] }),
    }),
  );
  await page.route(/\/api\/projects\/[^/]+\/agent-sessions(?:\?.*)?$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sessions: [] }),
    }),
  );
  await page.route(/\/api\/projects\/[^/]+\/terminal-sessions(?:\?.*)?$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sessions: [] }),
    }),
  );
  await page.route(/\/api\/projects\/[^/]+$/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        project: {
          name: PROJECT,
          path: `/tmp/${PROJECT}`,
          agentSessionCount: 0,
          terminalSessionCount: 0,
          gitBranch: "main",
        },
      }),
    }),
  );
  await page.route(/\/api\/projects\/[^/]+\/files(?:\?.*)?$/, (r) => {
    const path = new URL(r.request().url()).searchParams.get("path") ?? "";
    if (path !== "") {
      return r.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    }
    return r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        projectName: PROJECT,
        path: "",
        parentPath: null,
        entries: [
          { name: "README.md", path: "README.md", type: "file" },
          { name: "plain.md", path: "plain.md", type: "file" },
        ],
      }),
    });
  });
  await page.route(/\/api\/projects\/[^/]+\/files\/preview(?:\?.*)?$/, (r) => {
    const path = new URL(r.request().url()).searchParams.get("path") ?? "";
    return r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        type: "text",
        projectName: PROJECT,
        path,
        name: path,
        content: contentByPath[path] ?? "",
      }),
    });
  });
}

async function login(page) {
  await page.goto(`${WEB_ORIGIN}/`);
  await page
    .getByLabel("密码")
    .or(page.getByLabel("Password"))
    .fill(await readAppPassword());
  await page.getByRole("button", { name: /解锁|Unlock/ }).click();
  await page.waitForTimeout(700);
}

async function openFile(page, fileName, expectedH1) {
  // ?tab=files 直达中栏 Files tab（WorkbenchMiddleTab，URL search param）。
  await page.goto(`${WEB_ORIGIN}/projects/${PROJECT}?tab=files`);
  await page.waitForSelector(`text=${fileName}`, { timeout: 8000 });
  await page.getByText(fileName, { exact: true }).first().click();
  // 点文件累积 file tab（旧预览残留 DOM），按 expectedH1 定位本次新预览 visible。
  await page
    .locator('section[aria-label="File preview"]')
    .filter({ hasText: expectedH1 })
    .first()
    .waitFor({ state: "visible", timeout: 8000 });
}

async function run() {
  // 前置：CSS 落盘三道闸（新 utility 必须生成，否则排版全乱但探针盲过）。
  const css = await verifyCssFlushed({
    origin: WEB_ORIGIN,
    expectClasses: ["bg-surface-inset/60", "border-neutral-line/40", "text-on-surface-muted"],
  });
  if (!css.pass) {
    console.error("CSS 落盘验证失败，探针中止：");
    css.details.forEach((d) => console.error(`  ${d}`));
    process.exit(1);
  }
  console.log("✓ CSS 落盘 + content-type 正常");

  const browser = await chromium.launch({ executablePath: EXEC });
  try {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      locale: "en-US",
    });
    const page = await ctx.newPage();
    await setup(page, { "README.md": FRONTMATTER_CONTENT, "plain.md": NO_FRONTMATTER_CONTENT });
    await login(page);

    // 点文件累积 file tab（旧预览残留），preview 按 h1 文本定位当前激活预览。
    const preview = (h1) =>
      page.locator('section[aria-label="File preview"]').filter({ hasText: h1 }).first();

    console.log("\n===== 1. 带 frontmatter 的 .md：FrontmatterCard + 正文 =====");
    await openFile(page, "README.md", "Demo Title");
    const dlCount1 = await preview("Demo Title").locator("dl").count();
    record(dlCount1 === 1, `FrontmatterCard dl 渲染（count=${dlCount1}）`);
    const dtTexts = await preview("Demo Title").locator("dt").allTextContents();
    record(
      dtTexts.includes("name") && dtTexts.includes("license") && dtTexts.includes("description"),
      `key 渲染（dt=${JSON.stringify(dtTexts)}）`,
    );
    const ddTexts = await preview("Demo Title").locator("dd").allTextContents();
    record(
      ddTexts.some((t) => /MIT/.test(t)),
      `value 渲染（dd 含 MIT）`,
    );
    const h1 = (await preview("Demo Title").locator("h1").first().textContent()) ?? "";
    record(/Demo Title/.test(h1), `正文 h1 渲染（h1="${h1.trim()}"）`);
    const bodyText1 = await preview("Demo Title").innerText();
    record(
      !/name:\s*"demo-skill"/.test(bodyText1),
      "frontmatter 不当正文（旧 bug：yaml 残留当段落——已消失）",
    );

    console.log("\n===== 2. 无 frontmatter 的 .md：不渲染卡片 =====");
    await openFile(page, "plain.md", "Plain Title");
    const dlCount2 = await preview("Plain Title").locator("dl").count();
    record(dlCount2 === 0, `无 frontmatter 不渲染卡片（dl count=${dlCount2}）`);
    const h1b = (await preview("Plain Title").locator("h1").first().textContent()) ?? "";
    record(/Plain Title/.test(h1b), `正文 h1 渲染（h1="${h1b.trim()}"）`);
  } finally {
    await browser.close();
  }
}

(async () => {
  await run();
  console.log(`\n总计: ${allPass ? "ALL PASS" : "有 FAIL"}`);
  process.exit(allPass ? 0 : 1);
})();
