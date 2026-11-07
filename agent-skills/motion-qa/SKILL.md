---
name: motion-qa
description: Validate, polish, debug, compare, and quality-check Motion Agent or After Effects output using preview frames, numeric checks, visual QA, timing analysis, and reference matching.
---

# Motion QA

Use this before delivery and whenever the user says the motion feels wrong.

## QA Mindset

Do not rely on "looks fine." Collect evidence.

For every issue, translate:

```text
symptom -> likely channel -> measurement -> fix -> verification
```

Example:

```text
feels jittery -> velocity discontinuity -> sample position per frame -> adjust easing/path -> compare speed curve
```

## Visual Checks

Capture representative frames:

- first frame
- first action
- peak motion
- transition midpoint
- final frame
- any frame the user complained about

Check:

- no unintended crop or black frame
- text readable and not clipped
- logo/product visible
- UI hierarchy clear
- safe margins respected
- repeated items do not overlap unexpectedly
- effects do not hide important content

## Motion Checks

When motion quality matters, measure:

- position, scale, rotation, opacity values across frames
- speed curve continuity
- timing of interaction beats
- overlap/collision for cards or panels
- reference alignment for important frames

Use the repo tools and original `skill/SKILL.md` verification methods.

## Debugging Order

1. Reproduce the issue with a capture or sampled values.
2. Identify the exact layer/control/expression.
3. Make one focused change.
4. Recapture the same frame/time.
5. Report before/after evidence.

Avoid "try a bunch of changes" debugging. It hides the real cause.

## Delivery Gate

Do not call work final until:

- preview evidence exists
- scripts compiled and ran through the safe sender
- changed layers were inspected
- output specs were checked
- any unverified assumptions are listed

## User Feedback Translation

| User says | First place to inspect |
|---|---|
| "not smooth" | position path, easing, velocity continuity |
| "too floaty" | duration, damping, overshoot, distance |
| "not premium" | spacing, typography, contrast, easing discipline |
| "too chaotic" | number of moving elements and attention path |
| "doesn't match reference" | sampled key frames and element positions |
| "text is hard to read" | size, contrast, motion blur, crop, duration |
