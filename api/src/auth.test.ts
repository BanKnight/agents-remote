import { expect, test } from "bun:test";
import { AuthError, AuthService } from "./auth";

const fixedNow = new Date("2026-05-24T00:00:00.000Z");

test("AuthService signs and verifies a token for the correct password", () => {
  const service = new AuthService({
    appPassword: "secret",
    tokenSecret: "test-secret",
    now: () => fixedNow,
  });

  const issue = service.login("secret");

  expect(issue.expiresAt).toBe("2026-06-23T00:00:00.000Z");
  expect(service.verify(issue.token)).toBe(true);
});

test("AuthService rejects wrong password", () => {
  const service = new AuthService({ appPassword: "secret", tokenSecret: "test-secret" });

  expect(() => service.login("wrong")).toThrow(AuthError);

  try {
    service.login("wrong");
  } catch (error) {
    expect((error as AuthError).code).toBe("INVALID_PASSWORD");
  }
});

test("AuthService rejects malformed and tampered tokens", () => {
  const service = new AuthService({
    appPassword: "secret",
    tokenSecret: "test-secret",
    now: () => fixedNow,
  });
  const issue = service.login("secret");

  expect(service.verify(undefined)).toBe(false);
  expect(service.verify("not-a-token")).toBe(false);
  expect(service.verify(`${issue.token}tampered`)).toBe(false);
});

test("AuthService rejects expired tokens", () => {
  let now = fixedNow;
  const service = new AuthService({
    appPassword: "secret",
    tokenSecret: "test-secret",
    now: () => now,
    tokenTtlMs: 1000,
  });
  const issue = service.login("secret");

  now = new Date(fixedNow.getTime() + 1001);

  expect(service.verify(issue.token)).toBe(false);
  expect(() => service.requireToken(issue.token)).toThrow(AuthError);
});
