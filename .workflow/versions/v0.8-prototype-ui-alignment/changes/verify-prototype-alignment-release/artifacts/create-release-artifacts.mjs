import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(".");
const changeDir = ".workflow/versions/v0.8-prototype-ui-alignment/changes/verify-prototype-alignment-release";
const artifactsDir = resolve(repoRoot, changeDir, "artifacts");
const checkedAt = new Date().toISOString();
const log = [];

const pathExists = async (path) => {
  try {
    await access(resolve(repoRoot, path));
    return true;
  } catch {
    return false;
  }
};

const readText = async (path) => readFile(resolve(repoRoot, path), "utf8");
const record = (entry) => log.push({ checkedAt, ...entry });
const normalizeText = (text) => text.toLowerCase();

const verifyFiles = [
  ".workflow/versions/v0.8-prototype-ui-alignment/changes/establish-prototype-alignment-baseline/verify.md",
  ".workflow/versions/v0.8-prototype-ui-alignment/changes/align-home-project-shell/verify.md",
  ".workflow/versions/v0.8-prototype-ui-alignment/changes/align-runtime-detail-workspaces/verify.md",
  ".workflow/versions/v0.8-prototype-ui-alignment/changes/align-resource-inspection-workspaces/verify.md",
];

for (const path of verifyFiles) {
  const text = await readText(path);
  const hasCritical = /### CRITICAL\s*\n\s*- （无）/m.test(text);
  const allowsDistill = /是否允许进入 distill-change：是/.test(text);
  record({ check: "previous-verify", path, passed: hasCritical && allowsDistill, hasNoCritical: hasCritical, allowsDistill });
}

const requiredArtifacts = [
  {
    page: "home",
    prototype: "home.html",
    change: "align-home-project-shell",
    files: [
      "home-prototype-desktop.png",
      "home-prototype-mobile.png",
      "home-app-desktop.png",
      "home-app-mobile.png",
      "browser-check.log",
    ],
    base: ".workflow/versions/v0.8-prototype-ui-alignment/changes/align-home-project-shell/artifacts",
  },
  {
    page: "project-agent-workspace",
    prototype: "project-detail.html",
    change: "align-home-project-shell",
    files: [
      "project-detail-prototype-desktop.png",
      "project-detail-prototype-mobile.png",
      "project-agent-app-desktop.png",
      "project-agent-app-mobile.png",
      "browser-check.log",
    ],
    base: ".workflow/versions/v0.8-prototype-ui-alignment/changes/align-home-project-shell/artifacts",
  },
  {
    page: "agent-detail",
    prototype: "agent-session-detail.html",
    change: "align-runtime-detail-workspaces",
    files: [
      "agent-detail-prototype-desktop.png",
      "agent-detail-prototype-mobile.png",
      "agent-detail-app-desktop.png",
      "agent-detail-app-mobile.png",
      "browser-check.log",
      "agent-desktop-check.json",
      "agent-mobile-check.json",
    ],
    base: ".workflow/versions/v0.8-prototype-ui-alignment/changes/align-runtime-detail-workspaces/artifacts",
  },
  {
    page: "terminal-detail",
    prototype: "terminal-instance-detail.html",
    change: "align-runtime-detail-workspaces",
    files: [
      "terminal-detail-prototype-desktop.png",
      "terminal-detail-prototype-mobile.png",
      "terminal-detail-app-desktop.png",
      "terminal-detail-app-mobile.png",
      "browser-check.log",
      "terminal-desktop-check.json",
      "terminal-mobile-check.json",
    ],
    base: ".workflow/versions/v0.8-prototype-ui-alignment/changes/align-runtime-detail-workspaces/artifacts",
  },
  {
    page: "files-workspace",
    prototype: "files.html",
    change: "align-resource-inspection-workspaces",
    files: [
      "prototype-files-desktop.png",
      "prototype-files-mobile.png",
      "app-files-desktop.png",
      "app-files-mobile.png",
      "app-files-mobile-preview-detail.png",
      "browser-check.log",
    ],
    base: ".workflow/versions/v0.8-prototype-ui-alignment/changes/align-resource-inspection-workspaces/artifacts",
  },
  {
    page: "git-workspace",
    prototype: "git.html",
    change: "align-resource-inspection-workspaces",
    files: [
      "prototype-git-desktop.png",
      "prototype-git-mobile.png",
      "app-git-desktop.png",
      "app-git-mobile.png",
      "app-git-mobile-diff-detail.png",
      "browser-check.log",
    ],
    base: ".workflow/versions/v0.8-prototype-ui-alignment/changes/align-resource-inspection-workspaces/artifacts",
  },
  {
    page: "terminal-workspace",
    prototype: "terminal.html",
    change: "align-resource-inspection-workspaces",
    files: [
      "prototype-terminal-desktop.png",
      "prototype-terminal-mobile.png",
      "app-terminal-desktop.png",
      "app-terminal-mobile.png",
      "browser-check.log",
    ],
    base: ".workflow/versions/v0.8-prototype-ui-alignment/changes/align-resource-inspection-workspaces/artifacts",
  },
];

const manifest = [];
for (const entry of requiredArtifacts) {
  const files = [];
  for (const file of entry.files) {
    const path = `${entry.base}/${file}`;
    files.push({ path, exists: await pathExists(path) });
  }
  const missing = files.filter((file) => !file.exists).map((file) => file.path);
  manifest.push({ ...entry, files, missing });
  record({ check: "artifact-presence", page: entry.page, prototype: entry.prototype, change: entry.change, passed: missing.length === 0, missing });
}

const logChecks = [
  {
    source: ".workflow/versions/v0.8-prototype-ui-alignment/changes/align-home-project-shell/artifacts/browser-check.log",
    checks: [
      { label: "home app desktop", pattern: /home app desktop/i },
      { label: "home app mobile", pattern: /home app mobile/i },
      { label: "project app desktop", pattern: /project app desktop/i },
      { label: "project app mobile", pattern: /project app mobile/i },
      { label: "no blocking differences", pattern: /blocking differences: none/i },
      { label: "no fake provider history", pattern: /no fake provider history\/output/i },
    ],
  },
  {
    source: ".workflow/versions/v0.8-prototype-ui-alignment/changes/align-runtime-detail-workspaces/artifacts/browser-check.log",
    checks: [
      { label: "agent detail top return", pattern: /Agent detail mobile[\s\S]*Top return: present/i },
      { label: "agent detail no bottom nav", pattern: /Agent detail mobile[\s\S]*Project secondary bottom nav: absent/i },
      { label: "terminal detail no agent tools", pattern: /Terminal detail mobile[\s\S]*Agent-only Files\/Git\/\+Terminal\/Meta\/provider metadata: absent/i },
      { label: "drawer below output", pattern: /Input drawer: present and below output/i },
      { label: "no blocking differences", pattern: /No blocking differences found/i },
      { label: "shift tab gap not faked", pattern: /Shift\+Tab quick key is not implemented/i },
    ],
  },
  {
    source: ".workflow/versions/v0.8-prototype-ui-alignment/changes/align-resource-inspection-workspaces/artifacts/browser-check.log",
    checks: [
      { label: "files forbidden copy", pattern: /"workspace":"files","passed":true/ },
      { label: "files direct bottom nav", pattern: /"label":"files-direct","expectedVisible":true,"actualVisible":true,"passed":true/ },
      { label: "files preview hides bottom nav", pattern: /"label":"files-preview-detail","expectedVisible":false,"actualVisible":false,"passed":true/ },
      { label: "git forbidden copy", pattern: /"workspace":"git","passed":true/ },
      { label: "git direct bottom nav", pattern: /"label":"git-direct","expectedVisible":true,"actualVisible":true,"passed":true/ },
      { label: "git diff hides bottom nav", pattern: /"label":"git-diff-detail","expectedVisible":false,"actualVisible":false,"passed":true/ },
      { label: "terminal runtime input absent", pattern: /"check":"terminal-runtime-input-absent","passed":true/ },
      { label: "terminal close confirm", pattern: /"check":"terminal-close-confirm","passed":true/ },
    ],
  },
];

for (const source of logChecks) {
  const text = await readText(source.source);
  for (const check of source.checks) {
    record({ check: "browser-log-assertion", source: source.source, label: check.label, passed: check.pattern.test(text) });
  }
}

const sharedFiles = [
  ".workflow/versions/v0.8-prototype-ui-alignment/shared/alignment-contract.md",
  ".workflow/versions/v0.8-prototype-ui-alignment/shared/design-system-note.md",
  ".workflow/versions/v0.8-prototype-ui-alignment/shared/follow-up-gaps.md",
];
for (const path of sharedFiles) {
  record({ check: "shared-file", path, passed: await pathExists(path) });
}

const gapsText = await readText(".workflow/versions/v0.8-prototype-ui-alignment/shared/follow-up-gaps.md");
const openGapMatches = [...gapsText.matchAll(/^### (GAP-[^\n]+)\n([\s\S]*?)(?=\n### |\n*$)/gm)].map((match) => ({ id: match[1], body: match[2] }));
const openGaps = openGapMatches
  .filter((gap) => /状态：open/.test(gap.body))
  .map((gap) => ({
    id: gap.id,
    sourceChange: gap.body.match(/来源 change：([^\n]+)/)?.[1]?.trim() ?? null,
    type: gap.body.match(/缺口类型：([^\n]+)/)?.[1]?.trim() ?? null,
    expression: gap.body.match(/当前表达方式：([^\n]+)/)?.[1]?.trim() ?? null,
    blocking: /shared-baseline-gap|docs-conflict|capability-boundary/.test(gap.body),
  }));
record({ check: "follow-up-gaps", passed: openGaps.every((gap) => !gap.blocking), openGaps });

const failures = log.filter((entry) => entry.passed === false);
const summary = {
  checkedAt,
  version: "v0.8-prototype-ui-alignment",
  change: "verify-prototype-alignment-release",
  result: failures.length === 0 ? "passed" : "failed",
  failureCount: failures.length,
  openGaps,
  prototypeMap: manifest,
  referencedEvidence: {
    sharedFiles,
    verifyFiles,
    browserLogs: logChecks.map((entry) => entry.source),
  },
};

await mkdir(artifactsDir, { recursive: true });
await writeFile(resolve(artifactsDir, "release-artifact-manifest.json"), JSON.stringify(summary, null, 2) + "\n");
await writeFile(resolve(artifactsDir, "release-browser-check.log"), log.map((entry) => JSON.stringify(entry)).join("\n") + "\n");
record({ check: "release-summary", passed: failures.length === 0, failureCount: failures.length });
await writeFile(resolve(artifactsDir, "release-summary.json"), JSON.stringify({ ...summary, logPath: `${changeDir}/artifacts/release-browser-check.log` }, null, 2) + "\n");

if (failures.length > 0) {
  throw new Error(`Release artifact check failed with ${failures.length} failure(s)`);
}
