# Case Library Standard

This file defines when a `cases/<category>/<case>/` folder is ready to count as a reusable Motion Agent case.

## Case Levels

| Level | Requirements | Counts as |
|---|---|---|
| Draft | `RECIPE.md` with source, technique, key parameters, and pitfalls | Learned reference |
| Reusable | Draft + `PROMPT_TEMPLATE.md` + reusable JSX/spec or clear build steps | Callable pattern |
| Verified | Reusable + before/after frames, contact sheet, metric output, or AE capture evidence | Production-grade recipe |
| Promoted | Verified + transferable rules copied into `skill/SKILL.md` | Agent core knowledge |

## Required Files

Every case must include:

- `RECIPE.md`: what the motion does, how it is built, the important parameters, and the failure modes.

Reusable cases should also include:

- `PROMPT_TEMPLATE.md`: a short invocation pattern for future sessions.
- One reusable artifact: `.jsx`, `.json` spec, or a precise "build steps" section.
- Evidence: `.png` frame, contact sheet, plot, measured output, or a linked runtime capture.
- Promotion notes: what, if anything, should be copied into `skill/SKILL.md`.

## Acceptance Checklist

- The case names the mechanism, not only the visual result.
- The parameters are numeric enough to reproduce.
- Known AE pitfalls are recorded near the relevant step.
- Verification is tied to a visible frame or measured value.
- Any project-specific layer names are separated from the transferable method.

## Current Audit Command

```bash
python3 tools/health_check.py
```

Use the `case library` section of the health check to find missing prompt templates, reusable artifacts, and evidence.
