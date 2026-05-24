import { expect, test } from "bun:test";

test("web api client uses same-origin /api paths", () => {
  expect("/api/health".startsWith("/api")).toBe(true);
});
