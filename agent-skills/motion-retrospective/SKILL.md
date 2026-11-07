---
name: motion-retrospective
description: Run immediately after the user confirms an After Effects piece is final (they approve the render or export, say it is done, or ship it). Replays every bridge operation behind the piece, distills reusable recipes, pitfalls and rules into the case library and skill/SKILL.md, and publishes them to the repository.
---

# Motion Retrospective

Every finished piece should leave the agent better than it found it. When a render is
confirmed, review the whole build while the evidence is still in the runtime (processed
commands are pruned after 7 days), and turn it into knowledge the next session can reuse.

## Trigger

Start this skill **in the same turn** the user confirms a final render/export, for example:
"渲染好了 / 导出了 / 就这版 / ship it / looks good, exporting". The bridge also adds
`bridgeHealth.retrospective` to the result of any render command as a reminder.
Do not wait to be asked again.

## Steps

1. **Collect.** Note when the session started, then run:

   ```bash
   python3 tools/retrospective.py --slug <piece-name> --since <session start or e.g. 6h> [--match "<main comp name>"]
   ```

   This writes `cases/_inbox/<date>-<slug>/` with `TIMELINE.md`, `FAILURES.md`,
   `scripts/` (every successful mutating script, de-duplicated) and `stats.json`.

2. **Capture evidence.** Grab 4–6 frames from the final render (`captureFrame` or
   `ae_scripts/tools/run_capture.sh`) and build a contact sheet with `tools/sheet.py`.
   Save into `evidence/`. Never commit the video, the `.aep`, or client footage and fonts.

3. **Review the timeline.** For each run of commands, write down:
   - what the user asked for (from the conversation), what changed, and which script did it;
   - the **mechanism**, not just the look (rig structure, expression, key values, layer order);
   - the **numbers** that made it work (durations, easing influence, offsets, sizes);
   - every failure in `FAILURES.md`: its cause and the fix.

4. **Split into recipes.** One piece usually holds several reusable techniques. Give each one
   its own folder `cases/<category>/<technique>/` (categories: text-animation,
   shape-animation, ui-animation, transitions, effects) with `RECIPE.md`, a cleaned reusable
   `.jsx`, `PROMPT_TEMPLATE.md` and evidence. Keep a project index in
   `cases/projects/<piece>/RECIPE.md` that links them.
   Separate project-specific layer names from the transferable method.

5. **Promote rules.** Copy anything that applies beyond this piece into `skill/SKILL.md`:
   new pitfalls, new user-feedback translations, and the recipe index.
   Tick or add items in the learning map if the repository keeps one. Update the case count and project table in
   `README.md` / `README.zh-CN.md` when they change.

6. **Publish.**

   ```bash
   tools/publish_case.sh cases/<category>/<technique> "what was learned" --push
   ```

   The script scrubs `/Users/<name>/` paths, refuses video/audio/.aep files, runs
   `tools/health_check.py`, commits and pushes. Push automatically only if the repository
   owner opted in (`MOTION_AGENT_AUTO_PUBLISH=1`, or they asked for it); otherwise commit and ask.

7. **Report** to the user in a few lines: how many recipes were added, which rules were
   promoted, and the commit link.

## Quality bar

- A recipe names the mechanism and gives numbers someone can reproduce.
- Every pitfall says what broke, why, and the fix.
- No client assets, private paths, or unreleased material in the public repository.
- If the piece taught nothing new, say so and add only the evidence to an existing case.
