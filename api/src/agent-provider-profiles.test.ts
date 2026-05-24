import { expect, test } from "bun:test";
import { getAgentProviderProfile } from "./agent-provider-profiles";

test("getAgentProviderProfile returns internal Claude and Codex profiles", () => {
  expect(getAgentProviderProfile("claude")).toEqual({
    provider: "claude",
    label: "Claude",
    command: "claude",
    displayNamePrefix: "Claude Agent",
    capabilities: {
      history: "unsupported",
    },
  });
  expect(getAgentProviderProfile("codex")).toEqual({
    provider: "codex",
    label: "Codex",
    command: "codex",
    displayNamePrefix: "Codex Agent",
    capabilities: {
      history: "unsupported",
    },
  });
});

test("getAgentProviderProfile treats missing provider as unavailable", () => {
  expect(getAgentProviderProfile(undefined)).toBeUndefined();
});
