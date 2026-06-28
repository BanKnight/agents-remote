import { describe, expect, test } from "bun:test";
import { isExternalLink } from "./markdown-components";

const HOST = "agents.example.com";

describe("isExternalLink", () => {
  test("外部 https/http 链接 → true", () => {
    expect(isExternalLink("https://github.com/foo", HOST)).toBe(true);
    expect(isExternalLink("http://neverssl.com", HOST)).toBe(true);
  });

  test("同源 hostname（含端口/协议差异）→ false", () => {
    expect(isExternalLink("https://agents.example.com/x", HOST)).toBe(false);
    expect(isExternalLink("https://agents.example.com:8080/y", HOST)).toBe(false); // hostname 不含端口
    expect(isExternalLink("http://agents.example.com", HOST)).toBe(false); // 协议不同 hostname 同
  });

  test("子域 → true（不同 origin，新开合理）", () => {
    expect(isExternalLink("https://blog.example.com", HOST)).toBe(true);
  });

  test("协议相对 URL //cdn → true", () => {
    expect(isExternalLink("//cdn.example.com/x", HOST)).toBe(true);
  });

  test("非 http(s) 协议 → false（保持默认 a）", () => {
    expect(isExternalLink("mailto:a@b.com", HOST)).toBe(false);
    expect(isExternalLink("tel:+1555", HOST)).toBe(false);
  });

  test("相对路径 / anchor / 空串 / undefined → false", () => {
    expect(isExternalLink("/projects/abc", HOST)).toBe(false);
    expect(isExternalLink("#section", HOST)).toBe(false);
    expect(isExternalLink("", HOST)).toBe(false); // urlTransform 清空后的 href
    expect(isExternalLink(undefined, HOST)).toBe(false);
  });

  test("危险协议残留与非法 href → false（不抛）", () => {
    expect(isExternalLink("javascript:alert(1)", HOST)).toBe(false);
    expect(isExternalLink("http://[invalid", HOST)).toBe(false);
  });
});
