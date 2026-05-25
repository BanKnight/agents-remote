# intents

本文件记录本 change 的来源：可能来自用户原始意图，也可能来自 roadmap 规划出的铺垫、验证、质量或治理工作。

## 来源意图

- 编号：6
  原始意图：Files / Git / Terminal resource pages 需要与 prototype 对齐：Files 首版保持只读浏览/预览，Git 首版保持只读 status/diff inspection，Terminal 二级页展示 terminal instances 并支持进入/新建/关闭；这些直接二级页遵守统一底部二级导航和深层详情顶部返回规则。

## 规划来源

- 类型：不适用
- 原因：本 change 直接承接用户原始意图。
- 支撑目标：完成 Project Console 中 Files、Git、Terminal 辅助工作区的结构、列表/详情和移动端导航规则对齐。
- 前置关系：依赖 align-ui-shell-foundation。

## 分配说明

- 所属 version：v0.8-prototype-ui-alignment
- 分配原因：Files/Git/Terminal 共享 resource inspection 和实例列表模型，适合在统一 shell 基础上作为一组用户可见工作区对齐。
