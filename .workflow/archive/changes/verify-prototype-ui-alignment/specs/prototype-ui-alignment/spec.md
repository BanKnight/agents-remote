# prototype-ui-alignment spec

本文件记录 `verify-prototype-ui-alignment` 对 `prototype-ui-alignment` 的行为契约增量。

## Change 来源

- change-id：verify-prototype-ui-alignment
- 来源意图：UI/UX prototype alignment 需要以 prototype screenshots 和真实浏览器检查作为验证证据，覆盖桌面端与移动端关键页面，记录与原型一致的结构点、可接受的视觉差异和仍需后续 polish 的偏差，避免只凭代码变更判断 UI/UX 已对齐。
- 规划来源：本 change 是 `v0.8-prototype-ui-alignment` 的收口验证 change，依赖 Home、Project Agent workspace、Agent/Terminal instance detail 和 Files/Git/Terminal resource pages changes 已完成。

## ADDED Requirements

### Requirement: Prototype alignment is verified through real browser evidence

系统 SHALL 使用真实浏览器验证 Web UI 与 `docs/design/prototype/` 的结构对齐结果，并保存可审查的桌面端和移动端证据。

#### Scenario: Alignment verifier runs against core pages

- **WHEN** 执行 prototype alignment 收口验证
- **THEN** 验证覆盖 Home / Project entry、Project Agent workspace、Agent detail、Terminal detail、Files、Git、Terminal workspace 的关键桌面端和移动端页面状态
- **AND** 每个关键页面至少保存截图、日志或等价 artifact
- **AND** 验证结果记录到本 change 的 artifacts 和 `verify.md`

#### Scenario: Browser evidence is reviewed later

- **WHEN** 后续 reviewer 查看本 change artifacts
- **THEN** 可以从截图或日志判断一级/二级导航、深层详情返回、Files/Git 只读边界、Terminal list/detail 分离和移动端导航互斥是否被覆盖

### Requirement: Alignment verification records acceptable differences and blocking deviations

系统 SHALL 在收口验证中区分结构对齐、可接受的视觉差异和阻塞性偏差，避免把非像素级差异误判为失败，也避免忽略导航或信息架构错误。

#### Scenario: Verifier finds structural alignment

- **WHEN** 页面符合三层页面模型、移动端返回模型、只读边界和 runtime input 边界
- **THEN** 验证可以记录为通过，即使存在细小 spacing、阴影、色值或 copy 差异

#### Scenario: Verifier finds structural mismatch

- **WHEN** 页面出现错误层级导航、移动端 deep detail 仍显示 Project 二级底部导航、Files/Git 出现写操作、Terminal workspace 出现 runtime input 或 Agent/Terminal detail 工具边界错误
- **THEN** 验证 SHALL 将该问题记录为 CRITICAL 或 WARNING
- **AND** 指明应回流到对应 page-level implementation 或 design change

## MODIFIED Requirements

- （无）

## REMOVED Requirements

- （无）
