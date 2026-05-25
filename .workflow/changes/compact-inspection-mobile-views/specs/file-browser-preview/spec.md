# file-browser-preview spec

本文件记录单个 change 对 `file-browser-preview` 的行为契约增量。

## Change 来源

- change-id：compact-inspection-mobile-views
- 来源意图：Files 页面在移动端的信息展示占用空间过多，需要更紧凑、更成熟的列表/查看表现方式。
- 规划来源：让只读 Files 查看在移动端更紧凑、可读，并减少列表/详情展示的空间浪费。

## ADDED Requirements

### Requirement: Files mobile listing uses compact scan-friendly rows

系统 SHALL 在手机窄屏 Project workspace 的 Files 入口中，以紧凑、可扫读的方式展示目录条目，减少单个条目和列表容器的垂直空间浪费。

#### Scenario: User reviews a directory on mobile

- **WHEN** 用户在手机窄屏打开 Project Files 并浏览目录
- **THEN** 系统展示紧凑的文件/目录列表行
- **AND** 每个条目仍能区分文件夹和文件
- **AND** 长文件名或长路径不会导致页面级横向溢出
- **AND** 用户不需要先滚过大块说明文本才能看到目录条目

### Requirement: Files mobile preview prioritizes selected content

系统 SHALL 在手机窄屏选择文件后优先展示所选文件的预览内容，同时保留必要的当前路径和返回列表上下文。

#### Scenario: User previews a text file on mobile

- **WHEN** 用户在手机窄屏从 Files 列表选择文本文件
- **THEN** 页面展示紧凑的所选文件上下文
- **AND** 文本预览区域占据主要可用空间
- **AND** 用户可以返回目录列表或选择其他文件
- **AND** 预览内容不被无关说明、装饰或过大的 metadata 区域挤压

### Requirement: Files mobile inspection remains read-only

系统 SHALL 在移动端紧凑化后继续保持 Files 只读观察边界，不新增文件系统写操作入口。

#### Scenario: User inspects Files compact mobile view

- **WHEN** 用户在手机窄屏查看 Files 列表或文件预览
- **THEN** 页面不展示编辑、删除、重命名、上传或下载入口
- **AND** 紧凑布局不通过隐藏菜单引入任何文件写操作

## MODIFIED Requirements

- （无）

## REMOVED Requirements

- （无）
