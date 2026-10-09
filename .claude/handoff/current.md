# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-10（**v1.6 真机反馈四联修完成（`62ad6e3` + 主 commit）：终端置顶 / 根名真实化 / 「..」同构 / 搜索展开同构——三探针扩展全绿，等用户真机验证**）

## 一句话状态

用户真机复验 v1.6 后逐条报出四个问题，一轮收敛修复完毕并 commit：①终端 ⋯ 菜单补「置顶」（UI 装配层两处 agent gate 退役）；②全局文件根目录名真实化（`rootPath` 数据链 + `rootDisplayName`，硬编码 "agents-remote" 退役）；③「..」上一级行同构（`ParentDirRow` 单源 + **path 非空判定**防一级子目录空串 parentPath 吞行）；④搜索展开同构（`CollapsibleSearchRow` 单源统一三处）。探针 3 组全绿（cwd-memory 15 / mobile header 56 / desktop batch4 42）、单测 api 905 + web 774 + shared 10、门禁 + CSS 硬闸 + tokens 全绿。

## 本 session 焦点（v1.6 真机反馈四联修）

### 关键决策（本阶段不可丢）

- **用户真机反馈即最终裁决**：①终端置顶缺失推翻 v1.5 review P3⑦「dot 语言归属 agent」旧口径——pinned 链路全程类型无关，唯二 gate 在 UI 装配层；②根名 "agents-remote" 是批 11 把原型示例占位当真实值落的硬编码，用户裁决为伪造数据（部署目录名因机器而异）。
- **「..」渲染判定坑（防回归）**：服务端 `parentProjectPath` 对一级子目录返回 `""`（dirname→"."）非 null——FilesPanel 按 `path !== ""` 判定（truthy 判定会吞行）；工具区既有 `parentPath !== null` 严格判空口径等价保留；探针 mock `parentOf` 对齐真实语义（A 层 → ""）端到端锁死。
- **探针 mock 正则教训**：pinned mock 原 `/pinned-sessions(\?.*)?$/` 锚 `$`，POST `/pinned-sessions/{id}` 不匹配 → **静默穿透真实后端吃 400**（菜单保持开假象误导排向 keepOpen 链路；诊断三步：PINNED_MOCK dump → 普通 click 对照 → pageerror/console 监听抓 400/404 实锤）→ 去 `$` 锚修。mobile 探针正则本就无锚（Part 12 一次绿）对照实锤。
- **搜索展开基准**：用户认可的全局文件形态 = `.psearch`（38px/r12 移动档）+ `.obtn.srch` ✕；`CollapsibleSearchRow` 单源三处消费；⌘F 聚焦 gate 留桌面常驻分支（searchInputRef 不动）；Wiki `.wsearch` 不动（用户只点名文件树）。
- **同 key 缓存共享**：GlobalFilesOverview 容器 `useQuery(["root","files"])` 与 FilesPanel 同 key → dedupe 零额外网络；fallback 用既有 `files.rootDirectory`（「服务器根」）不新增键；探针 mock 无 rootPath 字段自动走 fallback 不破存量探针。

### 进度（已完成 / 待办）

- ✅ 四项修复全部落地 + 主 commit（18 文件 +428/-120）+ `62ad6e3` CSS 残留单独提交。
- ✅ 探针扩展 3 组：cwd-memory（Part 1b 搜索同构 + Part 7 根名/「..」端到端）/ mobile header Part 12 / desktop batch4 Part 4b。
- ✅ 单测：api 905（listRootFiles rootPath 断言 + realpath 换算防 macOS 符号链接）/ web 774（+rootDisplayName 3）/ shared 10。
- ✅ redesign-v2.md 记档（§v1.6 真机反馈四联修段）+ 本 handoff。
- ⬜ push（下一步动作）。
- ⬜ 用户真机验证四项修复。
- ⬜（存量）统一真机复验清单其余项反馈；批 18 键盘取证（`DEBUG_ENABLED=true` 重建恢复浮层）。

## 易丢的关键上下文

- **v1.6 基线 = `2b25a6c`**；本轮四联修 = 主 commit + `62ad6e3`。
- useAutoRetryToggle 签名 `(projectName, sessionId, sessionType = "agent")` 不变；terminal/skill 聚焦零脏请求。
- FileCrumb 根态 = 图标 + `<b>{rootDisplayName(rootPath, t("files.rootDirectory"))}</b>`；子目录层根段 = 纯图标回根钮。
- `ParentDirRow` / `CollapsibleSearchRow` / `rootDisplayName` 三处新单源，消费点见 redesign-v2 §v1.6 四联修段。
- 探针跑前照例 touch main.tsx 等 rebuild + 特征串验证（本轮验了 rootPath 进包 + files.root 键消失双特征）。
- 批 18 键盘取证恢复方法：`web/src/lib/keyboard-debug.ts` `DEBUG_ENABLED=true` → touch main.tsx 重建。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-10-10 07:20；触发原因：v1.6 真机反馈四联修完成（三探针全绿 + 全门禁绿 + 记档），push 前检查点
