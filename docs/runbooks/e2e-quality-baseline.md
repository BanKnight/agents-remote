# E2E quality baseline runbook

本文件记录本地运行和排查自动化 E2E quality baseline 的操作手册。

## 适用场景

- 修改登录、Project、Session Runtime、WebSocket stream、Terminal Session 或 Session Detail 后，需要验证跨 `web + api + tmux` 的核心链路。
- 本地复现 CI/E2E 失败。
- 人工测试前需要快速确认基础 runtime 链路没有断裂。

## 前置条件

- 已安装项目依赖：`bun install`。
- 本机可运行 `tmux` 和默认 shell。
- Playwright Chromium 已安装；首次运行如提示缺少 browser，执行：`bun x playwright install chromium`。
- 当前工作区没有依赖真实用户 Project 或生产 runtime dir；E2E runner 会创建临时 `PROJECTS_ROOT` 和 runtime dir。

## 操作步骤

1. 在仓库根目录运行：

   ```bash
   bun run e2e
   ```

2. 等待 runner 自动完成：
   - 创建临时 Project 和 runtime dir。
   - 启动 `api` dev service。
   - 启动 `web` dev service。
   - 使用 Playwright 打开浏览器并执行 Terminal Session smoke。
   - 清理子进程和临时目录。

3. 如果需要连同常规质量门禁一起验证，运行：

   ```bash
   bun run format:check && bun run lint && bun run typecheck && bun run test && bun run build && bun run e2e
   ```

## 验证方式

- 成功时 `bun run e2e` 输出 Playwright `1 passed`，命令返回 0。
- Terminal smoke 的核心成功条件是输出中出现确定性字符串 `e2e-terminal-baseline-ok`。
- API/Web service logs 会写入当前 change 的 artifacts 或 runner 配置的 E2E artifact 目录。

## 回滚 / 恢复

- 如果 Playwright browser 缺失：运行 `bun x playwright install chromium` 后重试。
- 如果 `tmux` 缺失：安装 tmux 后重试；不要把 Terminal runtime path mock 成通过。
- 如果 E2E 中断后怀疑残留进程：检查本地 dev service 和 tmux session，必要时按测试 session 名清理。
- 如果失败后需要定位浏览器状态：查看 `test-results/e2e/playwright-results` 和 `test-results/e2e/playwright-report`。

## 风险与注意事项

- E2E 使用真实 tmux/shell runtime，运行环境差异可能导致失败；优先查看 api/web logs 和 Playwright trace。
- `test-results/` 是 transient 输出目录，不应提交。
- 不要在 E2E runner 中使用真实用户 Project 或生产 runtime dir。
- 第一条 baseline 不覆盖真实 Claude/Codex CLI；Agent provider E2E 需要单独设计。

## 来源

- change：setup-e2e-quality-baseline
- verify / 事故 / 迁移证据：`.workflow/changes/setup-e2e-quality-baseline/verify.md`
