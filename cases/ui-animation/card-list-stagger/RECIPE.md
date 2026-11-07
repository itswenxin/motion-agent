# Card list stagger: one keyed master card, N delayed followers

**Level:** Verified · **Built:** 2026-11-06 in After Effects 26.0 by Motion Agent

Five list cards (avatar + two text bars) rise 80 px, fade in and settle from 94 % scale, one after
another; after a hold they lift 40 px and fade out in the same order. Comp `Stagger`: 1920×1080, 30 fps, 4.5 s.

## How it is built

1. One shape layer per card (`Card1..5`): groups `card` (900×120, roundness 28), `avatar` (72 px circle),
   `bar 1`, `bar 2`; groups are placed with their own Vector Transform. Created bottom card first so
   `Card1` ends up on top of the stack.
2. **Master = Card1**: real Bezier keyframes on Position (entrance + exit), Opacity (in + out) and
   Scale (in). Duration and easing of the whole system are edited here, in the Graph Editor.
3. **Controller** null `Ctrl` with one Slider `Stagger` = 0.08.
4. **Followers** (`Card2..5`) get one-line expressions:
   `m.transform.position.valueAtTime(time − i·stagger) + [0, i·150]`, same for Opacity and Scale, where
   `i` is parsed from the digits in the layer name. *Why an expression:* it makes N copies replay one hand-editable
   curve; without it every curve change would have to be redone on every card.

## Key parameters

| Parameter | Value |
|---|---|
| Comp | 1920×1080, 30 fps, 4.5 s |
| Cards | 5 × (900×120, roundness 28, #1A1D24), spacing 150 px, first card y 240 |
| Stagger | 0.08 s per index (slider) |
| Entrance (master) | 0.30 → 0.90 s: y +80 → 0, Scale 94 → 100 %, Opacity 0 → 100 by 0.72 s |
| Entrance ease | key 1 speed 0, outgoing influence 70 %; key 2 speed 0, incoming influence 85 % |
| Exit (master) | 3.30 → 3.75 s: y 0 → −40, Opacity 100 → 0 |
| Exit ease | hold key outgoing influence 85 % (slow start); last key incoming influence 40 % (quick leave) |

## Verification (AE 26.0)

- Master Position keys read back: 4 keys, influences 70 / 85 / 85 / 40.
- **Follower = delayed master**: on a 1/30 s grid over the whole 4.5 s, every follower's Position and
  Opacity was compared with Card1 at `t − i·0.08` (+ i·150 px). 544 samples, max error 1.4e−14.
- Card Y at 0.9 s: 240 / 390.8 / 543.7 / 701.0 / 872.4 (cards 1–5, targets 240 / 390 / 540 / 690 / 840),
  all at target by 1.3 s. Opacity at 0.7 s: 99.9 / 96.5 / 82.9 / 25.8 / 3.4. Exit at 3.8 s: 0 / 1.1 / 24.9
  / 69.5 / 89.1, all 0 at 4.1 s.
- 12 expressions, 0 errors. Frames 0.25 / 0.55 / 0.75 / 1.4 / 3.55 / 3.85 s in `evidence/contact_sheet.jpg`.

## Pitfalls hit

- None blocking. Deriving `i` from the layer name (not `thisLayer.index`) keeps the stagger stable when
  layers are reordered or a background is added.
- Followers' Position keeps the master's absolute X, so all cards must share X; offset Y by
  `i × spacing` in the expression rather than keying it.

## Promotion notes

- Pattern for SKILL.md's rig section: "key one master, followers = `valueAtTime(time − i·delay)` + layout
  offset; delay on a controller slider". Keeps curves editable while staying one-knob.
