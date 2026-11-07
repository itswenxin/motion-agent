# Number counter with rolling odometer digits

**Level:** Verified · **Built:** 2026-11-06 in After Effects 26.0 by Motion Agent

A big "$1,284,500" counts up from $0 with a long ease-out, and below it an odometer row of seven
digit columns rolls to the same number with real carry (a column only turns while every lower digit
rolls 9 → 0). Both read one keyframed slider. Comp `Counter`: 1920×1080, 30 fps, 4 s.

## How it is built

1. **Controller null** `Ctrl` with two Slider Controls: `Value` (keyframed) and `Decimals`.
   The count curve is two Bezier keyframes on `Value`, so the designer reshapes it in the Graph Editor.
2. **Big counter**: text layer `Number` (Inter-Bold 210 px). Its Source Text expression reads
   `Value × SCALE`, rounds to `Decimals`, inserts a comma every 3 digits from the right and adds
   prefix/suffix. *Why an expression:* keyframes cannot format a number as text.
3. **Odometer**: one text layer per digit (`Digit0..6`, k = place, Inter-SemiBold 110 px) whose text is the
   column `0\r1\r…\r9\r0` with fixed leading 130 px (`autoLeading = false`). Position Y expression:
   `digit = floor(v/10^k) % 10`, `frac = max(0, (v % 10^k) − (10^k − 1))`, `y = baseline − (digit+frac)·130`.
   The trailing `0` lets 9 roll into 0 without a jump. *Why an expression:* the carry logic links
   seven columns to one value; hand keyframes would have to be redone for every new number.
4. All seven columns share one alpha matte (`Matte`, 1 line tall, switched off), commas are
   static accent-colored text layers in fixed slots, behind them a rounded panel.

## Key parameters

| Parameter | Value |
|---|---|
| Comp | 1920×1080, 30 fps, 4.0 s |
| Count | 0 → 1,284,500, keys at 0.4 s and 2.8 s |
| Slider storage | `Value` holds END / SCALE = 128,450 (SCALE 10), expressions multiply back |
| Ease | key 1 speed 0, outgoing influence 40 %; key 2 speed 0, incoming influence 90 % |
| Format | prefix "$", decimals 0, comma every 3 digits |
| Big counter | Inter-Bold 210 px, tracking −10, baseline y 480 |
| Odometer | 7 columns, pitch 74 px, comma slot 34 px, Inter-SemiBold 110 px, leading 130 px, baseline y 790 |
| Matte | (row width + 20) × 130 px, centered on cap height (0.73 × 110 px) |

## Verification (AE 26.0)

- Slider sampled: 0 (0–0.4 s) → 12,433 (0.8 s) → 71,434 (1.2 s) → 105,923 (1.6 s) → 120,481 (2.0 s)
  → 126,768 (2.4 s) → 128,450 (2.8 s and after). Text read back at the same times:
  `$0, $124,335, $714,338, $1,059,227, $1,204,813, $1,267,682, $1,284,500`.
- Odometer end positions at 2.8 s match the digits of 1,284,500 exactly: Y = 790 / 790 / 140 / 270 / −250
  / 530 / 660 for 10^0…10^6 (= 790 − digit·130). At 0 s every column is at 790 (all zeros).
- 8 expressions, 0 expression errors. Six frames rendered (0.2–3.6 s): big counter and odometer show
  the same number in every frame (`evidence/contact_sheet.jpg`).

## Pitfalls hit

- **Slider Control range.** `setValue(1284500)` fails with
  `After Effects error: Unable to call "setValue" because of parameter 1. Value 1284500 out of range -1000000 to 1000000.`
  Store the value divided by a SCALE constant and multiply in the expression.
- **Proportional figures jiggle a centered counter.** Inter's default digits are proportional: at the
  same digit count the measured width moved between 1094 and 1118 px (1155 px at the end), so a
  centered layer drifts by ±12 px while counting. The odometer row avoids it with fixed-pitch columns;
  for the big counter use a tabular font or left/right justification if that drift matters.
- The units column moves faster than the frame rate during the fast part of the curve, so it reads
  as a blur of random digits; that is expected, it lands exactly once the slider slows down.

## Promotion notes

- Rule: the motion curve lives on a keyframed slider; Source Text / column expressions only format and
  distribute it. Slider Control is clamped to ±1,000,000, scale larger numbers.
- Odometer carry formula `frac = max(0, v mod 10^k − (10^k − 1))` is worth adding to SKILL.md's
  motion-math templates.
