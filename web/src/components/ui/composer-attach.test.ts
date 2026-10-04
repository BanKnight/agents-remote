import { describe, expect, test } from "bun:test";
import { blobToBase64, needsImageReEncode } from "./composer-attach";

describe("composer attach pure helpers", () => {
  describe("needsImageReEncode", () => {
    test("达标 jpeg/png/webp 免重编码", () => {
      expect(needsImageReEncode({ mediaType: "image/png", width: 1200, height: 900 })).toBe(false);
      expect(needsImageReEncode({ mediaType: "image/jpeg", width: 1568, height: 1568 })).toBe(
        false,
      );
      expect(needsImageReEncode({ mediaType: "image/webp", width: 800, height: 600 })).toBe(false);
    });

    test("超最优长边 → 重编码", () => {
      expect(needsImageReEncode({ mediaType: "image/jpeg", width: 1600, height: 900 })).toBe(true);
    });

    test("不可直传类型（gif/heic）恒重编码", () => {
      expect(needsImageReEncode({ mediaType: "image/gif", width: 100, height: 100 })).toBe(true);
      expect(needsImageReEncode({ mediaType: "image/heic", width: 100, height: 100 })).toBe(true);
    });
  });

  describe("blobToBase64", () => {
    test("round-trip 多块拼接（跨 chunk 边界）", async () => {
      const bytes = new Uint8Array(0x8000 + 7);
      crypto.getRandomValues(bytes);
      const blob = new Blob([bytes]);
      const b64 = await blobToBase64(blob);
      const back = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      expect([...back]).toEqual([...bytes]);
    });
  });
});
