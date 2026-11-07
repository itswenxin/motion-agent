# Prompt template: card list stagger

```
Read cases/ui-animation/card-list-stagger/RECIPE.md.
Run build_card-list-stagger.jsx with COUNT <5>, CARD_W×CARD_H <900×120>, RADIUS <28>, SPACING <150>,
STAGGER <0.08> s, entrance IN_T0 <0.3> s / IN_DUR <0.6> s / RISE <80> px (ease out 70 % / in 85 %),
exit OUT_T0 <3.3> s / OUT_DUR <0.45> s.
Only Card1 has keyframes; followers replay it with valueAtTime(time − i·stagger).
Verify that every follower equals the delayed master on a 1/fps grid (max error < 0.01).
```
