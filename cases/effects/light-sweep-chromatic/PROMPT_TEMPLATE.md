# Prompt template: light sweep + chromatic shimmer

```
Read cases/effects/light-sweep-chromatic/RECIPE.md.
Run build_light-sweep-chromatic.jsx with TITLE "<text>", INK <non-white color, e.g. #9AA3BD>, SIZE <280>,
sweep SWEEP_T0 <0.8> → SWEEP_T1 <2.0> s, SWEEP_PAD <260>, width <70>, direction <−25>, SPLIT <14> px.
R/G/B copies: CC Light Sweep then Shift Channels (Full Off = 10), G and B in Add mode.
Verify: brightest text pixels at mid-sweep sit at the keyed center (comp space) and the title is a single
color (no fringes) before and after the sweep.
```
