# 通用工程原则

> 来源：原 CLAUDE.md「调试第三方库 Bug」「参考实现研究方法」「通用工程原则」三节迁移（2026-09-19 harness 改造）。

## 1. 优先修改，克制新增

- 每新增一个实体（wrapper div、组件、变量、配置项），都带入了新的属性、新的交互边界和新的失效模式。系统复杂度随实体数量指数增长。
- 动手前先问：能不能改现有元素的 attribute/className/prop 完成同样目标？能不能把新行为折叠进现有结构？如果答案是"能"，就不要新增。
- **CSS 实例**：不要为全屏功能加 `WithFullScreen` wrapper 组件（它会变成新的 flex item、新的 containing block），直接在现有气泡上挂 `useState` + portal。
- **CSS 实例**：不要用 `min-h-11 min-w-11` 强制按钮尺寸，用 `p-2` 让内容决定大小——内容驱动的尺寸在不同上下文自然自适应。

## 2. 理解机制，再调参数

- 看到"位置不对""间距不对"时，先追溯因果链：当前值为什么会产生当前效果？哪个中间层（containing block、padding box、transform、flex alignment）在影响最终结果？
- 只有确认了根因，才能一次调对参数。靠反复加减数值试错，解决一个 case 的同时几乎必然破坏另一个。
- **CSS 实例**：`position: absolute; top: 0` 定位基准是祖先的 padding box 而非 border box——知道这层机制后，`py-1.5` 的 6px 偏移直接补 `-top-1`，一步到位。

## 3. 基础设施改变环境，不是只加功能

- 框架/库/模式在提供便利的同时，会静默修改它所包裹的整个子系统的运行环境。不能只看它"做了什么"，还要看它"改变了什么"。
- 引入基础设施前，追问：它注入了什么 DOM 结构？建立了哪些新的 CSS 层叠/定位关系？拦截或重写了哪些默认行为？
- **CSS 实例**：`@tanstack/react-virtual` 不仅"只渲染可见项"，还在每个 item 上注入 `position: absolute` + `transform: translateY()`。前者改变百分比宽度解析基准，后者使内部 `position: fixed` 不再相对视口——不事先理解这两层副作用，调试弹出的位置偏差几千像素是必然结果。

## 调试第三方库 Bug 的固定顺序

遇到第三方库 bug 时：① `tvly search` 查库的 issue → ② 找同样使用该库的开源项目参考实战解法（clone 到 `~/repos`）→ ③ 读 `node_modules` 源码验证机制 → ④ 一次性实现。不要靠猜测反复试错。

## 参考实现研究方法

- Claude Code CLI / SDK 等上游文档稀疏时，不要反复试探或盲猜协议格式。
- 优先通过 deepwiki 查询参考项目（如 hapi `tiann/hapi`）对同一问题的处理方式：协议消息格式、生命周期阶段、UI 呈现策略。
- 参考项目的源码已在 `~/repos/` 内，deepwiki 查不到的细节再用 grep 读源码补充。不要从零手动扫源码。
