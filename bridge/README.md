# AE AI Bridge

A local, file-based command queue that lets **Codex** and **Claude Code**
both drive After Effects through the same backend — no network server, no
account access, no remote code execution. The queue lives under:

```text
~/Library/Application Support/Motion Agent/runtime
```

Override it with the `AE_AI_BRIDGE_RUNTIME_DIR` environment variable (CLI side) and
**More Settings** in the panel (AE side). Both sides must point at the same folder.

## Architecture

```
Codex CLI ──┐                              ┌── runtime/commands/<id>.json  (written)
            ├──> bridge-client-lib.js ─────┤
Claude CLI ─┘        (shared)               └── runtime/results/<id>.json   (read, polled)

AE ScriptUI panel (AE AI Bridge.jsx — one panel, one Window-menu entry)
  - polls runtime/commands/ every 250ms while "connected"
  - drains it oldest-first, one file at a time
  - writes runtime/results/<id>.json per command
  - archives processed command files to runtime/commands/.processed/
  - screenshots go to runtime/previews/
```

Both `send-command.js` (Codex) and `claude-bridge-client.js` (Claude Code)
are thin CLIs over the **same** `bridge-client-lib.js` module, so there is
one protocol, one queue, one dispatcher on the AE side. Neither agent has
its own divergent script.

## Self-healing behavior

The client runs a lightweight health check around every command:

- before sending, it checks `runtime/commands/` for old pending commands;
- stale pending commands are moved to `runtime/quarantine/` instead of being
  deleted blindly;
- after a command finishes, the client verifies the queue is empty before
  allowing more commands to stack up;
- on timeout, the timed-out command is quarantined and the client stops;
- old `runtime/results/`, `runtime/previews/`, and processed command archives
  are cleaned conservatively by age and count;
- stray files written directly into the runtime root are archived into
  `runtime_legacy_artifacts_<timestamp>/` instead of being left to accumulate;
- JSX files with naked `app.beginUndoGroup()` / `app.endUndoGroup()` calls are
  rejected by the client. Use `applySafeJSXFile` / `evalSafeJSX` so the bridge
  owns the undo wrapper.

Run a manual health check anytime:

```bash
node send-command.js health
node send-command.js doctor
node send-command.js doctor fix=true
bash repair-runtime-link.sh
```

`health` checks the AE panel heartbeat and reports whether the panel is
freshly polling the same runtime folder as the CLI. `doctor` reports pending
commands, queue lock state, heartbeat state, cache sizes, and cleanup actions.
With `fix=true`, stale pending commands are quarantined and cache limits are
applied. `repair-runtime-link.sh` makes the local `bridge/runtime` path point
to the canonical shared runtime, then runs `doctor fix=true`.

If AE shows "connected" but commands are not consumed, run `health` first. A
stale heartbeat means the panel is open but the polling loop is not active
anymore, usually because AE was restarted, the panel was reloaded, or an AE
modal dialog stopped execution. A runtime mismatch means the panel and CLI are
watching different `runtime/commands/` folders; reinstall the panel with
`./install-macos.sh` and reopen `Window > Motion Agent.jsx`.

### Why this doesn't need a lock

Each command is its own uniquely-named file
(`<timestamp>-<random>.json`), written atomically (temp file + rename).
Two clients writing at the same instant can never collide or clobber each
other — there's nothing to lock at the write side. On the AE side, the poll
loop is single-threaded and drains `runtime/commands/` strictly in filename
(= creation-time) order, one file at a time, so execution is always
serialized without a separate cross-process lock. `runtime/queue.lock.json`
is written for observability (current queue depth / in-flight command id),
not as a mutex.

## Install

```bash
cd ae-ai-bridge
./install-macos.sh
```

This copies `AE AI Bridge.jsx` to a single install target (and removes any
stale duplicate left by older installs):

```text
/Applications/Adobe After Effects <version>/Scripts/ScriptUI Panels/Motion Agent.jsx
```

**After editing the JSX source, re-run `./install-macos.sh` and reopen the
panel in AE** (close it and reopen from the Window menu, or restart AE) —
ScriptUI panels are evaluated once when opened, so a running panel won't
pick up file changes until reloaded.

In After Effects: `Window > Motion Agent.jsx` (a single menu entry). Click
**"Codex Desktop"** or **"Claude Code Desktop"** — both buttons connect the
same shared queue, so whichever agent is actively driving AE can click
either one.

## Claude Code: sending commands

```bash
node claude-bridge-client.js ping
node claude-bridge-client.js inspectProject
node claude-bridge-client.js inspectActiveComp includeProperties=true propertyDepth=2
node claude-bridge-client.js inspectComp "Card_Flip_Stack_AE_Bridge_v1"
node claude-bridge-client.js setActiveComp "Card_Flip_Stack_AE_Bridge_v1"
node claude-bridge-client.js apply ./some-script.jsx
node claude-bridge-client.js eval "1 + 1"
node claude-bridge-client.js capture "Card_Flip_Stack_AE_Bridge_v1" 2.8
node claude-bridge-client.js raw <anyLegacyActionName> key=value ...
```

Each call writes a command file, waits for the matching result file, prints
it as JSON, and exits `0` on `ok: true` / `1` otherwise (so it's safe to
chain in scripts or check `$?`).

## Codex: reusing the same channel

Codex keeps using `send-command.js`, unchanged in spirit — same CLI shape,
same argument style — but it now writes into the identical
`runtime/commands/` / `runtime/results/` queue instead of the old single
`command.json` / `status.json` files, so it can never race with Claude Code:

```bash
node send-command.js ping
node send-command.js inspectProject
node send-command.js inspectCompByName name="Card_Flip_Stack_AE_Bridge_v1"
node send-command.js setActiveCompByName name="Card_Flip_Stack_AE_Bridge_v1"
node send-command.js applyJSXFile path=/absolute/path/to/script.jsx
node send-command.js applySafeJSXFile path=/absolute/path/to/script.jsx undoName="Edit name"
node send-command.js evalJSX code="1+1"
node send-command.js captureFrame compName="Card_Flip_Stack_AE_Bridge_v1" time=2.8
node send-command.js doctor fix=true
```

All the pre-existing rich commands (`createComp`, `buildSceneFromSpec`,
`updateSceneFromSpec`, `createWhiteCardStack`, `applyStackMotion`,
`replaceFootage`, `enqueueRender`, `convertAudioToKeyframes`,
`listProjectAssets`, `importAsset`, `batch`, ...) still work exactly as
before — they're dispatched by the same `executeCommand()` function, now
reachable through the new queue by passing their old action name as `type`.

The old ad hoc `run-*.applescript` → `DoScript` files (e.g.
`run-apply-hidden-spawn-one-way-flip.applescript`) are untouched and keep
working, but going forward prefer:

```bash
node send-command.js applyJSXFile path="/absolute/path/to/apply-hidden-spawn-one-way-flip.jsx"
```

— same effect (evaluates the JSX file inside AE), but through the queue, so
it gets a structured `{ok, data, error}` result instead of a blind
fire-and-forget AppleScript call, and both agents can see it in
`runtime/history.jsonl`.

## Command schema

```json
{
  "id": "1784149723951-f5be7c39",
  "type": "inspectCompByName",
  "createdAt": "2026-07-15T21:08:43.951Z",
  "payload": { "name": "Card_Flip_Stack_AE_Bridge_v1" }
}
```

## Result schema

```json
{
  "id": "1784149723951-f5be7c39",
  "ok": true,
  "type": "inspectCompByName",
  "startedAt": "2026-07-15T21:08:44.010Z",
  "finishedAt": "2026-07-15T21:08:44.120Z",
  "data": { "...": "..." },
  "error": null
}
```

On failure, `ok: false`, `data: null`, `error` holds the AE-side exception
message (e.g. `"Comp not found: \"Foo\". Available comps: Bar, Baz"`).

## Core commands

| Command | Payload | Notes |
|---|---|---|
| `ping` | — | Health check. |
| `inspectProject` | — | Project file, bit depth, all comps + footage items (no `activeItem` dependency). |
| `inspectActiveComp` | `includeProperties?, propertyDepth?, maxLayers?` | Reads `app.project.activeItem`. |
| `inspectCompByName` | `name, includeProperties?, propertyDepth?, maxLayers?` | Finds the comp **by name**, independent of what's active. Throws with the list of available comp names if not found. |
| `setActiveCompByName` | `name` | Opens that comp in the viewer (makes it the active item) and returns its info. |
| `captureFrame` | `compName?, time, outputPath?` | Renders a PNG of the given comp (or active comp if `compName` omitted) at `time` seconds. Defaults `outputPath` into `runtime/previews/<compName>-<time>.png`. |
| `evalJSX` | `code` | Runs arbitrary ExtendScript inline inside AE. Local-only, no network exposure — same trust level as the old `DoScript` flow it replaces. |
| `applyJSXFile` | `path` | Reads and evaluates a `.jsx` file from disk inside AE — the queue-native replacement for `osascript ... DoScript`. |
| `evalSafeJSX` | `code, undoName?` | Runs JSX inside a bridge-owned suppress-dialog + undo wrapper. The JSX itself must not call `beginUndoGroup` / `endUndoGroup`. |
| `applySafeJSXFile` | `path, undoName?` | Safe wrapper version of `applyJSXFile`; use this for edits that should be undoable. |
| `doctor` | `fix?, maxResults?, maxPreviews?, maxRootArtifacts?, resultsMaxAgeDays?, previewsMaxAgeDays?, rootArtifactsMaxAgeDays?` | CLI-only health check, queue repair, cache cleanup, and runtime-root artifact archival; does not enqueue an AE command. |

Any other `type` value falls through to the original 20+ legacy actions
(`createComp`, `buildSceneFromSpec`, `applyStackMotion`, etc. — see
`executeCommand()` in the JSX source for the full list).

## Runtime layout

```text
runtime/
  commands/            new command files land here: <id>.json
  commands/.processed/ archive of consumed command files (debugging)
  quarantine/           stale/timeout command files moved here for inspection
  results/              <id>.json written by AE once a command finishes
  previews/             PNGs from captureFrame / capturePreviewFrame
  queue.lock.json        {processing, pendingCount, currentId, updatedAt}
  history.jsonl          append-only log of every executed command
  command.json / status.json   legacy single-command channel (still active,
                                 kept for any external tooling that reads it
                                 directly; new work should use the queue)
```

## End-to-end test

```bash
node claude-bridge-client.js ping
node claude-bridge-client.js inspectComp "Card_Flip_Stack_AE_Bridge_v1"
node claude-bridge-client.js capture "Card_Flip_Stack_AE_Bridge_v1" 2.8
```

Expect `ok: true` on all three, a `pong: true` on the first, a full layer
list on the second, and a PNG written under `runtime/previews/` (path echoed
in the result's `data.outputPath`) on the third.

## Cache hygiene (panel v0.3.0)

- The panel purges After Effects' RAM image and snapshot caches automatically every
  25 commands or 10 minutes, when the queue is idle. Undo history is kept.
- `node send-command.js cache` reports the disk cache, the media cache and the runtime
  folder, with warnings.
- Once the disk cache reaches **20 GB** (override with `MOTION_AGENT_DISK_CACHE_GB`), the
  client clears it automatically after the next command, **only if the project is saved**
  (`purgeCache target=all onlyIfSaved=true`). Unsaved work postpones it to a later command.
- `node send-command.js purgeCache` purges image + snapshot caches on demand.
  `purgeCache target=all confirm=true` clears RAM and disk cache (AE 24.3+); it also clears
  undo history, so save first.
- `node send-command.js cache-clean [fix=true] [maxAgeDays=30] [orphans=true]` removes old
  media cache files, disk caches left by uninstalled AE versions, and stale runtime files.
  Without `fix=true` it only reports.

## Panel layout (v0.3.1)

The panel is often docked in a short slot (about 200 px). Connect buttons come first, there
is no duplicate title row, unfinished buttons are hidden, and the layout re-runs 0.5 s, 2 s and
6 s after AE starts, so Codex Desktop and Claude Code Desktop are visible as soon as AE opens.
After installing a new panel, restart After Effects.

