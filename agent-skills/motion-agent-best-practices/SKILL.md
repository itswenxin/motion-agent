---
name: motion-agent-best-practices
description: Motion Agent routing and best practices for AI-assisted Adobe After Effects production. Use when Codex or another coding agent needs to plan, build, modify, QA, render, or document motion design work with Motion Agent; use as the default entry point when unsure which Motion Agent skill applies.
---

# Motion Agent Best Practices

Use this as the routing layer for Motion Agent work. The deep AE execution contract still lives in the repository's `skill/SKILL.md`; read it before touching After Effects.

## Core Principle

Do not treat Motion Agent as "generate a JSX and hope." Treat it as a production workflow:

1. Understand the brief, reference, product, and delivery context.
2. Choose the right workflow skill.
3. Build editable AE structures, not one-off throwaway layers.
4. Verify with captured frames, sampled values, and concrete evidence.
5. Promote reusable patterns into a case or skill.

## Skill Routing

| User asks for | Load |
|---|---|
| A new video, shot, animation, or composition | `motion-create` |
| Reusable AE controls, expressions, rigs, presets, componentized motion | `motion-ae-rig` |
| Review, polish, compare, debug, validate, make it match reference | `motion-qa` |

If a task spans multiple areas, load the smallest useful set. For example, a product launch demo usually needs `motion-create`, `motion-ae-rig` and `motion-qa`.

## Before Editing AE

Read the repository's original `skill/SKILL.md`, then run its preflight checklist. In particular:

- Use `ae_scripts/tools/run_jsx.sh` for JSX.
- Respect AE's ES3 ExtendScript limits.
- Look up effect `matchName`s instead of guessing display names.
- Keep one logical change per script batch.
- Preserve user changes and existing controller values.

## Production Contract

Every Motion Agent result should leave behind:

- an editable AE project structure
- named controls for repeated tuning
- preview evidence
- a short note explaining what changed and what was verified
- reusable scripts or case notes if the pattern is likely to repeat

## Editable Output Rules

- Name layers, precomps, controls, markers, and output files for humans.
- Put user-facing controls in a clear `AI_Controls` or task-specific control layer.
- Keep expressions readable and localized; prefer surgical edits over full rewrites.
- Avoid hidden magic: if timing or layout is generated, expose the important knobs.
- Do not collapse everything into baked keyframes unless the user explicitly wants final-only output.

## Verification Rules

Before saying "done," gather evidence:

- capture representative frames
- inspect changed layers, expressions, or controller values
- sample timing/easing when motion quality matters
- check text bounds, logo readability, and composition safe areas
- record any unverified assumption

## Pattern Promotion

When a workflow repeats, do not leave it buried in a chat:

1. Add or update a case under `cases/<category>/<case>/`.
2. Save a `RECIPE.md`, reusable JSX, and before/after evidence.
3. If the rule is broadly useful, promote the short version into `skill/SKILL.md` or one of these agent skills.
4. Sync and commit according to the repository workflow.
