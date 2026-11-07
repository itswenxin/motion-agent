# Trim Paths draw-on with stagger and round caps

**Level:** Verified · **Built:** 2026-11-06 in After Effects 26.0 by Motion Agent

Five parallel S-curves draw themselves on from left to right, one after another, with soft round
ends; after a hold they draw off in the same direction (the tail chases the head). Comp `DrawOn`:
1920×1080, 30 fps, 4 s. One shape layer, no expressions.

## How it is built

1. One shape layer `Strokes` at comp center with five groups `Line1..5`. Each group holds its own
   Path (custom `Shape`: 4 vertices, horizontal handles), Stroke, and **Trim Paths inside the group**,
   so every line can be timed separately. (A single Trim Paths at layer level would trim all paths
   together or in sequence, not with an overlapping stagger.)
2. Stroke 22 px, Line Cap 2 (round), Line Join 2 (round), colors stepping #7C9CFF → #FF7AC6.
3. **Draw on**: Trim End 0 → 100, two Bezier keys per line, start offset `i × 0.10 s`.
4. **Draw off**: Trim Start 0 → 100 later, same stagger, so the stroke leaves toward the end point.
5. Build order follows SKILL.md's "build structure first, resolve references second": all groups,
   paths, strokes and trims are added in a first loop; values and keys are set in a second loop that
   re-resolves every property by name.

## Key parameters

| Parameter | Value |
|---|---|
| Comp | 1920×1080, 30 fps, 4.0 s |
| Path | vertices (±620, y), (∓207, y ∓ 95); handles ±140 px horizontal; line spacing 90 px |
| Stroke | 22 px, cap 2 = round, join 2 = round |
| Draw on (Trim End) | starts 0.30 s, stagger 0.10 s, duration 1.00 s |
| Draw-on ease | key 1 speed 0, outgoing influence 70 %; key 2 speed 0, incoming influence 85 % |
| Draw off (Trim Start) | starts 2.60 s, stagger 0.10 s, duration 0.80 s |
| Draw-off ease | key 1 outgoing 80 %; key 2 incoming 60 % |

## Verification (AE 26.0)

- Read back on all five lines: Line Cap = 2, width = 22.
- Trim End sampled at 0.3 / 0.6 / 0.9 / 1.3 / 1.7 s:
  line 1 → 0 / 11.4 / 86.2 / 100 / 100; line 3 → 0 / 0.8 / 31.7 / 97.6 / 100;
  line 5 → 0 / 0 / 3.9 / 86.2 / 100. The same curve shifted by 0.1 s per line (line 2 at 0.6 s equals
  line 4 at 0.8 s, etc.).
- Trim Start at 3.0 s: 29.5 / 12.2 / 4.4 / 0.9 / 0 for lines 1–5; 100 on all at 3.8 s.
- Frames at 0.2 / 0.7 / 1.1 / 1.9 / 2.9 / 3.3 s: frame 0.2 s mean RGB equals the background exactly
  (14, 15, 19), so a zero-length trimmed stroke with round caps draws nothing; 1.9 s all five lines
  complete; 3.3 s lines drawing off in stagger (`evidence/contact_sheet.jpg`).

## Pitfalls hit

- None blocking. Keep Trim Paths inside each group; set the Path with a `Shape` object after all
  sibling properties exist, otherwise the earlier references become invalid (SKILL.md "Object is invalid").
- With 0.1 s stagger and 1 s duration, the last line starts while the first is at 86 %: enough overlap
  to read as one gesture. Larger stagger (> 0.25 s) reads as separate events.

## Promotion notes

- Pattern: per-group Trim Paths + `i × stagger` key offsets in the build script. Trim End for draw on,
  Trim Start for draw off in the same direction. Already consistent with SKILL.md; no new rule needed.
