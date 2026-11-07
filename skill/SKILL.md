---
name: motion-agent
description: Core rules for driving Adobe After Effects with Motion Agent. Read before touching AE through the bridge: ES3 safety, keyframe and easing standards, verification, naming, cache hygiene, and how to replicate a reference.
---

# Motion Agent — core rules

This is the public core of the skill: the contract every session follows. Focused workflows live
in `agent-skills/`; tools live in `tools/` and `ae_scripts/`.

## 1. Talking to After Effects safely

- **ExtendScript is ES3.** No `let/const`, arrow functions, `Array.indexOf/forEach/map`,
  `JSON`, `String.trim`, `Object.keys`, or ES3 reserved words as names. A syntax error opens a
  modal dialog that blocks AE, and `beginSuppressDialogs()` cannot stop it.
- **Every JSX goes through `ae_scripts/tools/run_jsx.sh`**: ES3 lint (`preflight.py`), a run lock
  (AE runs one script at a time), and an explicit timeout. Keep each script under ~30 s; split big builds.
- **Never guess an effect `matchName`.** Display names and matchNames differ in most cases and a
  wrong one fails silently. Look it up with `ae_scripts/tools/fx.py`.
- **No dialogs** (`alert`, `confirm`, `prompt`). Scripts write their results to a file.
- **Never touch a project you did not open.** Check `app.project.file` and `app.project.dirty`
  first; save a timestamped backup before structural edits.

## 2. Let the user watch

- Every script that creates, edits, checks or captures a comp calls `comp.openInViewer()` and sets
  `comp.time = t` before each sample, so the user sees each step.
- Close each sub-comp when done (`comp.openInViewer(); app.executeCommand(4)`); hand over with only
  the main comp open at 0 s (`ae_scripts/tools/close_comps.jsx`). Never call Close Project.
- Do not render the finished film for the user unless asked; they review it in AE.

## 3. Build structure

- **One comp until sign-off.** Build everything in the main comp; group with parenting and nulls,
  switch states with in/out points. Precompose only when an effect, matte or time remap requires it.
  Organize and merge layers together with the user after the animation is final.
- **Persistent elements live once in the main comp** (a phone, a logo, a hero object) with one
  continuous keyframe path across the whole timeline, not one copy per shot.
- **Names are one short word** (`Phone`, `Title`, `Bg`, `TitleA`/`TitleB`, `Control`). No prefixes.
- **Device mockups**: real 3D tilt (X/Y rotation on 3D layers through a perspective camera) is fine;
  a front-facing device rotated flat on Z is not.

## 4. Motion: keyframes and smooth Bézier curves

- **Keyframes first, expressions only when necessary** (number formatting, procedural noise, many
  layers tied to one control). Designers must be able to reshape every curve in the Graph Editor.
- **No linear keyframes on motion.** Use the standard curves in `ae_scripts/lib/easing.jsx`
  (Penner / Material 3 / IBM Carbon cubic-beziers converted exactly to AE speed and influence):
  `MAEase.apply(prop, k1, k2, "easeOutQuint")`.

| Situation | Curve |
|---|---|
| Entrance, burst out then settle | `easeOutQuint`, `easeOutExpo`, `m3EmphasizedDecelerate` |
| Move from A to B on screen | `easeInOutCubic`, `m3Standard` |
| Exit | `easeInCubic`, `m3EmphasizedAccelerate` |
| Between overshoot turning points | `easeInOutSine` |
| Final settle | `easeOutQuart` |
| Colour / opacity fade | `easeOutCubic` |

- **Two keys per move.** Never key every measured sample; measurement defines a move's start,
  end and ease shape. Position, scale and rotation of one move share the same key times.
- **Speeds are signed** for falling values; spatial speed is path length.
- **`setTemporalEaseAtKey` resets HOLD**: set HOLD keys last.
- **Long continuous paths**: separate X/Y/Z, then a monotone cubic spline per channel (C1, zero
  slope at turnarounds, no overshoot); keep speed through cuts; never stall right before a cut.
- **Audit before handing over**: `ae_scripts/tools/audit_keyframes.jsx` must report
  LINEAR 0 and WOBBLE 0, and every DENSE run must be justified.

## 5. Verify with numbers, not impressions

- Sample properties per frame (`valueAtTime`) and check speed curves; capture frames with
  `comp.saveFrameToPng` (asynchronous: wait for the file) and compare side by side with
  `tools/sheet.py`.
- Fix motion problems in motion channels (path, easing, timing), not by hiding them with opacity.

## 6. Replicating a reference

Full workflow: `agent-skills/motion-replicate`. The rules behind it:

1. **Measure before building.** Fetch the clip (`tools/fetch_reference.py`), analyse it
   (`tools/analyze_reference.py`: size, fps, holds, cuts, loop, palette), then read positions,
   scales and angles at each move's start, end and turning points.
2. **Rebuild the mechanism, not one frame's look.** Measured values feed a rig that generates the
   frames; do not bake per-frame sizes into layers.
3. **Local data is not global truth.** A good fit on a short arc does not prove the whole orbit;
   measure several moments.
4. **No hard-coded environment.** Read comp size and camera at runtime; values that are right for
   1920×1080 are wrong for 1080×1920.
5. **Compare against the reference, not your intent.** Put the reference in the comp as a guide
   layer first, then measure, then compare every round.

6. **Check every transition frame by frame.** For each cut or transition, export about 8 frames
   on each side from the reference at its own frame rate and the same frames from AE, put them
   side by side (`tools/sheet.py --pair`), and fix any frame that differs: cut frame, last and first
   framing, entry/exit direction and speed, transition frames (blur, punch, mask, flash), background
   change. Repeat until every frame matches.

Reference videos belong to their creators: keep them in `refs/` (git-ignored) and credit them.

## 7. Cache hygiene

The panel purges RAM image and snapshot caches every 25 commands or 10 minutes (undo is kept).
The disk cache is cleared at 20 GB once the project is saved. `node bridge/send-command.js cache`
reports sizes; `cache-clean` removes old media cache.

## 8. Learn from every finished piece

When the user confirms a piece is final, run `agent-skills/motion-retrospective`: replay the build
with `tools/retrospective.py`, turn the techniques into recipes, promote new rules here.
