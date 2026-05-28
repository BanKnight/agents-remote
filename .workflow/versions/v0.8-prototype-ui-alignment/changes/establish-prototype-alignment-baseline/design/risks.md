# Risks Design

## Change

- change-id：establish-prototype-alignment-baseline

## 主要风险

- Shared materials may become stale if page changes privately diverge from them.
- The baseline may become too broad and delay page work if it tries to solve every design-system question before implementation.
- shadcn/ui defaults may override the prototype's dark Server Agent Console visual language.
- New npm dependencies may be too recent or larger than necessary if added without minimal component selection.
- Prototype HTML and React implementation can differ structurally, so brittle DOM/class assertions would create false failures.
- Missing APIs or future capabilities may be accidentally disguised as real functionality if follow-up gaps are not enforced.

## 跨子域权衡

- Centralized shared contracts improve consistency, but they must remain thin enough for later changes to update.
- Visual equivalence is more maintainable than pixel-perfect matching, but blocking differences must be explicit to avoid subjective review.
- shadcn/ui increases accessibility and interaction quality, but its default aesthetic must be subordinated to project tokens and wrappers.
- Keeping current routing/state boundaries lowers regression risk, but minimal route/search changes must remain allowed for mobile navigation correctness.

## 依赖与阻塞

- Page changes are blocked until `alignment-contract.md` and `design-system-note.md` exist.
- Implementation that introduces shadcn/ui or lucide-react must re-check npm metadata and supply-chain status at that time.
- If package latest versions are still within the 7-day window, plan-change must either choose safe older versions or ask for explicit confirmation.
- If current code lacks required route or layout hooks for prototype navigation, the affected page change must record the gap or propose a minimal adjustment.

## 验证建议

- Verify that shared files exist before any downstream page change starts.
- Verify that each page change cites the shared contract and saves prototype/app desktop/mobile screenshots.
- Verify that structure checks inspect behavioral landmarks, not exact DOM trees or class names.
- Verify that `follow-up-gaps.md` contains unresolved prototype/API conflicts instead of leaving them in page notes only.

## 开放问题

- Whether a third viewport should be added after first page implementation remains open.
- Whether shadcn component generation should live under `web/src/components/ui` or a project-specific UI path should be decided during implementation planning.

## 后续沉淀候选

- Risks that recur across page changes should be distilled into long-term frontend UI architecture guidance after this version is verified.
