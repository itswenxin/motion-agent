# Prompt template: number counter + rolling digits

```
Read cases/text-animation/number-counter-rolling-digits/RECIPE.md first.
Run build_number-counter-rolling-digits.jsx with END_VAL = <target>, START_VAL = <0>,
PREFIX "<$>", SUFFIX "<>", DECIMALS <0>, count window T0 <0.4> s → T1 <2.8> s,
ease out <40> % / in <90> %, ODO_DIGITS = <7>.
Keep SCALE so END_VAL / SCALE stays within ±1,000,000.
Verify: sample the Source Text at 6+ times, the last must equal the formatted target, and every
odometer column's Y at T1 must equal baseline − digit × leading.
```
