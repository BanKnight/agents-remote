# archive versions index

本文件索引已归档的 versions；归档内容本身保留在对应 version 目录中。

## 已归档 Versions

### version: v0.8-prototype-ui-alignment

- 归档日期：2026-05-29
- 归档路径：.workflow/archive/versions/v0.8-prototype-ui-alignment/
- 目标：建立 prototype UI alignment 共享基线，并逐页完成 Home/Project shell、Agent/Terminal detail、Files/Git/Terminal workspace 的 desktop/mobile 原型对齐与 release 收口验证。
- 包含 changes：
  - establish-prototype-alignment-baseline
  - align-home-project-shell
  - align-runtime-detail-workspaces
  - align-resource-inspection-workspaces
  - verify-prototype-alignment-release
- verify 结论摘要：所有 changes 均有 verify 证据；release 级 `verify-prototype-alignment-release` 汇总 Prototype Map 7 个条目的 artifacts、browser-log assertions、shared files 与 follow-up gaps，结论通过，无 CRITICAL/WARNING。
- distill 结论摘要：长期 UI architecture、console shell、mobile runtime/resource workspace 相关 docs 已按需补充证据来源；baseline shared 材料随 version 归档。

### version: v0.9-prototype-assets-guidelines

- 归档日期：2026-05-29
- 归档路径：.workflow/archive/versions/v0.9-prototype-assets-guidelines/
- 目标：规范化 HTML prototype 资产、总览展示、截图基线和设计规范，使后续 UI alignment 能依赖明确的页面结构、viewport、token、组件和跨页面公共抽象。
- 包含 changes：
  - refine-prototype-assets-guidelines
- verify 结论摘要：`refine-prototype-assets-guidelines` 已通过 verify；结构检查确认 overview 7 个 page sections、14 个 iframe、7 个 standalone HTML 均引用 `prototype-foundation.css`，截图采集日志和 PNG 尺寸检查确认 14 张正式截图匹配 desktop `1440x1000` / mobile `390x844`，`git diff --check` 通过，无 CRITICAL/WARNING。
- distill 结论摘要：长期 WHAT 已沉淀到 `docs/specs/prototype-assets-guidelines/spec.md`，`docs/specs/index.md` 与 `docs/project.md` 已同步；长期 HOW/asset 规范已在 `docs/design/prototype/guidelines.md`、`index.md`、`screenshots/index.md` 和 `prototype-foundation.css` 中原地沉淀。
