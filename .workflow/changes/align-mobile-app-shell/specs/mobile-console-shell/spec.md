# mobile-console-shell spec

本文件记录 `align-mobile-app-shell` 对 `mobile-console-shell` 的行为契约增量。

## Change 来源

- change-id：align-mobile-app-shell
- 来源意图：移动端优先 App-like 体验、页面不溢出、参考 `docs/design/prototype.png` 的移动端设计气质但替换为本项目术语、降低首页低频创建/采用 Project 入口的常驻视觉占比。
- 规划来源：作为 `v0.5-mobile-ux-polish` 的第一步，为后续 Project 工作区、Session 控制台、Files/Git 移动视图提供统一移动端 shell 与页面密度基线。

## ADDED Requirements

### Requirement: Mobile console presents an app-like shell instead of a website-like page

系统 SHALL 在手机视口中以接近原生 App 的控制台外壳展示登录后页面，并让 Project、Agent Sessions、Terminal、Files、Git 等本项目概念替代原型中的通用占位说法。

#### Scenario: User opens the authenticated console on a mobile viewport

- **WHEN** 已认证用户在手机尺寸视口打开控制台
- **THEN** 页面呈现深色、全高、App-like 的控制台布局
- **AND** 主要入口使用本项目术语表达 Project、Agent Sessions、Terminal、Files、Git 等能力
- **AND** 页面不以传统网站大页头、大营销文案或大面积介绍块作为移动端首屏主视觉

#### Scenario: Prototype terminology does not match this project

- **WHEN** 实现者参考 `docs/design/prototype.png` 调整移动端层级或视觉气质
- **THEN** 可借鉴原型的暗色移动端信息层级
- **AND** 原型中的页面元素、命名和文案必须替换为本项目已定义的领域概念

### Requirement: Mobile pages avoid viewport-level overflow by default

系统 SHALL 让登录后移动端页面默认收敛在设备视口内，除明确需要滚动的内容区域外，不产生页面级横向溢出或因固定区域叠加导致的不可达内容。

#### Scenario: User opens primary console pages on a narrow mobile viewport

- **WHEN** 用户在窄手机视口打开 Project 列表、Project 控制台、Session 详情、Files 或 Git 页面
- **THEN** 页面主体不会超出视口宽度形成横向页面滚动
- **AND** 顶部、主体、底部导航或操作区共同占用的高度不会让核心内容被永久遮挡
- **AND** 需要滚动的列表、终端输出或详情内容在自己的可滚动区域内可访问

#### Scenario: Dynamic content is longer than the visible area

- **WHEN** 会话列表、文件列表、Git diff 或终端输出超过当前可视高度
- **THEN** 超出的内容通过明确的滚动区域访问
- **AND** 页面级 shell 仍保持当前 Project 或页面上下文可识别

### Requirement: Home low-frequency Project creation is visually de-emphasized on mobile

系统 SHALL 在移动端首页降低 “Create or adopt a Project” 这类低频入口的常驻视觉占比，同时保留用户创建或采用 Project 的可发现路径。

#### Scenario: User opens the mobile home page with existing Projects

- **WHEN** 用户在手机视口打开首页且存在 Project 列表
- **THEN** 首屏优先展示可进入的 Project 或最近工作上下文
- **AND** 创建或采用 Project 的入口保持可见或可发现，但不占据大面积首屏空间
- **AND** 首页页头不因品牌文案、说明文字或创建表单导致主要 Project 入口被明显下压

#### Scenario: User needs to create or adopt a Project on mobile

- **WHEN** 用户主动寻找创建或采用 Project 的能力
- **THEN** 系统提供清晰入口进入创建或采用流程
- **AND** 该流程仍能表达必要输入、校验结果和错误状态

### Requirement: Mobile-first shell keeps wider viewport compatibility

系统 SHALL 以移动端体验作为默认密度和层级基线，同时保持后续平板与桌面适配方向不被破坏。

#### Scenario: User opens the same console on a tablet or desktop viewport

- **WHEN** 用户在较宽视口打开登录后控制台页面
- **THEN** 核心导航语义与移动端保持一致
- **AND** 页面可以利用更宽空间展示辅助信息或并列区域
- **AND** 不要求用户在移动端、平板和桌面之间学习不同的产品概念

## MODIFIED Requirements

### Requirement: Prototype visual hierarchy is the default product reference

修改长期 `pwa-console-shell` 中的原型参考要求：本 change 明确原型只作为暗色移动端控制台气质、密度和层级参考，所有元素命名、页面概念与操作文案 SHALL 映射到本项目自己的 Project、Agent Session、Terminal、Files、Git 等领域术语。

#### Scenario: Prototype wording conflicts with project terminology

- **WHEN** 原型中的页面元素或文案与本项目术语不一致
- **THEN** 实际产品 SHALL 使用本项目术语
- **AND** 不把原型占位文案直接带入用户可见界面

## REMOVED Requirements

- （无）
