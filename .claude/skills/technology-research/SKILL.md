---
name: technology-research
description: Use this skill whenever choosing, introducing, upgrading, or evaluating a technology stack, framework, library, SDK, runtime, build tool, deployment platform, or engineering practice. Trigger for questions about React, Next.js, TypeScript, Bun, Vite, TanStack, Cloudflare, monorepos, testing, package managers, dependency safety, “best practices”, “current recommendation”, or “should we use X”. Start from bundled baseline best practices for common stacks, then verify against current official docs/search results and project constraints before giving a conclusion.
---

# technology-research

Use this skill to produce high-quality, traceable technology recommendations.

The skill is not a blank web search. It works in three steps:

1. Start from a bundled baseline for the relevant technology stack.
2. Verify that baseline against current official sources.
3. Adjust the recommendation for the current project constraints.

## Core rule

Never present a baseline as final truth.

For common stacks, first read the matching baseline reference. Then confirm with current official docs, release notes, package metadata, security advisories, or deployment platform docs.

For library/framework/SDK/API/CLI details, use Context7 first when available. Use Tavily when broader web research, release discussion, ecosystem signals, or non-library sources are needed.

## When to use

Use `technology-research` when the user or a workflow command needs to:

- Choose a framework, library, SDK, runtime, package manager, build tool, testing tool, deployment platform, or engineering practice.
- Introduce, replace, or upgrade a dependency.
- Decide whether a technology fits the project.
- Confirm a best practice for React, Next.js, TypeScript, Bun, Vite, TanStack, Cloudflare, monorepo, testing, lint/format, deployment, or dependency safety.
- Support `design-change` with a current technical recommendation.

## Not responsible for

`technology-research` does not:

- Implement code directly.
- Replace `design-change` as the final design artifact.
- Replace `plan-change` as the implementation plan.
- Freeze one global tech stack for every project.
- Lock recommendations to hardcoded version numbers.

It produces a researched technical judgment that later workflow commands can cite.

## Reference selection

Read only the relevant baseline file:

- [default-web-stack.md](./references/default-web-stack.md) — User-preferred default Web app stack: Bun local dev, Cloudflare deploy, TanStack, shadcn/ui, Jotai, Better Auth, React 19, Tailwind CSS, Drizzle ORM, D1, Vite, and Oxc.
- [react.md](./references/react.md) — React app/component baseline.
- [nextjs.md](./references/nextjs.md) — Next.js app baseline.
- [typescript.md](./references/typescript.md) — TypeScript configuration and typecheck baseline.
- [bun-vite.md](./references/bun-vite.md) — Bun, Vite, runtime/tooling baseline.
- [tanstack.md](./references/tanstack.md) — TanStack Router/Query/Table/Form baseline.
- [cloudflare.md](./references/cloudflare.md) — Cloudflare Workers/Pages/D1/KV/R2 baseline.
- [monorepo.md](./references/monorepo.md) — Monorepo and workspace baseline.
- [testing.md](./references/testing.md) — Test strategy baseline.

## Workflow

1. Identify the decision type: stack selection, library introduction, upgrade, configuration, deployment, testing, security, performance, or maintainability.
2. Inspect project context when relevant: existing stack, package manager, deploy target, runtime, build/test/lint scripts, `docs/project.md`, roadmap/change context.
3. Read the matching baseline reference.
4. Verify current facts:
   - Use Context7 for official library/framework/SDK/API/CLI docs.
   - Use Tavily for current ecosystem signals, platform docs not covered by Context7, release notes, security advisories, or comparisons.
   - For npm dependencies, check package metadata, release timing, maintenance state, security advisories, and dependency-tree impact.
5. Compare baseline against project constraints.
6. Output a recommendation that distinguishes baseline, verified current facts, and project-specific adjustments.

## Dependency and supply-chain checks

When adding, replacing, or upgrading dependencies, check:

- Current stable version.
- Target version release date.
- Whether recent releases are unusually frequent.
- Maintainer changes, package-name confusion, repository moves, or security advisories.
- Whether the dependency tree grows significantly.
- Whether the project already has an adequate dependency.
- Whether platform capabilities or small project-local code can avoid the new dependency.

Default rule: do not choose an npm version published less than 7 days ago unless the user explicitly confirms.

If using a version published less than 7 days ago, record:

- User confirmation.
- Why waiting is not acceptable.
- Risk reduction measures.
- Rollback plan.

If a dependency only saves a small amount of code but adds supply-chain, bundle size, maintenance, or security risk, default to not adding it.

## Conclusion rules

- If the baseline and current sources agree, recommend the baseline and say it was confirmed.
- If current sources overturn the baseline, trust current sources and explain the change.
- If project constraints make the baseline unsuitable, clearly explain the deviation.
- If sources are missing or contradictory, record the gap and do not pretend the baseline is verified.

## Output format

Use this structure:

```markdown
## 技术问题

## 项目约束

## 默认基线

## 当前资料确认

## 推荐方案

## 不采用的方案

## 风险与验证点

## 后续落点
```

Required details:

- What baseline reference was used.
- What official/current sources were checked and when.
- Whether the baseline still holds.
- Any project-specific reason to deviate from the baseline.
- Dependency safety notes when adding or upgrading packages.
- Where the conclusion should land: `design-change`, `plan-change`, implementation notes, or long-term docs.

If current sources are missing or contradictory, say so. Do not pretend the baseline is verified.
