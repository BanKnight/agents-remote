# design 索引

UI 设计权威层：v1.4 设计包（Apple HIG 风格，iPhone/iPad/Mac 三端 75 页原型）+ v2 重构总纲。v1.4 核心变更：会话输入区 composer 单源重构并全端铺开（停止/发送同位互斥、窄端三彩色图标、宽端 pill + ≥3 行）、检视面板定案（动态标签条 03o/03ob2 + 链接直达 03ab）、文件浏览行结构定案（03oa，行3 与常驻搜索框废弃）、文件/Git 操作原型补全（03w2-4/03m2/03m3）、检视器深层返回动线 04f。

## 子目录

- [assets](./assets/) — 设计包共享资产：`components.css`（共享组件单源参考实现）、`tokens.css`（token 的 CSS 变量映射）、`icons.js`（SF Symbols 图标运行时）、`theme.js`（双主题运行时，data-theme 切换三通道）。

## 文档

- [design_spec.md](./design_spec.md) — v1.4 设计规格唯一权威：九条铁律、IA 总览、L0–L3 逐页说明、浮层清单、三端适配映射、§7 设计语言、§8 数据模型、§9 验收清单。
- [tokens.json](./tokens.json) — 设计 token 唯一数值源（color/radius/space/typography/icon/component 七组）；`$value`=浅色、`$extensions["mode.dark"]`=深色，语义名两态一致；禁止散落 HEX。
- [redesign-v2.md](./redesign-v2.md) — UI v2 重构总纲：权威源声明、23 条决策日志、九铁律实现映射、现状能力盘点、关键代码锚点、M0–M10 里程碑计划与状态、待定项跟踪。
- [index.html](./index.html) — 原型图集导航入口：75 页原型索引 + 浅/深主题联动开关。
