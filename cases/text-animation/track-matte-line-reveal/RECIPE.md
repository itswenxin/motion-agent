# Track-matte line reveal: lines slide up out of their own mask

**Level:** Verified · **Built:** 2026-11-06 in After Effects 26.0 by Motion Agent

Three title lines rise into view one after another, each from behind an invisible edge, hold, then
leave upward the same way. Every line has its own rectangular alpha matte, so the text appears to be
cut by a slot rather than fading. Comp `Reveal`: 1920×1080, 30 fps, 4.5 s.

## How it is built

1. **Background**: full-frame shape rectangle (`Bg`, #0E0F13). Shape instead of solid, so a rebuild
   leaves no orphan solids in the project.
2. **One text layer per line** (`Line1..3`, Inter-Bold 140 px, tracking −20, centered). Baselines are
   165 px apart and the block is optically centered (`firstBase = 540 − gap + 0.36·fontSize`).
3. **One matte per line** (`Matte1..3`, white rectangle shape layer). Its size comes from the line's
   real glyph box, `sourceRectAtTime(0)`, plus padding 40 px (x) / 14 px (y), placed at
   `position + rect.left + rect.width/2`, `position + rect.top + rect.height/2`.
4. **Bind**: `text.setTrackMatte(matte, TrackMatteType.ALPHA)`, then `matte.enabled = false`
   (AE 23+ track mattes still work with the matte's video switch off).
5. **Keyframes (no expressions)**: Position Y of each text layer has four Bezier keys:
   hidden below (y + matte height) → baseline → hold → hidden above (y − matte height).
   The drop distance equals the matte height, so in the start/end pose the glyphs sit just outside the slot.
6. Lines are staggered by 0.12 s on both entrance and exit.

## Key parameters

| Parameter | Value |
|---|---|
| Comp | 1920×1080, 30 fps, 4.5 s |
| Font | Inter-Bold 140 px, tracking −20; colors #FFFFFF / #7C9CFF / #FFFFFF |
| Baselines | 425.4 / 590.4 / 755.4 px (gap 165) |
| Glyph boxes (measured) | 750×109, 544×136, 799×130 px |
| Matte size | glyph box + 2×40 (x), + 2×14 (y): 830×137, 624×164, 879×158 |
| Entrance | starts 0.30 s, stagger 0.12 s, duration 0.70 s |
| Entrance ease | key 1 speed 0, outgoing influence 60 %; key 2 speed 0, incoming influence 85 % |
| Exit | starts 3.20 s, stagger 0.12 s, duration 0.55 s |
| Exit ease | hold key outgoing influence 80 % (slow start); last key incoming influence 30 % (leaves fast) |
| Travel | ± matte height (137 / 164 / 158 px) |

## Verification (AE 26.0)

- `trackMatteType` read back as 5013 (ALPHA) on all three lines, matte layer name correct,
  `MatteN.enabled = false`; 0 expressions.
- Position Y sampled (line 1): 562.5 at 0–0.3 s → 460.05 at 0.65 s → 425.4 from 1.0 s to 3.2 s → 390.3 at
  3.5 s → 288.3 at 3.99 s. Line 3 reaches 755.4 at 1.24 s (0.54 + 0.70 s).
- Rendered 6 frames and measured the share of bright pixels inside each line box:
  0.10 s → 0.000 / 0.000 / 0.000 (nothing visible, text is below its slot);
  0.85 s → 0.275 / 0.258 / 0.190 (line 3 still rising);
  1.60 s → 0.263 / 0.257 / 0.247 (all settled);
  4.30 s → 0.000 / 0.000 / 0.000 (all gone). Above y 330 and below y 860 stay background (≤ 0.007).
- Evidence: `evidence/contact_sheet.jpg`, numbers in `verify_report.txt`.

## Pitfalls hit

- `TrackMatteType.ALPHA` reads back as the number 5013, not a string; compare against the enum.
- Size the matte from `sourceRectAtTime`, not from font size: "explains" has a descender and is
  136 px tall while "Motion that" is 109 px, so a fixed matte height either clips the `p` or shows
  the next line.
- The travel must be at least `glyph height + PAD_Y`, otherwise the top of the glyphs peeks into the
  slot on frame 0. Using the matte height as travel guarantees it.

## Promotion notes

- Transferable rule: per-line mattes sized from `sourceRectAtTime` + travel = matte height, mattes bound
  with `setTrackMatte()` and switched off. Worth one line in the SKILL.md text-animation index.
