// @vitest-environment jsdom

// push.ts 单测（PWA 通知批）。覆盖两块：
// ① urlBase64ToUint8Array 的 base64url 解码边界（VAPID 公钥形态）：无 padding 自动补齐、
//    -/_ 字符映射回 +//、输出长度与字节值。独立参照 = Buffer.from(input, "base64url")
//    （bun 内建 base64url 编解码，与被测实现的 replace+atob 路径不同源）。
// ② 支持性 gate 在 jsdom 下的降级契约：jsdom 无 navigator.serviceWorker 且非
//    standalone → canUsePush() 必须 false、getPushSubscription() 必须回 null（UI 层据此
//    显降级提示，不允许抛错）。
//
// client.ts 顶层无 window 访问（全部在函数体内），push.ts 静态 import 安全；
// window 只需在测试运行前建好（canUsePush 经 display-mode 读 window.matchMedia）。
import { describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://app.example/" });
// 本 jsdom 版本不实现 matchMedia，而 display-mode 的 standalone 判定第一跳就是它——
// stub 恒 false（测试环境语义 = 非 standalone）。
dom.window.matchMedia = (() => ({ matches: false })) as unknown as typeof dom.window.matchMedia;
globalThis.window = dom.window as unknown as Window & typeof globalThis;

import { canUsePush, getPushSubscription, urlBase64ToUint8Array } from "./push";

describe("urlBase64ToUint8Array", () => {
  test("标准 base64（带 padding）解码：输出长度与字节值正确，与 atob 对照", () => {
    const out = urlBase64ToUint8Array("SGVsbG8=");
    expect(out).toBeInstanceOf(Uint8Array);
    expect(out.length).toBe(5);
    // "Hello" 的字节序列。
    expect(Array.from(out)).toEqual([72, 101, 108, 108, 111]);
    // 与 atob 原生解码路径逐字节对照。
    const viaAtob = Array.from(atob("SGVsbG8="), (c) => c.charCodeAt(0));
    expect(Array.from(out)).toEqual(viaAtob);
  });

  test("无 padding 输入自动补齐（VAPID 公钥常态：65 字节 = 87 字符）", () => {
    // 用 Buffer 生成一段 65 字节的确定性字节流与其 base64url 形态（模拟真实
    // applicationServerKey：P-256 未压缩公钥 65 字节、编码后无 padding）。
    const bytes = new Uint8Array(65).map((_, i) => (i * 37 + 11) % 256);
    const key = Buffer.from(bytes).toString("base64url");
    expect(key).not.toContain("=");

    const out = urlBase64ToUint8Array(key);
    expect(out.length).toBe(65);
    // 独立参照：Buffer 的 base64url 解码（与实现的补 padding + replace + atob 不同源）。
    expect(Array.from(out)).toEqual(Array.from(Buffer.from(key, "base64url")));
  });

  test("含 - 与 _ 字符正确映射回 + 与 /", () => {
    // 字节 [251, 255, 190] 的标准 base64 是 "+/++"（含 62/63 两个越界字符），
    // base64url 形态即 "-_--"。
    expect(Buffer.from([251, 255, 190]).toString("base64")).toBe("+/++");
    expect(Buffer.from([251, 255, 190]).toString("base64url")).toBe("-_--");

    const out = urlBase64ToUint8Array("-_--");
    expect(out.length).toBe(3);
    expect(Array.from(out)).toEqual([251, 255, 190]);
  });

  test("返回值是 ArrayBuffer 背书的 Uint8Array（BufferSource 契约）", () => {
    const out = urlBase64ToUint8Array("SGVsbG8=");
    expect(out.buffer).toBeInstanceOf(ArrayBuffer);
    expect(out.buffer.byteLength).toBe(5);
  });
});

describe("支持性 gate（jsdom：非 standalone 且无 serviceWorker）", () => {
  test("canUsePush 返回 false", () => {
    // 前置确认测试环境确实缺能力：jsdom 的 navigator 无 serviceWorker。
    expect("serviceWorker" in globalThis.navigator).toBe(false);
    expect(canUsePush()).toBe(false);
  });

  test("getPushSubscription 降级为 null（不抛错）", async () => {
    expect(await getPushSubscription()).toBeNull();
  });
});
