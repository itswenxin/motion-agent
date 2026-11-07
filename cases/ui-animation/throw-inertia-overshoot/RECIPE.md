# Throw with inertia: keyed arc that lands with speed + inertial bounce

**Level:** Verified · **Built:** 2026-11-06 in After Effects 26.0 by Motion Agent

A blue app chip pops in with a small overshoot, then is thrown along an arc into a target ring,
tilting in flight; it overshoots the target by ~61 px, swings back and settles within a second.
Comp `Inertia`: 1920×1080, 30 fps, 4 s, motion blur on.

## How it is built

1. **Scale pop**: two Bezier keys 0 → 100 % (0.10 → 0.40 s). The landing key has an *incoming speed*
   of 250 %/s instead of 0, so the value is still moving when the key is reached.
2. **Throw**: two Position keys P0 [380, 820] → P1 [1480, 500] (0.60 → 1.40 s). Spatial handles
   out [380, −520] at P0 and in [−420, −160] at P1 make the arc (set with `setSpatialTangentsAtKey`; the
   tangent array length is read from `keyInSpatialTangent(k).length`, it is 3 on a 2D layer). Temporal
   ease: start key speed 0 / influence 70 %; landing key incoming **speed 1400 px/s**, influence 40 %.
3. **Rotation**: keyed tilt 0 → −14° → 0 (0.6 / 1.0 / 1.65 s, influence 60–80 %), no bounce.
4. **Inertial bounce expression** on Position and Scale, after the last key only:
   `value + v · amp · sin(2π·freq·t) / e^(decay·t)`, `v = velocityAtTime(lastKey − frame/10)`.
   Sliders `Amp`, `Freq`, `Decay` on the layer. *Why an expression:* the overshoot
   is derived from whatever speed the designer's keys arrive with, so retiming the keys keeps the
   physics consistent; baked overshoot keys would have to be re-tuned on every change.
5. **Amp = 1 / (2π·freq)**: the derivative of the bounce at t = 0 is `v·amp·2π·freq`; with this amp it
   equals `v`, so the speed is continuous through the landing key.

## Key parameters

| Parameter | Value |
|---|---|
| Comp | 1920×1080, 30 fps, 4.0 s, comp + layer motion blur on |
| Chip | 220×220, roundness 56, #7C9CFF; target ring 260×260 stroke 4 px #2A2E37 at P1 |
| Scale keys | 0.10 s 0 % (speed 0, out influence 60 %) → 0.40 s 100 % (in speed 250 %/s, influence 40 %) |
| Position keys | 0.60 s [380, 820] (speed 0, out influence 70 %) → 1.40 s [1480, 500] (in speed 1400 px/s, influence 40 %) |
| Spatial handles | out [380, −520, 0] at key 1, in [−420, −160, 0] at key 2 |
| Rotation keys | 0 → −14° → 0 at 0.60 / 1.00 / 1.65 s, influence 60 / 60 / 80 % |
| Bounce | Freq 2.2 Hz, Decay 5.0 /s, Amp 1/(2π·2.2) = 0.0723 |

## Verification (AE 26.0)

- Keys read back: Position key 1 out influence 70, key 2 in speed 1400 / influence 40, tangents as set;
  Scale key 2 in speed 250.
- Path samples: [380, 820] (0.6 s) → [406.9, 783.9] → [544.9, 623.7] → [1048.4, 393.8] (1.2 s, above the
  straight line: the arc) → [1480, 500] (1.4 s).
- Distance from target after landing (sign = side of target): 61.2 px at 1.5 s (max), 13.9, −19.3, −9.5,
  4.96, 4.63, −0.77, −1.88 … last frame farther than 0.5 px at 2.43 s, 0 by 3.7 s.
- Speed through the landing key, measured with 2 ms steps: 1431 px/s just before, 1389 px/s just after.
- Scale: 27.1 % (0.25 s) → 100 % (0.40 s) → 111.2 % (0.5 s) → 102.6 → 98.3 → 99.7 % (1.2 s).
- 2 expressions, 0 errors. Frames in `evidence/contact_sheet.jpg`.

## Pitfalls hit

- **Arriving with speed 0 kills the bounce.** The expression multiplies by the incoming velocity, so a
  landing key with the default ease (speed 0) gives no overshoot at all. Give the last key an explicit
  incoming speed.
- **Speed jump at the landing key.** First try used Amp 0.05 (a common tutorial value): the one-frame
  step was 50.3 px before the key and 26.7 px after it, a visible hitch. Amp = 1/(2π·freq) fixed it
  (38.7 px per frame after, instantaneous speeds 1431 vs 1389 px/s).

## Promotion notes

- Add to SKILL.md motion math: inertial bounce `amp = 1/(2π·freq)` for velocity continuity, and "the
  last key must arrive with non-zero speed".
