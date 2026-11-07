# Prompt template: micro-interactions trio

```
Read cases/ui-animation/micro-interactions-trio/RECIPE.md.
Run build_micro-interactions-trio.jsx with ACCENT <#7C9CFF>, ON <#5EE0B5>, OFF <#3A3F4B>,
SPIN_CYCLE <1.5> s, SPIN_MIN/MAX <3>/<78> %, BAR_KEYS <[[0.3,0],[1.1,38],[1.6,38],[2.4,74],[2.7,74],[3.4,100]]>,
ON_T <1.0> s, OFF_T <3.0> s, TOGGLE_DUR <0.35> s, labels <...>.
Verify: spinner head/tail angles move only by the rotation step across each cycle boundary,
the % label equals round(Trim End) at sampled times, toggle knob ends at ±travel.
```
