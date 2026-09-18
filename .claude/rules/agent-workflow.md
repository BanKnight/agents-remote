# Agent 工作流规则

> 来源：22router harness 模式移植（2026-09-19，harness 改造）。

## handoff 节奏

- **何时 save**：完成一个 next-action、到达里程碑、阶段收尾、用户切换话题、感知到 context 接近上限。
- **save 内容**：更新 `.claude/handoff/current.md` 的"一句话状态 / 本 session 焦点 / 关键决策 / 进度 / 阻塞 / 易丢上下文"，旧版先归档到 `snapshots/`。
- **restore 时机**：session 启动（hook 自动注入）、compact 后（hook 自动注入）、长时间中断后（手动 `/onboard`）。

## GTD 节奏

- 任何新需求 / 想法先进 `.claude/gtd/inbox.md`，不直接开干。
- 开干前读 `.claude/gtd/next-actions.md`，明确本次推进哪条。
- 定期 `/gtd review`：清 inbox、更新 next-actions、重评 someday。

## reviewer 触发时机

- 写完功能 → **code-reviewer**（正确性/简化/效率）。
- 涉及路径处理 / 命令执行 / 鉴权 / 外部输入 / 密钥 → **security-reviewer**（PROJECTS_ROOT 边界、argv、注入、密钥泄露）。
- 涉及 UI / 交互 / 视觉 → **design-reviewer**（标尺：`docs/design/DESIGN.md` + `frontend-notes.md` token 契约）。
- 涉及渲染热路径 / WS 流处理 / 长会话回放 / bundle 体积 → **perf-reviewer**。

委托 reviewer 时限定具体问题与输出结构（按严重度排序的 `文件:行` 清单），防止审查报告膨胀。

## compact 前必做

- `/handoff save`，确保 `current.md` 反映最新状态。PreCompact hook 会再注入一次，但不能替代主动 save。
