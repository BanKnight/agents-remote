import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, expect } from "@playwright/test";

const artifactsDir = join(process.cwd(), ".workflow/changes/align-ui-shell-foundation/artifacts/browser-structure");
const password = "secret";

const main = async () => {
  await mkdir(artifactsDir, { recursive: true });
  const tempRoot = await mkdtemp(join(tmpdir(), "ar-shell-structure-"));
  const projectsRoot = join(tempRoot, "projects");
  const runtimeDir = join(tempRoot, "run");
  const projectPath = join(projectsRoot, "demo");
  await mkdir(join(projectPath, "src"), { recursive: true });
  await mkdir(runtimeDir, { recursive: true });
  await writeFile(join(projectPath, "README.md"), "# Demo\n\nShell structure check\n");
  await writeFile(join(projectPath, "src", "index.ts"), "export const shellStructure = true;\n");
  await git(projectPath, ["init"]);
  await git(projectPath, ["config", "user.email", "shell@example.com"]);
  await git(projectPath, ["config", "user.name", "Shell Check"]);
  await git(projectPath, ["add", "."]);
  await git(projectPath, ["commit", "-m", "initial"]);
  await writeFile(join(projectPath, "README.md"), "# Demo\n\nShell structure check changed\n");

  const apiPort = await freePort();
  const webPort = await freePort();
  const apiUrl = `http://127.0.0.1:${apiPort}`;
  const webUrl = `http://127.0.0.1:${webPort}`;
  const apiLogPath = join(artifactsDir, "api.log");
  const webLogPath = join(artifactsDir, "web.log");
  await writeFile(apiLogPath, "");
  await writeFile(webLogPath, "");

  const api = spawnLogged(["bun", "run", "--filter", "@agents-remote/api", "dev"], apiLogPath, {
    API_PORT: String(apiPort),
    APP_PASSWORD: password,
    PROJECTS_ROOT: projectsRoot,
    AGENTS_REMOTE_RUN_DIR: runtimeDir,
  });
  const web = spawnLogged(
    [
      "bun",
      "run",
      "--filter",
      "@agents-remote/web",
      "dev",
      "--",
      "--host",
      "127.0.0.1",
      "--port",
      String(webPort),
    ],
    webLogPath,
    {
      WEB_API_PROXY_TARGET: apiUrl,
    },
  );

  try {
    await waitForUrl(`${apiUrl}/api/health`, "api");
    await waitForUrl(webUrl, "web");

    const browser = await chromium.launch();
    try {
      const results: string[] = [];
      await verifyViewport(browser, webUrl, "desktop", { width: 1440, height: 1000 }, results);
      await verifyViewport(browser, webUrl, "mobile", { width: 390, height: 844 }, results);
      await writeFile(join(artifactsDir, "structure-check.log"), `${results.join("\n")}\n`);
    } finally {
      await browser.close();
    }
  } finally {
    api.kill();
    web.kill();
    await Promise.allSettled([api.exited, web.exited]);
    await rm(tempRoot, { force: true, recursive: true });
  }
};

const verifyViewport = async (
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  webUrl: string,
  label: string,
  viewport: { width: number; height: number },
  results: string[],
) => {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  try {
    await page.goto(webUrl);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Unlock console" }).click();
    await expect(page.getByRole("heading", { exact: true, name: "Projects" })).toBeVisible();
    const primaryNav = label === "desktop"
      ? page.getByRole("navigation", { name: "Primary navigation" })
      : page.getByRole("navigation", { name: "Primary mobile navigation" });
    await expect(primaryNav).toBeVisible();
    await page.screenshot({ fullPage: true, path: join(artifactsDir, `home-${label}.png`) });
    results.push(`${label}: Home primary shell visible`);

    await page.getByRole("link", { name: /demo/ }).click();
    await expect(page.getByRole("heading", { name: "demo" })).toBeVisible();
    await expect(page).toHaveURL(/workspace=agents/);
    const projectNav = label === "desktop"
      ? page.getByRole("navigation", { name: "Project workspace navigation" })
      : page.getByRole("navigation", { name: "Project mobile workspace navigation" });
    await expect(projectNav).toBeVisible();
    await expect(page.getByRole("heading", { name: "Agent Sessions" })).toBeVisible();
    await page.screenshot({ fullPage: true, path: join(artifactsDir, `project-agent-${label}.png`) });
    results.push(`${label}: Project secondary Agent workspace visible with URL workspace=agents`);

    await page.getByRole("button", { name: /^Git/ }).click();
    await expect(page).toHaveURL(/workspace=git/);
    await expect(page.getByLabel("Git changed files")).toBeVisible();
    await page.screenshot({ fullPage: true, path: join(artifactsDir, `project-git-${label}.png`) });
    results.push(`${label}: Project secondary Git workspace visible with URL workspace=git`);

    await page.getByRole("button", { name: /^Terminal/ }).click();
    await expect(page).toHaveURL(/workspace=terminal/);
    await page.getByRole("button", { name: "New Terminal" }).click();
    await page.getByRole("link", { name: /Open stream/i }).first().click();
    await expect(page.getByRole("heading", { name: "Runtime stream" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to Project" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Project workspace navigation" })).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Project mobile workspace navigation" })).toHaveCount(0);
    await page.screenshot({ fullPage: true, path: join(artifactsDir, `session-detail-${label}.png`) });
    results.push(`${label}: Session detail uses top return and no Project secondary nav`);
  } finally {
    await context.close();
  }
};

const git = async (projectPath: string, args: string[]) => {
  const process = Bun.spawn({
    cmd: ["git", "-C", projectPath, ...args],
    stderr: "pipe",
    stdout: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);

  if (exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${stderr || stdout}`);
  }
};

const spawnLogged = (cmd: string[], logPath: string, env: Record<string, string>) =>
  Bun.spawn({
    cmd,
    env: { ...process.env, ...env },
    stderr: Bun.file(logPath),
    stdout: Bun.file(logPath),
  });

const waitForUrl = async (url: string, label: string) => {
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt < 30_000) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
      lastError = new Error(`${label} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await Bun.sleep(250);
  }

  throw new Error(`${label} did not become ready at ${url}: ${String(lastError)}`);
};

const freePort = async () => {
  const server = Bun.serve({
    port: 0,
    fetch: () => new Response("ok"),
  });
  const port = server.port;
  await server.stop(true);
  return port;
};

await main();
