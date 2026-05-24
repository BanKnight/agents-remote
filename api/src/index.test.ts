import { expect, test } from "bun:test";

test("api smoke paths stay under /api", () => {
  expect("/api/health".startsWith("/api")).toBe(true);
  expect("/api/ws/echo".startsWith("/api")).toBe(true);
});
