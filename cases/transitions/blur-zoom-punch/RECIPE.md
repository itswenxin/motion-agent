# Blur/zoom punch transition

**Level:** Verified · **Built:** 2026-11-06 in After Effects 26.0 by Motion Agent

A dark "Zoom" scene accelerates into the camera, smears, hard-cuts on the most blurred frame to a light
"Punch" scene that is still over-scaled and decelerates back to 100 %. The cut hides inside the speed
and blur peak. Comp `Zoom`: 1920×1080, 30 fps, 4 s; cut at 2.0 s.

## How it is built

1. **Two scenes**, each `BgA/BgB` (shape, 400 px overscan) + `DotsA/DotsB` (ring of 10 dots) + `TitleA/TitleB`, all parented
   to a root null (`RootA`, `RootB`) at comp center, so Scale on the root zooms around the frame center.
2. **Spans**: scene A layers 0 → 2.0 s, scene B layers 2.0 → 4.0 s (`inPoint` set first, then `outPoint`,
   read back after).
3. **A punch-in** (Scale keys 1.6 → 2.0 s, 100 → 180 %): a cubic ease-in written as Bezier handles:
   start speed 0, influence 33.33 %; end speed **600 %/s** (= 3·80/0.4), influence 33.33 %. The arrival
   is the fastest moment of A.
4. **B land** (2.0 → 2.5 s, 180 → 100 %): leaves the cut with speed **−600 %/s**; its out influence is
   capped at 26.67 % (= 80 / (600·0.5)) so the handle does not undershoot 100 %, and the landing key has
   influence 75 % for a long settle.
5. **Fast Box Blur** (`ADBE Box Blur2`) on the adjustment layer `Blur`: Radius 0 → 70 → 0 at 1.75 / 2.0 / 2.25 s,
   Iterations 2, Repeat Edge Pixels on.

## Key parameters

| Parameter | Value |
|---|---|
| Comp | 1920×1080, 30 fps, 4.0 s, cut at 2.0 s |
| A scale keys | 1.6 s 100 % (speed 0, out influence 33.33 %) → 2.0 s 180 % (in speed 600 %/s, influence 33.33 %) |
| B scale keys | 2.0 s 180 % (out speed −600 %/s, influence 26.67 %) → 2.5 s 100 % (speed 0, in influence 75 %) |
| Blur | Fast Box Blur radius 0 / 70 / 0 at 1.75 / 2.0 / 2.25 s, influence 60 %, iterations 2, repeat edges 1 |
| Scenes | A #0E0F13 + #7C9CFF dots, B #F2F0EA + #FF7AC6 dots; titles Inter-Black 170 px |

## Verification (AE 26.0)

- Fast Box Blur params read back: `-0001` Blur Radius (3 keys), `-0002` Iterations 2, `-0003` Blur
  Dimensions 1, `-0004` Repeat Edge Pixels 1. Ease speeds read back: A key 2 in 600, B key 1 out −600.
- Visible scale per frame (A until f59, B from f60) and step: f53 105.8 / +2.8 → f56 123.7 / +7.8 →
  f58 146.3 / +12.5 → f59 161.6 / +15.3 → **f60 180 / +18.4** → f61 160.1 / −19.9 → f62 141.2 / −18.8 →
  f64 115.3 / −10.5 → f68 101.7 / −1.3. Speed grows monotonically into the cut and mirrors out of it.
- Blur on the same frames: 0.3 / 29.2 / 63.4 / 68.6 / **70** / 68.6 / 63.4 / 29.2 / 0.
- Spans read back: A 0–2 s, B 2–4 s. Frames 1.0 / 1.8 / 1.967 / 2.0 / 2.2 / 3.0 s in `evidence/contact_sheet.jpg`.

## Pitfalls hit

- **Speed bump before the cut** (attempts 1 and 2). A high outgoing influence at the start (85 %) plus a
  keyed arrival speed makes the curve overshoot that speed mid-move and then *slow down* into the cut:
  attempt 1 (arrival 260 %/s, in influence 30) peaked at 17.8 %/frame two frames before the cut and arrived at
  10.6; attempt 2 (420 %/s, in 40) peaked at 19.0 and arrived at 14.9. The cubic-handle setting
  (33.33 / 33.33 %, arrival = 3·Δ/T) removes the bump.
- A negative `KeyframeEase` speed is accepted for a decreasing Scale and reads back as −600.

## Promotion notes

- Add to SKILL.md motion math: to make a keyed move arrive at its maximum speed, use influence 33.33 % on
  both keys and arrival speed `3·Δ/T` (cubic ease-in); mirror it after a cut with the same |speed| and an
  out influence ≤ `Δ/(speed·T)`.
