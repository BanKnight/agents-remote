import { defineConfig, devices } from "@playwright/test";

const artifactsDir = process.env.E2E_ARTIFACTS_DIR ?? "test-results/e2e";
const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:4173";

export default defineConfig({
  testDir: "./e2e",
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  outputDir: `${artifactsDir}/playwright-results`,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: `${artifactsDir}/playwright-report` }],
  ],
  use: {
    baseURL,
    screenshot: { mode: "only-on-failure", fullPage: true },
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  workers: 1,
});
