---
name: motion-create
description: Create a new Motion Agent animation, AE composition, product demo, promotional shot, or motion system from a brief or reference. Use when starting new motion work before building scripts, layers, rigs, or renders.
---

# Motion Create

Use this skill when starting a new motion piece. Its job is to turn a fuzzy request into a buildable motion plan before AE work starts.

## Intake

Capture only the information needed to move:

- format: aspect ratio, resolution, duration, fps
- purpose: launch, demo, social, presentation, internal prototype
- source: text brief, UI screenshots, reference video, existing AE project, brand assets
- must-show content: product name, feature, logo, CTA, UI screens, character, object
- delivery: preview only, editable AE file, final video, transparent asset, template

If details are missing, choose reasonable defaults and state them. For modern startup/product motion, default to 1920x1080 or 1080x1920, 30fps, 6-15 seconds unless the prompt implies otherwise.

## Concept Pass

Define:

1. one-sentence story
2. first frame
3. main motion moments
4. ending frame
5. reusable controls
6. QA checks

Keep the plan short. The goal is to make the build executable, not to write a pitch deck.

## Workflow Selection

- For repeated elements or tunable animation, load `motion-ae-rig`.
- For reference matching or polish, load `motion-qa`.

## AE Build Rules

Before sending JSX, read the original `skill/SKILL.md`.

Build in small batches:

1. composition and source placeholders
2. layout and precomp structure
3. controls and rigs
4. motion timing
5. styling and effects
6. preview capture and QA

## Deliverable Checklist

- composition exists at the requested format
- major layers are named and grouped
- controls are discoverable
- timing markers identify major moments
- preview frames or a short render prove the intended direction
- limitations and next polish steps are noted
