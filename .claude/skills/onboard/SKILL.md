---
name: onboard
description: 主动恢复上下文。读 handoff/current.md + gtd/next-actions.md + rules/README.md，向用户复述"现在在哪、下一步干什么"。新 session、长时间中断后、或感觉丢了上下文时用。
---

# onboard — 快速恢复（Graph 导航）

## 流程

1. 读 `.claude/handoff/current.md`（最新状态；SessionStart hook 通常已注入）。
2. 读 `.claude/gtd/next-actions.md`（下一步）。
3. 浏览 `.claude/rules/README.md` 索引，确认相关规则已加载。
4. 需要项目 big picture 时读 `docs/project.md`（认知入口）。
5. 向用户**简洁复述**：一句话状态 + 当前焦点 + 下一步建议，并请求确认衔接。

## 何时用

- 新 session 启动（SessionStart hook 自动注入 current.md；本命令做完整主动恢复）。
- 长时间中断后、感觉上下文丢失、用户说"继续"但情况不明。

## 原则

- 复述要短，不照搬全文；只点关键，让用户快速回到状态。
