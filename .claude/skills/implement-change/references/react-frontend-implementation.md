# React frontend implementation

Use this reference when an implementation task modifies React components, routes, hooks, client state, data fetching, JSX structure, frontend tests, browser-visible behavior, or React styling.

This reference does not replace project or user-provided React guidance. If project instructions require another skill such as `vercel-react-best-practices`, load that skill as an additional constraint before editing.

## Project-first rules

- Follow the existing framework, routing, state, data fetching, styling, and test conventions.
- Keep route components responsible for route state, data ownership, mutations, permission checks, and page-specific behavior.
- Keep presentational components focused on rendering, visual variants, layout, and interaction presentation.
- Do not introduce new dependencies, state libraries, styling systems, or component libraries unless the current task explicitly commits them and dependency safety has been handled upstream.

## React implementation checks

- Keep components module-level; do not define reusable components inside render functions.
- Use derived values during render when they are pure; avoid effects for simple derivation.
- Use functional state updates when callbacks depend on previous state.
- Keep effect dependencies primitive and intentional; move interaction logic into event handlers when possible.
- Avoid memoization for trivial expressions, but use stable boundaries for expensive rendering or large lists when the task risk warrants it.
- Do not duplicate server-state fetching in multiple components when the project has a query/cache layer.

## Component and JSX structure

- Extract repeated UI into shared components only when the task or surrounding plan commits reuse.
- Keep component props semantic; avoid making callers know internal DOM or styling details.
- Keep accessibility attributes, labels, focus states, disabled states, and keyboard behavior intact when refactoring.
- Preserve real loading, empty, error, disabled, and permission states rather than replacing them with static prototype content.

## Styling

- Prefer existing tokens, utilities, generated source components, and local wrappers.
- Keep raw class changes scoped to the component or route being implemented unless the task commits a shared style abstraction.
- Ensure text, controls, and responsive layouts fit at required mobile and desktop viewports.
- Do not add visual-only wrappers that break semantic structure or accessibility.

## Verification

For React frontend tasks, run the local checks named by `tasks.md` or project scripts. For browser-visible changes, start or reuse the dev server and inspect the UI in a browser before reporting completion. Record any inability to run browser verification as a limitation instead of claiming success.

When a task also involves prototype alignment, follow `prototype-ui-alignment.md` for screenshot/artifact expectations.
