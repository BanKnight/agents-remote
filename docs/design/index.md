# design 索引

UI 设计权威层：v1.5 设计包（Apple HIG 风格，iPhone/iPad/Mac 三端 116 页原型，全语义命名）+ v2 重构总纲。v1.5 核心变更：iPhone 三 Tab 化（工作台 Tab 退役）与会话页单 tab 化（行1 = ‹项目｜实例名▾●n｜[面板][⋯]，全屏无 tab bar）；文件预览容器矩阵（.fmeta 元信息行/pencil 编辑钮/⋯ 固定菜单/不支持预览空态）；历史规模化（三段计数筛选/服务端搜索/五档分组/游标分页/行删除）；项目管理（行菜单/重命名/删除 ☐ 磁盘文件）；浮层两族总则（§5.0 锚定浮卡 vs 边缘锚定）与指针规范（§7.2）；composer 附件；iPad 底部状态栏。

## 子目录

- [assets](./assets/) — 设计包共享资产：`components.css`（共享组件单源参考实现）、`tokens.css`（token 的 CSS 变量映射）、`icons.js`（SF Symbols 图标运行时）、`theme.js`（双主题运行时，data-theme 切换三通道）。

## 文档

- [design_spec.md](./design_spec.md) — v1.5 设计规格唯一权威：铁律、IA 总览（§2）、逐 Tab/逐页说明（§3–§4）、浮层两族总则（§5.0）、三端映射（§6）、设计语言与指针规范（§7）、数据模型（§8）、验收清单（§9）、旧号新名对照表（§10.2）、图集规范（§11）。
- [tokens.json](./tokens.json) — 设计 token 唯一数值源（color/radius/space/typography/icon/component 七组）；`$value`=浅色、`$extensions["mode.dark"]`=深色，语义名两态一致；禁止散落 HEX。
- [gallery.manifest.json](./gallery.manifest.json) — 图集规范单源（§11）：116 页语义名清单与分组，index.html 消费。
- [redesign-v2.md](./redesign-v2.md) — UI v2 重构总纲：权威源声明、决策日志、九铁律实现映射、现状能力盘点、关键代码锚点、里程碑计划与状态、待定项跟踪。
- [index.html](./index.html) — 原型图集导航入口：116 页原型索引（语义名 + 分组）+ 浅/深主题联动开关。
