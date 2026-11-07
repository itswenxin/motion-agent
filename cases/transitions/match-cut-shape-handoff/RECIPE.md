# Match-cut shape handoff

**Level:** Verified · **Built:** 2026-11-06 in After Effects 26.0 by Motion Agent

An orange disc rises along an arc through a dark scene; on the cut to a light scene the same disc is
still there, same place, size, color and speed, keeps drifting up, then morphs into a blue rounded app
tile while a caption fades in. Comp `MatchCut`: 1920×1080, 30 fps, 4 s; cut at 2.0 s.

## How it is built

1. Two separate shape layers, one per scene: `Disc` (scene A, 0 → 2.0 s) and `Tile` (scene B,
   2.0 → 4.0 s), over `BgA` / `BgB`. Both are the **same primitive**: a 300×300 rectangle with
   roundness 150 (a circle), so the morph later is just a Roundness key, not a path swap.
2. **Disc** Position: [420, 980] (0.5 s) → [960, 540] (2.0 s) on a curved spatial path (out tangent
   [300, 0], in tangent [0, 260]: comes in from below, moving straight up at the cut). Temporal ease: start
   speed 0 / influence 70 %; arrival **speed 320 px/s**, influence 45 %. Scale 45 → 100 %, arriving at 30 %/s.
3. **Tile** starts with Disc's end state: Position [960, 540] → [960, 470] (2.0 → 2.6 s) with handles
   along the motion, out **speed 320 px/s** (influence 35 %), landing speed 0 / influence 85 %; Scale
   100 → 112 % leaving at 30 %/s. Morph 2.15 → 2.75 s: Roundness 150 → 72, Fill #FF8A3D → #3D5AFE
   (influence 70 / 85 %).
4. `TitleB` "Now in your pocket" fades and rises 30 px (2.5 → 2.9 s).
5. Layer spans are set with `inPoint` first, then `outPoint`, and read back.

## Key parameters

| Parameter | Value |
|---|---|
| Comp | 1920×1080, 30 fps, 4.0 s, cut 2.0 s |
| Shared shape | rect 300×300, roundness 150, #FF8A3D, center [960, 540] at the cut |
| Disc position keys | 0.5 s [420, 980] (speed 0, out influence 70 %) → 2.0 s [960, 540] (in speed 320 px/s, influence 45 %) |
| Disc spatial handles | out [300, 0, 0], in [0, 260, 0] |
| Disc scale keys | 45 → 100 %, arrival 30 %/s (influence 70 / 45 %) |
| Tile position keys | 2.0 s [960, 540] (out speed 320 px/s, influence 35 %) → 2.6 s [960, 470] (speed 0, in influence 85 %) |
| Tile scale keys | 100 → 112 %, leaving at 30 %/s (influence 35 / 85 %) |
| Morph | 2.15 → 2.75 s: roundness 150 → 72, color #FF8A3D → #3D5AFE, influence out 70 % / in 85 % |
| Caption | Inter-Bold 72 px, opacity 0 → 100, y 850 → 820, 2.5 → 2.9 s |

## Verification (AE 26.0)

- At t = 2.0 s Disc and Tile read back identical: position [960, 540], scale 100 %, roundness 150,
  size [300, 300], color [1, 0.541, 0.239, 1]. Spans: Disc 0–2 s, Tile 2–4 s.
- Velocity through the cut, measured with 2 ms steps: Disc −319.4 px/s (y, upward) at the end, Tile −318.3 px/s
  at the start; scale speed 29.8 vs 29.9 %/s.
- Visible y per frame and step: f57 Disc 577.0 / −14.8 → f58 563.5 / −13.5 → f59 551.2 / −12.3 → **f60 Tile
  540.0 / −11.2** → f61 529.0 / −11.0 → f62 517.1 / −11.8 → f64 492.7 / −12.0 → f66 478.1 / −5.5 → f68 473.1 / −1.8.
  The cut frame has no jump in position or speed.
- Tile roundness 150 / 150 / 95.6 / 72 and color orange → [0.469, 0.41, 0.767] → [0.239, 0.353, 0.996] at
  2.0 / 2.15 / 2.45 / 2.75 s. Frames 0.6 / 1.3 / 1.967 (last A) / 2.0 (first B) / 2.45 / 3.2 s in
  `evidence/contact_sheet.jpg`.

## Pitfalls hit

- The color key interpolates in RGB, so the midpoint between orange and blue is a muddy purple
  ([0.469, 0.41, 0.767] at 2.45 s, visible in the contact sheet). Acceptable at 0.6 s; for a cleaner blend add
  a middle color key or keep the hue change under the scale move.
- Continuity needs *both* a matching value and a matching speed: equal end/start values alone still give
  a stop-start at the cut when the outgoing key eases to speed 0.

## Promotion notes

- Rule for SKILL.md transitions: build both shapes from the same primitive, end A and start B on the
  same value **and** the same keyed speed (`KeyframeEase(speed, influence)` on both sides), then morph after the cut.
