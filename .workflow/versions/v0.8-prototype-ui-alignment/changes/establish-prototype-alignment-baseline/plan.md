# plan

## Change 目标

- 本 change 要把本轮 prototype UI alignment 的横切约束落成 version shared 中的三份运行态材料：`alignment-contract.md`、`design-system-note.md`、`follow-up-gaps.md`。
- 完成后，后续 Home/Project、runtime detail、resource inspection 和最终 verify changes 都应先读取 shared，再进行页面级规格、设计、实现和验收。

## 局部 big picture

- `v0.8-prototype-ui-alignment` 的主要风险不是单页是否能改像原型，而是多个页面 change 对“像原型”“怎么抽象”“哪些差异可接受”各自解释，导致风格和验收标准漂移。
- 本 change 是该 version 的前置规范/抽象基线。它不实现页面 UI，而是把用户澄清出的横切规则转成可被后续 changes 消费和回写的 shared 材料。
- 后续页面 changes 必须依赖本 change 的产物；如果页面实现发现 shared 不准确，应回写 shared 或登记 follow-up gap，而不是在页面 change 中私有化新规则。

## 执行策略

- 先创建 `alignment-contract.md`，因为它定义后续所有页面 change 的验收口径和 artifacts 要求，是 downstream change 启动前的阻塞产物。
- 再创建 `design-system-note.md`，因为它定义后续实现阶段如何使用 tokens、shadcn/ui、lucide-react、console primitives 和状态边界。
- 再创建 `follow-up-gaps.md`，提供本 version 内记录缺失功能/API、原型冲突和后续版本候选的统一格式。
- 最后做一致性检查：三份 shared 文件必须覆盖 spec 中所有 requirement，并与 design 中的 UI/UX、frontend 和 risks 口径一致。
- 本 change 的 implementation 阶段只写 `.workflow/versions/v0.8-prototype-ui-alignment/shared/` 下的 Markdown 材料，不修改 `web/` 代码或长期 `docs/`。

## 任务顺序依据

- `alignment-contract.md` 阻塞后续页面验收标准，因此先写。
- `design-system-note.md` 依赖 contract 的 source priority、viewport、equivalence 和 artifacts 口径，但可以在 contract 初稿后独立完善。
- `follow-up-gaps.md` 需要引用 contract 中的 gap handling 规则，适合在前两份 shared 明确后再写。
- 一致性检查必须最后执行，因为它需要同时读取三份 shared 文件、spec 和 design。

## 额外上下文

- `docs/design/prototype/index.md`：确认 Prototype Map 中应覆盖的 HTML 原型文件。
- `docs/design/prototype/guidelines.md`：确认导航、布局、组件、配色、间距和移动端返回模型。
- `docs/design/frontend-ui-architecture.md`：确认三层页面模型、共享 UI primitive 边界、移动端直接二级/深层 detail 规则和最终 artifacts 要求。
- `docs/design/console-shell.md`：确认 Project console、Files/Git/Terminal direct secondary、PWA 外壳和不伪造 session 的边界。
- `docs/design/mobile-session-interaction.md`：确认 Agent/Terminal detail、input drawer、quick keys、contextual tools 和 Terminal focused shell 边界。
- `web/package.json`、`web/vite.config.ts`、`web/src/styles/index.css`：只用于记录当前 frontend 约束，不在本 change 修改。

## 依赖与阻塞

### 阶段依赖

- specs 已完成，design 已完成，本 change 可进入实现。
- 后续页面 changes 依赖本 change 的 shared 文件存在。

### 任务依赖

- `alignment-contract.md` 是 `design-system-note.md` 和 `follow-up-gaps.md` 的规则前置。
- `design-system-note.md` 和 `follow-up-gaps.md` 可以在 contract 初稿完成后并行起草，但最终一致性检查依赖三者全部完成。

### 外部依赖

- 无外部服务、权限、长驻进程或人工确认依赖。
- 不在本 change 安装 npm 包；shadcn/lucide 版本安全检查只记录为后续 implementation/page changes 的要求。

## 并行机会

- `design-system-note.md` 与 `follow-up-gaps.md` 可在 `alignment-contract.md` 初稿后并行编写，因为它们写不同文件且共享输入稳定。
- 最终一致性检查不可并行，必须在三份 shared 文件都完成后执行。

## 风险与验证重点

- 验证 `alignment-contract.md` 是否同时覆盖 Prototype Map、viewport、acceptable/blocking differences、artifacts 和 gap handling。
- 验证 `design-system-note.md` 是否明确 shadcn/ui、lucide-react、tokens、console primitives、不抽象清单、状态/路由边界和 `vercel-react-best-practices` 加载要求。
- 验证 `follow-up-gaps.md` 是否能被后续页面 changes 直接追加条目，并包含足够字段供后续 roadmap 查验。
- 避免把 HOW 进一步扩展成页面实现任务；本 change 只产出 shared Markdown。
- 避免在 shared 中写入长期 docs 结论口吻；这些材料仍是运行态基线，验证后再由 distill-change 判断是否沉淀。

## 不做事项

- 不修改 `web/`、`api/`、`packages/` 代码。
- 不安装或升级 shadcn/ui、lucide-react、Radix、Tailwind 相关依赖。
- 不新增页面截图 artifacts；页面截图由后续页面 changes 和最终 verify change 产出。
- 不直接更新 `docs/` 长期文档。
- 不新增功能/API，不伪造数据，不改变 runtime/session/Files/Git 能力边界。
