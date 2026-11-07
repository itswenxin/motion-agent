# Light sweep + chromatic shimmer on a title

**Level:** Verified · **Built:** 2026-11-06 in After Effects 26.0 by Motion Agent

A cool-grey "Aurora" title gets a slanted band of light passing across it; as the band crosses, the
title splits into red / cyan-blue fringes and snaps back together. Comp `Sweep`: 1920×1080, 30 fps, 4 s.

## How it is built

1. Three identical text layers `TitleR`, `TitleG`, `TitleB` (Inter-Black 280 px, tracking −10,
   #9AA3BD, baseline y 640) over `Bg`.
2. Each has **CC Light Sweep** first, then **Shift Channels** keeping only its own channel
   (R: Green/Blue from Full Off; G: Red/Blue from Full Off; B: Red/Green from Full Off).
   `TitleG` and `TitleB` use blending mode **Add**, so at rest the three channels sum back to the original
   color, and the white sweep light (added before the channel split) also sums back to white.
3. **Sweep center** is keyed on `TitleG` only: x from text left − 260 to text right + 260 (comp pixels;
   text is continuously rasterized, so the effect point is in comp space), 0.8 → 2.0 s.
   `TitleR` / `TitleB` sweep centers are linked to it with a one-line expression.
   *Why an expression:* the three copies must share one sweep exactly; the designer edits one curve.
4. **Chromatic split**: Position keys on `TitleR` (x −14 px) and `TitleB` (x +14 px) at mid-sweep (1.4 s),
   back to 0 at 2.0 s.

## Key parameters

| Parameter | Value |
|---|---|
| Comp | 1920×1080, 30 fps, 4.0 s |
| Title | "Aurora", Inter-Black 280 px, #9AA3BD; glyph box x 488–1426, center y 540 |
| CC Light Sweep | Direction −25°, Shape 3, Width 70, Sweep Intensity 80, Edge Intensity 100, Edge Thickness 3 |
| Sweep center keys | 0.8 s [227.5, 539.6] → 2.0 s [1686.5, 539.6]; speed 0, influence 55 % / 55 % |
| Shift Channels | menu: 1 Alpha, 2 Red, 3 Green, 4 Blue, 5 Luminance, 6 Hue, 7 Lightness, 8 Saturation, 9 Full On, 10 Full Off |
| Split keys | R x 960 → 946 → 960, B x 960 → 974 → 960 at 0.8 / 1.4 / 2.0 s; influence out 60 % / in 80 % |
| Blend | TitleR Normal (5212), TitleG / TitleB Add (5220) |

## Verification (AE 26.0)

- Sweep center sampled: 227.5 (≤ 0.8 s) → 363.0 (1.1) → 957.0 (1.4) → 1551.1 (1.7) → 1686.5 (≥ 2.0 s); TitleR
  reads the same values through the link. TitleR x: 950.1 / 946 / 955.9 at 1.1 / 1.4 / 1.7 s, TitleB mirrored.
- Shift Channels read back R/G/B "take from": TitleR 2/10/10, TitleG 10/3/10, TitleB 10/10/4. 2 expressions, 0 errors.
- **Sweep lands where it is keyed (comp space)**: on row y 540 of the 1.4 s frame the 40 brightest text pixels
  average x 938.5 for a keyed center of 957 (max luma 255 vs resting text luma 141.7–163.3). Before (0.5 s)
  and after (3.0 s) the brightest text luma is the resting 163.3, i.e. no sweep.
- At rest the composite shows a single grey title (no fringes); at 1.1–1.7 s red and blue fringes appear on
  opposite sides (`evidence/contact_sheet.jpg`).

## Pitfalls hit

- **Shift Channels has 10 menu entries, not 11.** `setValue(11)` for "Full Off" failed with
  `After Effects error: Unable to call "setValue" because of parameter 1. Value 11 out of range 1 to 10.`
  A render probe on a white solid (Take Red From = k) gave 255 / 0 / 255 / 0 / 255 / 0 for k = 5…10, matching
  Luminance, Hue, Lightness, Saturation, Full On, Full Off. Full Off = 10.
- **A sweep on pure-white text is invisible.** Attempt 2 used a white title: the light has nothing to brighten.
  The title color must be below white (here luma ≈ 160) for the band to read.
- With a 260 px pad on each side, the band is on the glyphs only for ~0.4 s of the 1.2 s move. Reduce
  `SWEEP_PAD` for a longer visible pass.

## Promotion notes

- Add to SKILL.md: Shift Channels menu indices (Full Off = 10); CC Light Sweep on text uses comp-space
  centers (consistent with the existing shape-layer note); sweep needs a non-white base color.
