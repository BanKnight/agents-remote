# Prototype UI alignment implementation

Use this reference when an implementation task asks to restore, align, reproduce, compare, or polish UI against a prototype, screenshot, design file, visual baseline, or version shared alignment contract.

This reference is often used together with `component-and-style-abstraction.md` and `react-frontend-implementation.md`.

## Inputs to confirm

- Prototype source path and whether it is more authoritative than screenshots.
- Required viewports, states, and artifacts.
- Acceptable and unacceptable differences.
- Capability or security boundaries that override visual parity.
- Missing API or product gaps that must be recorded rather than faked.

If these inputs are absent from `plan.md`, `tasks.md`, specs, design, docs, or version shared, pause and return to `plan-change` instead of improvising a visual target.

## Implementation method

1. Read the prototype source directly before editing user-facing UI.
2. Split visual work into structural parity, component mapping, token/style mapping, and scenario checks.
3. Preserve real data, permissions, runtime state, and API boundaries even when the prototype shows unavailable capability.
4. Implement only the states committed by the current task; record missing states or APIs in the task-defined follow-up artifact.
5. Use browser verification for user-visible changes; type checks and unit tests are not enough for visual alignment.
6. Preserve lessons that affect repeated prototype work in the task-defined shared artifact or project instructions, not only in the local code diff.

## During-implementation comparison loop

Do not rely on final verify to discover visual drift. During implementation, repeat this loop for each meaningful structure or style batch:

1. Re-open the relevant prototype HTML section and identify the specific shell, navigation, workspace, list, control, color, spacing, or responsive rule being matched.
2. Compare against the latest available prototype screenshot and app screenshot for the same viewport.
3. Make the smallest scoped code change that moves the app toward that target.
4. Re-check the affected HTML/screenshot area before moving to the next batch.
5. If a local browser screenshot can be regenerated cheaply, use it mid-implementation for high-risk layout changes such as desktop shell docking, mobile bottom navigation, scroll regions, or panel grouping.

If repeated comparison shows the task target is underspecified, pause and return to `plan-change`; do not continue from memory or aesthetic preference.

## Structural parity

- Compare layout regions first: shell, navigation, header, content, detail panes, toolbars, lists, sidebars, bottom navigation, and empty/error states.
- Preserve prototype hierarchy where it affects visual result, interaction, responsiveness, or reuse; do not copy markup structure blindly when React component boundaries make a cleaner equivalent.
- Check desktop and mobile separately when both forms exist in one prototype file.
- Treat gaps, docking, panel boundaries, scroll containers, sticky areas, safe-area behavior, bottom navigation attachment, active nav width, and primary action placement as behavioral layout commitments, not decorative details.

## Visual parity

- Map colors by role: background, shell surface, sidebar surface, workspace surface, header surface, bottom navigation, raised surface, dashed empty surface, inset surface, code/output surface, border, active navigation, primary action, secondary action, status, muted text, and destructive/warning state.
- When the prototype uses the same role across pages or navigation levels, reuse the same implementation token/class; do not tune Home and Project separately unless the prototype shows a real role difference.
- Map typography by hierarchy: route title, section title, row title, metadata, badges, buttons, and terminal/code text.
- Match density, spacing, radius, and shadow only within the task scope; avoid broad theme rewrites unless the task explicitly commits them.
- Avoid adding decorative effects that are not present in the prototype.

## Design-language abstraction checks

- Check horizontal reuse: pages or workspaces that share the same prototype language should consume the same layout, navigation, surface, row, control, status, and typography roles.
- Check vertical layering: shell, sidebar, workspace, header, bottom navigation, raised rows, dashed empty states, inset toolbars, code/output panels, danger, and warning states should have named roles instead of scattered route-local styling.
- Interaction affordances such as active width, hover/selected surface, cursor, focus, disabled state, and safe-area behavior are part of prototype parity; treat them as abstraction requirements when shared across levels.
- If a repeated mismatch appears during implementation, update the shared contract or project instruction before marking the task complete so later changes inherit the correction.

## Capability boundaries

- Do not fake data, logs, agent history, provider metadata, file/git capabilities, runtime output, or unavailable actions to make the UI look fuller.
- Disabled, hidden, or follow-up-gapped capability must remain honest to the real product state.
- If visual parity conflicts with a security, path-safety, permission, or runtime boundary, keep the product boundary and record the visual/product gap.

## Verification

- Capture or regenerate required screenshots, traces, logs, or visual artifacts named by the task.
- Inspect the actual browser result at the committed viewports.
- Verify primary paths plus responsive layout boundaries; for prototype work, manual screenshot inspection is a required signal unless the task explicitly provides another visual harness.
- Record remaining acceptable differences or follow-up gaps where the task requires it.
