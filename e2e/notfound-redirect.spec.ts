import { expect, test } from "@playwright/test";

const password = process.env.E2E_PASSWORD ?? "secret";

test("无效 URL 登录后自动重定向到首页，不卡死在 NotFound", async ({ page }) => {
  // 访问一个不存在的路径。未登录时 AuthGate 先显示登录表单，URL 保持 /some-invalid-path。
  await page.goto("/some-invalid-path");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Unlock console" }).click();

  // 登录后 notFoundComponent 挂载 → useEffect 重定向到 `/`。
  // 断言 1：落到工作台（Primary navigation 可见 = 有完整导航，未被锁死在裸 NotFound）。
  await expect(page.getByLabel("Primary navigation")).toBeVisible({ timeout: 15_000 });
  // 断言 2：已离开无效路径。
  await expect(page).not.toHaveURL(/some-invalid-path/);
});
