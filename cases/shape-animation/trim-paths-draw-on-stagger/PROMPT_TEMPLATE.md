# Prompt template: Trim Paths draw-on stagger

```
Read cases/shape-animation/trim-paths-draw-on-stagger/RECIPE.md.
Run build_trim-paths-draw-on-stagger.jsx (or adapt its path vertices to <my paths>) with
COLORS = [<hex per path>], STROKE_W <22>, round caps, DRAW_START <0.3> s, STAGGER <0.1> s,
DRAW_DUR <1.0> s (ease out 70 % / in 85 %), OFF_START <2.6> s, OFF_DUR <0.8> s.
Trim Paths inside each group. Verify Trim End per path at 5 times (same curve shifted by the stagger)
and save frames before, during and after the draw-on.
```
