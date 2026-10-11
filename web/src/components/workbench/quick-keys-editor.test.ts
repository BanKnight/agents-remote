import { describe, expect, test } from "bun:test";

import { sessionQuickKeys } from "../../routes/console-model";
import { applyQuickKeyOrder } from "./quick-keys-editor";

/** applyQuickKeyOrder（order 归一化纯函数）：快捷键条渲染与编辑面板共用的单一管道。 */
describe("applyQuickKeyOrder", () =>
  test("空 order = 默认序原样返回", () => {
    const keys = sessionQuickKeys("terminal");
    expect(applyQuickKeyOrder(keys, [])).toEqual(keys);
  }));

test("部分 order：已知键按存储序排前，缺失键按默认序尾补", () => {
  const keys = sessionQuickKeys("terminal");
  expect(applyQuickKeyOrder(keys, ["escape"]).map((k) => k.id)).toEqual([
    "escape",
    "shifttab",
    "interrupt",
    "eof",
    "up",
    "down",
    "left",
    "right",
  ]);
});

test("乱序 order 全序重排", () => {
  const keys = sessionQuickKeys("terminal");
  expect(
    applyQuickKeyOrder(keys, [
      "up",
      "down",
      "left",
      "right",
      "eof",
      "interrupt",
      "escape",
      "shifttab",
    ]).map((k) => k.id),
  ).toEqual(["up", "down", "left", "right", "eof", "interrupt", "escape", "shifttab"]);
});

test("多余 order id（不存在于 keys）忽略", () => {
  const keys = sessionQuickKeys("terminal");
  const out = applyQuickKeyOrder(keys, ["nonexistent", "up"]);
  expect(out.map((k) => k.id)).toEqual([
    "up",
    "shifttab",
    "escape",
    "interrupt",
    "eof",
    "down",
    "left",
    "right",
  ]);
});
