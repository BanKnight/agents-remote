# Component and style abstraction implementation

Use this reference when an implementation task involves repeated UI structure, shared layout, reusable primitives, design-system extraction, style tokens, component-library boundaries, or refactoring route-local UI into reusable building blocks.

This reference is composable. For React prototype work, also load `prototype-ui-alignment.md` and `react-frontend-implementation.md` when their triggers apply.

## Abstraction test

Create or move an abstraction only when at least one condition is true:

- The same layout, navigation, surface, row, control, status, or interaction appears across multiple current pages or committed follow-up pages.
- The abstraction preserves a design-system or version shared commitment that later tasks must inherit.
- Route-local code is duplicating structure enough that future prototype alignment would drift.
- The abstraction hides real complexity from callers without hiding product behavior or data ownership.

Do not abstract only because code looks similar. Keep one-off UI local when it has no committed reuse path.

## Boundary rules

- Routes own data loading, route/search state, product copy, permissions, and page-specific behavior.
- Shared UI components own layout structure, visual variants, density, navigation patterns, surface treatment, and repeated interaction presentation.
- Navigation abstractions must include the whole clickable/presentational contract, not only item contents: wrapper width, active fill, icon marker, label density, hover/selected surface, mobile bottom behavior, and safe-area integration belong in the shared boundary when levels share the same visual language.
- Generated or external source components should stay at the base layer; project semantic wrappers should sit above them when local meaning matters.
- A design-system wrapper must make the common case easier without preventing one-off page-specific composition.

## Extraction workflow

1. Identify repeated regions from the task inputs before editing: shell, layout, navigation, panels, toolbars, buttons, badges, forms, list rows, terminal/output surfaces, or empty states.
2. Decide the target boundary before moving code: route-local helper, shared feature component, shell/component-library primitive, or base UI source component.
3. Move only the smallest stable unit that will be reused by the current task or explicitly committed follow-up tasks.
4. Keep props semantic and narrow; avoid passing raw class strings as the main API when a named variant or tone better expresses the design role.
5. Replace route-local duplicates with the shared component in the same task when that replacement is part of the commitment.

## Style abstraction

- Prefer named roles, variants, tones, density, and surface levels over scattering raw colors and spacing across routes.
- Treat color roles as part of the abstraction contract. If pages share shell/workspace/list/history/card primitives, they should share the same role classes or tokens instead of independently choosing darker/lighter route-local utilities; cover both horizontal reuse across pages/workspaces and vertical layers such as shell, sidebar, workspace, header, bottom nav, raised rows, dashed empties, inset toolbars, code/output, danger, and warning.
- Keep global token changes narrow and justified by the task; local wrapper variants are safer for change-specific alignment.
- Preserve existing project tokens, utility conventions, and generated component contracts.
- Avoid broad visual rewrites outside the task's prototype, page, or component boundary.

## Anti-patterns

- Leaving reusable shell, navigation, or primitive controls inside a route after multiple pages need them.
- Wrapping every element into a component without reducing duplication or clarifying responsibility.
- Creating a generic design system that is broader than the product currently needs.
- Hiding route behavior, data fetching, mutations, or permission decisions inside visual primitives.
- Recording an abstraction decision in docs or shared notes but not actually using the abstraction in implementation.

## Completion check

Before marking the task complete, confirm:

- The promised abstraction exists at the intended boundary.
- Current callers use it where the task committed reuse.
- The abstraction preserves prototype or design-system commitments.
- Route files did not retain duplicate local helpers that should have moved.
- Any intentionally deferred abstraction is recorded in the task-defined follow-up artifact.
