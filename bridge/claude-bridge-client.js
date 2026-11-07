#!/usr/bin/env node
/*
Claude Code AE Bridge client.

Talks to the same runtime/commands + runtime/results queue as send-command.js
(Codex). Both CLIs are thin wrappers over bridge-client-lib.js — one backend,
two front doors.

Usage:
  node claude-bridge-client.js ping
  node claude-bridge-client.js health
  node claude-bridge-client.js inspectProject
  node claude-bridge-client.js inspectActiveComp [includeProperties=true] [propertyDepth=2]
  node claude-bridge-client.js inspectComp "Card_Flip_Stack_AE_Bridge_v1"
  node claude-bridge-client.js setActiveComp "Card_Flip_Stack_AE_Bridge_v1"
  node claude-bridge-client.js apply ./some-script.jsx
  node claude-bridge-client.js eval "1 + 1"
  node claude-bridge-client.js safeApply ./some-script.jsx ["Undo name"]
  node claude-bridge-client.js doctor [fix=true]
  node claude-bridge-client.js capture "Card_Flip_Stack_AE_Bridge_v1" 2.8 [outputPath]
  node claude-bridge-client.js raw <type> [key=value ...]   (escape hatch: any legacy action too)
*/

"use strict";

const path = require("path");
const bridge = require("./bridge-client-lib.js");

function usage() {
  console.log(`Usage:
  node claude-bridge-client.js ping
  node claude-bridge-client.js health
  node claude-bridge-client.js inspectProject
  node claude-bridge-client.js inspectActiveComp [includeProperties=true] [propertyDepth=2]
  node claude-bridge-client.js inspectComp "<Comp Name>" [includeProperties=true] [propertyDepth=2]
  node claude-bridge-client.js setActiveComp "<Comp Name>"
  node claude-bridge-client.js apply <path/to/script.jsx>
  node claude-bridge-client.js eval "<inline ExtendScript code>"
  node claude-bridge-client.js safeApply <path/to/script.jsx> ["Undo name"]
  node claude-bridge-client.js doctor [fix=true]
  node claude-bridge-client.js capture "<Comp Name>" <timeSeconds> [outputPath]
  node claude-bridge-client.js raw <type> [key=value ...]
`);
}

function parseValue(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  const numberValue = Number(value);
  if (value.trim() !== "" && !Number.isNaN(numberValue)) return numberValue;
  return value;
}

function parseKvArgs(args) {
  const out = {};
  for (const arg of args) {
    const eq = arg.indexOf("=");
    if (eq === -1) continue;
    out[arg.slice(0, eq)] = parseValue(arg.slice(eq + 1));
  }
  return out;
}

async function main() {
  const [, , cmd, ...rest] = process.argv;
  if (!cmd || cmd === "-h" || cmd === "--help") {
    usage();
    process.exit(cmd ? 0 : 2);
  }

  let type;
  let payload = {};
  let timeoutMs = 30000;

  switch (cmd) {
    case "ping":
      type = "ping";
      break;

    case "health": {
      const report = bridge.getBridgeStatus(parseKvArgs(rest));
      console.log(JSON.stringify(report, null, 2));
      process.exit(report.listening === true ? 0 : 1);
      break;
    }

    case "inspectProject":
      type = "inspectProject";
      break;

    case "inspectActiveComp":
      type = "inspectActiveComp";
      payload = parseKvArgs(rest);
      break;

    case "inspectComp": {
      const [name, ...kv] = rest;
      if (!name) {
        console.error('inspectComp requires a comp name: inspectComp "<Comp Name>"');
        process.exit(2);
      }
      type = "inspectCompByName";
      payload = Object.assign({ name }, parseKvArgs(kv));
      break;
    }

    case "setActiveComp": {
      const [name] = rest;
      if (!name) {
        console.error('setActiveComp requires a comp name: setActiveComp "<Comp Name>"');
        process.exit(2);
      }
      type = "setActiveCompByName";
      payload = { name };
      break;
    }

    case "apply": {
      const [scriptPath] = rest;
      if (!scriptPath) {
        console.error("apply requires a path to a .jsx file: apply <path/to/script.jsx>");
        process.exit(2);
      }
      type = "applyJSXFile";
      payload = { path: path.resolve(scriptPath) };
      timeoutMs = 60000;
      break;
    }

    case "eval": {
      const code = rest.join(" ");
      if (!code) {
        console.error('eval requires inline code: eval "<ExtendScript code>"');
        process.exit(2);
      }
      type = "evalJSX";
      payload = { code };
      timeoutMs = 60000;
      break;
    }

    case "safeApply": {
      const [scriptPath, undoName] = rest;
      if (!scriptPath) {
        console.error("safeApply requires a path to a .jsx file: safeApply <path/to/script.jsx> [undoName]");
        process.exit(2);
      }
      type = "applySafeJSXFile";
      payload = { path: path.resolve(scriptPath) };
      if (undoName) payload.undoName = undoName;
      timeoutMs = 60000;
      break;
    }

    case "doctor": {
      const report = bridge.doctor(parseKvArgs(rest));
      console.log(JSON.stringify(report, null, 2));
      process.exit(report.ok ? 0 : 1);
      break;
    }

    case "capture": {
      const [name, time, outputPath] = rest;
      if (!name || time === undefined) {
        console.error('capture requires: capture "<Comp Name>" <timeSeconds> [outputPath]');
        process.exit(2);
      }
      type = "captureFrame";
      payload = { compName: name, time: Number(time) };
      if (outputPath) payload.outputPath = path.resolve(outputPath);
      timeoutMs = 60000;
      break;
    }

    case "raw": {
      const [rawType, ...kv] = rest;
      if (!rawType) {
        console.error("raw requires a command type: raw <type> [key=value ...]");
        process.exit(2);
      }
      type = rawType;
      payload = parseKvArgs(kv);
      break;
    }

    default:
      console.error(`Unknown command: ${cmd}`);
      usage();
      process.exit(2);
  }

  try {
    const result = await bridge.run(type, payload, {
      timeoutMs,
      health: { requireFreshBridge: cmd !== "ping" && cmd !== "diagnose" },
    });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  } catch (err) {
    console.error(err.message || String(err));
    process.exit(1);
  }
}

main();
