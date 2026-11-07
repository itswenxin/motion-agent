---
name: motion-ae-rig
description: Build reusable After Effects controls, controller nulls, expressions, presets, sliders, editable rigs, and reusable motion systems for Motion Agent workflows.
---

# Motion AE Rig

Use this when motion should be tunable, reused, or scaled across repeated elements.

## Rig Philosophy

Generate AE files that designers can continue editing. A good rig has:

- clear layer names
- a small number of meaningful controls
- readable expressions
- preserved manual edit points
- documented assumptions

## Choose The Driver

Before building a rig, choose the simplest driver that fits:

| Need | Driver |
|---|---|
| One-off timing, easiest hand edits | keyframes |
| Whole group motion with local tweaks | parent nulls |
| Many repeated elements with shared behavior | controller null + expressions |
| User-facing template controls | named sliders, checkboxes, color controls |

Do not over-rig. A rig is useful only if it makes iteration faster.

## Controller Rules

- Put controls on `AI_Controls` or a clearly named controller null.
- Keep high-level controls under 8 unless the user asks for a technical rig.
- Use human labels: `Global Progress`, `Card Spacing`, `Hero Scale`, `Highlight Strength`.
- Preserve old slider values when rebuilding a controller.
- Add timing markers for major beats.

## Expression Rules

Follow the original `skill/SKILL.md` ExtendScript and expression safety rules.

- Prefer surgical replacement over rewriting full expressions.
- Keep constants near the top of expressions.
- Avoid hidden layer index assumptions.
- Use names and comments that explain intent.
- Record any anchor line that future edits should preserve.

## Reusable Pattern Checklist

For a pattern worth saving:

1. Put the rig builder JSX under the relevant case folder.
2. Save the expression pattern or controller map in `RECIPE.md`.
3. Capture before/after frames.
4. Note what controls are safe for a designer to edit.
5. Promote general rules to `skill/SKILL.md` or this skill.

## Handoff Standard

Before handoff, report:

- control layer name
- key sliders and safe ranges
- which layers are designer-editable
- which expressions should not be rewritten
- preview evidence
