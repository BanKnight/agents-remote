import { expect, test } from "bun:test";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { listPiBuiltinProviders } from "./pi-providers";

// fake Provider 只需 auth 结构（oauth 存在 / apiKey.login 存在）供 authType 推导。
type FakeProvider = {
  id: string;
  name: string;
  auth?: { apiKey?: { login?: unknown }; oauth?: unknown };
};

const fakeCreate = (providers: FakeProvider[]) => async () =>
  ({ getProviders: () => providers }) as unknown as ModelRuntime;

test("listPiBuiltinProviders：映射 id/name/authType + 按 name 字母序排序", async () => {
  const result = await listPiBuiltinProviders(
    fakeCreate([
      { id: "openai", name: "OpenAI", auth: { apiKey: { login: () => {} } } },
      { id: "openai-codex", name: "OpenAI Codex", auth: { oauth: {} } },
      { id: "anthropic", name: "Anthropic", auth: { apiKey: { login: () => {} }, oauth: {} } },
      { id: "deepseek", name: "DeepSeek", auth: { apiKey: { login: () => {} } } },
    ]),
  );

  expect(result).toEqual([
    { id: "anthropic", name: "Anthropic", authType: "both" },
    { id: "deepseek", name: "DeepSeek", authType: "api_key" },
    { id: "openai", name: "OpenAI", authType: "api_key" },
    { id: "openai-codex", name: "OpenAI Codex", authType: "oauth" },
  ]);
});

test("listPiBuiltinProviders：无 oauth 无 login → unknown（兜底）", async () => {
  const result = await listPiBuiltinProviders(fakeCreate([{ id: "custom", name: "Custom" }]));

  expect(result).toEqual([{ id: "custom", name: "Custom", authType: "unknown" }]);
});
