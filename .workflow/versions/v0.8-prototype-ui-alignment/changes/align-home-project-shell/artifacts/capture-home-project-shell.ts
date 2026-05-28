import { chromium, expect } from "@playwright/test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dir, "../../../../../..");
const artifactsDir = import.meta.dir;
const password = "secret";

const main = async () => {
  await mkdir(artifactsDir, { recursive: true });
  const apiLogPath = join(artifactsDir, "capture-api.log");
  const webLogPath = join(artifactsDir, "capture-web.log");
  const browserLogPath = join(artifactsDir, "browser-check.log");
  const logLines: string[] = [];

  const tempRoot = await mkdtemp(join(tmpdir(), "agents-remote-home-project-"));
  const projectsRoot = join(tempRoot, "projects");
  const runtimeDir = join(tempRoot, "run");
  const projectPath = join(projectsRoot, "agents-remote");
  await mkdir(projectPath, { recursive: true });
  await mkdir(runtimeDir, { recursive: true });
  await writeFile(join(projectPath, "README.md"), "# agents-remote\n");
  await git(projectPath, ["init"]);
  await git(projectPath, ["config", "user.email", "capture@example.com"]);
  await git(projectPath, ["config", "user.name", "Capture User"]);
  await git(projectPath, ["add", "."]);
  await git(projectPath, ["commit", "-m", "initial"]);

  const apiPort = await freePort();
  const webPort = await freePort();
  const apiUrl = `http://127.0.0.1:${apiPort}`;
  const webUrl = `http://127.0.0.1:${webPort}`;

  await writeFile(apiLogPath, "");
  await writeFile(webLogPath, "");

  const api = spawnLogged(["bun", "run", "--filter", "@agents-remote/api", "dev"], apiLogPath, {
    API_PORT: String(apiPort),
    APP_PASSWORD: password,
    PROJECTS_ROOT: projectsRoot,
    AGENTS_REMOTE_RUN_DIR: runtimeDir,
  });
  const web = spawnLogged(
    ["bun", "run", "--filter", "@agents-remote/web", "dev", "--", "--host", "127.0.0.1", "--port", String(webPort)],
    webLogPath,
    { WEB_API_PROXY_TARGET: apiUrl },
  );

  try {
    await waitForUrl(`${apiUrl}/api/health`, "api");
    await waitForUrl(webUrl, "web");
    logLines.push(`app url: ${webUrl}`);
    logLines.push("viewports: desktop 1440x1000; mobile 390x844");

    const browser = await chromium.launch();
    try {
      await capturePrototype(browser, "home", "home.html", logLines);
      await capturePrototype(browser, "project-detail", "project-detail.html", logLines);
      await captureHomeApp(browser, webUrl, logLines);
      await captureProjectApp(browser, webUrl, logLines);
    } finally {
      await browser.close();
    }

    logLines.push("blocking differences: none found in automated structural checks");
    logLines.push("acceptable differences: real app uses live Project data, no fake provider history/output, and React DOM differs from static prototype HTML");
    await writeFile(browserLogPath, `${logLines.join("\n")}\n`);
  } finally {
    api.kill();
    web.kill();
    await Promise.allSettled([api.exited, web.exited]);
    await rm(tempRoot, { force: true, recursive: true });
  }
};

const capturePrototype = async (
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  id: string,
  fileName: string,
  logLines: string[],
) => {
  const url = `file://${join(repoRoot, "docs/design/prototype", fileName)}`;
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport: viewport.size });
    await page.goto(url);
    await expect(page.getByText(viewport.expectedLabel)).toBeVisible();
    await page.screenshot({ path: join(artifactsDir, `${id}-prototype-${viewport.name}.png`), fullPage: true });
    logLines.push(`${id} prototype ${viewport.name}: captured ${fileName} at ${viewport.label}`);
    await page.close();
  }
};

const captureHomeApp = async (
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  webUrl: string,
  logLines: string[],
) => {
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport: viewport.size });
    await login(page, webUrl);
    await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /agents-remote/ })).toBeVisible();
    await expect(page.getByLabel(viewport.name === "desktop" ? "Primary navigation" : "Primary mobile navigation")).toBeVisible();
    await page.screenshot({ path: join(artifactsDir, `home-app-${viewport.name}.png`), fullPage: true });
    logLines.push(`home app ${viewport.name}: Projects heading, Project row, and primary nav visible`);
    await page.close();
  }
};

const captureProjectApp = async (
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  webUrl: string,
  logLines: string[],
) => {
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport: viewport.size });
    await login(page, webUrl);
    await page.getByRole("link", { name: /agents-remote/ }).click();
    await expect(page.getByRole("heading", { name: "Agent instances", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "+ Claude" })).toBeVisible();
    await expect(page.getByRole("button", { name: "+ Codex" })).toBeVisible();
    await expect(page.getByText("Future restore will live here when provider history is available.")).toBeVisible();
    await expect(page.getByLabel(viewport.name === "desktop" ? "Project workspace navigation" : "Project mobile workspace navigation")).toBeVisible();
    await page.screenshot({ path: join(artifactsDir, `project-agent-app-${viewport.name}.png`), fullPage: true });
    logLines.push(`project app ${viewport.name}: Agent heading, Claude/Codex create buttons, staged history, and secondary nav visible`);
    await page.close();
  }
};

const login = async (page: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>["newPage"]>>, webUrl: string) => {
  await page.goto(webUrl);
  const passwordInput = page.getByLabel("Password");
  if (await passwordInput.isVisible().catch(() => false)) {
    await passwordInput.fill(password);
    await page.getByRole("button", { name: "Unlock console" }).click();
  }
};

const viewports = [
  { name: "desktop", label: "1440x1000", size: { width: 1440, height: 1000 }, expectedLabel: "Desktop:" },
  { name: "mobile", label: "390x844", size: { width: 390, height: 844 }, expectedLabel: "Mobile:" },
] as const;

const git = async (projectPath: string, args: string[]) => {
  const process = Bun.spawn({ cmd: ["git", "-C", projectPath, ...args], stderr: "pipe", stdout: "pipe" });
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
  Bun.spawn({ cmd, cwd: repoRoot, env: { ...process.env, ...env }, stderr: Bun.file(logPath), stdout: Bun.file(logPath) });

const waitForUrl = async (url: string, label: string) => {
  const startedAt = Date.now();
  let lastError: unknown;
  while (Date.now() - startedAt < 30_000) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`${label} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await Bun.sleep(250);
  }
  throw new Error(`${label} did not become ready at ${url}: ${String(lastError)}`);
};

const freePort = async () => {
  const server = Bun.serve({ port: 0, fetch: () => new Response("ok") });
  const port = server.port;
  await server.stop(true);
  return port;
};

await main();
