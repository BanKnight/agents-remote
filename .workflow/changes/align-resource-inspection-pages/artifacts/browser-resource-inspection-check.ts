import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium, expect, type Browser, type Page } from "@playwright/test";

const artifactsDir = join(
  process.cwd(),
  ".workflow/changes/align-resource-inspection-pages/artifacts/browser-resource-inspection",
);
const projectName = "resource-demo";
const longTerminalId =
  "terminal-session-long-id-for-resource-overflow-check-abcdefghijklmnopqrstuvwxyz-1234567890";
const createdTerminalId = "terminal-created-from-resource-workspace";

let terminalSessions = [
  terminalSession(
    longTerminalId,
    "Resource shell with a very long display name that must truncate safely",
  ),
];

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
      await verifyFilesWorkspace(
        browser,
        webUrl,
        "desktop",
        { width: 1440, height: 1000 },
        results,
      );
      await verifyFilesWorkspace(browser, webUrl, "mobile", { width: 390, height: 844 }, results);
      await verifyGitWorkspace(browser, webUrl, "desktop", { width: 1440, height: 1000 }, results);
      await verifyGitWorkspace(browser, webUrl, "mobile", { width: 390, height: 844 }, results);
      await verifyTerminalWorkspace(
        browser,
        webUrl,
        "desktop",
        { width: 1440, height: 1000 },
        results,
      );
      await verifyTerminalWorkspace(
        browser,
        webUrl,
        "mobile",
        { width: 390, height: 844 },
        results,
      );
      await writeFile(
        join(artifactsDir, "resource-inspection-check.log"),
        `${results.join("\n")}\n`,
      );
    } finally {
      await browser.close();
    }
  } finally {
    web.kill();
    await Promise.allSettled([web.exited]);
    await mockApi.stop(true);
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
    await assertNoWriteActions(page);

    if (label === "mobile") {
      await expect(mobileProjectNav(page)).toBeVisible();
      await expect(page.getByRole("button", { name: /Back to Files list/ })).toHaveCount(0);
      await assertNoHorizontalOverflow(page);
      await page.screenshot({
        fullPage: true,
        path: join(artifactsDir, "files-direct-mobile.png"),
      });
    } else {
      await expect(desktopProjectNav(page)).toBeVisible();
      await page.screenshot({
        fullPage: true,
        path: join(artifactsDir, "files-direct-desktop.png"),
      });
    }

    await page.getByText("README.md").click();
    await expect(page.locator('section[aria-label="File preview"]:visible')).toBeVisible();
    await expect(
      page
        .locator('section[aria-label="File preview"]:visible')
        .getByText("Mock README preview content"),
    ).toBeVisible();

    if (label === "mobile") {
      await expect(projectSecondaryNav(page)).toHaveCount(0);
      await expect(page.getByRole("button", { name: /Back to Files list/ })).toBeVisible();
      await assertNoHorizontalOverflow(page);
      await page.screenshot({
        fullPage: true,
        path: join(artifactsDir, "files-preview-mobile.png"),
      });
      await page.getByRole("button", { name: /Back to Files list/ }).click();
      await expect(mobileProjectNav(page)).toBeVisible();
    } else {
      await expect(desktopProjectNav(page)).toBeVisible();
      await page.screenshot({
        fullPage: true,
        path: join(artifactsDir, "files-preview-desktop.png"),
      });
    }

    results.push(
      `${label}: Files direct secondary page is compact and read-only, and file preview uses mobile deep detail without Project bottom nav`,
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
    await assertNoWriteActions(page);

    if (label === "mobile") {
      await expect(mobileProjectNav(page)).toBeVisible();
      await expect(page.getByRole("button", { name: /Back to changed files/ })).toHaveCount(0);
      await assertNoHorizontalOverflow(page);
      await page.screenshot({ fullPage: true, path: join(artifactsDir, "git-direct-mobile.png") });
    } else {
      await expect(desktopProjectNav(page)).toBeVisible();
      await page.screenshot({ fullPage: true, path: join(artifactsDir, "git-direct-desktop.png") });
    }

    await page.getByText("src/changed.ts").click();
    await expect(page.locator('section[aria-label="Git file diff"]:visible')).toBeVisible();
    await expect(
      page
        .locator('section[aria-label="Git file diff"]:visible')
        .getByText("+export const aligned = true;"),
    ).toBeVisible();

    if (label === "mobile") {
      await expect(projectSecondaryNav(page)).toHaveCount(0);
      await expect(page.getByRole("button", { name: /Back to changed files/ })).toBeVisible();
      await assertNoHorizontalOverflow(page);
      await page.screenshot({ fullPage: true, path: join(artifactsDir, "git-diff-mobile.png") });
      await page.getByRole("button", { name: /Back to changed files/ }).click();
      await expect(mobileProjectNav(page)).toBeVisible();
    } else {
      await expect(desktopProjectNav(page)).toBeVisible();
      await page.screenshot({ fullPage: true, path: join(artifactsDir, "git-diff-desktop.png") });
    }

    results.push(
      `${label}: Git direct secondary page is compact and read-only, and file diff uses mobile deep detail without Project bottom nav`,
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
    await expect(page.getByText(longTerminalId)).toBeVisible();
    await expect(page.getByRole("link", { name: "Open detail" }).first()).toBeVisible();
    await expect(page.getByLabel("Send input")).toHaveCount(0);
    await expect(page.getByLabel("Session quick keys")).toHaveCount(0);

    if (label === "mobile") {
      await expect(mobileProjectNav(page)).toBeVisible();
      await assertNoHorizontalOverflow(page);
      await page.screenshot({
        fullPage: true,
        path: join(artifactsDir, "terminal-direct-mobile.png"),
      });
    } else {
      await expect(desktopProjectNav(page)).toBeVisible();
      await page.screenshot({
        fullPage: true,
        path: join(artifactsDir, "terminal-direct-desktop.png"),
      });
    }

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
      `${label}: Terminal direct secondary page lists instances, supports create success and close confirm, keeps mobile bottom nav, and exposes no runtime input`,
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
    await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
  }
};

const assertNoHorizontalOverflow = async (page: Page) => {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
};

const projectSecondaryNav = (page: Page) => desktopProjectNav(page).or(mobileProjectNav(page));

const desktopProjectNav = (page: Page) =>
  page.getByRole("navigation", { name: "Project workspace navigation" });

const mobileProjectNav = (page: Page) =>
  page.getByRole("navigation", { name: "Project mobile workspace navigation" });

const startMockApi = (port: number, logPath: string) =>
  Bun.serve({
    port,
    async fetch(request) {
      const url = new URL(request.url);
      await writeFile(logPath, `${request.method} ${url.pathname}${url.search}\n`, {
        append: true,
      });

      if (url.pathname === "/api/health") {
        return json({ ok: true, service: "api" });
      }

      if (url.pathname === "/api/auth/me") {
        return json({ authenticated: true });
      }

      if (url.pathname === `/api/projects/${projectName}`) {
        return json({
          project: {
            name: projectName,
            path: `/tmp/${projectName}`,
            agentSessionCount: 0,
            terminalSessionCount: terminalSessions.length,
            gitBranch: "resource-alignment",
          },
        });
      }

      if (url.pathname === `/api/projects/${projectName}/agent-sessions`) {
        return json({ sessions: [] });
      }

      if (url.pathname === `/api/projects/${projectName}/terminal-sessions`) {
        if (request.method === "POST") {
          const created = terminalSession(createdTerminalId, "Created resource shell");
          terminalSessions = [
            created,
            ...terminalSessions.filter((session) => session.id !== created.id),
          ];
          return json({ session: created });
        }

        return json({ sessions: terminalSessions });
      }

      const terminalCloseMatch = url.pathname.match(
        new RegExp(`^/api/projects/${projectName}/terminal-sessions/([^/]+)/close$`),
      );
      if (terminalCloseMatch && request.method === "POST") {
        const sessionId = decodeURIComponent(terminalCloseMatch[1] ?? "");
        const closed = terminalSession(sessionId, "Closed resource shell", "closed");
        terminalSessions = terminalSessions.filter((session) => session.id !== sessionId);
        return json({ session: closed });
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
            {
              path: "src/changed.ts",
              scope: "worktree",
              status: "modified",
            },
            {
              path: "docs/very-long-resource-inspection-file-name-that-must-not-overflow.md",
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
            "+export const aligned = true;",
            "+const longLine = 'abcdefghijklmnopqrstuvwxyz-1234567890-abcdefghijklmnopqrstuvwxyz-1234567890';",
          ].join("\n"),
        });
      }

      return json({ error: { code: "NOT_FOUND", message: url.pathname } }, 404);
    },
  });

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
        {
          name: "changed.ts",
          path: "src/changed.ts",
          type: "file",
          size: 128,
          hidden: false,
        },
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
        name: "very-long-file-name-that-should-not-cause-horizontal-overflow-in-mobile-preview.txt",
        path: "docs/very-long-file-name-that-should-not-cause-horizontal-overflow-in-mobile-preview.txt",
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
    "Mock README preview content\nlong-preview-line-abcdefghijklmnopqrstuvwxyz-1234567890-abcdefghijklmnopqrstuvwxyz-1234567890",
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
