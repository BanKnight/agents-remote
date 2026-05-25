# intents

本文件记录本 change 的来源：可能来自用户原始意图，也可能来自 roadmap 规划出的铺垫、验证、质量或治理工作。

## 来源意图

- 编号：4
  原始意图：Project Agent workspace 需要与 prototype 对齐：Project 内 Agent 二级页应展示多个 Agent instances，提供 `+ Claude` / `+ Codex` 创建入口，并以轻量列表行展示 session history，避免厚卡片和重复 metadata 降低首屏密度。

## 规划来源

- 类型：不适用
- 原因：本 change 直接承接用户原始意图。
- 支撑目标：完成 Project 默认工作区的 Agent instance 列表、provider 创建入口和历史记录呈现对齐。
- 前置关系：依赖 align-ui-shell-foundation；被 align-instance-detail-workspaces 依赖。

## 分配说明

- 所属 version：v0.8-prototype-ui-alignment
- 分配原因：Agent workspace 是 Project Console 的主要工作区，需要在共享二级导航基础上独立对齐并为 instance detail 入口提供上下文。
