import { expect, test } from "@playwright/test";

const password = process.env.E2E_PASSWORD ?? "secret";
const projectName = process.env.E2E_PROJECT_NAME ?? "demo";

test("PWA manifest and service worker meet installability criteria", async ({ page }) => {
  await page.goto("/");

  // Manifest is linked and loadable
  const manifestLink = page.locator('link[rel="manifest"]');
  await expect(manifestLink).toHaveAttribute("href");

  const manifestHref = await manifestLink.getAttribute("href");
  const manifestResponse = await page.request.get(manifestHref!);
  expect(manifestResponse.ok()).toBe(true);
  expect(manifestResponse.headers()["content-type"]).toContain("application/manifest+json");

  const manifest = await manifestResponse.json();
  expect(manifest.name).toBeTruthy();
  expect(manifest.short_name).toBeTruthy();
  expect(manifest.start_url).toBe("/");
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons.length).toBeGreaterThanOrEqual(2);

  // At least one icon >= 192x192 PNG
  expect(
    manifest.icons.some((icon: { sizes: string; type: string }) => {
      const size = parseInt(icon.sizes.split("x")[0], 10);
      return size >= 192 && icon.type === "image/png";
    }),
  ).toBe(true);

  // Service worker is registered
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  // Desktop workbench: §6.12k 合并 side 项目行（srow2）= 登录 gate。可访问名 = 名称 +
  // live 徽章（"demo —"），title 属性 = 项目名（项目行独有，实例行/组头无）→ title 定位。
  await expect(page.locator(`nav.side .srow2[title="${projectName}"]`)).toBeVisible();

  // SW 注册→安装（全量 precache 下载）→激活是异步过程，injectManifest 迁移后产物形态
  // 变化使原「登录后一次性读取」落在 installing 窗口的概率上升——轮询等待激活。
  await expect
    .poll(
      async () => {
        const reg = await page.evaluate(async () => {
          const reg = await navigator.serviceWorker.getRegistration();
          return reg ? (reg.active?.scriptURL ?? null) : null;
        });
        return reg;
      },
      { timeout: 30_000 },
    )
    .toBeTruthy();

  // 自定义 SW（injectManifest）必须承载 push / notificationclick handler——PWA 通知批的
  // 事件接线契约。注册对象的 active.scriptURL 优先（dev = /dev-sw.js?dev-sw、prod = /sw.js），
  // 拿不到（激活窗口竞态）时兜底直接取 dev 固定路径。
  const scriptURL = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    return reg?.active?.scriptURL ?? null;
  });
  let swText: string | null = null;
  if (scriptURL) {
    const swResponse = await page.request.get(scriptURL);
    if (swResponse.ok()) swText = await swResponse.text();
  }
  if (swText === null) {
    const fallback = await page.request.get("/dev-sw.js?dev-sw");
    if (fallback.ok()) swText = await fallback.text();
  }
  expect(swText).toBeTruthy();
  // 字符串字面量在 bundle 后保留（self.addEventListener(...) 形态同样命中子串）。
  expect(swText!).toContain('addEventListener("push"');
  expect(swText!).toContain('addEventListener("notificationclick"');
});
