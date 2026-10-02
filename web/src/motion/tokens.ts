import type { Transition, Variants } from "motion/react";

// Motion design tokens — JS 侧单源（index.css :34 注释预留的本文件）。镜像
// styles/index.css :root 的 --ease-*/--duration-* 同名值：CSS 侧供纯 CSS 动画
// （skeleton-shimmer/msg-enter 等 keyframes）消费，本文件供 motion 组件消费，
// 两处必须同步改（motion-tokens.test.ts 一致性单测把关漂移）。

/** 贝塞尔缓动（cubic-bezier 四元组，与 CSS var --ease-* 同值）。 */
export const EASE = {
  /** 通用进出（--ease-standard）。 */
  standard: [0.4, 0, 0.2, 1],
  /** 强调型减速（--ease-emphasized）。 */
  emphasized: [0.2, 0, 0, 1],
  /** 退场加速（--ease-exit）。 */
  exit: [0.4, 0, 1, 1],
} as const;

/** 时长档（秒，motion 用秒；CSS 侧为 ms，换算关系 --duration-fast=120ms 等）。 */
export const DURATION = {
  fast: 0.12,
  base: 0.18,
  slow: 0.28,
} as const;

/**
 * Spring 预设（Apple 流体接口默认手感，docs/skill apple-design §4）：
 * 默认临界阻尼无过冲（bounce 0）；bounce 只给「手势本身带动量」的释放场景
 * （拖拽甩出/快速滑动），淡入类弹层过冲反而廉价。
 */
export const SPRING = {
  /** 默认：弹层开合、布局变化等状态驱动过渡。 */
  standard: { type: "spring", bounce: 0, duration: 0.35 },
  /** 快速小位移：popover/dropdown、小控件反馈。 */
  snappy: { type: "spring", bounce: 0, duration: 0.25 },
  /** 动量释放：拖拽甩出后的落位（手势速度交接用）。 */
  momentum: { type: "spring", bounce: 0.2, duration: 0.4 },
} as const satisfies Record<string, Transition>;

/** 列表首次挂载交错（容器/子项 variants 对；只用于首挂载，数据更新不重播）。 */
export const STAGGER = {
  container: {
    hidden: {},
    show: { transition: { staggerChildren: 0.04, delayChildren: 0.05 } },
  },
  /** fade + rise 6px；transition 走 MotionConfig 默认 spring。 */
  item: {
    hidden: { opacity: 0, y: 6 },
    show: { opacity: 1, y: 0 },
  },
} as const satisfies Record<string, Variants>;
