import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const serviceWorkerSource = readFileSync(
  new URL("../../public/service-worker.js", import.meta.url),
  "utf8",
);
const mainSource = readFileSync(new URL("../main.tsx", import.meta.url), "utf8");

const manifest = JSON.parse(
  readFileSync(new URL("../../public/manifest.webmanifest", import.meta.url), "utf8"),
) as {
  background_color: string;
  display: string;
  icons: Array<{ sizes: string; type: string }>;
  name: string;
  prefer_related_applications: boolean;
  short_name: string;
  start_url: string;
  theme_color: string;
};

test("PWA manifest exposes installable standalone shell fields", () => {
  expect(manifest.name).toBe("智控 · AI 远程控制台");
  expect(manifest.short_name).toBe("智控");
  expect(manifest.start_url).toBe("/");
  expect(manifest.display).toBe("standalone");
  expect(manifest.theme_color).toBe("#020617");
  expect(manifest.background_color).toBe("#020617");
  expect(manifest.prefer_related_applications).toBe(false);
});

test("PWA manifest includes Chromium installability icon sizes", () => {
  expect(manifest.icons.some((icon) => icon.sizes === "192x192" && icon.type === "image/png")).toBe(
    true,
  );
  expect(manifest.icons.some((icon) => icon.sizes === "512x512" && icon.type === "image/png")).toBe(
    true,
  );
});

test("PWA service worker caches install assets without intercepting app or API requests", () => {
  expect(serviceWorkerSource).toContain("APP_SHELL_ASSETS");
  expect(serviceWorkerSource).toContain("/manifest.webmanifest");
  expect(serviceWorkerSource).toContain('url.pathname.startsWith("/api/")');
  expect(serviceWorkerSource).toContain('request.mode === "navigate"');
  expect(serviceWorkerSource).not.toContain('networkFirst(request, "/")');
});

test("PWA service worker registration uses a stable script URL", () => {
  expect(mainSource).toContain('register?.("/service-worker.js"');
  expect(mainSource).toContain('updateViaCache: "none"');
  expect(mainSource).not.toContain("Date.now()");
});
