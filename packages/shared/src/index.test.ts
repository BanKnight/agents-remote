import { expect, test } from "bun:test";
import type { HealthResponse } from "./index";

test("HealthResponse marks the api service", () => {
  const response: HealthResponse = { ok: true, service: "api" };

  expect(response.service).toBe("api");
});
