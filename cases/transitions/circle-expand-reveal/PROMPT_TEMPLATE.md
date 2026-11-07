# Prompt template: circle expand reveal

```
Read cases/transitions/circle-expand-reveal/RECIPE.md.
Run build_circle-expand-reveal.jsx with ORIGIN <[x, y] of the tapped element>, scene colors <...>,
REVEAL_T0 <1.0> s, REVEAL_T1 <1.8> s, ease out 60 % / in 85 %.
End size = 2 × (distance to farthest corner + 8). Verify: rendered circle radius at a mid frame
matches Ellipse Size / 2 within 2 px, and all four corners show scene B after REVEAL_T1.
```
