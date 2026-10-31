// 诊断第三轮（修正 before 快照时序）：量 tmux window 在折叠/展开/reload 场景下的跟随性。
import { chromium } from "@playwright/test";
import { execSync } from "node:child_process";
import { readAppPassword } from "./lib/deploy-config.mjs";

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://127.0.0.1:43012";
const PROJECT = "test";

const tmuxSnapshot = () =>
  new Set(
    execSync("tmux list-sessions -F '#{session_name}'", { encoding: "utf8" })
      .split("\n")
      .filter(Boolean),
  );

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();

await page.goto(`${WEB_ORIGIN}/`);
await page.getByLabel("Access password").fill(await readAppPassword());
await page.waitForTimeout(400);
await page.getByRole("button", { name: "Sign in" }).click();
await page.waitForTimeout(800);

// 快照必须在 create 之前（上轮 bug：新会话被自己过滤）
const before = tmuxSnapshot();

const created = await page.evaluate(async (project) => {
  const res = await fetch(`/api/projects/${project}/terminal-sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ displayName: "tsize-collapse-probe" }),
  });
  return res.json();
}, PROJECT);
const sessionId = created?.session?.id;
if (!sessionId) {
  console.log("create failed:", JSON.stringify(created));
  await browser.close();
  process.exit(1);
}
console.log("created:", sessionId);

await context.addInitScript(`
  window.__resizes = [];
  const OrigWS = window.WebSocket;
  class HookedWS extends OrigWS {
    constructor(url, protocols) {
      super(url, protocols);
      if (!String(url).includes("/stream")) return;
      const origSend = this.send.bind(this);
      this.send = (data) => {
        try {
          const m = JSON.parse(data);
          if (m.type === "resize") window.__resizes.push({ cols: m.cols, rows: m.rows, t: Math.round(performance.now()) });
        } catch {}
        return origSend(data);
      };
    }
  }
  window.WebSocket = HookedWS;
`);

await page.goto(`${WEB_ORIGIN}/projects/${PROJECT}/session/${sessionId}`);
await page.waitForTimeout(2500);

const findTarget = () => {
  const list = execSync("tmux list-sessions -F '#{session_name}'", { encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
  return list.find((n) => !before.has(n)) ?? null;
};
const tmuxName = findTarget();
console.log("target tmux session:", tmuxName);
const tmuxSize = () => {
  try {
    return execSync(
      `tmux display-message -p -t ${JSON.stringify(tmuxName)} '#{window_width}x#{window_height}'`,
      { encoding: "utf8" },
    ).trim();
  } catch {
    return "(gone)";
  }
};

const measure = (tag) =>
  page.evaluate((t) => {
    const container = document.querySelector(".xterm")?.parentElement;
    const canvas = document.querySelector(".xterm canvas");
    const c = container?.getBoundingClientRect();
    const v = canvas?.getBoundingClientRect();
    return {
      tag: t,
      containerH: c ? Math.round(c.height) : null,
      canvasH: v ? Math.round(v.height) : null,
      gap: c && v ? Math.round(c.height - v.height) : null,
      resizes: window.__resizes.map((r) => `${r.cols}x${r.rows}@${r.t}`).join(" | "),
    };
  }, tag);

console.log("折叠首屏:", JSON.stringify(await measure("collapsed-first")), "tmux:", tmuxSize());

await page.getByRole("button", { name: "Expand input" }).click();
await page.waitForTimeout(600);
console.log("展开:    ", JSON.stringify(await measure("expanded")), "tmux:", tmuxSize());

await page.getByRole("button", { name: "Collapse input" }).click();
await page.waitForTimeout(600);
console.log("折叠回:  ", JSON.stringify(await measure("collapsed-again")), "tmux:", tmuxSize());

await page.reload();
await page.waitForTimeout(2500);
console.log("reload:  ", JSON.stringify(await measure("reloaded")), "tmux:", tmuxSize());

const close = await page.evaluate(
  async ({ project, id }) => {
    const res = await fetch(`/api/projects/${project}/terminal-sessions/${id}/close`, {
      method: "POST",
    });
    return res.status;
  },
  { project: PROJECT, id: sessionId },
);
console.log("cleanup:", close);
await browser.close();
