import { describe, expect, test } from "bun:test";
import type { TranslateFn } from "../../i18n/types";
import {
  ApiClientError,
  UPLOAD_NETWORK_ERROR_CODE,
  UPLOAD_RESPONSE_TIMEOUT_CODE,
} from "../../api/client";
import type { ComposerAttachment } from "./composer-attach";
import {
  attachmentStatusLine,
  base64Bytes,
  blobToBase64,
  classifyAttachment,
  describeUploadError,
  isInlineTextFile,
  needsImageReEncode,
} from "./composer-attach";

// 最小 stub：key 原样返回 + params JSON 化（单测只锁「走了哪个键/参数」，不锁真实文案）。
const t: TranslateFn = (key, params) => (params ? `${key}?${JSON.stringify(params)}` : key);

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

  describe("base64Bytes", () => {
    test("裸 base64 换算回字节（4 字符 = 3 字节，floor）", () => {
      expect(base64Bytes("")).toBe(0);
      expect(base64Bytes("aGk=")).toBe(3);
      expect(base64Bytes("aGVsbG8=")).toBe(6);
    });
  });

  describe("isInlineTextFile（批 8 附件双路径分流）", () => {
    const mb = 1024 * 1024;
    test("白名单扩展名 ≤1MB → 内联", () => {
      for (const name of ["a.txt", "b.md", "c.csv", "d.json", "e.log", "F.JSON"]) {
        expect(isInlineTextFile({ name, size: 100 })).toBe(true);
      }
    });
    test("恰 1MB 边界 → 内联（≤ 判定含边界）", () => {
      expect(isInlineTextFile({ name: "edge.txt", size: mb })).toBe(true);
    });
    test("超 1MB → uploads 路径", () => {
      expect(isInlineTextFile({ name: "big.log", size: mb + 1 })).toBe(false);
    });
    test("非白名单扩展名恒 uploads（含无扩展名/近形扩展）", () => {
      expect(isInlineTextFile({ name: "doc.pdf", size: 10 })).toBe(false);
      expect(isInlineTextFile({ name: "bin", size: 10 })).toBe(false);
      expect(isInlineTextFile({ name: "tsconfig.jsonc", size: 10 })).toBe(false);
    });
  });

  describe("classifyAttachment（批 8 三路分流单源：pick 占位与 addFiles 共用）", () => {
    test("image/* 直传 / 白名单小文本内联 / 其余 uploads", () => {
      expect(classifyAttachment({ type: "image/png", name: "a.png", size: 10 })).toBe("image");
      expect(classifyAttachment({ type: "", name: "a.txt", size: 10 })).toBe("text");
      expect(classifyAttachment({ type: "application/pdf", name: "a.pdf", size: 10 })).toBe("file");
    });
  });

  describe("describeUploadError（XHR 真进度批：失败文案细分单源）", () => {
    test("超限 → tooLarge（服务端 PROJECT_FILE_UPLOAD_TOO_LARGE 同码透传）", () => {
      const err = new ApiClientError("upload failed: 413", "PROJECT_FILE_UPLOAD_TOO_LARGE");
      expect(describeUploadError(err, t)).toBe("claude.attach.tooLarge");
    });
    test("网络中断 → networkError（客户端哨兵码）", () => {
      const err = new ApiClientError("upload failed", UPLOAD_NETWORK_ERROR_CODE);
      expect(describeUploadError(err, t)).toBe("claude.attach.networkError");
    });
    test("响应超时 → timeout（客户端哨兵码）", () => {
      const err = new ApiClientError("upload failed", UPLOAD_RESPONSE_TIMEOUT_CODE);
      expect(describeUploadError(err, t)).toBe("claude.attach.timeout");
    });
    test("服务端业务码 → failed 兜底", () => {
      const err = new ApiClientError("upload failed: 500", "PROJECT_FILE_NOT_FOUND");
      expect(describeUploadError(err, t)).toBe("claude.attach.failed");
    });
    test("非 ApiClientError → failed 兜底", () => {
      expect(describeUploadError(new Error("boom"), t)).toBe("claude.attach.failed");
    });
  });

  describe("attachmentStatusLine（上传期/等待响应/失败三态）", () => {
    test("file uploading：百分比文案（progress 在场）", () => {
      const a = { kind: "file", status: "uploading", progress: 42 } as const;
      expect(attachmentStatusLine(a, t)).toBe('claude.attach.uploadingPercent?{"percent":42}');
    });
    test("file uploading 无 progress → uploading 文案；awaiting → processing", () => {
      expect(
        attachmentStatusLine({ kind: "file", status: "uploading" } as ComposerAttachment, t),
      ).toBe("claude.attach.uploading");
      expect(
        attachmentStatusLine({ kind: "file", status: "uploading", awaitingResponse: true }, t),
      ).toBe("claude.attach.processing");
    });
    test("error 态：file 用 errorMessage 细分；image 维持 processFailed", () => {
      expect(
        attachmentStatusLine(
          { kind: "file", status: "error", errorMessage: "boom msg" } as ComposerAttachment,
          t,
        ),
      ).toBe("boom msg");
      expect(attachmentStatusLine({ kind: "file", status: "error" } as ComposerAttachment, t)).toBe(
        "claude.attach.failed",
      );
      expect(
        attachmentStatusLine({ kind: "image", status: "error" } as ComposerAttachment, t),
      ).toBe("claude.attach.processFailed");
    });
    test("ready 态返回 null（调用方渲染就绪信息）", () => {
      expect(
        attachmentStatusLine(
          { kind: "file", status: "ready", path: "uploads/a.txt" } as ComposerAttachment,
          t,
        ),
      ).toBe(null);
    });
  });
});
