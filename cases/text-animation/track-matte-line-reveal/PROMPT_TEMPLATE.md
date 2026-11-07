# Prompt template: track-matte line reveal

```
Read skill/SKILL.md and cases/text-animation/track-matte-line-reveal/RECIPE.md first.
Run cases/text-animation/track-matte-line-reveal/build_track-matte-line-reveal.jsx with:
LINES = ["<line 1>", "<line 2>", "<line 3>"], COLORS = [<hex per line>],
FONT = "<PostScript name>", FONT_SIZE = <140>, LINE_GAP = <165>,
IN_START <0.30> s, STAGGER <0.12> s, IN_DUR <0.70> s (ease out 60 % / in 85 %),
OUT_START <3.20> s, OUT_DUR <0.55> s.
Each line gets its own alpha matte sized from sourceRectAtTime. Verify: bright-pixel share inside
each line box is 0 at the first frame and after the exit, and every line sits on its baseline at hold.
```
