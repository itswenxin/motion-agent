---
name: motion-replicate
description: Use when the user pastes a Pinterest, Behance, Dribbble, Vimeo, YouTube or direct video link (or drops a video file) and wants the animation recreated in After Effects. Fetches or samples the reference, measures timing and motion, rebuilds it with editable keyframes, and compares frame by frame until it matches.
---

# Motion Replicate — from a reference link to an editable AE rebuild

Read `skill/SKILL.md` section 6, "Replicating a reference", first.
The rule: **measure before building.** Every number in the rebuild comes from the reference.

## 1. Get the reference

```bash
python3 tools/fetch_reference.py "<link>" --slug <short-name>
```

- **Pinterest** (pin.it or /pin/<id>/): downloads the pin's video through Pinterest's public
  widget API, including idea/story pins. If the pin is only an image, the tool says so and prints
  the outbound link: the real motion is usually there (an Instagram or Behance post). Follow it.
- **Direct video URL** (.mp4/.mov/.webm/.gif): downloaded as is.
- **Behance, Vimeo, YouTube, portfolio sites**: often refuse command-line requests (exit code 3)
  or embed a player. Then **watch instead of download**:
  1. Open the project page in the browser and list the players:
     `[...document.querySelectorAll('iframe,video')].map(n => n.src || n.currentSrc)`.
  2. Open the player URL itself (e.g. `https://player.vimeo.com/video/<id>`), paste
     `tools/browser_frame_sampler.js` into the browser's JavaScript tool, run
     `await motionAgentSample({ fps: 12 })`, then screenshot: you get a timestamped contact sheet
     and per-frame motion energy. `await motionAgentShowFrame(t)` + screenshot gives one
     full-resolution frame for measuring positions.
  3. Save the screenshots and the returned JSON into `refs/<slug>/`.
- Never bypass logins, paywalls or bot checks, and never spoof headers to pull protected files.
  If a page blocks you, use the browser route or ask the user to download the clip.

Everything under `refs/` is git-ignored. Reference videos belong to their creators: never commit
them or publish their frames; credit the creator (`meta.json`) in the case.

## 2. Measure

```bash
python3 tools/analyze_reference.py refs/<slug>/reference.mp4 --fps 24
```

Read `refs/<slug>/ANALYSIS.md`: size, frame rate, duration, holds, cuts, fastest moments,
whether it loops, palette, plus a contact sheet and a motion-energy plot. Then measure each
moving element from `frames/` (pixel positions, scale, rotation at its start, end and turning
points; `tools/measure.py` helps) and write a short spec: element → keys (time, value) →
speed shape (ease in / out / both, overshoot).

Tell the user in 3–5 lines what you measured and how you will build it before building.

## 3. Rebuild in After Effects

- Comp at the reference's size and frame rate (scale ×2 for small references, and say so).
- Open the comp in the viewer and move the playhead while working, so the user can watch.
- Keyframes with Bézier easing first (explicit speed/influence that reproduce the measured
  speed curve); expressions only when keyframes cannot do it.
- One short word per comp and layer name.
- Save a backup before each structural change.

### Pixel-level matches and 3D devices

When the reference has a 3D phone (or any rigid object) and the user wants a frame-exact match:

1. **Match the lens first.** Measure perspective (near vs far screen edge at several tilts) and try
   camera zooms until the projection fits; then use that lens for the whole film with HOLD keys on
   the camera. A wrong lens makes every pose fit only part of the frames.
2. **Fit the pose to the reference.** Per frame, find the screen edge and the body outline along
   scan lines and solve position, X/Y/Z rotation and scale by least squares through the camera.
   When only part of the device is visible, fix the angle that cannot be determined. After every
   fit, check the turn direction by eye (which side of the device shows), not just the error number.
3. **Compress samples into a few keys** with `tools/fit_keys.py` (monotone cubic, shared key times,
   one segment per shot, HOLD at cuts) and apply them with the JSX it writes
   (`ae_scripts/tools/apply_keys.jsx`). Influence 33.333 % and speed = slope × fps make AE's Bézier
   keys identical to the fitted spline.
4. **Match the body and the screen separately**: scale only the body layers about the device centre
   when the outline is off but the screen edges fit.
5. **Lay out screen content on a rectified reference**: unproject the reference screen to a flat
   view with the fitted pose, then move and scale regions (title, cards, rows, tab bar) to match.
6. **Distrust large measurement errors** until a close crop confirms them; duplicated frames in the
   reference cannot be matched by smooth motion.
7. **Every round**: per-shot error tables, ours-over-reference sheets, `tools/coarse_check.py` for
   the whole film, a scan for phone-attached layers visible while the phone is hidden, and the
   keyframe audit.
8. **Protect progress**: generate data files with `json.dumps`, never by hand (one stray `]` opened
   an error dialog that silently swallowed every later script); treat a missing report file as
   "AE is blocked" and stop; save after every verified fix.

## 4. Compare and iterate

Render the same timestamps as the reference frames and put them side by side:

```bash
python3 tools/sheet.py "<our frames glob>" refs/<slug>/compare.png --pair "refs/<slug>/frames/f_*.jpg"
```

Check timing (holds and cuts land on the same frames), positions (within a few pixels at the
same scale), speed shape and colour. Fix the biggest mismatch first and compare again.
Report each round with the comparison sheet. Do not render the finished film for the user: save the project, open the main comp at 0 s and tell them its name; they review it in AE. Render only if they ask. Stop when the user is happy.

## 5. Keep what was learned

When the user confirms the render, run `agent-skills/motion-retrospective`. The case credits
the original creator and source link, includes only our own rebuild's frames, and records the
measured numbers and the keyframes that reproduced them.
