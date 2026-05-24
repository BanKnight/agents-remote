import { expect, test } from "bun:test";
import { AuthService } from "./auth";
import { canUpgradeWebSocket } from "./ws-auth";

const makeAuth = () =>
  new AuthService({
    appPassword: "secret",
    tokenSecret: "test-secret",
    now: () => new Date("2026-05-24T00:00:00.000Z"),
  });

test("canUpgradeWebSocket accepts valid token", () => {
  const auth = makeAuth();
  const issue = auth.login("secret");

  expect(
    canUpgradeWebSocket(new Request(`http://localhost/api/ws/echo?token=${issue.token}`), auth),
  ).toBe(true);
});

test("canUpgradeWebSocket rejects missing or invalid token", () => {
  const auth = makeAuth();

  expect(canUpgradeWebSocket(new Request("http://localhost/api/ws/echo"), auth)).toBe(false);
  expect(canUpgradeWebSocket(new Request("http://localhost/api/ws/echo?token=bad"), auth)).toBe(
    false,
  );
});
