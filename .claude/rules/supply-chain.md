# 供应链安全规则

> 来源：22router `rules/supply-chain.md` 移植（2026-09-19 harness 改造 review 补齐）；pre-alpha 判据来自 22router M5e 实战教训（TanStack Charts 首版 4 天 + 官方明示 not ready for production → 换 recharts）。

## 依赖版本 ≥7 天

- **触发**：新增依赖、升级依赖、`bun install` 前。
- **动作**：核对最新版本的 npm 发布日，必须 ≥7 天；<7 天 → 降到次新且发布 ≥7 天的可用版本。工具：`/check-deps [包名]`。

## pre-alpha / 官方明示不可生产用 → 换库优先

- **判据（任一即触发换库）**：① README/badge 标 pre-alpha/alpha/beta；② 无 release 或 star/下载量极低；③ 官方声明 API 不稳定/勿生产用；④ <7 天选不到旧版本可降级。
- **三路核实**：npm registry 发布日 + GitHub repo 状态（star/release/issue）+ 官方文档稳定性声明，不只看一面。
- **豁免仅限「官方稳定但发布 <7 天」**（成熟库常规迭代、安全补丁），豁免时在 handoff/规则来源标注中记录。

## 其他

- 锁文件必须提交，不手改。
- 警惕 typosquatting（包名近似）：安装前核对包名与来源仓库。
- 涉及构建/部署的新依赖，实现完成后一并过 security-reviewer。
