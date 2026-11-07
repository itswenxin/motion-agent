# Prompt template: blur/zoom punch

```
Read cases/transitions/blur-zoom-punch/RECIPE.md.
Run build_blur-zoom-punch.jsx with scene A/B colors and titles <...>, CUT <2.0> s, PUNCH_IN <0.4> s,
LAND <0.5> s, ZOOM <180> %, BLUR_PEAK <70>. Speeds and influences are derived in the script
(cubic ease-in into the cut, mirrored speed out of it).
Verify per-frame visible scale across the cut (steps rise monotonically into the cut and mirror after)
and that blur radius peaks on the cut frame.
```
