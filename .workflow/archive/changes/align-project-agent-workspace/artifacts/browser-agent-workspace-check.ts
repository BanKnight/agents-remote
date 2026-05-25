import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, expect } from "@playwright/test";

const artifactsDir = join(
  process.cwd(),
  ".workflow/changes/align-project-agent-workspace/artifacts/browser-agent-workspace",
);
const password = "secret";

const main = async () => {
  await mkdir(artifactsDir, { recursive: true });
  const tempRoot = await mkdtemp(join(tmpdir(), "ar-agent-workspace-"));
  const projectsRoot = join(tempRoot, "projects");
  const runtimeDir = join(tempRoot, "run");
  const projectPath = join(projectsRoot, "agent-workspace-demo");
  await mkdir(projectPath, { recursive: true });
  await mkdir(runtimeDir, { recursive: true });
  await writeFile(join(projectPath, "README.md"), "# Demo\n\nAgent workspace check\n");
  await git(projectPath, ["init"]);
  await git(projectPath, ["config", "user.email", "agent-workspace@example.com"]);
  await git(projectPath, ["config", "user.name", "Agent Workspace Check"]);
  await git(projectPath, ["add", "."]);
  await git(projectPath, ["commit", "-m", "initial"]);

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
      await writeFile(join(artifactsDir, "agent-workspace-check.log"), `${results.join("\n")}\n`);
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
    await page.getByRole("link", { name: /agent-workspace-demo/i }).click();

    await expect(page).toHaveURL(/workspace=agents/);
    await expect(page.getByRole("heading", { name: "agent-workspace-demo" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Agent instances" })).toBeVisible();
    await expect(page.getByRole("button", { name: "+ Claude" })).toBeVisible();
    await expect(page.getByRole("button", { name: "+ Codex" })).toBeVisible();
    await expect(page.getByText("No Agent instances yet")).toBeVisible();
    await expect(page.getByRole("region", { name: "Session history" })).toBeVisible();
    await expect(page.getByText("Future restore will live here")).toBeVisible();

    const projectNav = label === "desktop"
      ? page.getByRole("navigation", { name: "Project workspace navigation" })
      : page.getByRole("navigation", { name: "Project mobile workspace navigation" });
    await expect(projectNav).toBeVisible();
    await page.screenshot({ fullPage: true, path: join(artifactsDir, `agent-workspace-${label}.png`) });
    results.push(`${label}: Agent workspace shows provider create actions, empty instances, staged history, and Project navigation`);

    await page.route("**/api/projects/*/agent-sessions", async (route) => {
      if (route.request().method() === "POST") {
        await Bun.sleep(5_000);
        await route.fulfill({
          contentType: "application/json",
          status: 503,
          body: JSON.stringify({ error: { code: "SESSION_PROVIDER_UNAVAILABLE", message: "Provider unavailable in browser check" } }),
        });
        return;
      }

      await route.fallback();
    });
    await page.getByRole("button", { name: "+ Claude" }).click();
    await expect(page.getByRole("button", { name: "+ Claude" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "+ Codex" })).toBeDisabled();
    await page.screenshot({ fullPage: true, path: join(artifactsDir, `agent-create-pending-${label}.png`) });
    results.push(`${label}: Provider create actions enter disabled pending state`);
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
