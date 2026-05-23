# plan

## 上下文清单

<!-- implement-change 启动前应读取这些路径。必须具体到文件或目录，不要只写“参考 docs”。 -->

### 运行态上下文

- `.workflow/changes/<change-id>/intents.md`：
- `.workflow/changes/<change-id>/specs/`：
- `.workflow/changes/<change-id>/design/`：
- `.workflow/changes/<change-id>/tasks.md`：

### 长期文档上下文

<!-- 按需列出本 change 实现需要遵循的长期 docs；如果无需读取，写明理由。 -->

- 是否需要读取长期 docs：是/否
- 读取或不读取理由：
- `docs/specs/...`：
- `docs/design/...`：
- `docs/architecture/...`：
- `docs/runbooks/...`：

### 代码上下文

<!-- 列出实现前必须阅读的关键代码目录或文件。 -->

- `src/...`：

## Change 概览

- change-id：
- 所属 version：
- 当前阶段：plan-change

## 输入依据

### Change 来源

- `.workflow/changes/<change-id>/intents.md`：

### 行为契约

- `.workflow/changes/<change-id>/specs/`：

### 设计依据

- `.workflow/changes/<change-id>/design/`：
- 如果没有 design，原因：

## 长期文档使用

<!-- 按需列出具体路径；如果无需读取长期 docs，写明原因。 -->

- 是否需要读取长期 docs：是/否
- 读取或不读取理由：
- `docs/specs/...`：
- `docs/design/...`：
- `docs/architecture/...`：
- `docs/runbooks/...`：

## 实现约束

<!-- 从 specs/design/docs 中提炼会影响实现的约束。 -->

- 

## 依赖分析

### 阶段依赖

<!-- 哪些阶段必须先完成，哪些可以后置。 -->

- 

### 任务依赖

<!-- 哪些任务依赖其他任务、spec、design 或长期 docs。 -->

- 

### 外部依赖

<!-- 第三方服务、配置、权限、数据、人工确认等。 -->

- 

## 实现策略

<!-- 说明实现顺序、关键路径、模块边界和依赖。 -->

- 

## 并行机会

<!-- 标明哪些任务可以并行，以及为什么不会互相阻塞。 -->

- 

## 任务拆解依据

<!-- 说明 tasks.md 为什么这样拆，如何覆盖 specs/design/docs。 -->

- 

## 风险与验证关注点

- 

## 不做事项

- 
