import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium, expect, type Browser, type Page } from "@playwright/test";

const artifactsDir = join(
  process.cwd(),
  ".workflow/changes/verify-prototype-ui-alignment/artifacts/prototype-ui-alignment",
);
const projectName = "prototype-demo";
const agentSessionId =
  "agent-session-prototype-alignment-long-id-abcdefghijklmnopqrstuvwxyz-1234567890";
const terminalSessionId =
  "terminal-session-prototype-alignment-long-id-abcdefghijklmnopqrstuvwxyz-1234567890";
const createdTerminalId = "terminal-created-during-prototype-alignment";
const mockApiRequests: string[] = [];

let terminalSessions = [
  terminalSession(
    terminalSessionId,
    "Prototype Terminal instance with a very long display name that should truncate safely",
  ),
];

const viewports = [
  { label: "desktop", size: { width: 1440, height: 1000 } },
  { label: "mobile", size: { width: 390, height: 844 } },
] as const;

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

      for (const viewport of viewports) {
        await verifyHome(browser, webUrl, viewport.label, viewport.size, results);
        await verifyProjectAgentWorkspace(browser, webUrl, viewport.label, viewport.size, results);
        await verifyAgentDetail(browser, webUrl, viewport.label, viewport.size, results);
        await verifyTerminalDetail(browser, webUrl, viewport.label, viewport.size, results);
        await verifyFilesWorkspace(browser, webUrl, viewport.label, viewport.size, results);
        await verifyGitWorkspace(browser, webUrl, viewport.label, viewport.size, results);
        await verifyTerminalWorkspace(browser, webUrl, viewport.label, viewport.size, results);
      }

      await writeFile(
        join(artifactsDir, "prototype-ui-alignment-check.log"),
        `${results.join("\n")}\n`,
      );
    } finally {
      await browser.close();
    }
  } finally {
    web.kill();
    await Promise.allSettled([web.exited]);
    await writeFile(mockApiLogPath, `${mockApiRequests.join("\n")}\n`);
    await mockApi.stop(true);
  }
};

const verifyHome = async (
  browser: Browser,
  webUrl: string,
  label: string,
  viewport: { width: number; height: number },
  results: string[],
) => {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  try {
    await page.goto(webUrl);
    await expect(page.getByRole("heading", { name: "Open a server Project" })).toBeVisible();
    await expect(page.getByRole("heading", { exact: true, name: "Projects" })).toBeVisible();
    await expect(page.getByRole("link", { name: /prototype-demo/i })).toBeVisible();
    await expect(
      label === "desktop"
        ? page.getByRole("navigation", { name: "Primary navigation" })
        : page.getByRole("navigation", { name: "Primary mobile navigation" }),
    ).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await page.screenshot({ fullPage: true, path: join(artifactsDir, `home-${label}.png`) });
    results.push(
      `${label}: Home keeps primary navigation and Project entry list aligned to prototype`,
    );
  } finally {
    await context.close();
  }
};

const verifyProjectAgentWorkspace = async (
  browser: Browser,
  webUrl: string,
  label: string,
  viewport: { width: number; height: number },
  results: string[],
) => {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  try {
    await page.goto(`${webUrl}/projects/${projectName}?workspace=agents`);
    await expect(page).toHaveURL(/workspace=agents/);
    await expect(page.getByRole("heading", { name: projectName })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Agent instances" })).toBeVisible();
    await expect(page.getByRole("button", { name: "+ Claude" })).toBeVisible();
    await expect(page.getByRole("button", { name: "+ Codex" })).toBeVisible();
    await expect(page.getByLabel("Agent instances")).toBeVisible();
    await expect(page.getByText(agentSessionId)).toBeVisible();
    await expect(page.getByRole("region", { name: "Session history" })).toBeVisible();
    await expect(projectNavForLabel(page, label)).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await page.screenshot({
      fullPage: true,
      path: join(artifactsDir, `project-agent-workspace-${label}.png`),
    });
    results.push(
      `${label}: Project Agent workspace keeps secondary navigation, live Agent list, and staged history boundary`,
    );
  } finally {
    await context.close();
  }
};

const verifyAgentDetail = async (
  browser: Browser,
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
    await expect(page.getByRole("heading", { name: "Prototype Claude stream" })).toBeVisible();
    await expect(page.getByText(agentSessionId)).toBeVisible();
    await expect(page.getByText("Agent output from prototype alignment mock stream")).toBeVisible();
    await expect(page.getByLabel("Agent detail tools")).toBeVisible();
    await expect(page.getByRole("button", { name: "Files" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Git" })).toBeVisible();
    await expect(page.getByRole("button", { name: "+Terminal" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Meta" })).toBeVisible();
    await expect(page.getByLabel("Session quick keys")).toBeVisible();
    await expect(projectSecondaryNav(page)).toHaveCount(0);
    await assertNoHorizontalOverflow(page);
    await page.screenshot({
      fullPage: true,
      path: join(artifactsDir, `agent-detail-${label}.png`),
    });

    await page.getByRole("button", { name: "Files" }).click();
    await expect(page.getByRole("heading", { name: "Files" })).toBeVisible();
    await expect(page.getByLabel("Agent contextual files")).toBeVisible();
    await expect(page.getByText("README.md")).toBeVisible();
    await assertNoWriteActions(page);
    await page.screenshot({
      fullPage: true,
      path: join(artifactsDir, `agent-detail-files-${label}.png`),
    });

    await page.getByRole("button", { name: "Back to stream" }).click();
    await page.getByRole("button", { name: "Git" }).click();
    await expect(page.getByRole("heading", { name: "Git" })).toBeVisible();
    await expect(page.getByLabel("Agent contextual Git changes")).toBeVisible();
    await expect(page.getByText("src/changed.ts")).toBeVisible();
    await assertNoWriteActions(page);
    results.push(
      `${label}: Agent detail is terminal-first, hides Project secondary nav, and contains Agent-only contextual tools`,
    );
  } finally {
    await context.close();
  }
};

const verifyTerminalDetail = async (
  browser: Browser,
  webUrl: string,
  label: string,
  viewport: { width: number; height: number },
  results: string[],
) => {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  try {
    await page.goto(`${webUrl}/projects/${projectName}/terminal-sessions/${terminalSessionId}`);
    await expect(page.getByRole("link", { name: "Back to Project" })).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Prototype Terminal instance with a very long display name that should truncate safely",
      }),
    ).toBeVisible();
    await expect(page.getByText(terminalSessionId)).toBeVisible();
    await expect(
      page.getByText("Terminal output from prototype alignment mock stream"),
    ).toBeVisible();
    await expect(page.getByLabel("Agent detail tools")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Files" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Git" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "+Terminal" })).toHaveCount(0);
    await expect(page.getByLabel("Session quick keys")).toBeVisible();
    await expect(projectSecondaryNav(page)).toHaveCount(0);
    await assertNoHorizontalOverflow(page);
    await page.screenshot({
      fullPage: true,
      path: join(artifactsDir, `terminal-detail-${label}.png`),
    });
    results.push(
      `${label}: Terminal detail stays a focused shell with no Agent-only tools or Project secondary nav`,
    );
  } finally {
    await context.close();
  }
};

const verifyFilesWorkspace = async (
  browser: Browser,
  webUrl: string,
  label: string,
  viewport: { width: number; height: number },
  results: string[],
) => {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  try {
    await page.goto(`${webUrl}/projects/${projectName}?workspace=files`);
    await expect(page.getByText("Current path")).toBeVisible();
    await expect(page.getByLabel("Project files")).toBeVisible();
    await expect(page.getByText("README.md")).toBeVisible();
    await expect(page.getByText("Select a file to preview")).toBeVisible();
    await expect(projectNavForLabel(page, label)).toBeVisible();
    await assertNoWriteActions(page);
    await assertNoHorizontalOverflow(page);
    await page.screenshot({
      fullPage: true,
      path: join(artifactsDir, `files-direct-${label}.png`),
    });

    await page.getByText("README.md").click();
    await expect(page.locator('section[aria-label="File preview"]:visible')).toBeVisible();
    await expect(
      page
        .locator('section[aria-label="File preview"]:visible')
        .getByText("Prototype README preview content"),
    ).toBeVisible();

    if (label === "mobile") {
      await expect(projectSecondaryNav(page)).toHaveCount(0);
      await expect(page.getByRole("button", { name: /Back to Files list/ })).toBeVisible();
    } else {
      await expect(desktopProjectNav(page)).toBeVisible();
    }

    await assertNoHorizontalOverflow(page);
    await page.screenshot({
      fullPage: true,
      path: join(artifactsDir, `files-preview-${label}.png`),
    });
    results.push(
      `${label}: Files workspace is read-only and mobile preview uses deep detail navigation`,
    );
  } finally {
    await context.close();
  }
};

const verifyGitWorkspace = async (
  browser: Browser,
  webUrl: string,
  label: string,
  viewport: { width: number; height: number },
  results: string[],
) => {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  try {
    await page.goto(`${webUrl}/projects/${projectName}?workspace=git`);
    await expect(page.getByText("Git status")).toBeVisible();
    await expect(page.getByLabel("Git changed files")).toBeVisible();
    await expect(page.getByText("src/changed.ts")).toBeVisible();
    await expect(page.getByText("Select a changed file")).toBeVisible();
    await expect(projectNavForLabel(page, label)).toBeVisible();
    await assertNoWriteActions(page);
    await assertNoHorizontalOverflow(page);
    await page.screenshot({ fullPage: true, path: join(artifactsDir, `git-direct-${label}.png`) });

    await page.getByText("src/changed.ts").click();
    await expect(page.locator('section[aria-label="Git file diff"]:visible')).toBeVisible();
    await expect(
      page
        .locator('section[aria-label="Git file diff"]:visible')
        .getByText("+export const prototypeAligned = true;"),
    ).toBeVisible();

    if (label === "mobile") {
      await expect(projectSecondaryNav(page)).toHaveCount(0);
      await expect(page.getByRole("button", { name: /Back to changed files/ })).toBeVisible();
    } else {
      await expect(desktopProjectNav(page)).toBeVisible();
    }

    await assertNoHorizontalOverflow(page);
    await page.screenshot({ fullPage: true, path: join(artifactsDir, `git-diff-${label}.png`) });
    results.push(
      `${label}: Git workspace is read-only and mobile file diff uses deep detail navigation`,
    );
  } finally {
    await context.close();
  }
};

const verifyTerminalWorkspace = async (
  browser: Browser,
  webUrl: string,
  label: string,
  viewport: { width: number; height: number },
  results: string[],
) => {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  try {
    await page.goto(`${webUrl}/projects/${projectName}?workspace=terminal`);
    await expect(page.getByRole("heading", { name: "Terminal instances" })).toBeVisible();
    await expect(page.getByRole("button", { name: "New Terminal" })).toBeVisible();
    await expect(page.getByLabel("Terminal instances")).toBeVisible();
    await expect(page.getByText(terminalSessionId)).toBeVisible();
    await expect(page.getByRole("link", { name: "Open detail" }).first()).toBeVisible();
    await expect(projectNavForLabel(page, label)).toBeVisible();
    await expect(page.getByLabel("Send input")).toHaveCount(0);
    await expect(page.getByLabel("Session quick keys")).toHaveCount(0);
    await assertNoHorizontalOverflow(page);
    await page.screenshot({
      fullPage: true,
      path: join(artifactsDir, `terminal-workspace-${label}.png`),
    });

    await page.getByRole("button", { name: "New Terminal" }).click();
    await expect(page.getByText(createdTerminalId)).toBeVisible();
    page.once("dialog", async (dialog) => {
      if (!dialog.message().includes("Close this Terminal?")) {
        throw new Error(`Unexpected dialog: ${dialog.message()}`);
      }
      await dialog.accept();
    });
    await page
      .getByText(createdTerminalId)
      .locator("xpath=ancestor::article")
      .getByRole("button", { name: "Close" })
      .click();
    await expect(page.getByText(createdTerminalId)).toHaveCount(0);
    results.push(
      `${label}: Terminal workspace lists instances, supports create/close, and keeps runtime input out of the direct workspace`,
    );
  } finally {
    await context.close();
  }
};

const assertNoWriteActions = async (page: Page) => {
  for (const name of [
    "Upload",
    "Edit",
    "Save",
    "Delete",
    "Stage",
    "Commit",
    "Reset",
    "Push",
    "Pull",
  ]) {
    await expect(page.getByRole("button", { exact: true, name })).toHaveCount(0);
  }
};

const assertNoHorizontalOverflow = async (page: Page) => {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
};

const projectNavForLabel = (page: Page, label: string) =>
  label === "desktop" ? desktopProjectNav(page) : mobileProjectNav(page);

const projectSecondaryNav = (page: Page) => desktopProjectNav(page).or(mobileProjectNav(page));

const desktopProjectNav = (page: Page) =>
  page.getByRole("navigation", { name: "Project workspace navigation" });

const mobileProjectNav = (page: Page) =>
  page.getByRole("navigation", { name: "Project mobile workspace navigation" });

const startMockApi = (port: number, logPath: string) =>
  Bun.serve({
    port,
    async fetch(request, server) {
      const url = new URL(request.url);
      mockApiRequests.push(`${request.method} ${url.pathname}${url.search}`);

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
        return json({ ok: true, service: "api" });
      }

      if (url.pathname === "/api/auth/me") {
        return json({ authenticated: true });
      }

      if (url.pathname === "/api/projects") {
        return json({
          projects: [
            {
              name: projectName,
              path: `/tmp/${projectName}/very-long-prototype-path-for-overflow-check`,
              agentSessionCount: 1,
              terminalSessionCount: terminalSessions.length,
              gitBranch: "prototype-alignment",
            },
          ],
        });
      }

      if (url.pathname === `/api/projects/${projectName}`) {
        return json({
          project: {
            name: projectName,
            path: `/tmp/${projectName}/very-long-prototype-path-for-overflow-check`,
            agentSessionCount: 1,
            terminalSessionCount: terminalSessions.length,
            gitBranch: "prototype-alignment",
          },
        });
      }

      if (url.pathname === `/api/projects/${projectName}/agent-sessions`) {
        return json({ sessions: [agentSession()] });
      }

      if (url.pathname === `/api/projects/${projectName}/agent-sessions/${agentSessionId}`) {
        return json({ session: agentSession() });
      }

      if (url.pathname === `/api/projects/${projectName}/terminal-sessions`) {
        if (request.method === "POST") {
          const created = terminalSession(
            createdTerminalId,
            "Created prototype alignment Terminal",
          );
          terminalSessions = [
            created,
            ...terminalSessions.filter((session) => session.id !== created.id),
          ];
          return json({ session: created });
        }

        return json({ sessions: terminalSessions });
      }

      const terminalDetailMatch = url.pathname.match(
        new RegExp(`^/api/projects/${projectName}/terminal-sessions/([^/]+)$`),
      );
      if (terminalDetailMatch) {
        const sessionId = decodeURIComponent(terminalDetailMatch[1] ?? "");
        const existing = terminalSessions.find((session) => session.id === sessionId);
        return json({
          session: existing ?? terminalSession(sessionId, "Prototype Terminal shell"),
        });
      }

      const terminalCloseMatch = url.pathname.match(
        new RegExp(`^/api/projects/${projectName}/terminal-sessions/([^/]+)/close$`),
      );
      if (terminalCloseMatch && request.method === "POST") {
        const sessionId = decodeURIComponent(terminalCloseMatch[1] ?? "");
        terminalSessions = terminalSessions.filter((session) => session.id !== sessionId);
        return json({ session: terminalSession(sessionId, "Closed prototype Terminal", "closed") });
      }

      if (url.pathname === `/api/projects/${projectName}/files`) {
        const path = url.searchParams.get("path") ?? "";
        return json(filesResponse(path));
      }

      if (url.pathname === `/api/projects/${projectName}/files/preview`) {
        const path = url.searchParams.get("path") ?? "";
        return json(filePreview(path));
      }

      if (url.pathname === `/api/projects/${projectName}/git/diff`) {
        return json({
          repository: true,
          projectName,
          files: [
            { path: "src/changed.ts", scope: "worktree", status: "modified" },
            {
              path: "docs/very-long-prototype-alignment-diff-file-name-that-must-not-overflow.md",
              scope: "staged",
              status: "added",
            },
          ],
        });
      }

      if (url.pathname === `/api/projects/${projectName}/git/diff/file`) {
        const path = url.searchParams.get("path") ?? "";
        return json({
          repository: true,
          projectName,
          path,
          scope: url.searchParams.get("scope") ?? "worktree",
          status: "modified",
          diff: [
            "diff --git a/src/changed.ts b/src/changed.ts",
            "@@ -1,2 +1,3 @@",
            " export const previous = false;",
            "+export const prototypeAligned = true;",
            "+const longLine = 'abcdefghijklmnopqrstuvwxyz-1234567890-abcdefghijklmnopqrstuvwxyz-1234567890';",
          ].join("\n"),
        });
      }

      return json({ error: { code: "NOT_FOUND", message: url.pathname } }, 404);
    },
    websocket: {
      open(ws) {
        const data = ws.data as { sessionId: string; sessionType: "agent" | "terminal" };
        ws.send(
          JSON.stringify({
            type: "connected",
            sessionId: data.sessionId,
            sessionType: data.sessionType,
            status: "running",
          }),
        );
        ws.send(
          JSON.stringify({
            type: "snapshot",
            data:
              data.sessionType === "agent"
                ? "Agent output from prototype alignment mock stream\nlong-agent-output-line-abcdefghijklmnopqrstuvwxyz-1234567890"
                : "Terminal output from prototype alignment mock stream\n$ echo prototype",
          }),
        );
      },
      message(ws, message) {
        ws.send(JSON.stringify({ type: "output", data: `Echoed ${String(message)}` }));
      },
    },
  });

const streamData = (path: string) => {
  const match = path.match(/\/(agent-sessions|terminal-sessions)\/([^/]+)\/stream$/);
  return {
    sessionId: decodeURIComponent(match?.[2] ?? "unknown"),
    sessionType: match?.[1] === "agent-sessions" ? "agent" : "terminal",
  };
};

function agentSession() {
  return {
    id: agentSessionId,
    projectName,
    provider: "claude",
    displayName: "Prototype Claude stream",
    status: "running",
  };
}

function terminalSession(id: string, displayName: string, status = "running") {
  return {
    id,
    projectName,
    displayName,
    status,
  };
}

const filesResponse = (path: string) => {
  if (path === "src") {
    return {
      projectName,
      path,
      parentPath: "",
      entries: [
        { name: "changed.ts", path: "src/changed.ts", type: "file", size: 128, hidden: false },
      ],
    };
  }

  return {
    projectName,
    path: "",
    parentPath: null,
    entries: [
      { name: "src", path: "src", type: "directory", size: null, hidden: false },
      { name: "README.md", path: "README.md", type: "file", size: 42, hidden: false },
      {
        name: "very-long-prototype-file-name-that-should-not-cause-horizontal-overflow.txt",
        path: "docs/very-long-prototype-file-name-that-should-not-cause-horizontal-overflow.txt",
        type: "file",
        size: 2048,
        hidden: false,
      },
    ],
  };
};

const filePreview = (path: string) => ({
  type: "text",
  projectName,
  path,
  name: path.split("/").pop() ?? path,
  size: 42,
  content:
    "Prototype README preview content\nlong-preview-line-abcdefghijklmnopqrstuvwxyz-1234567890-abcdefghijklmnopqrstuvwxyz-1234567890",
});

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
