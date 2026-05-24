import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

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
  expect(manifest.name).toBe("Agents Remote");
  expect(manifest.short_name).toBe("Agents");
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
