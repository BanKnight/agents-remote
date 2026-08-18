import { expect, test } from "bun:test";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { listPiBuiltinProviders } from "./pi-providers";

const fakeCreate = (providers: { id: string; name: string }[]) => async () =>
  ({ getProviders: () => providers }) as unknown as ModelRuntime;

test("listPiBuiltinProviders：映射 id/name + 按 name 字母序排序", async () => {
  const result = await listPiBuiltinProviders(
    fakeCreate([
      { id: "openai", name: "OpenAI" },
      { id: "anthropic", name: "Anthropic" },
      { id: "deepseek", name: "DeepSeek" },
    ]),
  );

  expect(result).toEqual([
    { id: "anthropic", name: "Anthropic" },
    { id: "deepseek", name: "DeepSeek" },
    { id: "openai", name: "OpenAI" },
  ]);
});
