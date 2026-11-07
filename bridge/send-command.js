#!/usr/bin/env node
/*
Codex AE Bridge client.

Talks to the same runtime/commands + runtime/results queue as
claude-bridge-client.js (Claude Code). Both CLIs are thin wrappers over
bridge-client-lib.js — one backend, two front doors, so Codex and Claude Code
never fight over a single shared command file.

Legacy action names (createComp, buildSceneFromSpec, applyStackMotion, ...)
still work unchanged — they're sent as the command `type` and the AE-side
queue dispatcher falls back to the original action handler for anything it
doesn't recognize as one of the newer inspect/eval/capture commands.
*/

"use strict";

const fs = require("fs");
const path = require("path");
const bridge = require("./bridge-client-lib.js");

function usage() {
  console.log(`Usage:
  node send-command.js ping
  node send-command.js health
  node send-command.js diagnose
  node send-command.js getActiveComp
  node send-command.js inspectProject
  node send-command.js inspectActiveComp includeProperties=true propertyDepth=2
  node send-command.js inspectCompByName name="Card_Flip_Stack_AE_Bridge_v1"
  node send-command.js setActiveCompByName name="Card_Flip_Stack_AE_Bridge_v1"
  node send-command.js inspectSelectedLayers includeProperties=true propertyDepth=4
  node send-command.js dumpLayerProperties layerName=Hero depth=6
  node send-command.js capturePreviewFrame outputPath=/absolute/path/preview.png time=1.25
  node send-command.js captureFrame compName="My Comp" time=2.8
  node send-command.js doctor [fix=true]
  node send-command.js cache                                  (disk cache, media cache, runtime sizes + warnings)
  node send-command.js cache-clean [fix=true] [maxAgeDays=30] [orphans=true] (old media cache, disk caches of uninstalled AE versions, runtime; dry run by default)
  node send-command.js purgeCache                             (RAM image + snapshot caches; keeps undo)
  node send-command.js purgeCache target=all confirm=true     (RAM + disk cache, AE 24.3+; clears undo)
  node send-command.js evalJSX code="1+1"
  node send-command.js applyJSXFile path=/absolute/path/to/script.jsx
  node send-command.js applySafeJSXFile path=/absolute/path/to/script.jsx undoName="Edit name"
  node send-command.js listProjectAssets
  node send-command.js importAsset path=/absolute/path/video.mp4 name=Hero
  node send-command.js batch commandsPath=/absolute/path/commands.json
  node send-command.js createComp name=AI_Test width=1920 height=1080 duration=8 frameRate=30
  node send-command.js buildSceneFromSpec specPath=/absolute/path/to/spec.json
  node send-command.js updateSceneFromSpec specPath=/absolute/path/to/spec.json
  node send-command.js convertAudioToKeyframes layerName=Music
  node send-command.js replaceFootage layerName=Hero path=/absolute/path/video.mp4
  node send-command.js enqueueRender outputPath=/absolute/path/output.mov
  node send-command.js createWhiteCardStack count=5 widthPercent=27 topPercent=43 intervalFrames=24
  node send-command.js applyStackMotion widthPercent=27 topPercent=43 spacingScale=1 centerScale=112 intervalFrames=24

Any action name is accepted as-is and sent through the shared runtime/commands
queue (runtime/commands/<id>.json -> runtime/results/<id>.json), same as
claude-bridge-client.js uses.
`);
}

function parseValue(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  const numberValue = Number(value);
  if (!Number.isNaN(numberValue) && value.trim() !== "") return numberValue;
  return value;
}

const action = process.argv[2];
if (!action || action === "-h" || action === "--help") {
  usage();
  process.exit(action ? 0 : 2);
}

const params = {};
for (const arg of process.argv.slice(3)) {
  const eq = arg.indexOf("=");
  if (eq === -1) continue;
  params[arg.slice(0, eq)] = parseValue(arg.slice(eq + 1));
}

if (params.commandsPath) {
  params.commands = JSON.parse(fs.readFileSync(params.commandsPath, "utf8"));
  delete params.commandsPath;
}

if (params.specPath && String(params.specPath).endsWith(".json") && process.env.CODEX_BRIDGE_INLINE_SPEC === "1") {
  params.spec = JSON.parse(fs.readFileSync(params.specPath, "utf8"));
}

if (action === "doctor") {
  const report = bridge.doctor(params);
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

if (action === "cache") {
  const report = bridge.getCacheReport();
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

if (action === "cache-clean") {
  const report = bridge.cleanMediaCache(params);
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

if (action === "health") {
  const report = bridge.getBridgeStatus(params);
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.listening === true ? 0 : 1);
}

const SLOW_ACTIONS = new Set(["applyJSXFile", "evalJSX", "applySafeJSXFile", "evalSafeJSX", "buildSceneFromSpec", "updateSceneFromSpec", "batch", "enqueueRender"]);
const timeoutMs = SLOW_ACTIONS.has(action) ? 60000 : 30000;

(async () => {
  try {
    const requireFreshBridge = params.requireFreshBridge !== false && action !== "ping" && action !== "diagnose";
    delete params.requireFreshBridge;
    const result = await bridge.run(action, params, { timeoutMs, health: { requireFreshBridge } });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  } catch (err) {
    console.error(err.message || String(err));
    process.exit(1);
  }
})();
