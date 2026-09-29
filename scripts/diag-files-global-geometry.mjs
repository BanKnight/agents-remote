// 一次性诊断：iPhone 视口 /files 全局文件页各层左缘几何（第三批反馈①「列表两侧边距不对」）。
import { chromium } from "@playwright/test";
import { readAppPassword } from "./lib/deploy-config.mjs";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "zh-CN" });
const page = await ctx.newPage();
await page.goto("http://localhost:43012/");
await page.waitForSelector('input[type="password"]', { timeout: 15000 });
await page.getByLabel("访问密码").fill(await readAppPassword());
await page.getByRole("button", { name: "登录" }).click();
await page.waitForSelector("nav[aria-label]", { timeout: 15000 });

// 直接去 /files（global + leftMode=files）
await page.goto("http://localhost:43012/files");
await page.waitForTimeout(1500);

const data = await page.evaluate(() => {
  const q = (sel) => document.querySelector(sel);
  const geom = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      left: +r.left.toFixed(1),
      right: +r.right.toFixed(1),
      width: +r.width.toFixed(1),
      top: +r.top.toFixed(1),
      ml: cs.marginLeft,
      mr: cs.marginRight,
      pl: cs.paddingLeft,
      pr: cs.paddingRight,
    };
  };
  const vw = document.documentElement.clientWidth;
  const h1 = q("h1");
  const sfield = q(".psearch");
  const cards = [...document.querySelectorAll(".gfcard")];
  const firstGfrow = q(".gfcard .gfrow");
  const firstGfrowText = firstGfrow ? firstGfrow.querySelector(".tx, .n") : null;
  const gfile = q(".gfile");
  const gfileP = q(".gfile .p");
  const cap = q(".gfcard ~ .cap, p.cap");
  // FilesPanel 滚动容器链（找 .gfcard 父链上 overflow auto 的层）
  const scrollChain = [];
  let node = cards[0];
  while (node && node !== document.body) {
    const cs = getComputedStyle(node);
    if (cs.overflowY !== "visible" || cs.paddingLeft !== "0px") {
      scrollChain.push({
        tag: node.tagName.toLowerCase(),
        cls: (node.className || "").toString().slice(0, 80),
        pl: cs.paddingLeft,
        pr: cs.paddingRight,
        ml: cs.marginLeft,
        overflowY: cs.overflowY,
        left: +node.getBoundingClientRect().left.toFixed(1),
        right: +node.getBoundingClientRect().right.toFixed(1),
      });
    }
    node = node.parentElement;
  }
  return {
    vw,
    h1: geom(h1),
    h1Text: h1?.textContent,
    sfield: geom(sfield),
    card0: geom(cards[0]),
    card1: geom(cards[1]),
    gfrow: geom(firstGfrow),
    gfrowText: geom(firstGfrowText),
    gfile: geom(gfile),
    gfileP: geom(gfileP),
    cap: geom(cap),
    scrollChain,
  };
});
console.log(JSON.stringify(data, null, 1));
await browser.close();
