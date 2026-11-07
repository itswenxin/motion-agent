# Whip-pan push between two full-screen scenes

**Level:** Verified · **Built:** 2026-11-06 in After Effects 26.0 by Motion Agent

A blue "Scene A" frame is shoved off to the left while a pink "Scene B" pushes in from the right,
in 15 frames, with a horizontal directional smear that peaks at the fastest frame and is gone when the
push lands. Comp `Whip`: 1920×1080, 30 fps, 4 s; push at 1.60 → 2.10 s.

## How it is built

1. **Two scene groups** built side by side: `BgA` + `TitleA` centered at x 960,
   `BgB` + `TitleB` at x 2880 (one frame width to the right). Backgrounds are shape
   rectangles with 160 px overscan on the *outer* side only (A to the left, B to the right) and top/bottom.
2. **One rig null** `Rig`: all four scene layers are parented to it at t = 0 (AE keeps world
   positions when parenting). Its Position has the only motion keys: x 960 → −960. Because B is a child
   at a fixed offset, the A|B seam is mathematically closed on every frame.
3. **Directional Blur** (`ADBE Motion Blur`) on an adjustment layer `Blur`: Direction 90°
   (horizontal), Blur Length keys 0 → 140 → 0 at push start / middle / end.
4. Ease: both rig keys speed 0, influence 85 %, which compresses most of the travel into the 2–3 middle
   frames; that concentration is what reads as a whip rather than a slide.

## Key parameters

| Parameter | Value |
|---|---|
| Comp | 1920×1080, 30 fps, 4.0 s |
| Scenes | A #7C9CFF / B #FF7AC6, titles Inter-Black 180 px #0E0F13 |
| Plates | (1920 + 160) × (1080 + 320), overscan outer side only |
| Push | rig x 960 → −960, 1.60 → 2.10 s (15 frames) |
| Push ease | key 1 speed 0, outgoing influence 85 %; key 2 speed 0, incoming influence 85 % |
| Blur | Directional Blur, Direction 90°, Blur Length 0 → 140 → 0 at 1.60 / 1.85 / 2.10 s |
| Blur ease | speed 0, influence 70 % on all three keys |

## Verification (AE 26.0)

- Effect read back: matchName `ADBE Motion Blur`, params `ADBE Motion Blur-0001` "Direction" (90),
  `ADBE Motion Blur-0002` "Blur Length" (3 keys); `Blur.adjustmentLayer = true`.
- Per-frame rig X and step (px/frame): f49 955.7 / 4.3 → f52 864.9 / 48.1 → f54 647.1 / 138.4 →
  f55 346.3 / 300.9 → **f56 −346.3 / 692.5** → f58 −785.5 / 138.4 → f62 −955.7 / 14.5 → f63 −960. Speed
  profile is symmetric; blur length follows it (2.0 / 85.1 / 134.9 / 139.5 / 139.5 / 85.1 / 2.0 at the same frames).
- Edge check, 40 px strips at the left and right frame edge: 1.0 s both pure A [124, 156, 255],
  3.0 s both pure B [255, 122, 198] (bright share 1.000), so no foreign color leaks in at rest.
- Frames 1.0 / 1.75 / 1.85 / 1.95 / 2.05 / 3.0 s in `evidence/contact_sheet.jpg`.

## Pitfalls hit

- Directional Blur's real matchName is `ADBE Motion Blur` (looked up with `ae_scripts/tools/fx.py`; guessing
  "Directional" fails silently).
- Overscan on both sides would make plates overlap: B (higher in the stack) would cover A's right
  overscan, moving the seam 160 px left and showing a pink strip on the resting Scene A. Overscan only on
  the outer side; the edge-strip check above confirms clean frames at rest.
- Directional Blur on an adjustment layer samples outside the frame; plates larger than the frame keep
  the frame edges from darkening during the smear.

## Promotion notes

- Rule: one rig null for both scenes (seam can't open), blur length keyed to peak at the fastest frame,
  overscan only on the outer side. Candidate for SKILL.md's transitions section.
