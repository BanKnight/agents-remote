import { describe, it, expect } from "bun:test";
import { sanitizeSource, sanitizeSkillId, sanitizeSkillName, SkillError } from "./skill-process";

/** 断言输入会被拒且错误码是 SKILL_SOURCE_INVALID。 */
function expectInvalid(fn: () => unknown): void {
  try {
    fn();
    throw new Error("expected sanitizer to throw, but it did not");
  } catch (e) {
    expect(e).toBeInstanceOf(SkillError);
    expect((e as SkillError).code).toBe("SKILL_SOURCE_INVALID");
  }
}

describe("skill-process sanitizers", () => {
  describe("sanitizeSource", () => {
    it("accepts owner/repo", () => {
      expect(sanitizeSource("mattpocock/skills")).toBe("mattpocock/skills");
      expect(sanitizeSource("anthropics/skills")).toBe("anthropics/skills");
      expect(sanitizeSource("my-org.repo/the-skills")).toBe("my-org.repo/the-skills");
    });

    it("trims surrounding whitespace", () => {
      expect(sanitizeSource("  mattpocock/skills  ")).toBe("mattpocock/skills");
    });

    it.each([
      ["empty", ""],
      ["whitespace-only", "   "],
      ["missing slash", "mattpocock"],
      ["trailing slash", "mattpocock/"],
      ["leading slash", "/skills"],
      ["path traversal", "../etc/passwd"],
      ["double-dot segment", "mattpocock/../skills"],
      ["absolute path", "/etc/passwd"],
      ["three segments", "mattpocock/skills/tdd"],
      ["null byte", "mattpocock/ski\0lls"],
      ["space inside", "mattpocock /skills"],
    ])("rejects %s: %j", (_label, input) => {
      expectInvalid(() => sanitizeSource(input as string));
    });
  });

  describe("sanitizeSkillId / sanitizeSkillName", () => {
    it("accepts safe tokens (letters digits . _ -)", () => {
      expect(sanitizeSkillId("tdd")).toBe("tdd");
      expect(sanitizeSkillId("TDD")).toBe("TDD");
      expect(sanitizeSkillId("my-skill")).toBe("my-skill");
      expect(sanitizeSkillId("skill.name_v2")).toBe("skill.name_v2");
      expect(sanitizeSkillName("skill_3")).toBe("skill_3");
      expect(sanitizeSkillName("  tdd  ")).toBe("tdd");
    });

    it.each([
      ["empty", ""],
      ["slash", "foo/bar"],
      ["path traversal", "../x"],
      ["dot-slash", "./x"],
      ["space", "foo bar"],
      ["null byte", "foo\0bar"],
      ["colon", "foo:bar"],
    ])("rejects %s: %j", (_label, input) => {
      expectInvalid(() => sanitizeSkillId(input as string));
      expectInvalid(() => sanitizeSkillName(input as string));
    });
  });

  it("SkillError carries code + name", () => {
    const err = new SkillError("SKILL_INSTALL_FAILED", "boom");
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe("SKILL_INSTALL_FAILED");
    expect(err.name).toBe("SkillError");
    expect(err.message).toBe("boom");
  });
});
