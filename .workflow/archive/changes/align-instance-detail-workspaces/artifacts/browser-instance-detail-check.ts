import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium, expect } from "@playwright/test";

const artifactsDir = join(
  process.cwd(),
  ".workflow/changes/align-instance-detail-workspaces/artifacts/browser-instance-detail",
);
const projectName = "instance-detail-demo";
const agentSessionId = "agent-session-long-id-for-overflow-check-1234567890";
const terminalSessionId = "terminal-session-long-id-for-overflow-check-1234567890";

const main = async () => {
  await rm(artifactsDir, { force: true, recursive: true });
  await mkdir(artifactsDir, { recursive: true });

  const apiPort = await freePort();
  const webPort = await freePort();
  const apiUrl = `http://127.0.0.1:${apiPort}`;
  const webUrl = `http://127.0.0.1:${webPort}`;
  const webLogPath = join(artifactsDir, "web.log");
  const mockApiLogPath = join(artifactsDir, "mock-api.log");
  await writeFile(webLogPath, "");
  await writeFile(mockApiLogPath, "");

  const mockApi = startMockApi(apiPort, mockApiLogPath);
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
    { WEB_API_PROXY_TARGET: apiUrl },
  );

  try {
    await waitForUrl(`${apiUrl}/api/health`, "mock api");
    await waitForUrl(webUrl, "web");

    const browser = await chromium.launch();
    try {
      const results: string[] = [];
      await verifyAgentDetail(browser, webUrl, "desktop", { width: 1440, height: 1000 }, results);
      await verifyAgentDetail(browser, webUrl, "mobile", { width: 390, height: 844 }, results);
      await verifyTerminalDetail(
        browser,
        webUrl,
        "desktop",
        { width: 1440, height: 1000 },
        results,
      );
      await verifyTerminalDetail(browser, webUrl, "mobile", { width: 390, height: 844 }, results);
      await writeFile(join(artifactsDir, "instance-detail-check.log"), `${results.join("\n")}\n`);
    } finally {
      await browser.close();
    }
  } finally {
    web.kill();
    await Promise.allSettled([web.exited]);
    await mockApi.stop(true);
  }
};

const verifyAgentDetail = async (
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  webUrl: string,
  label: string,
  viewport: { width: number; height: number },
  results: string[],
) => {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  try {
    await page.goto(`${webUrl}/projects/${projectName}/agent-sessions/${agentSessionId}`);
    await expect(page.getByRole("link", { name: "Back to Project" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Claude detail stream" })).toBeVisible();
    await expect(page.getByText(agentSessionId)).toBeVisible();
    await expect(page.getByLabel("Agent detail tools")).toBeVisible();
    await expect(page.getByRole("button", { name: "Files" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Git" })).toBeVisible();
    await expect(page.getByRole("button", { name: "+Terminal" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Meta" })).toBeVisible();
    await expect(page.getByText("Agent output from mock stream")).toBeVisible();
    await expect(page.getByLabel("Session quick keys")).toBeVisible();
    await expect(projectSecondaryNav(page)).toHaveCount(0);
    await page.screenshot({
      fullPage: true,
      path: join(artifactsDir, `agent-detail-${label}.png`),
    });
    results.push(
      `${label}: Agent detail shows terminal-first stream, Agent-only tools, quick keys, and no Project secondary nav`,
    );

    await page.getByRole("button", { name: "Meta" }).click();
    await expect(page.getByLabel("Session meta")).toBeVisible();
    await expect(page.getByText("Real session and stream fields only.")).toBeVisible();
    await page.screenshot({ fullPage: true, path: join(artifactsDir, `agent-meta-${label}.png`) });
    await page.getByLabel("Session meta").getByRole("button", { name: "Close" }).click();
    results.push(
      `${label}: Agent Meta popover opens with real project/session/provider/status fields and closes`,
    );

    await page.getByRole("button", { name: "Files" }).click();
    await expect(page.getByRole("heading", { name: "Files" })).toBeVisible();
    await expect(
      page.getByText("Read-only Project files opened from this Agent detail."),
    ).toBeVisible();
    await expect(page.getByLabel("Agent contextual files")).toBeVisible();
    await expect(page.getByText("README.md")).toBeVisible();
    await page.screenshot({ fullPage: true, path: join(artifactsDir, `agent-files-${label}.png`) });
    results.push(
      `${label}: Agent Files contextual view is read-only and stays inside the detail context`,
    );

    await page.getByRole("button", { name: "Back to stream" }).click();
    await page.getByRole("button", { name: "Git" }).click();
    await expect(page.getByRole("heading", { name: "Git" })).toBeVisible();
    await expect(
      page.getByText("Commit, stage, checkout, and reset stay unavailable."),
    ).toBeVisible();
    await expect(page.getByLabel("Agent contextual Git changes")).toBeVisible();
    await expect(page.getByText("src/changed.ts")).toBeVisible();
    await page.screenshot({ fullPage: true, path: join(artifactsDir, `agent-git-${label}.png`) });
    results.push(
      `${label}: Agent Git contextual view is read-only and does not expose write actions`,
    );

    await page.getByRole("button", { name: "+Terminal" }).click();
    await expect(page).toHaveURL(
      new RegExp(
        `/projects/${projectName}/terminal-sessions/terminal-created-from-agent\\?fromAgentSession=${agentSessionId}$`,
      ),
    );
    await expect(page.getByRole("link", { name: "Back to Agent detail" })).toBeVisible();
    await expect(page.getByLabel("Agent detail tools")).toHaveCount(0);
    results.push(
      `${label}: Agent +Terminal uses the terminal creation flow, preserves Agent source context, and navigates to focused Terminal detail`,
    );
  } finally {
    await context.close();
  }
};

const verifyTerminalDetail = async (
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  webUrl: string,
  label: string,
  viewport: { width: number; height: number },
  results: string[],
) => {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  try {
    await page.goto(`${webUrl}/projects/${projectName}/terminal-sessions/${terminalSessionId}`);
    await expect(page.getByRole("heading", { name: "Terminal detail shell" })).toBeVisible();
    await expect(page.getByText("Terminal output from mock stream")).toBeVisible();
    await expect(page.getByLabel("Session controls")).toBeVisible();
    await expect(page.getByLabel("Agent detail tools")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Files" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Git" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "+Terminal" })).toHaveCount(0);
    await expect(projectSecondaryNav(page)).toHaveCount(0);
    await page.getByRole("button", { name: "Hide" }).click();
    await expect(
      page.getByText(
        "Drawer collapsed. Tap Show to restore the text input without reconnecting the stream.",
      ),
    ).toBeVisible();
    await expect(page.getByLabel("Send interrupt")).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: join(artifactsDir, `terminal-detail-${label}.png`),
    });
    await page.getByRole("button", { name: "Show" }).click();
    await page.getByLabel("Send input").fill("echo hello");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByLabel("Send input")).toHaveValue("");
    results.push(
      `${label}: Terminal detail remains a focused shell with no Agent tools and a recoverable input drawer`,
    );
  } finally {
    await context.close();
  }
};

const projectSecondaryNav = (page: import("@playwright/test").Page) =>
  page
    .getByRole("navigation", { name: "Project workspace navigation" })
    .or(page.getByRole("navigation", { name: "Project mobile workspace navigation" }));

const startMockApi = (port: number, logPath: string) =>
  Bun.serve({
    port,
    async fetch(request, server) {
      const url = new URL(request.url);
      await writeFile(logPath, `${request.method} ${url.pathname}${url.search}\n`, {
        append: true,
      });

      if (url.pathname.endsWith("/stream")) {
        if (server.upgrade(request, { data: streamData(url.pathname) })) {
          return undefined;
        }
        return json(
          { error: { code: "UPGRADE_FAILED", message: "WebSocket upgrade failed" } },
          400,
        );
      }

      if (url.pathname === "/api/health") {
        return json({ status: "ok" });
      }

      if (url.pathname === "/api/auth/me") {
        return json({ authenticated: true });
      }

      if (url.pathname === `/api/projects/${projectName}/agent-sessions/${agentSessionId}`) {
        return json({ session: agentSession() });
      }

      if (url.pathname === `/api/projects/${projectName}/terminal-sessions/${terminalSessionId}`) {
        return json({ session: terminalSession(terminalSessionId, "Terminal detail shell") });
      }

      if (
        url.pathname ===
        `/api/projects/${projectName}/terminal-sessions/terminal-created-from-agent`
      ) {
        return json({
          session: terminalSession(
            "terminal-created-from-agent",
            "Terminal for Claude detail stream",
          ),
        });
      }

      if (
        url.pathname === `/api/projects/${projectName}/terminal-sessions` &&
        request.method === "POST"
      ) {
        return json({
          session: terminalSession(
            "terminal-created-from-agent",
            "Terminal for Claude detail stream",
          ),
        });
      }

      if (url.pathname === `/api/projects/${projectName}/files`) {
        const path = url.searchParams.get("path") ?? "";
        return json(filesResponse(path));
      }

      if (url.pathname === `/api/projects/${projectName}/git/diff`) {
        return json({
          repository: true,
          files: [
            { path: "src/changed.ts", scope: "worktree", status: "modified" },
            { path: "README.md", scope: "staged", status: "added" },
          ],
        });
      }

      return json({ error: { code: "NOT_FOUND", message: url.pathname } }, 404);
    },
    websocket: {
      open(ws) {
        const data = ws.data as { sessionType: "agent" | "terminal" };
        ws.send(JSON.stringify({ type: "connected", status: "running" }));
        ws.send(
          JSON.stringify({
            type: "snapshot",
            data:
              data.sessionType === "agent"
                ? "Agent output from mock stream\nlong-output-line-abcdefghijklmnopqrstuvwxyz-1234567890"
                : "Terminal output from mock stream\n$ echo hello",
          }),
        );
      },
      message(ws, message) {
        ws.send(JSON.stringify({ type: "output", data: `Echoed ${String(message)}` }));
      },
    },
  });

const streamData = (path: string) => ({
  sessionType: path.includes("/agent-sessions/") ? "agent" : "terminal",
});

const agentSession = () => ({
  id: agentSessionId,
  projectName,
  provider: "claude",
  displayName: "Claude detail stream",
  status: "running",
});

const terminalSession = (id: string, displayName: string) => ({
  id,
  projectName,
  displayName,
  status: "running",
});

const filesResponse = (path: string) => {
  if (path === "src") {
    return {
      path,
      parentPath: "",
      entries: [
        { name: "changed.ts", path: "src/changed.ts", type: "file", size: 128, hidden: false },
      ],
    };
  }

  return {
    path: "",
    parentPath: null,
    entries: [
      { name: "src", path: "src", type: "directory", hidden: false },
      { name: "README.md", path: "README.md", type: "file", size: 42, hidden: false },
    ],
  };
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });

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
