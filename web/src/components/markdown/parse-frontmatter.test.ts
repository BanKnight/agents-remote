import { test, expect } from "bun:test";
import { parseMarkdownFrontmatter } from "./parse-frontmatter";

test("无 frontmatter → null + 原 body", () => {
  const text = "# Title\n\nbody";
  expect(parseMarkdownFrontmatter(text)).toEqual({ frontmatter: null, body: text });
});

test("有 frontmatter → 解析字段 + 剥离 body", () => {
  const r = parseMarkdownFrontmatter("---\nname: obs\nlicense: MIT\n---\n# Title\n\nbody");
  expect(r.frontmatter).toEqual({ name: "obs", license: "MIT" });
  expect(r.body).toBe("# Title\n\nbody");
});

test("双引号 / 单引号值剥离", () => {
  const r = parseMarkdownFrontmatter("---\nname: \"obs\"\ndesc: 'x y'\n---\nbody");
  expect(r.frontmatter).toEqual({ name: "obs", desc: "x y" });
});

test("超长引号值完整保留 + body 正确", () => {
  const long = "A".repeat(500);
  const r = parseMarkdownFrontmatter(`---\ndescription: "${long}"\n---\nbody`);
  expect(r.frontmatter?.description).toBe(long);
  expect(r.body).toBe("body");
});

test("缺结束 --- → 视为无 frontmatter（原样返回）", () => {
  const text = "---\nname: x\n# body";
  expect(parseMarkdownFrontmatter(text)).toEqual({ frontmatter: null, body: text });
});

test("空 frontmatter（块内无字段）→ null + body 剥离", () => {
  const r = parseMarkdownFrontmatter("---\n---\n# body");
  expect(r.frontmatter).toBeNull();
  expect(r.body).toBe("# body");
});

test("非开头 --- → 不识别（frontmatter 必须在文档开头）", () => {
  const text = "# Title\n---\nname: x\n---\nbody";
  expect(parseMarkdownFrontmatter(text)).toEqual({ frontmatter: null, body: text });
});

test("frontmatter 后无正文 → body 为空串", () => {
  expect(parseMarkdownFrontmatter("---\nname: x\n---\n")).toEqual({
    frontmatter: { name: "x" },
    body: "",
  });
});

test("CRLF 换行也支持", () => {
  const r = parseMarkdownFrontmatter("---\r\nname: x\r\n---\r\n# body");
  expect(r.frontmatter).toEqual({ name: "x" });
  expect(r.body).toBe("# body");
});
