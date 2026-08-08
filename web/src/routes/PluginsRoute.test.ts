import { describe, expect, it } from "bun:test";
import { parseEnvLines } from "./PluginsRoute";

describe("parseEnvLines（MCP stdio env 文本域解析）", () => {
  it("解析 KEY=value 行", () => {
    expect(parseEnvLines("A=1\nB=two\n")).toEqual({ A: "1", B: "two" });
  });

  it("忽略空行与无 = 的行", () => {
    expect(parseEnvLines("\n\njusttext\nC=3\n")).toEqual({ C: "3" });
  });

  it("trim key 与 value 两侧空白", () => {
    expect(parseEnvLines("  K  =  v  ")).toEqual({ K: "v" });
  });

  it("值内保留 =（取首个 = 切分）", () => {
    expect(parseEnvLines("URL=https://a.com/p?q=1")).toEqual({ URL: "https://a.com/p?q=1" });
  });

  it("空输入 / 全空白返回 undefined", () => {
    expect(parseEnvLines("")).toBeUndefined();
    expect(parseEnvLines("   \n  ")).toBeUndefined();
    expect(parseEnvLines("  =v  ")).toBeUndefined();
  });
});
