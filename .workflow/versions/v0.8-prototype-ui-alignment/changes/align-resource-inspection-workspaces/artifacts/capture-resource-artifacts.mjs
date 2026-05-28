import { chromium, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const artifactsDir = resolve(".workflow/versions/v0.8-prototype-ui-alignment/changes/align-resource-inspection-workspaces/artifacts");
const appBase = "http://127.0.0.1:43012";
const projectName = "agents-remote";
const prototypeDir = resolve("docs/design/prototype");
const log = [];
const browser = await chromium.launch({ headless: true });

const record = (entry) => log.push({ checkedAt: new Date().toISOString(), ...entry });
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const screenshot = async (page, name) => {
  await page.screenshot({ path: resolve(artifactsDir, name), fullPage: false });
  record({ artifact: name, url: page.url(), viewport: page.viewportSize() });
};

const openPage = async (viewport) => {
  const page = await browser.newPage({ viewport });
  page.on("pageerror", (error) => record({ level: "pageerror", message: error.message, url: page.url() }));
  page.on("console", (message) => {
    const text = message.text();
    if (text.includes("401 (Unauthorized)") && page.url() === `${appBase}/`) {
      return;
    }
    if (["error", "warning"].includes(message.type())) {
      record({ level: `console-${message.type()}`, message: text, url: page.url() });
    }
  });
  return page;
};

for (const prototype of ["files", "git", "terminal"]) {
  for (const [label, viewport] of Object.entries({ desktop: { width: 1440, height: 1000 }, mobile: { width: 390, height: 844 } })) {
    const page = await openPage(viewport);
    await page.goto(pathToFileURL(resolve(prototypeDir, `${prototype}.html`)).toString(), { waitUntil: "load" });
    await screenshot(page, `prototype-${prototype}-${label}.png`);
    await page.close();
  }
}

const loginResponse = await fetch(`${appBase}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ password: "dev-password" }),
});
if (!loginResponse.ok) {
  throw new Error(`Login failed: ${loginResponse.status}`);
}
const cookie = loginResponse.headers.get("set-cookie") ?? "";

const apiJson = async (path, init = {}) => {
  const response = await fetch(`${appBase}${path}`, {
    ...init,
    headers: { cookie, ...(init.headers ?? {}) },
  });
  if (!response.ok) {
    throw new Error(`${path} failed: ${response.status}`);
  }
  return response.json();
};

const projectUrl = (workspace) => `${appBase}/projects/${projectName}?workspace=${workspace}`;
const files = await apiJson(`/api/projects/${projectName}/files`);
const previewEntry = files.entries.find((entry) => entry.type === "file");
const git = await apiJson(`/api/projects/${projectName}/git/diff`);
const gitEntry = git.repository ? git.files[0] : undefined;
await apiJson(`/api/projects/${projectName}/terminal-sessions`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ displayName: "Terminal · browser artifact" }),
});

record({
  check: "fixture",
  projectName,
  previewPath: previewEntry?.path ?? null,
  gitPath: gitEntry?.path ?? null,
  gitRepository: git.repository,
  gitFileCount: git.repository ? git.files.length : 0,
});

async function loginBrowser(page) {
  await page.goto(`${appBase}/`, { waitUntil: "networkidle" });
  if (await page.getByLabel("App password").isVisible().catch(() => false)) {
    await page.getByLabel("App password").fill("dev-password");
    await page.getByRole("button", { name: /Unlock console/i }).click();
    await page.waitForLoadState("networkidle");
  }
}

async function assertNoForbiddenText(page, workspace) {
  const text = await page.locator("body").innerText();
  const forbiddenByWorkspace = {
    files: [/\bUpload\b/i, /\bRename\b/i, /\bSave\b/i, /\bDelete\b/i],
    git: [/\bStage\b/i, /\bCommit\b/i, /\bCheckout\b/i, /\bReset\b/i, /\bStash\b/i, /\bDiscard\b/i],
    terminal: [/textarea/i, /quick keys/i, /shell command composer/i],
  };
  const matches = forbiddenByWorkspace[workspace].filter((pattern) => pattern.test(text)).map(String);
  record({ check: "forbidden-copy", workspace, passed: matches.length === 0, matches });
}

async function assertBottomNav(page, expectedVisible, label) {
  const nav = page.getByRole("navigation", { name: "Project mobile workspace navigation" });
  const visible = await nav.isVisible().catch(() => false);
  record({ check: "project-bottom-nav", label, expectedVisible, actualVisible: visible, passed: visible === expectedVisible });
}

for (const workspace of ["files", "git", "terminal"]) {
  const desktop = await openPage({ width: 1440, height: 1000 });
  await loginBrowser(desktop);
  await desktop.goto(projectUrl(workspace), { waitUntil: "networkidle" });
  if (workspace === "files" && previewEntry) {
    await desktop.getByRole("button", { name: new RegExp(escapeRegExp(previewEntry.name)) }).click().catch(() => undefined);
  }
  if (workspace === "git" && gitEntry) {
    await desktop.locator('[aria-label="Git changed files"] button').first().click().catch(() => undefined);
  }
  await assertNoForbiddenText(desktop, workspace);
  await screenshot(desktop, `app-${workspace}-desktop.png`);
  await desktop.close();

  const mobile = await openPage({ width: 390, height: 844 });
  await loginBrowser(mobile);
  await mobile.goto(projectUrl(workspace), { waitUntil: "networkidle" });
  await assertNoForbiddenText(mobile, workspace);
  await assertBottomNav(mobile, true, `${workspace}-direct`);
  await screenshot(mobile, `app-${workspace}-mobile.png`);

  if (workspace === "files" && previewEntry) {
    await mobile.getByRole("button", { name: new RegExp(escapeRegExp(previewEntry.name)) }).click();
    await assertBottomNav(mobile, false, "files-preview-detail");
    await expect(mobile.getByText("Back to Files list")).toBeVisible();
    await screenshot(mobile, "app-files-mobile-preview-detail.png");
  }

  if (workspace === "git" && gitEntry) {
    await mobile.locator('[aria-label="Git changed files"] button').first().click();
    await assertBottomNav(mobile, false, "git-diff-detail");
    await expect(mobile.getByText("Back to changed files")).toBeVisible();
    await screenshot(mobile, "app-git-mobile-diff-detail.png");
  }

  if (workspace === "terminal") {
    const body = await mobile.locator("body").innerText();
    record({ check: "terminal-runtime-input-absent", passed: !/Runtime input|quick keys|textarea|composer/i.test(body) });
    const closeButton = mobile.getByRole("button", { name: "Close" }).first();
    record({ check: "terminal-close-visible", passed: await closeButton.isVisible().catch(() => false) });
    let closeDialogMessage = "";
    mobile.once("dialog", async (dialog) => {
      closeDialogMessage = dialog.message();
      await dialog.dismiss();
    });
    await closeButton.click();
    record({ check: "terminal-close-confirm", passed: /Close this Terminal/.test(closeDialogMessage), message: closeDialogMessage });
  }
  await mobile.close();
}

await writeFile(resolve(artifactsDir, "browser-check.log"), log.map((entry) => JSON.stringify(entry)).join("\n") + "\n");
await browser.close();
