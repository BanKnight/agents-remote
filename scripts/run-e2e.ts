import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const artifactsDir = process.env.E2E_ARTIFACTS_DIR ?? join(process.cwd(), "test-results/e2e");
const apiLogPath = join(artifactsDir, "e2e-api.log");
const webLogPath = join(artifactsDir, "e2e-web.log");
const password = "secret";

const main = async () => {
  await mkdir(artifactsDir, { recursive: true });
  await writeFile(apiLogPath, "");
  await writeFile(webLogPath, "");

  const tempRoot = await mkdtemp(join(tmpdir(), "agents-remote-e2e-"));
  const projectsRoot = join(tempRoot, "projects");
  const runtimeDir = join(tempRoot, "run");
  const projectPath = join(projectsRoot, "demo");
  await mkdir(projectPath, { recursive: true });
  await mkdir(join(projectPath, "src"), { recursive: true });
  await mkdir(join(projectPath, ".config"), { recursive: true });
  await writeFile(join(projectPath, "README.md"), "# Demo\n\nfile-browser-e2e-text-ok\n");
  await writeFile(join(projectPath, "src", "index.ts"), "export const fileBrowserE2e = true;\n");
  await writeFile(join(projectPath, ".env.example"), "APP_ENV=demo\n");
  await writeFile(
    join(projectPath, "logo.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40"><text x="4" y="24">file-browser-e2e-image-ok</text></svg>',
  );
  await git(projectPath, ["init"]);
  await git(projectPath, ["config", "user.email", "e2e@example.com"]);
  await git(projectPath, ["config", "user.name", "E2E User"]);
  await git(projectPath, ["add", "."]);
  await git(projectPath, ["commit", "-m", "initial"]);
  await writeFile(
    join(projectPath, "README.md"),
    "# Demo\n\nfile-browser-e2e-text-ok\n\ngit-diff-e2e-worktree-ok\n",
  );
  await writeFile(
    join(projectPath, "src", "index.ts"),
    "export const fileBrowserE2e = true;\nexport const gitDiffE2eStaged = true;\n",
  );
  await git(projectPath, ["add", "src/index.ts"]);
  await writeFile(join(projectPath, "notes.txt"), "git-diff-e2e-untracked-ok\n");
  await mkdir(runtimeDir, { recursive: true });

  const apiPort = await freePort();
  const webPort = await freePort();
  const apiUrl = `http://127.0.0.1:${apiPort}`;
  const webUrl = `http://127.0.0.1:${webPort}`;

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

    const playwright = Bun.spawn({
      cmd: ["bun", "x", "playwright", "test"],
      env: {
        ...process.env,
        E2E_BASE_URL: webUrl,
        E2E_PASSWORD: password,
        E2E_PROJECT_NAME: "demo",
        E2E_ARTIFACTS_DIR: artifactsDir,
      },
      stderr: "inherit",
      stdout: "inherit",
    });
    const exitCode = await playwright.exited;

    if (exitCode !== 0) {
      throw new Error(`Playwright exited with ${exitCode}`);
    }
  } finally {
    api.kill();
    web.kill();
    await Promise.allSettled([api.exited, web.exited]);
    await rm(tempRoot, { force: true, recursive: true });
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

const spawnLogged = (cmd: string[], logPath: string, env: Record<string, string>) => {
  return Bun.spawn({
    cmd,
    env: { ...process.env, ...env },
    stderr: Bun.file(logPath),
    stdout: Bun.file(logPath),
  });
};

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
