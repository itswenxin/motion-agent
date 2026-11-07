---
name: ae-gsap-motion
description: Translate GreenSock/GSAP animation thinking into Adobe After Effects keyframes, controller nulls, text animators, expressions, and ExtendScript. Use after skill/SKILL.md when the user asks for GSAP-like professional animation, GreenSock-style sequencing, timeline/stagger/ease/scrub/Flip/SplitText patterns in AE, or asks to convert GSAP motion ideas into AE implementation.
---

# AE GSAP Motion Translation

Use this after `skill/SKILL.md` for After Effects work that benefits from GreenSock/GSAP motion grammar. GSAP itself does **not** run in AE. Translate its concepts into AE-native keyframes, expressions, controller nulls, text animators, time remap, masks, cameras, and scripts.

Official GSAP skills (MIT, [greensock/gsap-skills](https://github.com/greensock/gsap-skills)); install them with `npx skills add greensock/gsap-skills`, then read from your agent's skills folder:

- `$CODEX_HOME/skills/gsap-core/SKILL.md`
- `$CODEX_HOME/skills/gsap-timeline/SKILL.md`
- `$CODEX_HOME/skills/gsap-scrolltrigger/SKILL.md`
- `$CODEX_HOME/skills/gsap-plugins/SKILL.md`
- `$CODEX_HOME/skills/gsap-utils/SKILL.md`
- `$CODEX_HOME/skills/gsap-performance/SKILL.md`

Read only the relevant official GSAP skill when exact semantics matter. Keep AE scripts ES3-safe as required by `skill/SKILL.md`.

## Core Translation

| GSAP idea | AE translation |
|---|---|
| `gsap.to(target, vars)` | Keep current value as start; set end keyframe at `start + duration`. |
| `gsap.from(target, vars)` | Set an explicit start keyframe from `vars`; animate to current/final designed value. Avoid unwanted "immediateRender" by not overwriting later settled states. |
| `gsap.fromTo(target, from, to)` | Set both start and end keyframes explicitly. Best for reliable scripted AE builds. |
| `gsap.set(target, vars)` | Set value at the current time or create a hold keyframe if later animation depends on it. |
| `duration`, `delay` | Convert seconds to comp time; for 30fps, `1 frame = 1/30`. |
| `ease` | Apply temporal ease on keyframes or use expression curves. Match feel, not exact browser math. |
| `stagger` | Offset layer/keyframe start times by frames; for text, prefer Text Animator selectors or Decompose Text layers. |
| `repeat` / `yoyo` | Use looping expressions, time remap, or duplicated keyframe cycles. Bake if expressions become fragile. |
| `autoAlpha` | Opacity keyframes; optionally disable/enable layer only for hard cuts outside visible ranges. |
| Relative values `+=`, `-=` | Read current AE property and add delta before writing the new key. |
| Function-based values | Use index-based calculations in JSX or expression selectors. |
| `gsap.defaults()` | Shared config object in JSX, or controller null with sliders for duration/ease/spread. |
| `matchMedia()` / reduced motion | Create alternate scale/slider presets such as `Motion Amount`; for reduced motion use shorter distance, lower rotation, or opacity-only. |

## Timeline Grammar

Before creating AE keys, write a compact timeline spec:

```text
label intro @ 0.00
S06_Card_Demo.fromTo position [x0,y0,z0] -> [x1,y1,z1] dur .55 ease power3.out @ intro
S06_Card02.to scale 70 -> 100 dur .35 ease back.out @ <+.08
cards.stagger orientation += [0,18,-8] dur .6 ease power2.inOut each .04 from center
```

Then translate it into an AE table:

| Field | Meaning |
|---|---|
| layer | Exact AE layer name or pattern. |
| property | AE property path: Position, Scale, Orientation, Opacity, Mask Path, Time Remap, etc. |
| from/to | Explicit values in AE units. |
| start/duration | Seconds or frames. |
| ease | GSAP-style name mapped to AE temporal ease. |
| offset | Absolute time, label, previous start `<`, previous end `>`, or stagger offset. |
| controller | Optional null/slider that should drive the values. |

Prefer timeline labels over scattered delay math. For complex sections, create one controller null per sequence, e.g. `CTRL_S06_CARDS`, with sliders such as `Motion Amount`, `Stagger Frames`, `Depth Spread`, and `Progress`.

## Ease Mapping

Use these as starting points and tune visually with captures:

| GSAP ease | AE feel |
|---|---|
| `none` | Linear interpolation. Use for scrub/progress-driven motion. |
| `power1.out` | Gentle ease out; low influence. |
| `power2.out` | Standard UI ease out. |
| `power3.out` | Fast start, strong settle; good for cards and titles. |
| `power3.inOut` | Symmetric smooth travel; good for camera or group moves. |
| `expo.out` | Very fast arrival then slow settle; use sparingly. |
| `back.out(1.7)` | Add an overshoot key beyond the end, then settle. |
| `elastic.out()` | Use expression spring or 3-5 decaying overshoot keys. |
| `bounce.out` | Use stepped impact keys; do not fake with one Easy Ease. |

When exact timing matters, sample frames around the peak velocity and landing moment. AE's keyframe interpolation will not be numerically identical to GSAP; the deliverable is matching motion perception.

## ScrollTrigger Concepts In AE

AE has no DOM scroll. Translate ScrollTrigger as a progress driver:

| ScrollTrigger idea | AE pattern |
|---|---|
| `trigger/start/end` | Timeline label range or work area range. |
| `scrub: true` | Slider/Null `Progress 0..100`, Time Remap, or expression mapping time to progress. Use linear ease. |
| numeric `scrub` lag | Low-pass/spring expression on the progress value, or delayed duplicated keys. |
| `pin` | Hold the camera or parent null while animating children. Do not animate the pinned parent if children need independent motion. |
| `snap` | Hold/snap keyframes or `Math.round(progress / step) * step` expression. |
| `markers` | Temporary guide layers, labels, or text overlays; remove before final delivery. |
| `containerAnimation` | Horizontal/3D carousel controlled by one master null or camera path; nested elements reference the same progress. |

For AE "scroll-like" reels, drive a master timeline with `CTRL_PROGRESS` and map progress to cards, camera Z, opacity, and blur. Keep the progress-driving motion linear; put ease on the nested visual responses only when it improves the look.

## Plugin Pattern Equivalents

| GSAP plugin | AE equivalent |
|---|---|
| Flip | Record first and last layer transforms; animate through inverse offset or parent nulls. Use for layout reorders and card swaps. |
| Draggable / Observer | AE render is not interactive; represent gestures with controller sliders or recorded keyframes. |
| Inertia | Use velocity-based expression, spring expression, or decaying overshoot keys. |
| SplitText | Use AE Text Animators, Expression Selectors, or Decompose Text into per-word/per-character layers. |
| ScrambleText | Source Text hold keys, character map expression, or text animator opacity/character offset. |
| DrawSVG | Shape layer Trim Paths. |
| MorphSVG | Mask/path keyframes or shape path interpolation; ensure vertex counts/order match. |
| MotionPath | AE mask path + layer path parenting, or sampled position keys along a Bezier. |
| CustomEase / CustomWiggle / CustomBounce | AE graph editor curves, temporal ease values, or custom expression functions. |
| GSDevTools | Temporary controller nulls, guide layers, frame captures, and audit JSX reports. |

## Utility Function Equivalents

Use GSAP utils as math vocabulary in JSX/expressions:

```javascript
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function mapRange(in0, in1, out0, out1, v) {
  var p = (v - in0) / (in1 - in0);
  return out0 + (out1 - out0) * p;
}
function lerp(a, b, p) { return a + (b - a) * p; }
function snap(step, v) { return Math.round(v / step) * step; }
```

Common AE uses:

- `normalize/mapRange`: map time, audio amplitude, or slider progress to position/scale/opacity.
- `random`: generate deterministic per-layer offsets in JSX; avoid non-deterministic expression randomness unless the jitter is intentional.
- `snap`: stepped typewriter, frame-skipped motion, grid/cards snapping.
- `distribute`: card fans, text staggers, center-out reveals.

## Performance Rules For AE

- Prefer transforms, opacity, time remap, and camera/null movement over heavy per-frame effects.
- Avoid many layers with expensive effects all animating at once; precompose or bake when the look is approved.
- Use expressions for control and iteration; bake to keyframes when the expression becomes slow or brittle.
- Motion blur improves perceived quality but can hide layout mistakes; verify both with and without it when diagnosing.
- For repeated cards, use parent nulls and shared controllers instead of independently keying every property.
- Keep masks and mesh warps as simple as the visual allows. Capture exact frames after changing masks.

## AE Build Workflow

1. Read `AEMotion` and the relevant official GSAP skill if the user names a GSAP concept.
2. Inspect the AE comp/layers before editing. Do not infer layer names.
3. Draft a GSAP-style timeline spec with labels, duration, ease, stagger, and target layers.
4. Convert to an AE implementation table.
5. Write ES3-safe JSX helpers for keyframes/ease/controllers.
6. Apply one logical sequence per script.
7. Capture exact frames around start, peak velocity, landing, and final hold.
8. Tune values from visual evidence, then save.

## Do Not

- Do not paste GSAP browser code into AE.
- Do not use modern JavaScript syntax in ExtendScript.
- Do not animate the same AE property in multiple unrelated rigs without auditing overlap.
- Do not rely on `delay`-style scattered timing for complex sections; use labels/controller timing.
- Do not keep temporary guide/marker layers visible in final renders unless the user asked for them.
