---
name: check-deps
description: 依赖供应链体检。查指定包（或 package.json 全部依赖）的发布日，<7 天则提示降级到次新可用版本。添加/升级依赖前用。
---

# check-deps — 供应链体检（Loop）

依据：constitution 第 3/5 条质量与进化底线；规则细节见 `.claude/rules/verification.md`。

## /check-deps [包名...]

- 无参数：读项目 `package.json` 及 workspaces 的全部依赖，逐一查。
- 有参数：查指定包。

## 查询方法

- npm registry：`https://registry.npmjs.org/<包>` 的 `time` 对象，取各版本发布时间（首选，可用 curl + jq）。
- 或用 `tvly search "<包> npm publish date"` 辅助核对。

## 判定与输出

- 最新版本发布 ≥7 天 → ✅ 通过。
- 最新版本发布 <7 天 → ⚠️ 找次新且发布 ≥7 天的可用版本，建议降级，给出具体版本号。
- 每个包一行：`包名 | 最新版本(发布日) | 判定 | 建议`。

## 原则

- 手动工具（不做 hook 拦截，依用户决策）；添加依赖前自觉调用。
- 若发现新风险模式 → 触发 `/evolve` 更新规则库。
