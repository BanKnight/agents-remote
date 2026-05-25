import { expect, test } from "@playwright/test";

const password = process.env.E2E_PASSWORD ?? "secret";
const projectName = process.env.E2E_PROJECT_NAME ?? "demo";

test("authenticated user can browse Project files and preview text and images", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Unlock console" }).click();

  await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible();
  await page.getByRole("link", { name: projectName }).click();

  await expect(page.getByRole("heading", { name: projectName })).toBeVisible();
  await page.getByRole("button", { name: /^Files/ }).click();

  const files = page.getByLabel("Project files");
  await expect(files.getByRole("button", { name: /\.config/ })).toBeVisible();
  await expect(files.getByRole("button", { name: /src/ })).toBeVisible();
  await expect(files.getByRole("button", { name: /README\.md/ })).toBeVisible();

  const rootNames = await files
    .locator("button .font-semibold")
    .evaluateAll((nodes) => nodes.map((node) => node.textContent ?? ""));
  expect(rootNames.slice(0, 6)).toEqual([
    ".config",
    ".git",
    "src",
    ".env.example",
    "logo.svg",
    "notes.txt",
  ]);

  await files.getByRole("button", { name: /src/ }).click();
  await expect(files.getByRole("button", { name: /index\.ts/ })).toBeVisible();
  await files.getByRole("button", { name: /index\.ts/ }).click();
  await expect(page.getByLabel("File preview")).toContainText("fileBrowserE2e");

  await page.getByRole("button", { name: "Root" }).click();
  await files.getByRole("button", { name: /README\.md/ }).click();
  await expect(page.getByLabel("File preview")).toContainText("file-browser-e2e-text-ok");

  await files.getByRole("button", { name: /logo\.svg/ }).click();
  await expect(page.getByRole("img", { name: "logo.svg" })).toBeVisible();
});
