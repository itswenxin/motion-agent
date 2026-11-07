#!/usr/bin/env node
/*
Shared AE AI Bridge client library.

Both `send-command.js` (Codex) and `claude-bridge-client.js` (Claude Code) build
on this module so they speak the exact same protocol against the exact same
runtime folder — no divergent, conflicting scripts per agent.

Protocol (matches the queue consumed by "AE AI Bridge.jsx", the shared panel):

  Command file  runtime/commands/<id>.json
    { id, type, createdAt, payload }

  Result file   runtime/results/<id>.json
    { id, ok, type, startedAt, finishedAt, data, error }

Each command is written to its own uniquely-named file via a temp-file-then-
rename (atomic on the same filesystem), so two clients writing at the same
moment can never corrupt or clobber each other's command — collisions are
structurally impossible since ids are unique. AE drains runtime/commands/ in
filename (== creation-time) order, one file at a time, on a single-threaded
poll loop, so execution itself is always serialized without any extra
cross-process lock. See runtime/queue.lock.json for live queue depth.
*/

"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const vm = require("vm");

const DEFAULT_RUNTIME_DIR = path.join(os.homedir(), "Library", "Application Support", "Motion Agent", "runtime");
const RUNTIME_DIR = path.resolve(process.env.AE_AI_BRIDGE_RUNTIME_DIR || DEFAULT_RUNTIME_DIR);
const COMMANDS_DIR = path.join(RUNTIME_DIR, "commands");
const RESULTS_DIR = path.join(RUNTIME_DIR, "results");
const PREVIEWS_DIR = path.join(RUNTIME_DIR, "previews");
const PROCESSED_COMMANDS_DIR = path.join(COMMANDS_DIR, ".processed");
const QUARANTINE_DIR = path.join(RUNTIME_DIR, "quarantine");
const DOCTOR_STATE_PATH = path.join(RUNTIME_DIR, "doctor-state.json");
const STATUS_PATH = path.join(RUNTIME_DIR, "status.json");

const DEFAULT_HEALTH_OPTIONS = {
  staleCommandMs: 2 * 60 * 1000,
  autoCleanupIntervalMs: 30 * 60 * 1000,
  resultsMaxAgeDays: 7,
  previewsMaxAgeDays: 3,
  processedMaxAgeDays: 7,
  rootArtifactsMaxAgeDays: 0,
  maxResults: 1500,
  maxPreviews: 300,
  maxProcessedCommands: 1500,
  maxRootArtifacts: 0,
  heartbeatStaleMs: 5000,
  requireFreshBridge: false,
  cacheCheckIntervalMs: 15 * 60 * 1000,
};

const RUNTIME_ROOT_KEEP_NAMES = new Set([
  ".gitkeep",
  "command.json",
  "commands",
  "doctor-state.json",
  "history.jsonl",
  "install-tmp",
  "last-poll-error.json",
  "previews",
  "quarantine",
  "queue.lock.json",
  "results",
  "scripts-archive",
  "status.json",
]);

function ensureDirs() {
  for (const dir of [RUNTIME_DIR, COMMANDS_DIR, RESULTS_DIR, PREVIEWS_DIR, PROCESSED_COMMANDS_DIR, QUARANTINE_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function makeId() {
  return `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

/** Write a command into the queue. Returns the command object (with its id). */
// Keep a copy of every JSX file the agent runs, so tools/retrospective.py can rebuild
// the full history of a piece even after the working scripts are moved or deleted.
const SCRIPTS_ARCHIVE_DIR = path.join(RUNTIME_DIR, "scripts-archive");
function archiveScriptForRetrospective(id, payload) {
  try {
    const p = payload && payload.path;
    if (!p || !/\.(jsx|js)$/i.test(String(p)) || !fs.existsSync(p)) return;
    if (fs.statSync(p).size > 2 * 1024 * 1024) return;
    fs.mkdirSync(SCRIPTS_ARCHIVE_DIR, { recursive: true });
    fs.copyFileSync(p, path.join(SCRIPTS_ARCHIVE_DIR, `${id}.jsx`));
  } catch (err) { /* archiving must never block a command */ }
}

function sendCommand(type, payload) {
  if (!type) {
    throw new Error("sendCommand requires a type.");
  }
  ensureDirs();
  const id = makeId();
  const command = {
    id,
    type,
    createdAt: new Date().toISOString(),
    payload: payload || {},
  };
  archiveScriptForRetrospective(id, command.payload);
  const finalPath = path.join(COMMANDS_DIR, `${id}.json`);
  const tmpPath = path.join(COMMANDS_DIR, `.${id}.json.tmp`);
  fs.writeFileSync(tmpPath, JSON.stringify(command, null, 2));
  fs.renameSync(tmpPath, finalPath);
  return command;
}

function parseBridgePayload(raw) {
  try {
    return JSON.parse(raw);
  } catch (jsonErr) {
    // Older AE panel builds serialize ExtendScript object literals instead of
    // strict JSON, e.g. `({id:"...", ok:true})`. Evaluate in an empty context so
    // the Node client can interoperate with those installed panel versions.
    return vm.runInNewContext(raw, Object.create(null), { timeout: 1000 });
  }
}

function nowIso() {
  return new Date().toISOString();
}

function parseBool(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  if (value === true || value === "true" || value === "1") return true;
  if (value === false || value === "false" || value === "0") return false;
  return fallback;
}

function listJsonFiles(dir) {
  try {
    return fs.readdirSync(dir)
      .filter((name) => name.endsWith(".json") && !name.startsWith("."))
      .map((name) => path.join(dir, name));
  } catch (err) {
    return [];
  }
}

function fileInfo(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return {
      path: filePath,
      name: path.basename(filePath),
      mtimeMs: stat.mtimeMs,
      size: stat.size,
    };
  } catch (err) {
    return null;
  }
}

function readJsonFile(filePath) {
  try {
    return parseBridgePayload(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    return null;
  }
}

function moveToQuarantine(filePath, reason) {
  ensureDirs();
  const info = fileInfo(filePath);
  if (!info) return null;
  const safeReason = String(reason || "unknown").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 60);
  const dest = path.join(QUARANTINE_DIR, `${Date.now()}-${safeReason}-${path.basename(filePath)}`);
  fs.renameSync(filePath, dest);
  return {
    from: filePath,
    to: dest,
    size: info.size,
  };
}

function cleanupFiles(dir, options) {
  const opts = options || {};
  const maxAgeDays = Number(opts.maxAgeDays || 0);
  const maxFiles = Number(opts.maxFiles || 0);
  const fix = Boolean(opts.fix);
  const now = Date.now();
  const files = [];

  for (const name of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    if (name.startsWith(".")) continue;
    const fullPath = path.join(dir, name);
    let stat;
    try {
      stat = fs.statSync(fullPath);
    } catch (err) {
      continue;
    }
    if (!stat.isFile()) continue;
    files.push({ path: fullPath, name, mtimeMs: stat.mtimeMs, size: stat.size });
  }

  const deleteSet = new Set();
  if (maxAgeDays > 0) {
    const cutoff = now - maxAgeDays * 24 * 60 * 60 * 1000;
    for (const file of files) {
      if (file.mtimeMs < cutoff) deleteSet.add(file.path);
    }
  }
  if (maxFiles > 0 && files.length > maxFiles) {
    const oldestFirst = files.slice().sort((a, b) => a.mtimeMs - b.mtimeMs);
    for (const file of oldestFirst.slice(0, files.length - maxFiles)) {
      deleteSet.add(file.path);
    }
  }

  const deleted = [];
  for (const filePath of deleteSet) {
    const info = fileInfo(filePath);
    if (!info) continue;
    if (fix) {
      fs.unlinkSync(filePath);
    }
    deleted.push(info);
  }

  return {
    dir,
    scanned: files.length,
    deleted: deleted.length,
    bytesDeleted: deleted.reduce((sum, file) => sum + file.size, 0),
    dryRun: !fix,
  };
}

function cleanupRuntime(options) {
  ensureDirs();
  const opts = Object.assign({}, DEFAULT_HEALTH_OPTIONS, options || {});
  const fix = Boolean(opts.fix);
  return {
    results: cleanupFiles(RESULTS_DIR, {
      fix,
      maxAgeDays: opts.resultsMaxAgeDays,
      maxFiles: opts.maxResults,
    }),
    previews: cleanupFiles(PREVIEWS_DIR, {
      fix,
      maxAgeDays: opts.previewsMaxAgeDays,
      maxFiles: opts.maxPreviews,
    }),
    processedCommands: cleanupFiles(PROCESSED_COMMANDS_DIR, {
      fix,
      maxAgeDays: opts.processedMaxAgeDays,
      maxFiles: opts.maxProcessedCommands,
    }),
    rootArtifacts: archiveRuntimeRootArtifacts({
      fix,
      maxAgeDays: opts.rootArtifactsMaxAgeDays,
      maxFiles: opts.maxRootArtifacts,
    }),
  };
}

function makeArchiveStamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "_");
}

function archiveRuntimeRootArtifacts(options) {
  const opts = options || {};
  const fix = Boolean(opts.fix);
  const maxAgeDays = Number(opts.maxAgeDays || 0);
  const maxFiles = Number(opts.maxFiles || 0);
  if (maxAgeDays <= 0 && maxFiles <= 0) {
    return {
      dir: RUNTIME_DIR,
      archiveDir: null,
      scanned: 0,
      archived: 0,
      failed: 0,
      bytesArchived: 0,
      dryRun: !fix,
      failures: [],
    };
  }
  const now = Date.now();
  const entries = [];

  for (const name of fs.existsSync(RUNTIME_DIR) ? fs.readdirSync(RUNTIME_DIR) : []) {
    if (RUNTIME_ROOT_KEEP_NAMES.has(name)) continue;
    const fullPath = path.join(RUNTIME_DIR, name);
    let stat;
    try {
      stat = fs.lstatSync(fullPath);
    } catch (err) {
      continue;
    }
    entries.push({
      path: fullPath,
      name,
      mtimeMs: stat.mtimeMs,
      size: stat.isDirectory() ? 0 : stat.size,
      isDirectory: stat.isDirectory(),
    });
  }

  const archiveSet = new Set();
  if (maxAgeDays > 0) {
    const cutoff = now - maxAgeDays * 24 * 60 * 60 * 1000;
    for (const entry of entries) {
      if (entry.mtimeMs < cutoff) archiveSet.add(entry.path);
    }
  }
  if (maxFiles > 0 && entries.length > maxFiles) {
    const oldestFirst = entries.slice().sort((a, b) => a.mtimeMs - b.mtimeMs);
    for (const entry of oldestFirst.slice(0, entries.length - maxFiles)) {
      archiveSet.add(entry.path);
    }
  }

  const candidates = entries.filter((entry) => archiveSet.has(entry.path));
  const archived = [];
  const failed = [];
  let archiveDir = null;

  if (fix && candidates.length > 0) {
    archiveDir = path.join(path.dirname(RUNTIME_DIR), `runtime_legacy_artifacts_${makeArchiveStamp()}`);
    fs.mkdirSync(archiveDir, { recursive: true });
  }

  for (const entry of candidates) {
    if (!fix) {
      archived.push(entry);
      continue;
    }
    try {
      const dest = path.join(archiveDir, entry.name);
      fs.renameSync(entry.path, dest);
      archived.push(Object.assign({}, entry, { to: dest }));
    } catch (err) {
      failed.push({
        path: entry.path,
        name: entry.name,
        error: err.message || String(err),
      });
    }
  }

  return {
    dir: RUNTIME_DIR,
    archiveDir,
    scanned: entries.length,
    archived: archived.length,
    failed: failed.length,
    bytesArchived: archived.reduce((sum, entry) => sum + entry.size, 0),
    dryRun: !fix,
    failures: failed,
  };
}

function getPendingCommands() {
  ensureDirs();
  return listJsonFiles(COMMANDS_DIR)
    .map((filePath) => {
      const info = fileInfo(filePath);
      if (!info) return null;
      const payload = readJsonFile(filePath);
      return Object.assign(info, {
        id: payload && payload.id,
        type: payload && payload.type,
        createdAt: payload && payload.createdAt,
        ageMs: Date.now() - info.mtimeMs,
      });
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function getQueueLock() {
  return readJsonFile(path.join(RUNTIME_DIR, "queue.lock.json"));
}

function getRuntimeStats() {
  function dirStats(dir) {
    let files = 0;
    let bytes = 0;
    if (!fs.existsSync(dir)) return { files, bytes };
    for (const name of fs.readdirSync(dir)) {
      if (name.startsWith(".")) continue;
      const fullPath = path.join(dir, name);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isFile()) {
          files += 1;
          bytes += stat.size;
        }
      } catch (err) {}
    }
    return { files, bytes };
  }

  return {
    commands: dirStats(COMMANDS_DIR),
    results: dirStats(RESULTS_DIR),
    previews: dirStats(PREVIEWS_DIR),
    processedCommands: dirStats(PROCESSED_COMMANDS_DIR),
    quarantine: dirStats(QUARANTINE_DIR),
  };
}

function normalizePathForCompare(filePath) {
  if (!filePath) return "";
  return path.resolve(String(filePath));
}

function parseStatusTime(status) {
  if (!status) return null;
  const stamp = status.heartbeatAt || status.updatedAt || status.time || status.finishedAt || status.startedAt;
  if (!stamp) return null;
  const ms = Date.parse(stamp);
  return Number.isNaN(ms) ? null : ms;
}

function getBridgeStatus(options) {
  ensureDirs();
  const opts = Object.assign({}, DEFAULT_HEALTH_OPTIONS, options || {});
  const report = {
    statusPath: STATUS_PATH,
    expectedRuntimeDir: RUNTIME_DIR,
    exists: false,
    listening: null,
    fresh: false,
    ageMs: null,
    runtimeMatches: null,
    reason: "status-missing",
    status: null,
  };

  if (!fs.existsSync(STATUS_PATH)) {
    return report;
  }

  report.exists = true;
  const status = readJsonFile(STATUS_PATH);
  report.status = status;
  if (!status) {
    report.reason = "status-unreadable";
    return report;
  }

  const reportedRuntimeDir = status.runtimeDir || (status.data && status.data.runtimeDir);
  if (reportedRuntimeDir) {
    report.reportedRuntimeDir = reportedRuntimeDir;
    report.runtimeMatches = normalizePathForCompare(reportedRuntimeDir) === normalizePathForCompare(RUNTIME_DIR);
  }

  const statusMs = parseStatusTime(status);
  if (statusMs) {
    report.ageMs = Date.now() - statusMs;
    report.fresh = report.ageMs <= Number(opts.heartbeatStaleMs);
  }

  const explicitlyDisconnected = status.action === "disconnected" || status.listening === false;
  if (explicitlyDisconnected) {
    report.listening = false;
    report.reason = "panel-disconnected";
  } else if (report.runtimeMatches === false) {
    report.listening = false;
    report.reason = "runtime-mismatch";
  } else if (report.fresh) {
    report.listening = true;
    report.reason = "heartbeat-fresh";
  } else if (status.heartbeatAt) {
    report.listening = false;
    report.reason = "heartbeat-stale";
  } else {
    report.listening = null;
    report.reason = "legacy-status-no-heartbeat";
  }

  return report;
}

function validateJSXPayload(type, payload) {
  if (type !== "applyJSXFile" && type !== "evalJSX" && type !== "applySafeJSXFile" && type !== "evalSafeJSX") {
    return;
  }
  let code = "";
  if (type === "evalJSX" || type === "evalSafeJSX") {
    code = String((payload && payload.code) || "");
  } else {
    const scriptPath = payload && payload.path;
    if (!scriptPath) return;
    try {
      code = fs.readFileSync(scriptPath, "utf8");
    } catch (err) {
      return;
    }
  }
  if (/(beginUndoGroup|endUndoGroup)\s*\(/.test(code)) {
    throw new Error(
      "JSX contains naked beginUndoGroup/endUndoGroup calls. Use applySafeJSXFile/evalSafeJSX with undoName instead, and remove manual undo calls from the script."
    );
  }
}

// ── AE cache hygiene ─────────────────────────────────────────────
// The disk cache and media cache grow without bound during long agent sessions
// (one real session left a 50 GB disk cache). These helpers measure them and
// clean what is safe to clean from outside AE.

const CACHE_WARN_RATIO = 0.8;
// Clear the AE disk cache once it reaches this size (GB), even if AE's own limit is higher.
const DISK_CACHE_CLEAN_GB = Number(process.env.MOTION_AGENT_DISK_CACHE_GB || 20);
const MEDIA_CACHE_DIRS = [
  path.join(os.homedir(), "Library", "Application Support", "Adobe", "Common", "Media Cache Files"),
  path.join(os.homedir(), "Library", "Application Support", "Adobe", "Common", "Media Cache"),
];

function dirSizeBytes(dir) {
  if (!fs.existsSync(dir)) return 0;
  try {
    const out = require("child_process").execFileSync("du", ["-sk", dir], { encoding: "utf8", timeout: 60000 });
    return Number(out.split(/\s+/)[0]) * 1024;
  } catch (err) {
    return 0;
  }
}

function readAeDiskCachePrefs() {
  const prefsRoot = path.join(os.homedir(), "Library", "Preferences", "Adobe", "After Effects");
  if (!fs.existsSync(prefsRoot)) return null;
  const versions = fs.readdirSync(prefsRoot).filter((v) => /^\d+(\.\d+)*$/.test(v))
    .sort((a, b) => a.split(".").map(Number).reduce((acc, n, i) => acc || n - (Number(b.split(".")[i]) || 0), 0));
  // Prefer the prefs of the newest installed After Effects (a newer prefs folder
  // can be left behind by a beta), then fall back to the highest version folder.
  const installed = [];
  try {
    for (const app of fs.readdirSync("/Applications").filter((n) => n.startsWith("Adobe After Effects"))) {
      const bundle = fs.readdirSync(path.join("/Applications", app)).find((n) => /^Adobe After Effects.*\.app$/.test(n));
      if (!bundle) continue;
      const plist = fs.readFileSync(path.join("/Applications", app, bundle, "Contents", "Info.plist"), "utf8");
      const m = plist.match(/<key>CFBundleShortVersionString<\/key>\s*<string>(\d+)\.(\d+)/);
      if (m) installed.push(`${m[1]}.${m[2]}`);
    }
  } catch (err) { /* no /Applications access */ }
  const ordered = versions.filter((v) => !installed.includes(v)).concat(versions.filter((v) => installed.includes(v)));
  for (let i = ordered.length - 1; i >= 0; i--) {
    const v = ordered[i];
    const file = path.join(prefsRoot, v, `Adobe After Effects ${v} Prefs.txt`);
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, "utf8").replace(/\r/g, "\n");
    const start = text.indexOf('["Disk Cache Controls"]');
    if (start === -1) continue;
    const section = text.slice(start, text.indexOf("\n[", start + 1) === -1 ? undefined : text.indexOf("\n[", start + 1));
    const folder = (section.match(/"Folder \d+" = "([^"]+)"/) || [])[1];
    const maxGB = Number((section.match(/"Max Size \d+" = "([^"]+)"/) || [])[1] || 0);
    const enabled = (section.match(/"Enabled \d+" = "([^"]+)"/) || [])[1] !== "0";
    return { version: v, prefsFile: file, folder, maxGB, enabled, installed };
  }
  return null;
}

function findAeDiskCacheDirs(prefs) {
  if (!prefs || !prefs.folder) return [];
  const base = path.join(prefs.folder, "Adobe", "After Effects");
  if (!fs.existsSync(base)) return [];
  const dirs = [];
  for (const v of fs.readdirSync(base)) {
    const vdir = path.join(base, v);
    if (!fs.statSync(vdir).isDirectory()) continue;
    for (const name of fs.readdirSync(vdir)) {
      if (name.startsWith("Disk Cache")) dirs.push(path.join(vdir, name));
    }
  }
  return dirs;
}

function isAfterEffectsRunning() {
  try {
    const out = require("child_process").execFileSync("pgrep", ["-f", "Adobe After Effects.*/Contents/MacOS/After Effects"], { encoding: "utf8" });
    return out.trim().length > 0;
  } catch (err) {
    return false;
  }
}

function getCacheReport() {
  const prefs = readAeDiskCachePrefs();
  const installed = (prefs && prefs.installed) || [];
  const diskDirs = findAeDiskCacheDirs(prefs).map((dir) => {
    const version = path.basename(path.dirname(dir));
    // A cache folder for a version that is no longer installed is never read again.
    const orphan = installed.length > 0 && !installed.includes(version);
    return { dir, version, orphan, gb: +(dirSizeBytes(dir) / 1e9).toFixed(2) };
  });
  const diskGB = diskDirs.reduce((a, d) => a + d.gb, 0);
  const media = MEDIA_CACHE_DIRS.map((dir) => ({ dir, gb: +(dirSizeBytes(dir) / 1e9).toFixed(2) }));
  const runtimeGB = +(dirSizeBytes(RUNTIME_DIR) / 1e9).toFixed(3);
  const warnings = [];
  const activeGB = diskDirs.filter((d) => !d.orphan).reduce((a, d) => a + d.gb, 0);
  const thresholdGB = prefs && prefs.maxGB > 0 ? Math.min(DISK_CACHE_CLEAN_GB, prefs.maxGB * CACHE_WARN_RATIO) : DISK_CACHE_CLEAN_GB;
  const needsDiskPurge = activeGB >= thresholdGB;
  if (needsDiskPurge) {
    warnings.push(`AE disk cache is ${activeGB.toFixed(1)} GB (clean threshold ${thresholdGB.toFixed(0)} GB). It is cleared automatically after the next command once the project is saved, or run: purgeCache target=all confirm=true`);
  }
  const orphanGB = diskDirs.filter((d) => d.orphan).reduce((a, d) => a + d.gb, 0);
  if (orphanGB > 1) warnings.push(`${orphanGB.toFixed(1)} GB of disk cache belongs to After Effects versions that are no longer installed. Run: cache-clean fix=true orphans=true`);
  const mediaGB = media.reduce((a, d) => a + d.gb, 0);
  if (mediaGB > 20) warnings.push(`Media cache is ${mediaGB.toFixed(1)} GB. Run: cache-clean fix=true maxAgeDays=30`);
  return {
    aeRunning: isAfterEffectsRunning(),
    diskCache: { limitGB: prefs ? prefs.maxGB : null, cleanThresholdGB: +thresholdGB.toFixed(1), needsPurge: needsDiskPurge, enabled: prefs ? prefs.enabled : null, totalGB: +diskGB.toFixed(2), dirs: diskDirs },
    mediaCache: { totalGB: +mediaGB.toFixed(2), dirs: media },
    runtimeGB,
    warnings,
  };
}

function cleanMediaCache(options) {
  const opts = options || {};
  const fix = parseBool(opts.fix, false);
  const maxAgeDays = Number(opts.maxAgeDays || 30);
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  const removed = [];
  let bytes = 0;
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      let st;
      try { st = fs.lstatSync(full); } catch (err) { continue; }
      if (st.isDirectory()) { walk(full); continue; }
      if (st.mtimeMs < cutoff) {
        bytes += st.size;
        removed.push(full);
        if (fix) { try { fs.unlinkSync(full); } catch (err) { /* in use: skip */ } }
      }
    }
  }
  MEDIA_CACHE_DIRS.forEach(walk);
  const orphanDirs = [];
  if (parseBool(opts.orphans, false)) {
    const prefs = readAeDiskCachePrefs();
    const installed = (prefs && prefs.installed) || [];
    for (const dir of findAeDiskCacheDirs(prefs)) {
      const version = path.basename(path.dirname(dir));
      if (installed.length === 0 || installed.includes(version)) continue;
      orphanDirs.push({ dir, gb: +(dirSizeBytes(dir) / 1e9).toFixed(2) });
      if (fix) fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  const runtime = cleanupRuntime(Object.assign({}, DEFAULT_HEALTH_OPTIONS, { fix }));
  return { fix, maxAgeDays, mediaFiles: removed.length, mediaGB: +(bytes / 1e9).toFixed(2), orphanDirs, runtime };
}

function maybeCheckCaches() {
  const state = readJsonFile(DOCTOR_STATE_PATH) || {};
  if (state.lastCacheCheckAt && Date.now() - Date.parse(state.lastCacheCheckAt) < DEFAULT_HEALTH_OPTIONS.cacheCheckIntervalMs) {
    return state.lastCacheWarnings || [];
  }
  let warnings = [];
  let needsPurge = false;
  try { const r = getCacheReport(); warnings = r.warnings; needsPurge = r.diskCache.needsPurge; } catch (err) { warnings = []; }
  const next = Object.assign({}, readJsonFile(DOCTOR_STATE_PATH) || {}, { lastCacheCheckAt: nowIso(), lastCacheWarnings: warnings, diskCacheNeedsPurge: needsPurge });
  fs.writeFileSync(DOCTOR_STATE_PATH, JSON.stringify(next, null, 2));
  return warnings;
}

/** After a successful command: clear the disk cache if it is over the threshold and the project is saved. */
async function maybeAutoDiskPurge(lastType, options) {
  if (lastType === "purgeCache") return null;
  const state = readJsonFile(DOCTOR_STATE_PATH) || {};
  if (!state.diskCacheNeedsPurge) return null;
  const command = sendCommand("purgeCache", { target: "all", onlyIfSaved: true });
  const result = await waitForResult(command.id, Object.assign({}, options, { timeoutMs: 120000 }));
  const data = result && result.data;
  if (result && result.ok && data && !data.skipped) {
    // Re-measure on the next command.
    fs.writeFileSync(DOCTOR_STATE_PATH, JSON.stringify(Object.assign({}, readJsonFile(DOCTOR_STATE_PATH) || {}, { diskCacheNeedsPurge: false, lastCacheCheckAt: null, lastCacheWarnings: [] }), null, 2));
  }
  return result;
}

function maybeRunAutoCleanup() {
  ensureDirs();
  const state = readJsonFile(DOCTOR_STATE_PATH) || {};
  const intervalMs = DEFAULT_HEALTH_OPTIONS.autoCleanupIntervalMs;
  if (state.lastAutoCleanupAt && Date.now() - Date.parse(state.lastAutoCleanupAt) < intervalMs) {
    return null;
  }
  const cleanup = cleanupRuntime(Object.assign({}, DEFAULT_HEALTH_OPTIONS, { fix: true }));
  fs.writeFileSync(DOCTOR_STATE_PATH, JSON.stringify(Object.assign({}, state, {
    lastAutoCleanupAt: nowIso(),
    lastAutoCleanup: cleanup,
  }), null, 2));
  return cleanup;
}

function preflight(type, payload, options) {
  ensureDirs();
  validateJSXPayload(type, payload);

  const opts = Object.assign({}, DEFAULT_HEALTH_OPTIONS, options || {});
  const bridgeStatus = getBridgeStatus(opts);
  if (opts.requireFreshBridge && bridgeStatus.listening !== true) {
    throw new Error(`AE Bridge is not ready (${bridgeStatus.reason}). Expected runtime: ${RUNTIME_DIR}. Open After Effects > Window > Motion Agent.jsx, click Codex Desktop, then run health again.`);
  }

  const pending = getPendingCommands();
  const stale = pending.filter((cmd) => cmd.ageMs > opts.staleCommandMs);
  const quarantined = [];

  if (stale.length > 0) {
    for (const cmd of stale) {
      quarantined.push(moveToQuarantine(cmd.path, "stale-pending"));
    }
  }

  const freshPending = getPendingCommands();
  if (freshPending.length > 0) {
    const names = freshPending.map((cmd) => `${cmd.id || cmd.name}:${cmd.type || "unknown"}`).join(", ");
    throw new Error(`Bridge queue is not empty after stale-command repair; refusing to stack commands. Pending: ${names}`);
  }

  const cleanup = maybeRunAutoCleanup();
  const cacheWarnings = maybeCheckCaches();
  return {
    bridgeStatus,
    pendingBefore: pending.length,
    staleQuarantined: quarantined.filter(Boolean).length,
    autoCleanup: cleanup,
    cacheWarnings,
  };
}

function postflight(commandId) {
  const pending = getPendingCommands();
  const ownCommandStillPending = pending.find((cmd) => cmd.name === `${commandId}.json`);
  return {
    queueEmpty: pending.length === 0,
    pendingCount: pending.length,
    ownCommandStillPending: Boolean(ownCommandStillPending),
    pending,
  };
}

function doctor(options) {
  ensureDirs();
  const opts = Object.assign({}, DEFAULT_HEALTH_OPTIONS, options || {});
  const fix = parseBool(opts.fix, false);
  const pending = getPendingCommands();
  const stale = pending.filter((cmd) => cmd.ageMs > opts.staleCommandMs);
  const quarantined = [];

  if (fix) {
    for (const cmd of stale) {
      quarantined.push(moveToQuarantine(cmd.path, "doctor-stale-pending"));
    }
  }

  const cleanup = cleanupRuntime(Object.assign({}, opts, { fix }));
  const afterPending = getPendingCommands();
  const report = {
    ok: afterPending.length === 0,
    fixed: fix,
    runtimeDir: RUNTIME_DIR,
    bridgeListening: isBridgeListening(opts),
    bridgeStatus: getBridgeStatus(opts),
    queueLock: getQueueLock(),
    pendingBefore: pending.map((cmd) => ({
      id: cmd.id,
      type: cmd.type,
      ageMs: cmd.ageMs,
      path: cmd.path,
    })),
    stalePending: stale.length,
    staleQuarantined: quarantined.filter(Boolean).length,
    pendingAfter: afterPending.map((cmd) => ({
      id: cmd.id,
      type: cmd.type,
      ageMs: cmd.ageMs,
      path: cmd.path,
    })),
    cleanup,
    stats: getRuntimeStats(),
    checkedAt: nowIso(),
  };

  fs.writeFileSync(DOCTOR_STATE_PATH, JSON.stringify({
    lastDoctorAt: report.checkedAt,
    lastDoctorFix: fix,
    lastDoctorOk: report.ok,
  }, null, 2));

  return report;
}

/** Read a result by command id, or null if AE hasn't produced it yet. */
function readResult(id) {
  const resultPath = path.join(RESULTS_DIR, `${id}.json`);
  if (!fs.existsSync(resultPath)) {
    return null;
  }
  try {
    return parseBridgePayload(fs.readFileSync(resultPath, "utf8"));
  } catch (err) {
    return null;
  }
}

function isBridgeListening() {
  return getBridgeStatus().listening;
}

/** Poll runtime/results/<id>.json until it appears, times out, or fails. */
function waitForResult(id, options) {
  const opts = options || {};
  const timeoutMs = opts.timeoutMs || 30000;
  const pollMs = opts.pollMs || 200;
  const start = Date.now();
  return new Promise((resolve, reject) => {
    (function tick() {
      const result = readResult(id);
      if (result) {
        resolve(result);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        const commandPath = path.join(COMMANDS_DIR, `${id}.json`);
        let quarantined = null;
        if (fs.existsSync(commandPath)) {
          try {
            quarantined = moveToQuarantine(commandPath, "timeout");
          } catch (errMove) {
            quarantined = { error: errMove.message || String(errMove) };
          }
        }
        const bridgeStatus = getBridgeStatus();
        const listening = bridgeStatus.listening;
        const hint = listening === false
          ? ` The bridge is not ready (${bridgeStatus.reason}) — open AE, Window > Motion Agent.jsx, and click Codex Desktop.`
          : " Make sure the Motion Agent panel is open in After Effects and connected (Codex Desktop or Claude Code Desktop button).";
        const quarantineHint = quarantined
          ? ` The timed-out command was quarantined at ${quarantined.to || "unknown"}.`
          : "";
        reject(new Error(`Timed out after ${timeoutMs}ms waiting for result of command ${id} (type not yet processed).${hint}${quarantineHint} Stopping here so no more commands are stacked behind a blocked AE dialog or bridge state.`));
        return;
      }
      setTimeout(tick, pollMs);
    })();
  });
}

/** Send a command and wait for its result. */
async function run(type, payload, options) {
  const opts = options || {};
  const health = preflight(type, payload, opts.health);
  const command = sendCommand(type, payload);
  const result = await waitForResult(command.id, options);
  const post = postflight(command.id);
  result.bridgeHealth = {
    preflight: health,
    postflight: post,
  };
  if (!post.queueEmpty) {
    throw new Error(`Bridge command completed but queue is not empty (${post.pendingCount} pending). Stopping instead of stacking more commands.`);
  }
  if (result.ok && (type === "enqueueRender" || /renderQueue\.render\s*\(/.test(JSON.stringify(payload || {})))) {
    result.bridgeHealth.retrospective = "A render was started. Once the user confirms this render is final, run agent-skills/motion-retrospective now: python3 tools/retrospective.py --slug <piece> --since <session start>.";
  }
  if (result.ok && opts.autoDiskPurge !== false) {
    try {
      const purge = await maybeAutoDiskPurge(type, options);
      if (purge) result.bridgeHealth.autoDiskPurge = purge.data || purge;
    } catch (err) {
      result.bridgeHealth.autoDiskPurge = { error: String(err.message || err) };
    }
  }
  return result;
}

module.exports = {
  DEFAULT_RUNTIME_DIR,
  RUNTIME_DIR,
  COMMANDS_DIR,
  RESULTS_DIR,
  PREVIEWS_DIR,
  PROCESSED_COMMANDS_DIR,
  QUARANTINE_DIR,
  STATUS_PATH,
  ensureDirs,
  makeId,
  sendCommand,
  readResult,
  waitForResult,
  isBridgeListening,
  getBridgeStatus,
  preflight,
  postflight,
  cleanupRuntime,
  getCacheReport,
  cleanMediaCache,
  doctor,
  run,
};
