# Film grain system: one Amount knob, Fractal Noise overlay + Noise

**Level:** Verified · **Built:** 2026-11-06 in After Effects 26.0 by Motion Agent

A flat purple scene with a cream card gets a fine, living film grain that re-rolls every frame. One
`Amount` slider sets the strength of both grain sources and one `Size` slider sets the grain size.
Comp `Grain`: 1920×1080, 30 fps, 4 s.

## How it is built

1. Scene: `Bg` (#4A4560), `Card` (1000×520, roundness 56, #F2F0EA), `Title` "Grain" (Inter-Black 220 px);
   Card and Title have a slow keyed push, Scale 100 → 104 % over 4 s (influence 60 %).
2. `Texture`: gray solid with **Fractal Noise** (`ADBE Fractal Noise`), Contrast 160, Complexity 2,
   blending mode **Overlay** (mid-gray is neutral in Overlay, so only the noise deviation shows).
   Evolution has two **LINEAR** keys 0 → 21600° over 4 s = 180° per frame, so every frame is a new grain pattern.
3. `Noise`: adjustment layer with **Noise** (`ADBE Noise2`), color noise on, adds fine per-pixel sparkle.
4. `Ctrl` null with Sliders `Amount` (40) and `Size` (10). Expressions:
   Texture Opacity = `clamp(Amount × 0.5)`, Noise amount = `Amount × 0.05`, Fractal Scale = `Size`.
   *Why an expression:* one knob drives two effects on two layers; without it the designer has to keep
   two values in proportion by hand. Grain animation itself is keyed (Evolution), not `time × n`.

## Key parameters

| Parameter | Value |
|---|---|
| Comp | 1920×1080, 30 fps, 4.0 s |
| Amount (default) | 40 → Texture opacity 20 %, Noise 2 % |
| Amount mapping | opacity = Amount × 0.5 (max 50 %), Noise = Amount × 0.05 (max 5 %) |
| Fractal Noise | Scale 10 (Size slider), Contrast 160, Complexity 2, Overlay |
| Evolution | LINEAR keys 0° (0 s) → 21600° (4 s): 180° per frame |
| Scene push | Card/Title Scale 100 → 104 %, speed 0, influence 60 % both keys |

## Verification (AE 26.0)

The same frame (1.0 s) and the next (1.033 s) were rendered at three Amount values, measuring luma in a flat
background patch (x 40–600, y 100–980):

| Amount | Texture opacity / Noise | luma mean | luma std dev | mean abs diff to next frame |
|---|---|---|---|---|
| 0 | 0 % / 0 % | 74.0 | 0.00 | 0.00 |
| 40 | 20 % / 2 % | 73.7 | 7.09 | 7.80 |
| 100 | 50 % / 5 % | 73.8 | 17.90 | 19.75 |

- Grain strength scales linearly with Amount (7.09 → 17.90 for 40 → 100) and the mean brightness does not
  shift (Overlay on 50 % gray is neutral). The frame-to-frame difference confirms the grain re-rolls every frame.
- Read back: Evolution 0 / 180 / 5400 / 21600 at 0 / 1 f / 1 s / 4 s; Texture blend mode 5226 = OVERLAY;
  3 expressions, 0 errors. Contact sheet: top row 100 % crops at Amount 0 / 40 / 100, bottom row frames at Amount 40.

## Pitfalls hit

- **Attempt 1 read as blotches, not grain**: Fractal Scale 28 with Texture opacity = Amount gave std dev
  17.6 at Amount 50 and visible 10–15 px clumps (see the first section of `verify_report.txt`). Fine film grain at
  1080p needs Scale ≈ 10 and a capped overlay opacity (≤ 50 %).
- A Python string replace in my own patching silently missed the opacity expression once (read-back showed
  opacity 40 instead of 20); reading the driven values back in the verify script caught it.

## Promotion notes

- Grain recipe for SKILL.md's styling section: Fractal Noise Scale ≈ 10, Contrast 160, Overlay ≤ 50 %, Evolution
  keyed linear ~180°/frame, plus Noise 2–5 %; measure luma std dev in a flat patch (≈ 7 reads as subtle film grain).
