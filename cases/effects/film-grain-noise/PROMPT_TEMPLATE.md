# Prompt template: film grain

```
Read cases/effects/film-grain-noise/RECIPE.md.
Add the grain system from build_film-grain-noise.jsx on top of <comp>: Texture (Fractal Noise, Overlay)
+ Noise adjustment + Ctrl null with Amount <40> and Size <10>. Mapping: opacity = Amount × 0.5,
Noise = Amount × 0.05; Evolution keyed LINEAR at ~180° per frame.
Verify: luma std dev in a flat patch at Amount 0 / default / 100 (expect 0 / ≈7 / ≈18) and non-zero
difference between consecutive frames.
```
