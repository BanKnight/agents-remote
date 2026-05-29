import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve('docs/design/prototype');
const outputDir = resolve(root, 'screenshots');
const pages = [
  ['home', 'home.html'],
  ['project-detail', 'project-detail.html'],
  ['agent-session-detail', 'agent-session-detail.html'],
  ['terminal-instance-detail', 'terminal-instance-detail.html'],
  ['files', 'files.html'],
  ['git', 'git.html'],
  ['terminal', 'terminal.html'],
];
const viewports = [
  ['desktop', { width: 1440, height: 1000 }],
  ['mobile', { width: 390, height: 844 }],
];

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch();

try {
  for (const [slug, file] of pages) {
    for (const [label, viewport] of viewports) {
      const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
      const url = `file://${resolve(root, file)}`;
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.screenshot({ path: resolve(outputDir, `${slug}-${label}.png`), fullPage: false });
      await page.close();
      console.log(`${slug}-${label}.png ${viewport.width}x${viewport.height} ${file}`);
    }
  }
} finally {
  await browser.close();
}
