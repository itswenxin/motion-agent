# Circle expand reveal from a tap point

**Level:** Verified · **Built:** 2026-11-06 in After Effects 26.0 by Motion Agent

A blue button in a dark scene is tapped (it dips to 88 %), and a pink scene B bursts out of the
button as a growing circle that ends just past the farthest corner of the frame. Comp `Circle`: 1920×1080,
30 fps, 3.5 s; reveal 1.00 → 1.80 s.

## How it is built

1. Scene A at the bottom: `BgA`, `TitleA`, `Button` (140 px circle at the origin [1380, 700]).
2. Scene B above it: `BgB`, `TitleB`, both with `setTrackMatte(Matte, ALPHA)`; one matte layer
   serves both (AE 23+ allows several layers to use the same matte), matte switched off.
3. `Matte`: shape layer at the origin with one ellipse; **Ellipse Size** has two Bezier keys,
   0 → `2·(rmax + 8)`, where `rmax` = distance from the origin to the farthest frame corner, computed in
   the script (here corner [0, 0]: 1547.4 px, so end size 3110.8 px). Using the exact corner distance means
   the circle reaches full coverage on the last key, not halfway through (an over-sized end value would
   make the visible part of the move end early and look abrupt).
4. Tap feedback: button Scale keys 100 → 88 → 100 (0.70 / 0.85 / 1.05 s); the reveal starts at 1.00 s,
   during the release, so cause and effect overlap.

## Key parameters

| Parameter | Value |
|---|---|
| Comp | 1920×1080, 30 fps, 3.5 s |
| Origin / button | [1380, 700], Ø140, #7C9CFF on #0E0F13 |
| Matte end size | 2 × (1547.4 + 8) = 3110.8 px |
| Reveal keys | 1.00 s size 0 → 1.80 s size 3110.8 |
| Reveal ease | key 1 speed 0, outgoing influence 60 %; key 2 speed 0, incoming influence 85 % |
| Tap keys | Scale 100 / 88 / 100 % at 0.70 / 0.85 / 1.05 s, influence 70 / 60 / 85 % |

## Verification (AE 26.0)

- Ellipse Size sampled: 0 (≤ 1.0 s) → 56.5 (1.1) → 313.5 (1.2) → 1191.6 (1.3) → 2324.9 (1.4) → 2991.6 (1.6)
  → 3110.8 (1.8 s and after).
- Both B layers report `trackMatteLayer = Matte`; matte `enabled = false`.
- **Rendered radius vs keyed radius**: in the 1.3 s frame, scanning left from the origin along y 700, the pink
  edge is 597 px away; keyed radius is 1191.6 / 2 = 595.8 px (1.2 px antialias difference).
- 2.2 s frame: all four corner pixels are pure B [255, 122, 198]; 0.9 s: corners are A [14, 15, 19] and the
  origin pixel is the blue button.
- Button Scale 100 / 88 / 100 at 0.70 / 0.85 / 1.05 s. Frames in `evidence/contact_sheet.jpg`.

## Pitfalls hit

- None blocking. One thing to watch: the matte has to be *above* nothing in particular in AE 23+
  (`setTrackMatte` binds by reference), but scene B must be above scene A, otherwise the revealed scene is
  hidden under A.

## Promotion notes

- Rule: end size = 2 × distance to the farthest corner (+ a few px), computed in script from the origin;
  one matte can drive several layers via `setTrackMatte`.
