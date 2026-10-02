import { LazyMotion, MotionConfig } from "motion/react";
import type { ReactNode } from "react";

import { SPRING } from "../motion/tokens";

/**
 * 动效基建（redesign-v2.md 动效体系批A）：
 * - LazyMotion + strict：特性包（domMax = domAnimation + gestures/layout，工作台
 *   layout 动画批D 需要）走**动态 import** 单独 chunk 异步加载——首屏不背动效运行时，
 *   加载完成前 m 组件以终态直出（无动画但永不坏）；strict 让误用全量 motion 组件直接
 *   抛错防体积回退，全站动效组件一律 `m.div` 而非 `motion.div`。
 * - MotionConfig reducedMotion="user"：JS 驱动动画尊重系统减弱动效（transform/layout
 *   自动禁用、保留 opacity），与 index.css 站点级 CSS 兜底（:600）双保险——该注释在
 *   CSS 侧预留已久，本组件即其落地。
 * - 默认 transition = SPRING.standard：未显式给 transition 的 m 组件走临界阻尼 spring。
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={() => import("motion/react").then((res) => res.domMax)} strict>
      <MotionConfig reducedMotion="user" transition={SPRING.standard}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}
