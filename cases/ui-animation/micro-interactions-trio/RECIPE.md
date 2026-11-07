# Micro-interactions trio: spinner, progress bar, toggle switch

**Level:** Verified · **Built:** 2026-11-06 in After Effects 26.0 by Motion Agent

Three rows of product-UI feedback in one comp: a Material-style loading spinner whose arc grows and
shrinks while it turns, an upload bar that fills in three eased steps with a live % label, and a
toggle that switches on (knob slides with a squash, track turns green) and off again.
Comp `Micro`: 1920×1080, 30 fps, 4.5 s. Everything except the % label is real keyframes.

## How it is built

**Row 1, spinner** (`Spinner` over a grey `SpinTrack` ring, 96 px, stroke 12, round cap):
- Each 1.5 s cycle: Trim End 3 → 78 % in the first half (Start held at 0), then Trim Start 0 → 75 % in
  the second half (End held at 78). Both eased (influence 75 / 75).
- The last key of each cycle has **outgoing HOLD**, and the next cycle restarts at Start 0 / End 3.
  At the same frame Trim **Offset** jumps by +270° (= 75 % × 3.6) on a HOLD key, so the arc does not move
  on screen when the trim values reset.
- Layer Rotation: two LINEAR keys, 0 → 1215° over 4.5 s (0.75 turns/s).

**Row 2, progress bar**: two shape layers with the same 640 px straight path, stroke 16 round cap:
grey `BarTrack` and blue `Bar` with Trim End keys 0 → 38 → (hold) → 74 → (hold) → 100.
`Percent` Source Text expression: `Math.round(...Trim Paths 1.end) + "%"`. *Why an expression:*
keyframes cannot turn a number into a label; the motion itself stays on the Trim End keys.

**Row 3, toggle**: `Toggle` (168×92 pill) Fill Color keys #3A3F4B → #5EE0B5 → back;
`Knob` (72 px white circle) Position keys ±38 px and a mid-move Scale squash [118, 91] %.

## Key parameters

| Parameter | Value |
|---|---|
| Comp | 1920×1080, 30 fps, 4.5 s; rows at y 300 / 540 / 780, components at x 1180 |
| Spinner | Ø96, stroke 12, cycle 1.5 s, Trim 3 → 78 %, Offset +270° per cycle (HOLD), rotation 0.75 turn/s LINEAR |
| Spinner ease | all Trim keys speed 0, influence in 75 % / out 75 %; cycle-end keys out = HOLD |
| Bar | 640 px, stroke 16; Trim End keys (s, %): (0.3, 0) (1.1, 38) (1.6, 38) (2.4, 74) (2.7, 74) (3.4, 100) |
| Bar ease | speed 0, outgoing influence 65 %, incoming influence 85 % |
| Toggle | on at 1.0 s, off at 3.0 s, 0.35 s each; knob travel ±38 px; squash [118, 91] % at mid-move (influence 50) |
| Toggle ease | speed 0, outgoing influence 70 %, incoming influence 90 % (position, scale and color) |

## Verification (AE 26.0)

- **Spinner seam**: per frame, absolute head = End·3.6 + Offset + Rotation and tail = Start·3.6 + Offset +
  Rotation. Across the cycle boundary (frames 44 → 45): head 676.8° → 685.8°, tail 666° → 675°, i.e. both move
  exactly the 9° of layer rotation per frame while the trim values reset (Start 75 → 0, End 78 → 3,
  Offset 0 → 270). Arc length stays within 10.8° … 280.7°.
- Bar Trim End at 0.3 / 0.7 / 1.1 / 1.4 / 2.0 / 2.4 / 3.0 / 3.4 s: 0 / 27.6 / 38 / 38 / 64.1 / 74 / 87.4 / 100; label
  read back `0% 28% 38% 38% 64% 74% 87% 100%`.
- Toggle knob X: 1142 (0.9 s) → 1149.8 → 1198.9 (1.175 s) → 1218 (1.35 s); Scale [118, 91] at 1.175 s, back
  to 100 at 1.35 s; track color [0.227, 0.247, 0.294] → [0.369, 0.878, 0.71] and back by 3.35 s.
- 1 expression, 0 errors. Frames 0.4 / 1.17 / 1.5 / 2.2 / 3.17 / 3.9 s in `evidence/contact_sheet.jpg`.

## Pitfalls hit

- First layout put the "%" label 70 px right of the bar end; at 100 % the round cap (8 px) and the
  wider "100%" nearly touched. Moved to +100 px.
- A looping Trim Start/End spinner needs the reset hidden: cycle-end keys with HOLD out, plus an Offset
  HOLD jump equal to the travelled distance. Verified numerically (above) rather than by eye.

## Promotion notes

- Spinner loop rule (HOLD-out cycle keys + Offset jump of `(max − min) × 3.6°`) and "label = expression,
  motion = keys" are worth a line in SKILL.md's UI section.
