# prototype-assets-guidelines spec

本文件记录 `prototype-assets-guidelines` 的长期行为契约。它是主线 WHAT，不记录实现方案、任务拆解或单次 change 过程。

## Purpose

- 为 `docs/design/prototype/` 下 HTML 原型资产、总览入口、截图基线和设计规范建立长期可验证契约，避免后续 UI alignment 误用截图来源、viewport、页面结构或跨页面 token/component 基础。

## Requirements

### Requirement: Overview SHALL group every standalone prototype page with desktop and mobile iframe previews

`docs/design/prototype/overview.html` SHALL present each standalone prototype page as its own review section, and each section SHALL contain exactly two iframe previews: one desktop preview and one mobile preview for the same page.

#### Scenario: Overview covers the current prototype page set

- **WHEN** the current standalone prototype page set contains `home.html`, `project-detail.html`, `agent-session-detail.html`, `terminal-instance-detail.html`, `files.html`, `git.html`, and `terminal.html`
- **THEN** `overview.html` exposes 7 page sections and 14 iframe previews in total
- **AND** each page section labels the page and distinguishes the desktop iframe from the mobile iframe
- **AND** each page section links to the standalone page HTML

### Requirement: Overview SHALL be a review entry rather than the screenshot source

The prototype overview SHALL document and behave as a visual review entry for comparing page pairs, while formal prototype screenshots SHALL be captured by opening each standalone page HTML directly at the required viewport size.

#### Scenario: Screenshot source is unambiguous

- **WHEN** a reviewer or automation needs official prototype screenshots
- **THEN** the documented source is the standalone page HTML, not an iframe inside `overview.html`
- **AND** `overview.html` communicates that it is for overview/review only

### Requirement: Guidelines SHALL define concrete reusable visual tokens and component specs

`docs/design/prototype/guidelines.md` SHALL define concrete values for reusable prototype design tokens and component specs, including colors, sizes, shadows, spacing, radii, typography, navigation, surfaces, rows, buttons, status pills, inputs, terminal/code panels, and other cross-page primitives present in the prototypes.

#### Scenario: Prototype implementer reads visual values

- **WHEN** a future UI alignment change needs to match the HTML prototypes
- **THEN** the implementer can find concrete values or value ranges for color, size, shadow, spacing, radius, font, and component shape in `guidelines.md`
- **AND** the guidance is organized so future theme changes can map values through shared tokens rather than per-page one-off styles

### Requirement: Guidelines SHALL define desktop and mobile viewport standards

`docs/design/prototype/guidelines.md` SHALL state the standard desktop and mobile viewport sizes used for prototype screenshots and alignment review.

#### Scenario: Screenshot viewport is selected

- **WHEN** prototype screenshots are captured for the current prototype page set
- **THEN** the screenshot process uses the documented desktop and mobile viewport standards
- **AND** the same standards can be referenced by later app-vs-prototype alignment changes

### Requirement: Guidelines SHALL define responsive layout requirements

`docs/design/prototype/guidelines.md` SHALL define the responsive requirements for desktop, mobile direct secondary pages, and mobile deep/detail pages, including navigation placement, safe-area handling, content scroll behavior, and when bottom navigation must be hidden.

#### Scenario: Mobile direct and deep states are compared

- **WHEN** a prototype page includes a mobile direct secondary state and a deeper detail state
- **THEN** the guidelines identify which state displays bottom navigation and which state uses top return
- **AND** content overflow is expected to scroll without being covered by fixed navigation or input areas

### Requirement: Cross-page prototype reuse SHALL be represented through shared foundations

Prototype pages SHALL avoid scattering duplicated cross-page structure, style values, components, or tokens when those elements are shared across pages; shared prototype foundations SHALL be used or introduced for reusable shell, navigation, surface, row, status, action, input, terminal/code, typography, color, spacing, radius, and shadow patterns.

#### Scenario: A shared visual primitive appears in multiple pages

- **WHEN** a shell, navigation item, status pill, action button, list row, terminal surface, or design token appears in more than one prototype page
- **THEN** it is backed by a shared prototype foundation rather than unrelated per-page definitions
- **AND** page-specific differences remain explicit instead of hidden in duplicated styles

### Requirement: Prototype screenshots SHALL be refreshed to match the latest standards

The `docs/design/prototype/screenshots/` assets SHALL be refreshed for all standalone prototype pages using the documented desktop and mobile viewport standards, and the screenshots index SHALL describe the updated assets.

#### Scenario: Screenshot baseline is updated

- **WHEN** the prototype assets and guidelines are updated
- **THEN** every standalone prototype page has an updated desktop and mobile screenshot in `docs/design/prototype/screenshots/`
- **AND** `docs/design/prototype/screenshots/index.md` lists the refreshed screenshots with accurate descriptions

### Requirement: Prototype indexes SHALL reflect the refined asset model

The prototype documentation indexes SHALL describe the refined relationship between standalone page HTML files, `overview.html`, `guidelines.md`, and screenshots.

#### Scenario: Reader enters prototype docs

- **WHEN** a reader opens `docs/design/prototype/index.md` or `docs/design/prototype/screenshots/index.md`
- **THEN** the reader can determine which files are standalone page prototypes, which file is the overview/review entry, where the standards live, and where the official screenshots are stored

## Notes

- Concrete token, component, viewport, responsive, foundation and screenshot-source details live in `docs/design/prototype/guidelines.md` and `docs/design/prototype/index.md`.
- This spec does not require `overview.html` to match formal screenshot viewport dimensions; overview iframe sizing is review-only.

## 来源

- change：`.workflow/versions/v0.9-prototype-assets-guidelines/changes/refine-prototype-assets-guidelines/`
- verify 证据：`.workflow/versions/v0.9-prototype-assets-guidelines/changes/refine-prototype-assets-guidelines/verify.md`
