# Prompt template: throw with inertia

```
Read cases/ui-animation/throw-inertia-overshoot/RECIPE.md.
Run build_throw-inertia-overshoot.jsx with P0 <[380,820]>, P1 <[1480,500]>, throw <0.6> → <1.4> s,
spatial handles OUT_TAN <[380,-520]>, IN_TAN <[-420,-160]>, landing speed <1400> px/s (influence 40 %),
FREQ <2.2> Hz, DECAY <5>, AMP = 1/(2π·FREQ).
Verify: max overshoot past P1 and settle time (< 0.5 px), and that the speed just before and just after
the landing key differ by < 10 %.
```
