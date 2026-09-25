# 当前状态（current.md — 滚动更新）

> 最后更新：2026-09-25（**深度优化四批全闭环 + code-simplifier 终审清单全消化 `658e61c`**。批次 1 `f3482bb` / 2 `13bc633`+`9dd796e`+`4d77a2d` / 3 `77c24c3`+`06b2c7f`+`347dda2`+review `21111f1` / 4 `2bf5e55`+终审 `658e61c`。**下一步：①用户拍板 SessionDetailHeader 死 UI（§6.12m 条 8）②真机复验清单（见下）**。）
> 用法：`/handoff save` 更新本文件并把旧版归档到 `snapshots/`。compact 与 session 启动时由 hook 自动注入。

## 一句话状态

深度优化（「多端同构，减少冗余代码」+ big picture 精简）四批全部闭环：批次 3 检视双轨退役 + 编辑能力下沉三件套详情态（useFileEditor 单源）+ 批次 4 Wiki 归一 + code-simplifier 终审 11 条 + 低优先 4 项全消化（i18n 孤儿 139 key、FilesPanel 单模式化、ChatRow/审批/新建 prompt 收敛等，19 文件 +105/−478）。设计文档同步（铁律 7 修订 + §6.12m 十条）。全部验证绿。

## 本 session 焦点

批次 4 收尾闭环，模式 = **终审清单逐条核实（rg 消费计数）→ 消化 → typecheck 中途兜底 → 批末全套验证**。关键执行点：
- **i18n 孤儿批量删**：只读脚本生成零引用清单（无模板拼接判定）→ 确定性删行脚本删 en+zh（278 行逐 Edit 反而是注入风险点）→ TranslationKey/zh Record 双向类型护栏。**多行 value 格式（key 单独一行）单行正则漏删**——typecheck 报 missing 3 key 兜住，手工补删 5 处。
- **FilesPanel 单模式化**（终审 #4 完整形态）：非 rootBrowse 分支现存零调用方 → rootBrowse/projectName/onMobilePreviewChange 三 prop 删，`resolveRootBrowseTarget` 恒走，`joinRootBrowseDirectoryPath` 签名收窄，注释 rootBrowse 概念统一中文表述。
- **顺手修复**：ChatRow 的 ActionMenu cancelLabel 误传 rowMenuAria（aria 文案「对话操作」当取消按钮文案）→ `t("cancel")`。

## 关键决策（本阶段不可丢）

- **多端同构 = 代码同一份（用户拍板）**：三件套（project-tool-panels）双端共享，注册表（workbench-tab-plugin）单源；表现差异只在容器层。编辑能力经拍板保留并下沉三件套详情态（铁律 7 已修订记档）。
- **精简方法论贯穿四批**：优先删除其次合并最后才提取；reviewer 以精简为主标尺；批次 4 code-simplifier 热区终审收尾。
- **rootBrowse 单独立项**（用户拍板不在本轮）；GitFileDiffPanel 中栏保留（compare 专用语境）；§6.12m 条 6 评估不做两项（GitScopeChips/githead 展开）。
- **⚠️ 待用户拍板：SessionDetailHeader + detailView 全链死 UI**（§6.12m 条 8）——全部 PanelRouter 挂载点传 `embeddedHeader`，Files/Git 切换入口不可达，DetailWorkspace files/git 分支（含批次 3 换装）当前不可达。选项：A 整片删除 / B 恢复一个入口。批次 3 换装保留（形态正确，恢复入口即用）。
- `docs/design2/` 是用户目录不动。

## 进度（已完成 / 进行中 / 待办）

- ✅ 批次 1（`f3482bb`）：死代码清理 + 顺手 bug（chat 菜单 label/relativeTime/长按/TabContextMenu）
- ✅ 批次 2（`13bc633`+`9dd796e`+`4d77a2d`）：纯逻辑单源（useGlobalActivityRows/useComposerEnterPolicy/useApprovalCenter/formatAheadBehind/LargeTitleRow/MOBILE_SHEET_CLASSES/instanceRowMenuItems/query key 工厂/WS 单订阅）
- ✅ 批次 3（`77c24c3`+`06b2c7f`+`347dda2`+review `21111f1`）：useFileEditor 单源 + L3 编辑保存 + GitDiffPanel 退役（git-diff-viewer 1247→455 行）+ review 修复轮
- ✅ 批次 4（`2bf5e55`）：Wiki 归一（WikiPageDetail → L3WikiReader）
- ✅ 批次 4 收尾（`658e61c`）：code-simplifier 终审 11 条 + 低优先 4 项全消化 + 铁律 7 修订 + §6.12m 十条记档
- ✅ 验证：四门禁 + CSS 硬闸 + e2e 24/24 + 探针 m4 43/43、inspector ALL、file-save-scroll ALL、approvals 26/26、cwd-memory ALL、m9-b 16/16、m9-d 63/63
- ⬜ **用户拍板 SessionDetailHeader 死 UI**（A 删除 / B 恢复入口，§6.12m 条 8）
- ⬜ **交用户真机复验**（清单见下）
- ⬜ 单独立项（不在本轮）：rootBrowse 下沉；i18n 动词级 key 收敛；存量探针欠账；probe-chat-e2e 2 存量 FAIL

## 用户真机复验清单（深度优化四批）

**编辑链（新能力，重点）：**
1. 桌面右栏 files 段点文本文件 → 预览 →「编辑」→ 改内容 → 保存（「已保存」反馈 + ⌘S 快捷键 + 保存后列表 mtime 刷新）；改后不保存直接点其他文件 → dirty 丢弃确认
2. 移动 iPhone 项目工具态文件预览：meta 行「编辑 / 查看 diff ›」按钮**贴行右缘**（review 修复过 auto margin 平分 bug）；编辑态保存/完成流同上
3. md/html 文件：渲染态 ⇄「源码」/编辑切换正常（renderMode 重置 bug 已修）
4. L3 图片文件预览 → ImageViewer；超大文件 → 提示文案

**检视换装（形态变化，属预期）：**
5. 移动会话 focus 态 files/git tab = 工具面板形态（03o/03m），原检视面板（scope chips/branches 完整视图）不再出现；git 改动行 → 栏内 diff → 返回
6. Wiki：列表 → 阅读态（右栏/移动同一份 L3WikiReader）→ 返回；「让 Agent 读这篇」/复制链接按语境在
7. 审批中心「全部允许」两段确认（桌面 Popover / 移动 sheet 双端行为一致）

**杂项：**
8. chat 会话列表行菜单（右键/长按）：菜单取消按钮现在显示「取消」（原误显示「对话操作」）；新建文件夹 prompt（文件面板底部 links + 文件夹行菜单「新建到此」）两入口行为一致
9. 双主题（浅/深）下上述全部形态正常

## 阻塞 / 风险

- 无阻塞。dev 服务 tmux ar-dev 存活 43011/43012；`658e61c` 后已 touch main.tsx rebuild，`curl -sI` CSS = text/css。
- 右栏 files tab 点图片文件 = ImageViewer（批次 3 起 L3 详情态支持，不再是 unsupported 提示）。
- token 机检 report 模式存量 HEX（`#6b7280` 等）非本轮引入，M1 收紧时清。

## 易丢的关键上下文

- **探针跑法**：`bun scripts/probe-*.mjs`；跑前 touch main.tsx 完整 rebuild + sleep 16；e2e 用 `systemd-run --scope --user -p MemoryMax=2G bun run e2e "正则"`。
- **agent-browser 密码**：`PW=$(awk '/password:/ {print $2; exit}' ~/.agents-remote/config.yaml)` 进 shell 变量，不进上下文；断言用类名/aria 不用文案（探针须设 locale zh-CN）。
- **Edit 注入防护（本 session 又两次手滑：t() key 写错两处）**：单行小步 Edit + 落盘后 rg 机检 + typecheck 兜底；批量机械操作（278 行删）用确定性脚本比逐 Edit 更安全。
- **i18n 批删方法论（可复用）**：只读脚本生成零引用清单 → 无模板拼接判定 → 确定性删行脚本 → TranslationKey 类型护栏拦漏删（多行 value 格式 key 单独一行，单行正则匹配不到）→ 手工补。
- **route mock LIFO**：后注册先匹配；探针 mock 别挂宽泛 `git/.*`。preview 响应必带 mtimeMs。
- **右栏默认收起**：探针/e2e 加InitScript `localStorage.setItem("workbenchRightCollapsed","false")`。
- **基线对照法**：`git worktree add /tmp/ar-probe-baseline <旧 commit>` + 43099 独立端口 preview。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-09-25 19:05；触发原因：深度优化四批全闭环 + 终审清单消化（`658e61c`）+ handoff save
