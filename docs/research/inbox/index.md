# research/inbox 索引

本层是 research 的**未定型区**：放置带调研但方案未定、尚未进入实现期的意图文档。

## 与 research 根的区别

- `docs/research/` 根：**已沉淀结论**——方案已定、可作为长期参考的调研。
- `docs/research/inbox/`：**未定型意图**——基础要素已对齐、调研已做，但技术方案未定、待深化。非沉淀结论。

## 治理规则

- 本区文档**不是长期结论**，引用时须标注"待深化"。
- 文档定型（方案定稿、进入实现期）后，须**迁出**：技术方案迁 `docs/research/` 根，行为契约迁 `docs/specs/`，并从本区删除。
- 本区不长期堆积：进入 roadmap / 完成深化即迁出或归档。

## 文档

- [llm-wiki-okf.md](./llm-wiki-okf.md) — llm-wiki / OKF 知识库调研（基础要素已对齐，待深化）：Karpathy LLM Wiki pattern（与 RAG 区别：一次性编译成持久 wiki 而非查询时检索）、Google OKF（Open Knowledge Format，2026-06-16，markdown+YAML 格式规范非工具、producer/consumer 分离）、选型结论不并入外部开源项目（consumer 侧自建轻量渲染层）、producer 工具 skill vs MCP 对比（用户倾向 MCP，待与 browser 统筹）。
- [embedded-browser.md](./embedded-browser.md) — 嵌入式浏览器调研（基础要素已对齐，待深化）：类 herdr-browser 在控制台内嵌入真实 Chromium + CDP 驱动 + 人可接管，核心场景为可视化 Agent 登录/爬虫操作与本地代码实时预览；herdr-browser 机制参考、与本项目 Web SPA 嵌入差异（渲染方式、移动端冲突、项目零基础）、待深化决策点（作用域/驱动方式/SPA 内渲染方式/移动端策略/MCP 通道复用）。