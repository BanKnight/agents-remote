import { expect, test } from "bun:test";
import type { ApiErrorResponse, HealthResponse, LoginResponse } from "./index";

test("HealthResponse marks the api service", () => {
  const response: HealthResponse = { ok: true, service: "api" };

  expect(response.service).toBe("api");
});

test("auth DTOs describe login and errors", () => {
  const login: LoginResponse = {
    ok: true,
    token: "token",
    expiresAt: "2026-05-31T00:00:00.000Z",
  };
  const error: ApiErrorResponse = {
    error: {
      code: "UNAUTHENTICATED",
      message: "Authentication required",
    },
  };

  expect(login.ok).toBe(true);
  expect(error.error.code).toBe("UNAUTHENTICATED");
});
