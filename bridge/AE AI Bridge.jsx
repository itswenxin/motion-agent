/*
AE AI Bridge

Shared panel for both Codex and Claude Code -- one menu entry, one command
queue. Install as a ScriptUI panel:
  /Applications/Adobe After Effects <version>/Scripts/ScriptUI Panels/Motion Agent.jsx

Open in After Effects:
  Window > Motion Agent.jsx

This bridge polls a local command queue (runtime/commands/*.json ->
runtime/results/*.json) and executes approved actions in AE. It is
intentionally file-based: no network server, no account access, no remote
code execution.
*/

(function aeAiBridge(thisObj) {
    var BRIDGE_NAME = "Motion Agent";
    var DEFAULT_RUNTIME_DIR = Folder("~/Library/Application Support/Motion Agent/runtime").fsName;
    var state = {
        listening: false,
        lastCommandId: "",
        runtimeDir: DEFAULT_RUNTIME_DIR,
        pollMs: 250,
        panelVersion: "0.3.1",
        connectedAgent: "",
        // Cache hygiene: purge RAM image/snapshot caches while the agent works,
        // so long sessions do not keep piling up preview frames. Undo history is kept.
        autoPurgeMinutes: 10,
        autoPurgeEveryCommands: 25,
        commandsSincePurge: 0,
        lastPurgeMs: new Date().getTime()
    };

    function buildUI(thisObj) {
        var win = (thisObj instanceof Panel)
            ? thisObj
            : new Window("palette", BRIDGE_NAME, undefined, { resizeable: true });

        win.orientation = "column";
        win.alignChildren = ["fill", "fill"];
        win.spacing = 0;
        win.margins = 0;
        win.preferredSize = [320, 220];
        win.minimumSize = [160, 200];

        var titleBar = win.add("group");
        titleBar.orientation = "row";
        titleBar.alignChildren = ["left", "center"];
        titleBar.alignment = ["fill", "top"];
        titleBar.margins = [8, 8, 8, 6];
        var titleText = titleBar.add("statictext", undefined, "Motion Agent");
        titleText.characters = 18;
        var titleSpacer = titleBar.add("statictext", undefined, "");
        titleSpacer.alignment = ["fill", "center"];
        var statusPill = titleBar.add("statictext", undefined, "idle");
        statusPill.characters = 10;
        statusPill.justify = "left";
        titleSpacer.visible = false;
        statusPill.visible = false;
        titleBar.visible = false;
        titleBar.maximumSize.height = 0;

        var body = win.add("group");
        body.orientation = "column";
        body.alignChildren = ["fill", "top"];
        body.alignment = ["fill", "fill"];
        body.spacing = 8;
        body.margins = [10, 8, 10, 8];

        var connectionBanner = body.add("group");
        connectionBanner.orientation = "row";
        connectionBanner.alignChildren = ["left", "center"];
        connectionBanner.alignment = ["fill", "top"];
        connectionBanner.spacing = 6;
        connectionBanner.margins = [0, 0, 0, 0];
        connectionBanner.preferredSize = [260, 22];
        var connectionDot = connectionBanner.add("statictext", undefined, "[ ]");
        connectionDot.characters = 4;
        var connectionLabel = connectionBanner.add("statictext", undefined, "NOT CONNECTED");
        connectionLabel.characters = 18;
        connectionLabel.justify = "left";

        var codexButton = body.add("button", undefined, "Codex Desktop");
        codexButton.alignment = ["fill", "top"];
        codexButton.preferredSize = [260, 32];

        var claudeButton = body.add("button", undefined, "Claude Code Desktop");
        claudeButton.alignment = ["fill", "top"];
        claudeButton.preferredSize = [260, 32];

        var cursorButton = body.add("button", undefined, "Cursor CLI");
        cursorButton.alignment = ["fill", "top"];
        cursorButton.preferredSize = [260, 34];
        cursorButton.enabled = false;
        cursorButton.visible = false;
        cursorButton.maximumSize.height = 0;

        // Status sits under the connect buttons, so a short docked panel still shows the buttons.
        var statusText = body.add("statictext", undefined, "Choose an agent to connect", { multiline: true });
        statusText.justify = "left";
        statusText.alignment = ["fill", "top"];
        statusText.preferredSize = [260, 36];

        var settingsButton = body.add("button", undefined, "More Settings");
        settingsButton.alignment = ["fill", "top"];
        settingsButton.preferredSize = [260, 28];

        var settingsGroup = body.add("group");
        settingsGroup.orientation = "column";
        settingsGroup.alignChildren = ["fill", "top"];
        settingsGroup.spacing = 6;
        settingsGroup.visible = false;
        settingsGroup.alignment = ["fill", "top"];
        settingsGroup.preferredSize = [260, 170];

        var pathInput = settingsGroup.add("edittext", undefined, state.runtimeDir);
        pathInput.characters = 28;

        var settingsButtons = settingsGroup.add("group");
        settingsButtons.orientation = "row";
        settingsButtons.alignChildren = ["left", "center"];
        settingsButtons.alignment = ["fill", "top"];
        var permissionButton = settingsButtons.add("button", undefined, "Check AE Permission");
        var chooseButton = settingsButtons.add("button", undefined, "Choose Folder");
        var revealButton = settingsButtons.add("button", undefined, "Reveal");
        var pollButton = settingsButtons.add("button", undefined, "Poll Once");
        var stopButton = settingsButtons.add("button", undefined, "Disconnect");

        var quickButtons = settingsGroup.add("group");
        quickButtons.orientation = "row";
        quickButtons.alignChildren = ["left", "center"];
        quickButtons.alignment = ["fill", "top"];
        var createButton = quickButtons.add("button", undefined, "Create 5 Cards");
        var stackButton = quickButtons.add("button", undefined, "Apply Stack Motion");

        var logBox = settingsGroup.add("edittext", undefined, "Bridge UI loaded.", { multiline: true, readonly: true });
        logBox.preferredSize = [260, 64];

        var warning = win.add("statictext", undefined, "Connecting a third-party agent shares your AE project structure and prompts with that agent.", { multiline: true });
        warning.alignment = ["fill", "bottom"];
        warning.justify = "left";
        warning.preferredSize = [260, 48];

        win._motionAgentUi = {
            titleBar: titleBar,
            titleText: titleText,
            titleSpacer: titleSpacer,
            statusPill: statusPill,
            body: body,
            statusText: statusText,
            connectionBanner: connectionBanner,
            connectionDot: connectionDot,
            connectionLabel: connectionLabel,
            codexButton: codexButton,
            claudeButton: claudeButton,
            cursorButton: cursorButton,
            settingsButton: settingsButton,
            settingsGroup: settingsGroup,
            pathInput: pathInput,
            settingsButtons: settingsButtons,
            quickButtons: quickButtons,
            logBox: logBox,
            warning: warning
        };

        function setTextColor(control, rgb) {
            try {
                control.graphics.foregroundColor = control.graphics.newPen(control.graphics.PenType.SOLID_COLOR, rgb, 1);
            } catch (err) {}
        }

        function refreshConnectionVisuals() {
            var connected = state.listening && state.connectedAgent;
            if (connected) {
                connectionDot.text = "[*]";
                connectionLabel.text = "CONNECTED";
                codexButton.text = state.connectedAgent === "Codex Desktop" ? "[ON] Codex Desktop" : "Codex Desktop";
                claudeButton.text = state.connectedAgent === "Claude Code Desktop" ? "[ON] Claude Code" : "Claude Code Desktop";
                setTextColor(statusPill, [0.35, 0.95, 0.55]);
                setTextColor(connectionDot, [0.35, 0.95, 0.55]);
                setTextColor(connectionLabel, [0.35, 0.95, 0.55]);
            } else {
                connectionDot.text = "[ ]";
                connectionLabel.text = "NOT CONNECTED";
                codexButton.text = "Codex Desktop";
                claudeButton.text = "Claude Code Desktop";
                setTextColor(statusPill, [0.75, 0.75, 0.75]);
                setTextColor(connectionDot, [0.75, 0.75, 0.75]);
                setTextColor(connectionLabel, [0.75, 0.75, 0.75]);
            }
            cursorButton.text = "Cursor CLI";
        }

        function setUiStatus(shortText, longText) {
            statusPill.text = shortText;
            statusText.text = longText;
            logBox.text = longText + "\nRuntime: " + state.runtimeDir;
            refreshConnectionVisuals();
            forceLayout(win);
        }

        function safeUi(actionName, fn) {
            try {
                fn();
            } catch (err) {
                setUiStatus("error", actionName + " failed: " + err.toString());
            }
        }

        chooseButton.onClick = function () {
            safeUi("Choose folder", function () {
                var folder = Folder.selectDialog("Choose AE AI Bridge runtime folder");
                if (folder) {
                    state.runtimeDir = folder.fsName;
                    pathInput.text = state.runtimeDir;
                    ensureRuntimeDir();
                    writeStatus("folder_selected", true, "Runtime folder selected.");
                    setUiStatus("folder selected", "Runtime folder selected.");
                }
            });
        };

        revealButton.onClick = function () {
            safeUi("Reveal folder", function () {
                state.runtimeDir = pathInput.text;
                ensureRuntimeDir();
                Folder(state.runtimeDir).execute();
            });
        };

        function connectAgent(agentLabel) {
            safeUi("Connect", function () {
                state.runtimeDir = pathInput.text;
                ensureRuntimeDir();
                if (!canWriteFilesAndAccessNetwork()) {
                    state.listening = false;
                    setUiStatus("permission needed", "AE blocks script file access. Enable: Preferences > Scripting & Expressions > Allow Scripts to Write Files and Access Network, then click " + agentLabel + " again.");
                    openScriptingPreferences();
                    return;
                }
                if (state.listening) {
                    writeHeartbeat("Already connected.");
                    if (!state.connectedAgent) {
                        state.connectedAgent = agentLabel;
                    }
                    setUiStatus("connected", "Already connected. The command queue accepts commands from any client (Codex, Claude Code) writing into the same runtime folder.");
                    return;
                }
                state.listening = true;
                state.connectedAgent = agentLabel;
                writeStatus("connected", true, agentLabel + " connected the bridge queue.");
                setUiStatus("connected", "Connected via " + agentLabel + ". Codex and Claude Code can both send AE commands.");
                try {
                    poll(logBox);
                } catch (pollErr) {
                    logBridgeError("poll:connect", pollErr);
                }
                try {
                    pollQueue();
                } catch (queueErr) {
                    logBridgeError("pollQueue:connect", queueErr);
                }
                schedulePoll();
            });
        }

        codexButton.onClick = function () {
            connectAgent("Codex Desktop");
            activateApp(["Codex", "Terminal"]);
        };

        claudeButton.onClick = function () {
            connectAgent("Claude Code Desktop");
            activateApp(["Claude"]);
        };

        permissionButton.onClick = function () {
            safeUi("Check permission", function () {
                if (canWriteFilesAndAccessNetwork()) {
                    setUiStatus("permission ok", "AE script file/network permission is enabled.");
                } else {
                    setUiStatus("permission needed", "Turn on: Allow Scripts to Write Files and Access Network.");
                    openScriptingPreferences();
                }
            });
        };

        stopButton.onClick = function () {
            safeUi("Disconnect", function () {
                state.listening = false;
                state.connectedAgent = "";
                writeStatus("disconnected", true, "AE AI Bridge was disconnected.");
                setUiStatus("idle", "Disconnected. Click Codex Desktop to activate again.");
            });
        };

        pollButton.onClick = function () {
            safeUi("Poll once", function () {
                state.runtimeDir = pathInput.text;
                ensureRuntimeDir();
                poll(logBox);
                pollQueue();
                setUiStatus("polled", "Checked the command queue once.");
            });
        };

        createButton.onClick = function () {
            safeUi("Create cards", function () {
                createWhiteCardStack({ count: 5, widthPercent: 27, topPercent: 43 });
                setUiStatus("done", "Created 5 white 16:9 cards.");
            });
        };

        stackButton.onClick = function () {
            safeUi("Apply stack motion", function () {
                applyStackMotion({ widthPercent: 27, topPercent: 43, intervalFrames: 24 });
                setUiStatus("done", "Applied stack motion to selected cards.");
            });
        };

        settingsButton.onClick = function () {
            settingsGroup.visible = !settingsGroup.visible;
            settingsButton.text = settingsGroup.visible ? "Hide Settings" : "More Settings";
            forceLayout(win);
        };

        win.onResizing = win.onResize = function () {
            forceLayout(this);
        };

        setUiStatus("idle", "Choose Codex Desktop or Claude Code to connect");
        forceLayout(win);
        // A docked panel often gets its real size only after AE finishes restoring the
        // workspace, and onResize does not always fire. Re-run the layout a few times.
        $.global.MOTION_AGENT_PANEL = win;
        $.global.MOTION_AGENT_RELAYOUT = function () {
            try { if ($.global.MOTION_AGENT_PANEL) forceLayout($.global.MOTION_AGENT_PANEL); } catch (relayoutErr) {}
        };
        try {
            app.scheduleTask("$.global.MOTION_AGENT_RELAYOUT()", 500, false);
            app.scheduleTask("$.global.MOTION_AGENT_RELAYOUT()", 2000, false);
            app.scheduleTask("$.global.MOTION_AGENT_RELAYOUT()", 6000, false);
        } catch (scheduleErr) {}
        return win;
    }

    function forceLayout(win) {
        adaptUiToWidth(win);
        if (win && win.layout) {
            win.layout.layout(true);
            win.layout.resize();
        }
    }

    function adaptUiToWidth(win) {
        if (!win) {
            return;
        }
        var width = 320;
        var height = 520;
        try {
            if (win.size && win.size.width) {
                width = win.size.width;
                height = win.size.height || height;
            } else if (win.bounds) {
                width = win.bounds.width;
                height = win.bounds.height || height;
            }
        } catch (err) {}
        var contentWidth = Math.max(120, Math.min(360, width - 20));
        try {
            var ui = win._motionAgentUi;
            if (!ui) {
                return;
            }
            var narrow = width < 300;
            // Compact when the docked panel is short: drop the duplicate title row and the
            // disabled Cursor button, shorten buttons, so Codex / Claude stay visible.
            var compact = height < 360;
            // The AE tab already shows "Motion Agent", and Cursor is not wired yet:
            // both stay hidden so the whole panel fits in about 200 px.
            ui.titleBar.visible = false;
            ui.titleBar.maximumSize.height = 0;
            ui.cursorButton.visible = false;
            ui.cursorButton.maximumSize.height = 0;
            var buttonH = compact ? 28 : 32;
            ui.codexButton.preferredSize.height = buttonH;
            ui.claudeButton.preferredSize.height = buttonH;
            ui.settingsButton.preferredSize.height = compact ? 24 : 26;

            ui.titleText.alignment = ["left", "center"];
            ui.titleText.preferredSize.width = contentWidth;
            ui.titleSpacer.visible = false;
            ui.statusPill.visible = false;

            ui.body.preferredSize.width = contentWidth;
            ui.statusText.alignment = ["fill", "top"];
            ui.statusText.justify = "left";
            ui.statusText.preferredSize.width = contentWidth;
            ui.statusText.preferredSize.height = compact ? 30 : (narrow ? 48 : 36);

            ui.connectionBanner.orientation = "row";
            ui.connectionBanner.alignChildren = ["left", "center"];
            ui.connectionBanner.preferredSize.width = contentWidth;
            ui.connectionBanner.preferredSize.height = 22;
            ui.connectionDot.alignment = ["left", "center"];
            ui.connectionDot.preferredSize.width = 28;
            ui.connectionLabel.alignment = ["left", "center"];
            ui.connectionLabel.justify = "left";
            ui.connectionLabel.preferredSize.width = Math.max(80, contentWidth - 34);

            var fullWidthControls = [
                ui.codexButton,
                ui.claudeButton,
                ui.cursorButton,
                ui.settingsButton,
                ui.settingsGroup,
                ui.pathInput,
                ui.logBox,
                ui.warning
            ];
            for (var i = 0; i < fullWidthControls.length; i++) {
                fullWidthControls[i].alignment = ["fill", "top"];
                fullWidthControls[i].preferredSize.width = contentWidth;
            }

            ui.settingsButtons.orientation = narrow ? "column" : "row";
            ui.settingsButtons.alignChildren = narrow ? ["fill", "top"] : ["left", "center"];
            ui.quickButtons.orientation = narrow ? "column" : "row";
            ui.quickButtons.alignChildren = narrow ? ["fill", "top"] : ["left", "center"];
            ui.warning.justify = "left";
            ui.warning.preferredSize.height = narrow ? 72 : 48;
        } catch (layoutErr) {}
    }

    function ensureRuntimeDir() {
        var folder = Folder(state.runtimeDir);
        if (!folder.exists) {
            folder.create();
        }
        var subfolders = ["commands", "commands/.processed", "results", "previews"];
        var i;
        for (i = 0; i < subfolders.length; i++) {
            var sub = Folder(state.runtimeDir + "/" + subfolders[i]);
            if (!sub.exists) {
                sub.create();
            }
        }
    }

    function commandFile() {
        return File(state.runtimeDir + "/command.json");
    }

    function statusFile() {
        return File(state.runtimeDir + "/status.json");
    }

    function historyFile() {
        return File(state.runtimeDir + "/history.jsonl");
    }

    // --- Multi-client command queue (runtime/commands, runtime/results) ---
    // Each command is its own file, written atomically (temp file + rename) by the
    // client CLI. This means Codex and Claude Code can never clobber each other's
    // command: unique filenames avoid write collisions, and AE's single-threaded
    // poll loop drains the queue strictly in id (creation) order, one file at a
    // time, so processing itself is always serialized without needing a separate
    // cross-process lock. queue.lock.json is written for observability (so a
    // client can see whether AE is actively draining a backlog).
    function commandsDir() {
        var folder = Folder(state.runtimeDir + "/commands");
        if (!folder.exists) {
            folder.create();
        }
        return folder;
    }

    function processedCommandsDir() {
        var folder = Folder(state.runtimeDir + "/commands/.processed");
        if (!folder.exists) {
            folder.create();
        }
        return folder;
    }

    function resultsDir() {
        var folder = Folder(state.runtimeDir + "/results");
        if (!folder.exists) {
            folder.create();
        }
        return folder;
    }

    function previewsDir() {
        var folder = Folder(state.runtimeDir + "/previews");
        if (!folder.exists) {
            folder.create();
        }
        return folder;
    }

    function queueLockFile() {
        return File(state.runtimeDir + "/queue.lock.json");
    }

    function writeQueueLock(processing, pendingCount, currentId) {
        ensureRuntimeDir();
        writeText(queueLockFile(), stringify({
            processing: processing,
            pendingCount: pendingCount || 0,
            currentId: currentId || "",
            updatedAt: isoString()
        }));
    }

    function listPendingCommandFiles() {
        var dir = commandsDir();
        // Avoid Folder#getFiles(function mask) here: its cross-version support in
        // ExtendScript is unreliable, and if it throws, the exception is raised
        // from inside the app.scheduleTask recurring callback (schedulePoll),
        // which has no surrounding try/catch of its own -- one bad tick silently
        // kills the whole polling loop with no visible error. getFiles() with no
        // mask is universally supported, so filter manually instead.
        var all = dir.getFiles();
        var files = [];
        var i;
        for (i = 0; i < all.length; i++) {
            var f = all[i];
            if (f instanceof File && (/\.json$/i).test(f.name)) {
                files.push(f);
            }
        }
        files.sort(function (a, b) {
            if (a.name < b.name) {
                return -1;
            }
            if (a.name > b.name) {
                return 1;
            }
            return 0;
        });
        return files;
    }

    function writeQueueResult(id, ok, type, startedAt, finishedAt, data, error) {
        ensureRuntimeDir();
        var file = File(resultsDir().fsName + "/" + id + ".json");
        writeText(file, stringify({
            id: id,
            ok: ok,
            type: type,
            startedAt: startedAt,
            finishedAt: finishedAt,
            data: data === undefined ? null : data,
            error: error || null
        }));
    }

    function archiveCommandFile(file) {
        try {
            var destPath = processedCommandsDir().fsName + "/" + file.name;
            var destFile = File(destPath);
            if (destFile.exists) {
                destFile.remove();
            }
            file.copy(destPath);
            file.remove();
        } catch (archiveErr) {}
    }

    function processQueuedCommandFile(file) {
        var raw = readText(file);
        var command;
        try {
            command = parseJson(raw);
        } catch (parseErr) {
            var fallbackId = file.name.replace(/\.json$/i, "");
            var now = isoString();
            writeQueueResult(fallbackId, false, "unknown", now, now, null, "Invalid command JSON: " + parseErr.toString());
            archiveCommandFile(file);
            return;
        }
        if (!command || !command.id || !command.type) {
            var fid = (command && command.id) || file.name.replace(/\.json$/i, "");
            var nowInvalid = isoString();
            writeQueueResult(fid, false, (command && command.type) || "unknown", nowInvalid, nowInvalid, null, "Command must include id and type.");
            archiveCommandFile(file);
            return;
        }

        var startedAt = isoString();
        state.lastCommandId = command.id;
        try {
            var data = executeQueuedCommand(command);
            var finishedAt = isoString();
            writeQueueResult(command.id, true, command.type, startedAt, finishedAt, data, null);
            appendHistory({ id: command.id, type: command.type, ok: true, time: finishedAt });
        } catch (err) {
            var finishedAtErr = isoString();
            writeQueueResult(command.id, false, command.type, startedAt, finishedAtErr, null, err.toString());
            appendHistory({ id: command.id, type: command.type, ok: false, message: err.toString(), time: finishedAtErr });
        }
        archiveCommandFile(file);
    }

    function purgeTargetValue(name) {
        if (typeof PurgeTarget === "undefined") return null;
        return PurgeTarget[name] !== undefined ? PurgeTarget[name] : null;
    }

    function purgeCaches(target) {
        // target: "image" (default, keeps undo), "memory" (all RAM, AE 24.3+),
        // "all" (RAM + disk cache, AE 24.3+), "undo".
        var t = target || "image";
        var before = app.memoryInUse;
        var done = [];
        function purgeOne(enumName) {
            var v = purgeTargetValue(enumName);
            if (v === null) return false;
            app.purge(v);
            done.push(enumName);
            return true;
        }
        if (t === "image") {
            purgeOne("IMAGE_CACHES");
            purgeOne("SNAPSHOT_CACHES");
        } else if (t === "memory") {
            if (!purgeOne("ALL_MEMORY_CACHES")) {
                purgeOne("IMAGE_CACHES");
                purgeOne("SNAPSHOT_CACHES");
            }
        } else if (t === "all") {
            if (!purgeOne("ALL_CACHES")) throw new Error("PurgeTarget.ALL_CACHES is not available in this version of After Effects.");
        } else if (t === "undo") {
            purgeOne("UNDO_CACHES");
        } else {
            throw new Error("Unknown purge target: " + t + ". Use image, memory, all or undo.");
        }
        state.commandsSincePurge = 0;
        state.lastPurgeMs = new Date().getTime();
        var after = app.memoryInUse;
        return {
            target: t,
            purged: done,
            memoryBeforeMB: Math.round(before / 1048576),
            memoryAfterMB: Math.round(after / 1048576),
            freedMB: Math.round((before - after) / 1048576),
            diskCacheCleared: t === "all",
            undoCleared: t === "all" || t === "memory" || t === "undo",
            aeVersion: app.version,
            time: isoString()
        };
    }

    function purgeCacheCmd(payload) {
        var target = (payload && payload.target) || "image";
        if (payload && payload.onlyIfSaved === true) {
            // Automatic disk-cache purge: only when nothing unsaved can be lost.
            var saved = app.project && app.project.file !== null && app.project.dirty === false;
            if (!saved) {
                return { skipped: true, target: target, reason: "Project has unsaved changes (or was never saved); purge postponed.", time: isoString() };
            }
            return purgeCaches(target);
        }
        if (target !== "image" && !(payload && payload.confirm === true)) {
            throw new Error("Purge target '" + target + "' can clear undo history or the disk cache. Save the project, then resend with confirm=true.");
        }
        return purgeCaches(target);
    }

    function maybeAutoPurge() {
        var elapsedMin = (new Date().getTime() - state.lastPurgeMs) / 60000;
        if (state.commandsSincePurge < state.autoPurgeEveryCommands && elapsedMin < state.autoPurgeMinutes) return;
        if (state.commandsSincePurge === 0) return;
        try {
            var report = purgeCaches("image");
            appendHistory({ id: "auto-purge-" + new Date().getTime(), type: "autoPurge", ok: true, message: "freed " + report.freedMB + " MB", time: report.time });
        } catch (purgeErr) {
            logBridgeError("autoPurge", purgeErr);
        }
    }

    function pollQueue() {
        var files = listPendingCommandFiles();
        if (files.length === 0) {
            return;
        }
        var i;
        for (i = 0; i < files.length; i++) {
            writeQueueLock(true, files.length - i, files[i].name.replace(/\.json$/i, ""));
            try {
                processQueuedCommandFile(files[i]);
            } catch (fileErr) {
                // One malformed/unlucky command file must never abort the whole
                // drain pass (and, transitively, must never abort the recurring
                // scheduled poll loop that calls pollQueue()).
                logBridgeError("pollQueue:" + files[i].name, fileErr);
            }
            state.commandsSincePurge++;
        }
        writeQueueLock(false, 0, "");
        maybeAutoPurge();
    }

    function logBridgeError(where, err) {
        try {
            ensureRuntimeDir();
            writeText(File(state.runtimeDir + "/last-poll-error.json"), stringify({
                where: where,
                message: err ? err.toString() : "unknown error",
                time: isoString()
            }));
        } catch (writeErr) {}
    }

    function findCompByName(name) {
        if (!app.project) {
            throw new Error("Open a project first.");
        }
        if (!name) {
            throw new Error("payload.name is required.");
        }
        var available = [];
        var i;
        for (i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (item instanceof CompItem) {
                available.push(item.name);
                if (item.name === name) {
                    return item;
                }
            }
        }
        throw new Error("Comp not found: \"" + name + "\". Available comps: " + available.join(", "));
    }

    function sanitizeFileName(name) {
        return String(name).replace(/[^a-zA-Z0-9_\-]+/g, "_");
    }

    function safeSerialize(value) {
        if (value === undefined) {
            return null;
        }
        try {
            if (typeof JSON !== "undefined" && JSON.stringify) {
                JSON.stringify(value);
            }
            return value;
        } catch (err) {
            return String(value);
        }
    }

    function inspectProjectInfo() {
        if (!app.project) {
            return { hasProject: false };
        }
        var comps = [];
        var footage = [];
        var i;
        for (i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (item instanceof CompItem) {
                comps.push({
                    index: i,
                    name: item.name,
                    width: item.width,
                    height: item.height,
                    duration: item.duration,
                    frameRate: item.frameRate,
                    numLayers: item.numLayers
                });
            } else {
                footage.push({
                    index: i,
                    name: item.name,
                    typeName: item.typeName
                });
            }
        }
        return {
            hasProject: true,
            projectFile: app.project.file ? app.project.file.fsName : "",
            bitsPerChannel: app.project.bitsPerChannel,
            numItems: app.project.numItems,
            activeItemName: app.project.activeItem ? app.project.activeItem.name : "",
            comps: comps,
            footage: footage
        };
    }

    function inspectCompByNameCmd(payload) {
        var comp = findCompByName(payload.name);
        var maxLayers = numberParam(payload, "maxLayers", comp.numLayers);
        var includeProperties = !!payload.includeProperties;
        var result = getCompInfoFor(comp);
        result.layers = [];
        var limit = Math.min(comp.numLayers, maxLayers);
        var i;
        for (i = 1; i <= limit; i++) {
            result.layers.push(inspectLayer(comp.layer(i), includeProperties, numberParam(payload, "propertyDepth", 2)));
        }
        return result;
    }

    function setActiveCompByNameCmd(payload) {
        var comp = findCompByName(payload.name);
        try {
            comp.openInViewer();
        } catch (viewerErr) {}
        return getCompInfoFor(comp);
    }

    // saveFrameToPng() returns before the PNG is actually flushed to disk --
    // the file can sit at 0 bytes for a couple of seconds while AE renders in
    // the background. Without this wait, a client polling runtime/results/
    // and then immediately reading the PNG can see a truncated/empty file
    // even though the command reported ok:true.
    function waitForStableFile(fsPath, timeoutMs) {
        var start = new Date().getTime();
        var lastSize = -1;
        var stableHits = 0;
        while (new Date().getTime() - start < timeoutMs) {
            var probe = File(fsPath);
            var size = probe.exists ? probe.length : 0;
            if (size > 0 && size === lastSize) {
                stableHits++;
                if (stableHits >= 2) {
                    return true;
                }
            } else {
                stableHits = 0;
            }
            lastSize = size;
            $.sleep(150);
        }
        return lastSize > 0;
    }

    function captureFrameCmd(payload) {
        var comp = payload.compName ? findCompByName(payload.compName) : activeComp();
        var time = payload.time !== undefined ? parseFloat(payload.time) : comp.time;
        var outputPath = payload.outputPath || (previewsDir().fsName + "/" + sanitizeFileName(comp.name) + "-" + time.toFixed(2) + ".png");
        var file = File(outputPath);
        var parentFolder = file.parent;
        if (parentFolder && !parentFolder.exists) {
            parentFolder.create();
        }
        try {
            comp.saveFrameToPng(time, file);
        } catch (err) {
            throw new Error("Could not save preview frame: " + err.toString());
        }
        var settled = waitForStableFile(outputPath, 8000);
        if (!settled) {
            throw new Error("Preview frame did not finish writing within 8s: " + outputPath);
        }
        return { outputPath: outputPath, time: time, comp: comp.name };
    }

    // evalJSX / applyJSXFile run arbitrary ExtendScript in the AE process, same as
    // the ad hoc `osascript ... DoScript` flow this bridge replaces. Local-only,
    // file-based transport; no network exposure. Keep that trust boundary in mind
    // before wiring any remote/networked client to this queue.
    function assertNoUndoGroupCalls(code, label) {
        if (/(beginUndoGroup|endUndoGroup)\s*\(/.test(code)) {
            throw new Error((label || "JSX") + " contains prohibited Undo group calls. Remove beginUndoGroup/endUndoGroup before execution.");
        }
    }

    function evalJSXCmd(payload) {
        if (!payload.code) {
            throw new Error("evalJSX requires payload.code.");
        }
        assertNoUndoGroupCalls(payload.code, "evalJSX");
        var evalResult = eval(payload.code);
        return { result: safeSerialize(evalResult) };
    }

    function evalSafeJSXCmd(payload) {
        if (!payload.code) {
            throw new Error("evalSafeJSX requires payload.code.");
        }
        assertNoUndoGroupCalls(payload.code, "evalSafeJSX");
        var undoName = payload.undoName || "AE AI Bridge safe JSX";
        app.beginSuppressDialogs();
        app.beginUndoGroup(undoName);
        try {
            var evalResult = eval(payload.code);
            return { result: safeSerialize(evalResult), undoName: undoName };
        } finally {
            app.endUndoGroup();
            app.endSuppressDialogs(false);
        }
    }

    function applyJSXFileCmd(payload) {
        if (!payload.path) {
            throw new Error("applyJSXFile requires payload.path.");
        }
        var file = File(payload.path);
        if (!file.exists) {
            throw new Error("JSX file does not exist: " + payload.path);
        }
        var code = readText(file);
        assertNoUndoGroupCalls(code, payload.path);
        var evalResult = eval(code);
        return { path: payload.path, result: safeSerialize(evalResult) };
    }

    function applySafeJSXFileCmd(payload) {
        if (!payload.path) {
            throw new Error("applySafeJSXFile requires payload.path.");
        }
        var file = File(payload.path);
        if (!file.exists) {
            throw new Error("JSX file does not exist: " + payload.path);
        }
        var code = readText(file);
        assertNoUndoGroupCalls(code, payload.path);
        return evalSafeJSXCmd({
            code: code,
            undoName: payload.undoName || ("AE AI Bridge: " + file.name)
        });
    }

    function executeQueuedCommand(command) {
        var type = command.type;
        var payload = command.payload || {};
        if (type === "ping") {
            return { pong: true, bridge: BRIDGE_NAME, time: isoString() };
        }
        if (type === "inspectProject") {
            return inspectProjectInfo();
        }
        if (type === "inspectActiveComp") {
            return inspectActiveComp(payload);
        }
        if (type === "inspectCompByName") {
            return inspectCompByNameCmd(payload);
        }
        if (type === "setActiveCompByName") {
            return setActiveCompByNameCmd(payload);
        }
        if (type === "captureFrame") {
            return captureFrameCmd(payload);
        }
        if (type === "purgeCache") {
            return purgeCacheCmd(payload);
        }
        if (type === "evalJSX") {
            return evalJSXCmd(payload);
        }
        if (type === "evalSafeJSX") {
            return evalSafeJSXCmd(payload);
        }
        if (type === "applyJSXFile") {
            return applyJSXFileCmd(payload);
        }
        if (type === "applySafeJSXFile") {
            return applySafeJSXFileCmd(payload);
        }
        // Fall back to the legacy action dispatcher so every existing command
        // (createComp, buildSceneFromSpec, applyStackMotion, replaceFootage, ...)
        // is also reachable through the shared queue using its old action name
        // as the new command's `type`. One dispatcher, two transports.
        return executeCommand({ action: type, params: payload });
    }

    function readText(file) {
        if (!file.exists) {
            return "";
        }
        file.encoding = "UTF-8";
        file.open("r");
        var text = file.read();
        file.close();
        return text;
    }

    function writeText(file, text) {
        file.encoding = "UTF-8";
        if (file.exists) {
            file.remove();
        }
        if (!file.open("w")) {
            throw new Error("Cannot write file: " + file.fsName);
        }
        file.write(String(text));
        file.close();
    }

    function mainPrefSectionName() {
        var versionNumber = parseFloat(app.version);
        if (versionNumber > 12.0 || (versionNumber === 12.0 && app.buildNumber >= 264) || app.version.substring(0, 5) !== "12.0x") {
            return "Main Pref Section v2";
        }
        return "Main Pref Section";
    }

    function canWriteFilesAndAccessNetwork() {
        try {
            return app.preferences.getPrefAsLong(mainPrefSectionName(), "Pref_SCRIPTING_FILE_NETWORK_SECURITY") === 1;
        } catch (err) {
            try {
                return app.preferences.getPrefAsLong("Main Pref Section", "Pref_SCRIPTING_FILE_NETWORK_SECURITY") === 1;
            } catch (fallbackErr) {
                return false;
            }
        }
    }

    function openScriptingPreferences() {
        try {
            app.executeCommand(3131);
        } catch (err) {
            try {
                app.executeCommand(2359);
            } catch (fallbackErr) {}
        }
    }

    // Best-effort: bring the chosen agent's app to the foreground after
    // connecting, so the user lands back in Codex/Claude Code without an
    // extra Cmd+Tab. Tries each candidate app name in order (first match
    // wins); silently does nothing if none of the names resolve to an
    // installed app, or if this AE's scripting security prefs block
    // system() calls. Uses macOS `open -a`, so candidateNames must match the
    // app name as macOS knows it.
    function activateApp(candidateNames) {
        try {
            if (typeof system === "undefined" || !system || !system.callSystem) {
                return;
            }
            var parts = [];
            var i;
            for (i = 0; i < candidateNames.length; i++) {
                parts.push('open -a "' + String(candidateNames[i]).replace(/"/g, '\\"') + '" 2>/dev/null');
            }
            system.callSystem(parts.join(" || ") + " || true");
        } catch (activateErr) {}
    }

    function stringify(obj) {
        if (typeof JSON !== "undefined" && JSON.stringify) {
            return JSON.stringify(obj, null, 2);
        }
        return obj.toSource();
    }

    // ExtendScript's Date object (ES3-era JScript engine) has no toISOString().
    // Format it manually everywhere the queue needs an ISO 8601 timestamp.
    function isoString(date) {
        date = date || new Date();
        function pad(n, width) {
            n = String(n);
            while (n.length < width) {
                n = "0" + n;
            }
            return n;
        }
        return date.getUTCFullYear() + "-" +
            pad(date.getUTCMonth() + 1, 2) + "-" +
            pad(date.getUTCDate(), 2) + "T" +
            pad(date.getUTCHours(), 2) + ":" +
            pad(date.getUTCMinutes(), 2) + ":" +
            pad(date.getUTCSeconds(), 2) + "." +
            pad(date.getUTCMilliseconds(), 3) + "Z";
    }

    function parseJson(text) {
        if (!text) {
            return undefined;
        }
        if (typeof JSON !== "undefined" && JSON.parse) {
            return JSON.parse(text);
        }
        return eval("(" + text + ")");
    }

    function writeStatus(action, ok, message, data) {
        ensureRuntimeDir();
        writeText(statusFile(), stringify({
            bridge: BRIDGE_NAME,
            action: action,
            ok: ok,
            message: message,
            runtimeDir: state.runtimeDir,
            listening: state.listening,
            pollMs: state.pollMs,
            panelVersion: state.panelVersion,
            heartbeatAt: isoString(),
            data: data || {},
            lastCommandId: state.lastCommandId,
            time: new Date().toUTCString()
        }));
    }

    function writeHeartbeat(message) {
        writeStatus("heartbeat", true, message || "Bridge polling.", {
            queue: "runtime/commands"
        });
    }

    function appendHistory(entry) {
        ensureRuntimeDir();
        var file = historyFile();
        file.encoding = "UTF-8";
        file.open("a");
        file.writeln(stringify(entry));
        file.close();
    }

    function activeComp() {
        if (!app.project) {
            throw new Error("Open a project first.");
        }
        var comp = app.project.activeItem;
        if (!(comp instanceof CompItem)) {
            throw new Error("Open or select a composition first.");
        }
        return comp;
    }

    function selectedOrNamedCards(comp, params) {
        var layers = comp.selectedLayers;
        if (layers && layers.length >= 3) {
            return layers;
        }
        var prefix = params && params.namePrefix ? params.namePrefix : "AI Card ";
        var found = [];
        var i;
        for (i = 1; i <= comp.numLayers; i++) {
            if (comp.layer(i).name.indexOf(prefix) === 0) {
                found.push(comp.layer(i));
            }
        }
        found.sort(function (a, b) {
            return a.name > b.name ? 1 : -1;
        });
        return found;
    }

    function createWhiteCardStack(params) {
        var comp = activeComp();
        var count = numberParam(params, "count", 5);
        var widthPercent = numberParam(params, "widthPercent", 27);
        var topPercent = numberParam(params, "topPercent", 43);
        var cardWidth = comp.width * widthPercent / 100;
        var cardHeight = cardWidth * 9 / 16;
        var i;
        var created = [];

        for (i = 0; i < count; i++) {
            var layer = comp.layers.addShape();
            layer.name = "AI Card " + pad2(i + 1);
            layer.threeDLayer = true;

            var root = layer.property("ADBE Root Vectors Group");
            var group = root.addProperty("ADBE Vector Group");
            group.name = "Card";
            var contents = group.property("ADBE Vectors Group");

            var rect = contents.addProperty("ADBE Vector Shape - Rect");
            rect.property("ADBE Vector Rect Size").setValue([cardWidth, cardHeight]);
            rect.property("ADBE Vector Rect Roundness").setValue(cardHeight * 0.055);

            var fill = contents.addProperty("ADBE Vector Graphic - Fill");
            fill.property("ADBE Vector Fill Color").setValue([1, 1, 1]);

            var stroke = contents.addProperty("ADBE Vector Graphic - Stroke");
            stroke.property("ADBE Vector Stroke Color").setValue([0.86, 0.86, 0.86]);
            stroke.property("ADBE Vector Stroke Width").setValue(2);

            layer.property("ADBE Transform Group").property("ADBE Position").setValue([comp.width / 2, comp.height * topPercent / 100, 0]);
            created.push(layer.name);
        }

        applyStackMotion({
            widthPercent: widthPercent,
            topPercent: topPercent,
            intervalFrames: numberParam(params, "intervalFrames", 24),
            namePrefix: "AI Card "
        });

        return { created: created };
    }

    function applyStackMotion(params) {
        var comp = activeComp();
        var layers = selectedOrNamedCards(comp, params || {});
        if (!layers || layers.length < 3) {
            throw new Error("Select at least 3 card layers, or create AI Card layers first.");
        }

        var topPercent = numberParam(params, "topPercent", 43);
        var intervalFrames = numberParam(params, "intervalFrames", 24);
        var start = comp.time;
        var step = intervalFrames * comp.frameDuration;
        var p;
        var i;

        for (i = 0; i < layers.length; i++) {
            layers[i].threeDLayer = true;
            var t = layers[i].property("ADBE Transform Group");
            var position = t.property("ADBE Position");
            var scale = t.property("ADBE Scale");
            var opacity = t.property("ADBE Opacity");
            var rotateX = t.property("ADBE Rotate X");
            var rotateY = t.property("ADBE Rotate Y");
            var rotateZ = t.property("ADBE Rotate Z");

            for (p = 0; p < layers.length; p++) {
                var pose = poseFor(i - p, comp, topPercent, params || {});
                var time = start + p * step;
                setKey(position, time, [pose.x, pose.y, pose.z], 82);
                setKey(scale, time, [pose.s, pose.s, pose.s], 82);
                setKey(opacity, time, pose.opacity, 72);
                setKey(rotateX, time, pose.rx, 82);
                setKey(rotateY, time, pose.ry, 82);
                setKey(rotateZ, time, pose.rz, 82);
            }
        }

        return { animatedLayers: layers.length, keyframeStops: layers.length };
    }

    function createComp(params) {
        if (!app.project) {
            app.newProject();
        }
        var name = params.name || "AI Motion Comp";
        var width = numberParam(params, "width", 1920);
        var height = numberParam(params, "height", 1080);
        var duration = numberParam(params, "duration", 8);
        var frameRate = numberParam(params, "frameRate", 30);
        var comp = app.project.items.addComp(name, width, height, 1, duration, frameRate);
        comp.openInViewer();
        return getCompInfoFor(comp);
    }

    function buildSceneFromSpec(params) {
        var spec = params.spec;
        if (!spec && params.specPath) {
            spec = parseJson(readText(File(params.specPath)));
        }
        if (!spec) {
            throw new Error("buildSceneFromSpec requires params.spec or params.specPath.");
        }

        if (!app.project) {
            app.newProject();
        }

        var compSpec = spec.comp || {};
        var comp = app.project.items.addComp(
            compSpec.name || "AI Generated Motion",
            numberParam(compSpec, "width", 1920),
            numberParam(compSpec, "height", 1080),
            numberParam(compSpec, "pixelAspect", 1),
            numberParam(compSpec, "duration", 8),
            numberParam(compSpec, "frameRate", 30)
        );
        comp.openInViewer();

        var created = [];
        var layers = spec.layers || [];
        var layerMap = {};
        var i;
        for (i = 0; i < layers.length; i++) {
            var layer = createLayerFromSpec(comp, layers[i], layerMap);
            created.push(layer.name);
            if (layers[i].id) {
                layer.comment = "codex-id:" + layers[i].id;
                layerMap[layers[i].id] = layer;
            }
            applyLayerSpec(layer, layers[i]);
        }

        applyParenting(layerMap, layers);
        applyTrackMattes(comp, layerMap, layers);
        applyPrecomps(comp, layerMap, spec.precomps || []);
        applyCompSpec(comp, compSpec);
        applyRenderQueueSpec(comp, spec.renderQueue);

        return {
            comp: getCompInfoFor(comp),
            createdLayers: created
        };
    }

    function updateSceneFromSpec(params) {
        var spec = params.spec;
        if (!spec && params.specPath) {
            spec = parseJson(readText(File(params.specPath)));
        }
        if (!spec) {
            throw new Error("updateSceneFromSpec requires params.spec or params.specPath.");
        }
        var comp = activeComp();
        var layers = spec.layers || [];
        var layerMap = buildExistingLayerMap(comp);
        var touched = [];
        var i;
        for (i = 0; i < layers.length; i++) {
            var layer = findLayerForSpec(comp, layers[i], layerMap);
            if (!layer) {
                layer = createLayerFromSpec(comp, layers[i], layerMap);
            }
            if (layers[i].id) {
                layer.comment = "codex-id:" + layers[i].id;
                layerMap[layers[i].id] = layer;
            }
            applyLayerSpec(layer, layers[i]);
            touched.push(layer.name);
        }
        applyParenting(layerMap, layers);
        applyTrackMattes(comp, layerMap, layers);
        applyPrecomps(comp, layerMap, spec.precomps || []);
        applyCompSpec(comp, spec.comp || {});
        applyRenderQueueSpec(comp, spec.renderQueue);
        return {
            comp: getCompInfoFor(comp),
            touchedLayers: touched
        };
    }

    function buildExistingLayerMap(comp) {
        var map = {};
        var i;
        for (i = 1; i <= comp.numLayers; i++) {
            var layer = comp.layer(i);
            if (layer.comment && layer.comment.indexOf("codex-id:") === 0) {
                map[layer.comment.substring(9)] = layer;
            }
            map[layer.name] = layer;
        }
        return map;
    }

    function findLayerForSpec(comp, layerSpec, layerMap) {
        if (layerSpec.id && layerMap[layerSpec.id]) {
            return layerMap[layerSpec.id];
        }
        if (layerSpec.name && layerMap[layerSpec.name]) {
            return layerMap[layerSpec.name];
        }
        return undefined;
    }

    function createLayerFromSpec(comp, layerSpec, layerMap) {
        var type = layerSpec.type || "shape";
        if (type === "camera") {
            var camera = comp.layers.addCamera(layerSpec.name || "AI Camera", vector2Param(layerSpec.pointOfInterest, [comp.width / 2, comp.height / 2]));
            tagLayer(camera, layerSpec);
            return camera;
        }
        if (type === "light") {
            var lightType = lightTypeParam(layerSpec.lightType || "point");
            var light = comp.layers.addLight(layerSpec.name || "AI Light", vector2Param(layerSpec.position2D, [comp.width / 2, comp.height / 2]));
            try {
                light.lightType = lightType;
            } catch (err) {}
            tagLayer(light, layerSpec);
            return light;
        }
        if (type === "null") {
            var nullLayer = comp.layers.addNull();
            nullLayer.name = layerSpec.name || "AI Null";
            tagLayer(nullLayer, layerSpec);
            return nullLayer;
        }
        if (type === "text") {
            var textLayer = comp.layers.addText(layerSpec.text || "");
            textLayer.name = layerSpec.name || "AI Text";
            tagLayer(textLayer, layerSpec);
            return textLayer;
        }
        if (type === "solid") {
            var solidColor = colorParam(layerSpec.color, [1, 1, 1]);
            var solid = comp.layers.addSolid(solidColor, layerSpec.name || "AI Solid", numberParam(layerSpec, "width", comp.width), numberParam(layerSpec, "height", comp.height), 1, comp.duration);
            tagLayer(solid, layerSpec);
            return solid;
        }
        if (type === "adjustment") {
            var adjustment = comp.layers.addSolid(colorParam(layerSpec.color, [1, 1, 1]), layerSpec.name || "AI Adjustment", comp.width, comp.height, 1, comp.duration);
            adjustment.adjustmentLayer = true;
            tagLayer(adjustment, layerSpec);
            return adjustment;
        }
        if (type === "audio" && layerSpec.path) {
            var audioFile = File(layerSpec.path);
            if (!audioFile.exists) {
                throw new Error("Audio file does not exist: " + layerSpec.path);
            }
            var audioOptions = new ImportOptions(audioFile);
            var audioFootage = app.project.importFile(audioOptions);
            var audioLayer = comp.layers.add(audioFootage);
            audioLayer.name = layerSpec.name || audioFootage.name;
            tagLayer(audioLayer, layerSpec);
            return audioLayer;
        }
        if (type === "footage" && layerSpec.path) {
            var file = File(layerSpec.path);
            if (!file.exists) {
                throw new Error("Footage file does not exist: " + layerSpec.path);
            }
            var importOptions = new ImportOptions(file);
            var footage = app.project.importFile(importOptions);
            var footageLayer = comp.layers.add(footage);
            footageLayer.name = layerSpec.name || footage.name;
            tagLayer(footageLayer, layerSpec);
            return footageLayer;
        }
        var layer = createShapeLayer(comp, layerSpec);
        tagLayer(layer, layerSpec);
        return layer;
    }

    function tagLayer(layer, layerSpec) {
        if (layerSpec && layerSpec.id) {
            layer.comment = "codex-id:" + layerSpec.id;
        }
    }

    function createShapeLayer(comp, layerSpec) {
        var layer = comp.layers.addShape();
        layer.name = layerSpec.name || "AI Shape";
        var rectSpec = layerSpec.rect || {};
        var width = numberParam(rectSpec, "width", numberParam(layerSpec, "width", comp.width * 0.28));
        var height = numberParam(rectSpec, "height", numberParam(layerSpec, "height", width * 9 / 16));
        var radius = numberParam(rectSpec, "radius", height * 0.055);

        var root = layer.property("ADBE Root Vectors Group");
        var group = root.addProperty("ADBE Vector Group");
        group.name = "Shape";
        var contents = group.property("ADBE Vectors Group");
        var rect = contents.addProperty("ADBE Vector Shape - Rect");
        rect.property("ADBE Vector Rect Size").setValue([width, height]);
        rect.property("ADBE Vector Rect Roundness").setValue(radius);

        var fill = contents.addProperty("ADBE Vector Graphic - Fill");
        fill.property("ADBE Vector Fill Color").setValue(colorParam(layerSpec.fill, [1, 1, 1]));

        if (layerSpec.stroke !== false) {
            var stroke = contents.addProperty("ADBE Vector Graphic - Stroke");
            stroke.property("ADBE Vector Stroke Color").setValue(colorParam(layerSpec.strokeColor, [0.86, 0.86, 0.86]));
            stroke.property("ADBE Vector Stroke Width").setValue(numberParam(layerSpec, "strokeWidth", 2));
        }
        applyVectorSpecs(contents, layerSpec);
        return layer;
    }

    function applyLayerSpec(layer, layerSpec) {
        if (layerSpec.threeD !== false) {
            try {
                layer.threeDLayer = true;
            } catch (err) {}
        }
        var transform = layer.property("ADBE Transform Group");
        if (!transform) {
            return;
        }
        var t = layerSpec.transform || {};
        if (t.position !== undefined) {
            setTransformValue(transform, "ADBE Position", vectorParam(t.position, undefined));
        }
        if (t.scale !== undefined) {
            setTransformValue(transform, "ADBE Scale", vectorParam(t.scale, undefined));
        }
        if (t.opacity !== undefined) {
            setTransformValue(transform, "ADBE Opacity", numberParam(t, "opacity", undefined));
        }
        if (layer.threeDLayer) {
            if (t.rotationX !== undefined) {
                setTransformValue(transform, "ADBE Rotate X", numberParam(t, "rotationX", undefined));
            }
            if (t.rotationY !== undefined) {
                setTransformValue(transform, "ADBE Rotate Y", numberParam(t, "rotationY", undefined));
            }
        }
        if (t.rotationZ !== undefined || t.rotation !== undefined) {
            setTransformValue(transform, "ADBE Rotate Z", numberParam(t, "rotationZ", numberParam(t, "rotation", undefined)));
        }
        applyKeyframes(transform, layerSpec.keyframes || {});
        applyEffects(layer, layerSpec.effects || []);
        applyExpressions(transform, layerSpec.expressions || {});
        applyTextSpec(layer, layerSpec.textStyle);
        if (layerSpec.blendingMode) {
            try {
                layer.blendingMode = blendingModeParam(layerSpec.blendingMode);
            } catch (err) {}
        }
        if (layerSpec.label) {
            layer.label = Math.max(0, Math.min(16, parseInt(layerSpec.label, 10)));
        }
        if (layerSpec.inPoint !== undefined) {
            layer.inPoint = parseFloat(layerSpec.inPoint);
        }
        if (layerSpec.outPoint !== undefined) {
            layer.outPoint = parseFloat(layerSpec.outPoint);
        }
        if (layerSpec.motionBlur !== undefined) {
            try {
                layer.motionBlur = !!layerSpec.motionBlur;
            } catch (err) {}
        }
        if (layerSpec.adjustment !== undefined) {
            try {
                layer.adjustmentLayer = !!layerSpec.adjustment;
            } catch (err) {}
        }
        if (layerSpec.collapseTransformation !== undefined) {
            try {
                layer.collapseTransformation = !!layerSpec.collapseTransformation;
            } catch (err) {}
        }
        if (layerSpec.guideLayer !== undefined) {
            try {
                layer.guideLayer = !!layerSpec.guideLayer;
            } catch (err) {}
        }
        if (layerSpec.shy !== undefined) {
            try {
                layer.shy = !!layerSpec.shy;
            } catch (err) {}
        }
        if (layerSpec.enabled !== undefined) {
            layer.enabled = !!layerSpec.enabled;
        }
        if (layerSpec.audioEnabled !== undefined) {
            try {
                layer.audioEnabled = !!layerSpec.audioEnabled;
            } catch (err) {}
        }
        if (layerSpec.timeRemapEnabled !== undefined) {
            try {
                layer.timeRemapEnabled = !!layerSpec.timeRemapEnabled;
            } catch (err) {}
        }
        applyMarkers(layer, layerSpec.markers || []);
        applyMasks(layer, layerSpec.masks || []);
        applyCameraOptions(layer, layerSpec.cameraOptions);
        applyTextAnimators(layer, layerSpec.textAnimators || []);
        applyPropertyPaths(layer, layerSpec.propertyPaths || []);
        if (layerSpec.replaceFootagePath) {
            replaceLayerFootage(layer, layerSpec.replaceFootagePath);
        }
    }

    function setTransformValue(transform, propertyName, value) {
        var prop = transform.property(propertyName);
        if (prop && value !== undefined) {
            prop.setValue(value);
        }
    }

    function applyKeyframes(transform, keyframes) {
        applyPropertyKeyframes(transform.property("ADBE Position"), keyframes.position);
        applyPropertyKeyframes(transform.property("ADBE Scale"), keyframes.scale);
        applyPropertyKeyframes(transform.property("ADBE Opacity"), keyframes.opacity);
        applyPropertyKeyframes(transform.property("ADBE Rotate X"), keyframes.rotationX);
        applyPropertyKeyframes(transform.property("ADBE Rotate Y"), keyframes.rotationY);
        applyPropertyKeyframes(transform.property("ADBE Rotate Z"), keyframes.rotationZ || keyframes.rotation);
    }

    function applyPropertyKeyframes(prop, frames) {
        if (!prop || !frames || frames.length === 0) {
            return;
        }
        var i;
        for (i = 0; i < frames.length; i++) {
            setKey(prop, numberParam(frames[i], "time", 0), frames[i].value, numberParam(frames[i], "ease", 82));
        }
    }

    function applyVectorSpecs(contents, layerSpec) {
        applyPathSpecs(contents, layerSpec.paths || []);
        applyTrimPathSpecs(contents, layerSpec.trimPaths || []);
        applyGradientSpecs(contents, layerSpec.gradients || []);
    }

    function applyPathSpecs(contents, paths) {
        var i;
        for (i = 0; i < paths.length; i++) {
            var pathSpec = paths[i];
            var pathGroup = contents.addProperty("ADBE Vector Shape - Group");
            if (pathSpec.name) {
                pathGroup.name = pathSpec.name;
            }
            var pathProp = pathGroup.property("ADBE Vector Shape");
            if (pathSpec.shape) {
                pathProp.setValue(shapeFromSpec(pathSpec.shape));
            }
            applyShapeKeyframes(pathProp, pathSpec.keyframes || []);
        }
    }

    function applyShapeKeyframes(prop, frames) {
        var i;
        for (i = 0; i < frames.length; i++) {
            if (frames[i].shape) {
                setKey(prop, numberParam(frames[i], "time", 0), shapeFromSpec(frames[i].shape), numberParam(frames[i], "ease", 82));
            }
        }
    }

    function shapeFromSpec(spec) {
        var shape = new Shape();
        shape.vertices = spec.vertices || [];
        shape.inTangents = spec.inTangents || zeroTangents(shape.vertices.length);
        shape.outTangents = spec.outTangents || zeroTangents(shape.vertices.length);
        shape.closed = spec.closed !== false;
        return shape;
    }

    function zeroTangents(count) {
        var result = [];
        var i;
        for (i = 0; i < count; i++) {
            result.push([0, 0]);
        }
        return result;
    }

    function applyTrimPathSpecs(contents, trims) {
        var i;
        for (i = 0; i < trims.length; i++) {
            var trimSpec = trims[i];
            var trim = contents.addProperty("ADBE Vector Filter - Trim");
            if (trimSpec.name) {
                trim.name = trimSpec.name;
            }
            setVectorProp(trim, "ADBE Vector Trim Start", trimSpec.start);
            setVectorProp(trim, "ADBE Vector Trim End", trimSpec.end);
            setVectorProp(trim, "ADBE Vector Trim Offset", trimSpec.offset);
            applyPropertyKeyframes(trim.property("ADBE Vector Trim Start"), trimSpec.startKeyframes);
            applyPropertyKeyframes(trim.property("ADBE Vector Trim End"), trimSpec.endKeyframes);
            applyPropertyKeyframes(trim.property("ADBE Vector Trim Offset"), trimSpec.offsetKeyframes);
        }
    }

    function applyGradientSpecs(contents, gradients) {
        var i;
        for (i = 0; i < gradients.length; i++) {
            var spec = gradients[i];
            var matchName = spec.kind === "stroke" ? "ADBE Vector Graphic - G-Stroke" : "ADBE Vector Graphic - G-Fill";
            var gradient = contents.addProperty(matchName);
            if (spec.name) {
                gradient.name = spec.name;
            }
            setVectorProp(gradient, "ADBE Vector Grad Start Pt", vectorParam(spec.startPoint, undefined));
            setVectorProp(gradient, "ADBE Vector Grad End Pt", vectorParam(spec.endPoint, undefined));
            setVectorProp(gradient, "ADBE Vector Fill Opacity", spec.opacity);
            setVectorProp(gradient, "ADBE Vector Stroke Width", spec.strokeWidth);
            applyPropertyPaths(gradient, spec.propertyPaths || []);
        }
    }

    function setVectorProp(group, propName, value) {
        if (value === undefined) {
            return;
        }
        var prop = group.property(propName);
        if (prop) {
            prop.setValue(value);
        }
    }

    function applyEffects(layer, effects) {
        var i;
        for (i = 0; i < effects.length; i++) {
            var effectSpec = effects[i];
            if (!effectSpec.matchName) {
                continue;
            }
            var effectsProp = layer.property("ADBE Effect Parade");
            if (!effectsProp) {
                continue;
            }
            var effect = effectSpec.name ? effectsProp.property(effectSpec.name) : undefined;
            if (!effect) {
                effect = effectsProp.addProperty(effectSpec.matchName);
            }
            if (effectSpec.name) {
                effect.name = effectSpec.name;
            }
            applyEffectProperties(effect, effectSpec.properties || {});
        }
    }

    function applyEffectProperties(effect, properties) {
        var key;
        for (key in properties) {
            if (properties.hasOwnProperty(key)) {
                var prop = effect.property(key);
                if (!prop && !isNaN(parseInt(key, 10))) {
                    prop = effect.property(parseInt(key, 10));
                }
                if (prop) {
                    prop.setValue(properties[key]);
                }
            }
        }
    }

    function applyPropertyPaths(root, paths) {
        var i;
        for (i = 0; i < paths.length; i++) {
            var entry = paths[i];
            var prop = propertyByPath(root, entry.path || entry.propertyPath || []);
            if (!prop) {
                continue;
            }
            if (entry.expression) {
                prop.expression = entry.expression;
            }
            if (entry.value !== undefined) {
                prop.setValue(entry.value);
            }
            applyPropertyKeyframes(prop, entry.keyframes || []);
        }
    }

    function propertyByPath(root, path) {
        if (typeof path === "string") {
            path = path.split("/");
        }
        if (!(path instanceof Array)) {
            return undefined;
        }
        var prop = root;
        var i;
        for (i = 0; i < path.length; i++) {
            if (!prop) {
                return undefined;
            }
            if (!isNaN(parseInt(path[i], 10))) {
                prop = prop.property(parseInt(path[i], 10));
            } else {
                prop = prop.property(path[i]);
            }
        }
        return prop;
    }

    function applyExpressions(transform, expressions) {
        setExpression(transform.property("ADBE Position"), expressions.position);
        setExpression(transform.property("ADBE Scale"), expressions.scale);
        setExpression(transform.property("ADBE Opacity"), expressions.opacity);
        setExpression(transform.property("ADBE Rotate X"), expressions.rotationX);
        setExpression(transform.property("ADBE Rotate Y"), expressions.rotationY);
        setExpression(transform.property("ADBE Rotate Z"), expressions.rotationZ || expressions.rotation);
    }

    function setExpression(prop, expression) {
        if (prop && expression) {
            prop.expression = expression;
        }
    }

    function applyTextSpec(layer, textStyle) {
        if (!textStyle || !layer.property("ADBE Text Properties")) {
            return;
        }
        var sourceText = layer.property("ADBE Text Properties").property("ADBE Text Document");
        var doc = sourceText.value;
        if (textStyle.fontSize !== undefined) {
            doc.fontSize = parseFloat(textStyle.fontSize);
        }
        if (textStyle.fillColor) {
            doc.fillColor = colorParam(textStyle.fillColor, doc.fillColor);
        }
        if (textStyle.justification) {
            doc.justification = justificationParam(textStyle.justification);
        }
        sourceText.setValue(doc);
    }

    function applyTextAnimators(layer, animators) {
        if (!animators || animators.length === 0 || !layer.property("ADBE Text Properties")) {
            return;
        }
        var textProps = layer.property("ADBE Text Properties");
        var animatorGroup = textProps.property("ADBE Text Animators");
        var i;
        for (i = 0; i < animators.length; i++) {
            var spec = animators[i];
            var animator = animatorGroup.addProperty("ADBE Text Animator");
            if (spec.name) {
                animator.name = spec.name;
            }
            var props = animator.property("ADBE Text Animator Properties");
            addTextAnimatorProperty(props, "ADBE Text Position 3D", spec.position);
            addTextAnimatorProperty(props, "ADBE Text Scale 3D", spec.scale);
            addTextAnimatorProperty(props, "ADBE Text Opacity", spec.opacity);
            addTextAnimatorProperty(props, "ADBE Text Rotation", spec.rotation);
            addTextSelector(animator, spec.selector || {});
        }
    }

    function addTextAnimatorProperty(props, matchName, value) {
        if (value === undefined) {
            return;
        }
        var prop = props.addProperty(matchName);
        prop.setValue(value);
    }

    function addTextSelector(animator, spec) {
        var selectors = animator.property("ADBE Text Selectors");
        var selector = selectors.addProperty("ADBE Text Selector");
        setVectorProp(selector, "ADBE Text Percent Start", numberParam(spec, "start", 0));
        setVectorProp(selector, "ADBE Text Percent End", numberParam(spec, "end", 100));
        setVectorProp(selector, "ADBE Text Percent Offset", numberParam(spec, "offset", 0));
        applyPropertyKeyframes(selector.property("ADBE Text Percent Start"), spec.startKeyframes);
        applyPropertyKeyframes(selector.property("ADBE Text Percent End"), spec.endKeyframes);
        applyPropertyKeyframes(selector.property("ADBE Text Percent Offset"), spec.offsetKeyframes);
    }

    function applyMarkers(layer, markers) {
        if (!markers || markers.length === 0 || !layer.property("ADBE Marker")) {
            return;
        }
        var markerProp = layer.property("ADBE Marker");
        var i;
        for (i = 0; i < markers.length; i++) {
            var spec = markers[i];
            var marker = new MarkerValue(spec.comment || "");
            if (spec.duration !== undefined) {
                marker.duration = parseFloat(spec.duration);
            }
            if (spec.chapter) {
                marker.chapter = spec.chapter;
            }
            markerProp.setValueAtTime(numberParam(spec, "time", 0), marker);
        }
    }

    function applyMasks(layer, masks) {
        if (!masks || masks.length === 0 || !layer.property("ADBE Mask Parade")) {
            return;
        }
        var maskGroup = layer.property("ADBE Mask Parade");
        var i;
        for (i = 0; i < masks.length; i++) {
            var spec = masks[i];
            var mask = maskGroup.addProperty("ADBE Mask Atom");
            if (spec.name) {
                mask.name = spec.name;
            }
            try {
                mask.maskMode = maskModeParam(spec.mode || "add");
            } catch (err) {}
            setVectorProp(mask, "ADBE Mask Opacity", numberParam(spec, "opacity", 100));
            setVectorProp(mask, "ADBE Mask Feather", vectorParam(spec.feather, [0, 0]));
            if (spec.shape) {
                mask.property("ADBE Mask Shape").setValue(shapeFromSpec(spec.shape));
            }
            applyShapeKeyframes(mask.property("ADBE Mask Shape"), spec.keyframes || []);
        }
    }

    function applyCameraOptions(layer, options) {
        if (!options || !layer.property("ADBE Camera Options Group")) {
            return;
        }
        var camera = layer.property("ADBE Camera Options Group");
        setVectorProp(camera, "ADBE Camera Depth of Field", options.depthOfField === true ? 1 : options.depthOfField);
        setVectorProp(camera, "ADBE Camera Focus Distance", options.focusDistance);
        setVectorProp(camera, "ADBE Camera Aperture", options.aperture);
        setVectorProp(camera, "ADBE Camera Blur Level", options.blurLevel);
        setVectorProp(camera, "ADBE Camera Zoom", options.zoom);
    }

    function replaceLayerFootage(layer, filePath) {
        if (!layer || !layer.source || !layer.source.replace) {
            return;
        }
        var file = File(filePath);
        if (!file.exists) {
            throw new Error("Replacement footage file does not exist: " + filePath);
        }
        layer.source.replace(file);
    }

    function applyParenting(layerMap, layers) {
        var i;
        for (i = 0; i < layers.length; i++) {
            if (layers[i].parent && layers[i].id && layerMap[layers[i].id] && layerMap[layers[i].parent]) {
                if (layerMap[layers[i].id] !== layerMap[layers[i].parent]) {
                    layerMap[layers[i].id].parent = layerMap[layers[i].parent];
                }
            }
        }
    }

    function applyTrackMattes(comp, layerMap, layers) {
        var i;
        for (i = 0; i < layers.length; i++) {
            var matte = layers[i].trackMatte;
            if (!matte || !layers[i].id || !layerMap[layers[i].id] || !layerMap[matte.layerId]) {
                continue;
            }
            var targetLayer = layerMap[layers[i].id];
            var matteLayer = layerMap[matte.layerId];
            var matteType = trackMatteTypeParam(matte.type || "alpha");
            try {
                if (targetLayer.setTrackMatte) {
                    targetLayer.setTrackMatte(matteLayer, matteType);
                } else {
                    matteLayer.moveBefore(targetLayer);
                    targetLayer.trackMatteType = matteType;
                }
            } catch (err) {}
        }
    }

    function applyPrecomps(comp, layerMap, precomps) {
        var i;
        for (i = 0; i < precomps.length; i++) {
            var ids = precomps[i].layerIds || [];
            var indices = [];
            var j;
            for (j = 0; j < ids.length; j++) {
                if (layerMap[ids[j]]) {
                    indices.push(layerMap[ids[j]].index);
                }
            }
            if (indices.length > 0) {
                indices.sort(function (a, b) {
                    return a - b;
                });
                comp.layers.precompose(indices, precomps[i].name || "AI Precomp", true);
            }
        }
    }

    function poseFor(relative, comp, topPercent, params) {
        var knots = [
            { d: -2, x: 0.01, y: -0.50, z: -260, s: 68, rx: -8, ry: 0, rz: 2, opacity: 78 },
            { d: -1, x: 0, y: -0.31, z: -120, s: 78, rx: -78, ry: 0, rz: 0, opacity: 90 },
            { d: -0.18, x: 0, y: -0.09, z: 30, s: 103, rx: -18, ry: -1, rz: -2, opacity: 100 },
            { d: 0, x: 0, y: -0.02, z: 70, s: numberParam(params, "centerScale", 112), rx: 0, ry: -2, rz: -3, opacity: 100 },
            { d: 0.18, x: 0, y: 0.08, z: 30, s: 102, rx: 18, ry: -1, rz: -2, opacity: 100 },
            { d: 1, x: 0, y: 0.31, z: -120, s: 82, rx: 78, ry: 0, rz: 0, opacity: 92 },
            { d: 2, x: 0.01, y: 0.54, z: -260, s: 70, rx: 8, ry: 0, rz: 2, opacity: 78 }
        ];
        var spacing = numberParam(params, "spacingScale", 1);
        var d = clamp(relative, -2, 2);
        var raw = knots[knots.length - 1];
        var i;
        for (i = 0; i < knots.length - 1; i++) {
            if (d >= knots[i].d && d <= knots[i + 1].d) {
                raw = mixPose(knots[i], knots[i + 1], (d - knots[i].d) / (knots[i + 1].d - knots[i].d));
                break;
            }
        }
        return {
            x: comp.width / 2 + raw.x * comp.width,
            y: comp.height * topPercent / 100 + raw.y * comp.height * spacing,
            z: raw.z,
            s: raw.s,
            rx: raw.rx,
            ry: raw.ry,
            rz: raw.rz,
            opacity: raw.opacity
        };
    }

    function mixPose(a, b, t) {
        return {
            x: lerp(a.x, b.x, t),
            y: lerp(a.y, b.y, t),
            z: lerp(a.z, b.z, t),
            s: lerp(a.s, b.s, t),
            rx: lerp(a.rx, b.rx, t),
            ry: lerp(a.ry, b.ry, t),
            rz: lerp(a.rz, b.rz, t),
            opacity: lerp(a.opacity, b.opacity, t)
        };
    }

    function getCompInfo() {
        var comp = activeComp();
        return getCompInfoFor(comp);
    }

    function inspectActiveComp(params) {
        var comp = activeComp();
        var maxLayers = numberParam(params || {}, "maxLayers", comp.numLayers);
        var includeProperties = !!(params && params.includeProperties);
        var result = getCompInfoFor(comp);
        result.layers = [];
        var limit = Math.min(comp.numLayers, maxLayers);
        var i;
        for (i = 1; i <= limit; i++) {
            result.layers.push(inspectLayer(comp.layer(i), includeProperties, numberParam(params || {}, "propertyDepth", 2)));
        }
        return result;
    }

    function inspectSelectedLayers(params) {
        var comp = activeComp();
        var layers = comp.selectedLayers;
        var includeProperties = !!(params && params.includeProperties);
        var result = [];
        var i;
        for (i = 0; i < layers.length; i++) {
            result.push(inspectLayer(layers[i], includeProperties, numberParam(params || {}, "propertyDepth", 3)));
        }
        return { selectedLayers: result };
    }

    function inspectLayer(layer, includeProperties, depth) {
        var item = {
            index: layer.index,
            name: layer.name,
            id: layer.comment && layer.comment.indexOf("codex-id:") === 0 ? layer.comment.substring(9) : "",
            enabled: layer.enabled,
            shy: !!layer.shy,
            guideLayer: !!layer.guideLayer,
            threeDLayer: !!layer.threeDLayer,
            adjustmentLayer: !!layer.adjustmentLayer,
            inPoint: layer.inPoint,
            outPoint: layer.outPoint,
            startTime: layer.startTime,
            label: layer.label,
            matchName: layer.matchName || "",
            hasVideo: !!layer.hasVideo,
            hasAudio: !!layer.hasAudio
        };
        try {
            item.blendingMode = String(layer.blendingMode);
        } catch (err) {}
        if (layer.parent) {
            item.parent = layer.parent.name;
        }
        if (includeProperties) {
            item.properties = dumpPropertyTree(layer, depth);
        }
        return item;
    }

    function dumpLayerProperties(params) {
        var comp = activeComp();
        var layer;
        if (params.layerName) {
            layer = comp.layer(params.layerName);
        } else if (params.layerIndex) {
            layer = comp.layer(parseInt(params.layerIndex, 10));
        } else if (comp.selectedLayers.length > 0) {
            layer = comp.selectedLayers[0];
        }
        if (!layer) {
            throw new Error("Select a layer, or pass layerName/layerIndex.");
        }
        return {
            layer: inspectLayer(layer, false, 0),
            properties: dumpPropertyTree(layer, numberParam(params, "depth", 5))
        };
    }

    function dumpPropertyTree(group, depth) {
        var result = [];
        if (!group || depth < 0 || group.numProperties === undefined) {
            return result;
        }
        var i;
        for (i = 1; i <= group.numProperties; i++) {
            var prop = group.property(i);
            if (!prop) {
                continue;
            }
            var entry = {
                index: i,
                name: prop.name,
                matchName: prop.matchName || "",
                propertyType: prop.propertyType,
                canSetExpression: !!prop.canSetExpression,
                numKeys: prop.numKeys || 0
            };
            if (prop.propertyValueType !== undefined) {
                entry.propertyValueType = prop.propertyValueType;
            }
            if (prop.numProperties !== undefined && prop.numProperties > 0 && depth > 0) {
                entry.children = dumpPropertyTree(prop, depth - 1);
            }
            result.push(entry);
        }
        return result;
    }

    function capturePreviewFrame(params) {
        var comp = activeComp();
        var outputPath = params.outputPath || (state.runtimeDir + "/preview.png");
        var time = params.time !== undefined ? parseFloat(params.time) : comp.time;
        var file = File(outputPath);
        try {
            comp.saveFrameToPng(time, file);
        } catch (err) {
            throw new Error("Could not save preview frame: " + err.toString());
        }
        var settled = waitForStableFile(outputPath, 8000);
        if (!settled) {
            throw new Error("Preview frame did not finish writing within 8s: " + outputPath);
        }
        return { outputPath: outputPath, time: time, comp: comp.name };
    }

    function listProjectAssets(params) {
        if (!app.project) {
            return { assets: [] };
        }
        var assets = [];
        var i;
        for (i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            assets.push({
                index: i,
                name: item.name,
                typeName: item.typeName,
                width: item.width || 0,
                height: item.height || 0,
                duration: item.duration || 0,
                frameRate: item.frameRate || 0,
                file: item.file ? item.file.fsName : ""
            });
        }
        return { assets: assets };
    }

    function importAsset(params) {
        if (!app.project) {
            app.newProject();
        }
        if (!params.path) {
            throw new Error("importAsset requires path.");
        }
        var file = File(params.path);
        if (!file.exists) {
            throw new Error("Asset file does not exist: " + params.path);
        }
        var options = new ImportOptions(file);
        if (params.sequence !== undefined) {
            options.sequence = !!params.sequence;
        }
        var item = app.project.importFile(options);
        if (params.name) {
            item.name = params.name;
        }
        return { name: item.name, typeName: item.typeName, file: item.file ? item.file.fsName : "" };
    }

    function diagnoseBridge() {
        var activeName = "";
        var activeType = "";
        if (app.project && app.project.activeItem) {
            activeName = app.project.activeItem.name;
            activeType = app.project.activeItem instanceof CompItem ? "CompItem" : "ProjectItem";
        }
        return {
            bridge: BRIDGE_NAME,
            runtimeDir: state.runtimeDir,
            listening: state.listening,
            pollMs: state.pollMs,
            panelVersion: state.panelVersion,
            heartbeatAt: isoString(),
            hasProject: !!app.project,
            activeItem: activeName,
            activeItemType: activeType,
            jsonAvailable: typeof JSON !== "undefined"
        };
    }

    function getCompInfoFor(comp) {
        return {
            name: comp.name,
            width: comp.width,
            height: comp.height,
            duration: comp.duration,
            frameRate: comp.frameRate,
            selectedLayers: comp.selectedLayers.length,
            numLayers: comp.numLayers
        };
    }

    function executeCommand(command) {
        if (!command || !command.action) {
            throw new Error("Command must include an action.");
        }
        var params = command.params || {};
        if (command.action === "ping") {
            return { pong: true };
        }
        if (command.action === "diagnose") {
            return diagnoseBridge();
        }
        if (command.action === "getActiveComp") {
            return getCompInfo();
        }
        if (command.action === "inspectActiveComp") {
            return inspectActiveComp(params);
        }
        if (command.action === "inspectSelectedLayers") {
            return inspectSelectedLayers(params);
        }
        if (command.action === "dumpLayerProperties") {
            return dumpLayerProperties(params);
        }
        if (command.action === "capturePreviewFrame") {
            return capturePreviewFrame(params);
        }
        if (command.action === "listProjectAssets") {
            return listProjectAssets(params);
        }
        if (command.action === "importAsset") {
            return importAsset(params);
        }
        if (command.action === "batch") {
            return executeBatch(params);
        }
        if (command.action === "createComp") {
            return createComp(params);
        }
        if (command.action === "buildSceneFromSpec") {
            return buildSceneFromSpec(params);
        }
        if (command.action === "updateSceneFromSpec") {
            return updateSceneFromSpec(params);
        }
        if (command.action === "createWhiteCardStack") {
            return createWhiteCardStack(params);
        }
        if (command.action === "applyStackMotion") {
            return applyStackMotion(params);
        }
        if (command.action === "convertAudioToKeyframes") {
            return convertAudioToKeyframes(params);
        }
        if (command.action === "enqueueRender") {
            return enqueueRender(params);
        }
        if (command.action === "replaceFootage") {
            return replaceFootageCommand(params);
        }
        throw new Error("Unsupported action: " + command.action);
    }

    function executeBatch(params) {
        var commands = params.commands || [];
        var results = [];
        var i;
        for (i = 0; i < commands.length; i++) {
            results.push({
                action: commands[i].action,
                data: executeCommand(commands[i])
            });
        }
        return { results: results };
    }

    function convertAudioToKeyframes(params) {
        var comp = activeComp();
        var layerName = params.layerName || "";
        var layer = layerName ? comp.layer(layerName) : (comp.selectedLayers.length > 0 ? comp.selectedLayers[0] : undefined);
        if (!layer) {
            throw new Error("Select an audio layer or pass layerName.");
        }
        deselectAllLayers(comp);
        layer.selected = true;
        var commandId = app.findMenuCommandId("Convert Audio to Keyframes");
        if (!commandId) {
            throw new Error("Could not find Convert Audio to Keyframes command.");
        }
        app.executeCommand(commandId);
        return { convertedLayer: layer.name };
    }

    function deselectAllLayers(comp) {
        var i;
        for (i = 1; i <= comp.numLayers; i++) {
            comp.layer(i).selected = false;
        }
    }

    function enqueueRender(params) {
        var comp = activeComp();
        var rqItem = app.project.renderQueue.items.add(comp);
        if (params.outputPath) {
            rqItem.outputModule(1).file = File(params.outputPath);
        }
        if (params.renderSettingsTemplate) {
            rqItem.applyTemplate(params.renderSettingsTemplate);
        }
        if (params.outputModuleTemplate) {
            rqItem.outputModule(1).applyTemplate(params.outputModuleTemplate);
        }
        if (params.render === true) {
            app.project.renderQueue.render();
        }
        return { queuedComp: comp.name, outputPath: params.outputPath || "" };
    }

    function replaceFootageCommand(params) {
        var comp = activeComp();
        var layer = params.layerName ? comp.layer(params.layerName) : undefined;
        if (!layer && comp.selectedLayers.length > 0) {
            layer = comp.selectedLayers[0];
        }
        if (!layer) {
            throw new Error("Select a footage layer or pass layerName.");
        }
        replaceLayerFootage(layer, params.path);
        return { layer: layer.name, path: params.path };
    }

    function applyCompSpec(comp, compSpec) {
        if (!compSpec) {
            return;
        }
        if (compSpec.motionBlur !== undefined) {
            comp.motionBlur = !!compSpec.motionBlur;
        }
        if (compSpec.shyLayers !== undefined) {
            comp.hideShyLayers = !!compSpec.shyLayers;
        }
        if (compSpec.bgColor) {
            comp.bgColor = colorParam(compSpec.bgColor, comp.bgColor);
        }
        applyCompMarkers(comp, compSpec.markers || []);
    }

    function applyCompMarkers(comp, markers) {
        if (!markers || markers.length === 0 || !comp.markerProperty) {
            return;
        }
        var i;
        for (i = 0; i < markers.length; i++) {
            var spec = markers[i];
            var marker = new MarkerValue(spec.comment || "");
            comp.markerProperty.setValueAtTime(numberParam(spec, "time", 0), marker);
        }
    }

    function applyRenderQueueSpec(comp, renderSpec) {
        if (!renderSpec || renderSpec.enabled !== true) {
            return;
        }
        enqueueRender({
            outputPath: renderSpec.outputPath,
            renderSettingsTemplate: renderSpec.renderSettingsTemplate,
            outputModuleTemplate: renderSpec.outputModuleTemplate,
            render: renderSpec.render === true
        });
    }

    function poll(statusText) {
        var file = commandFile();
        if (!file.exists) {
            return;
        }
        var command = parseJson(readText(file));
        if (!command || !command.id || command.id === state.lastCommandId) {
            return;
        }
        state.lastCommandId = command.id;

        try {
            var data = executeCommand(command);
            writeStatus(command.action, true, "OK", data);
            appendHistory({
                id: command.id,
                action: command.action,
                ok: true,
                message: "OK",
                time: new Date().toUTCString()
            });
            if (statusText) {
                statusText.text = "OK: " + command.action + "\n" + command.id;
            }
        } catch (err) {
            writeStatus(command.action || "unknown", false, err.toString(), {});
            appendHistory({
                id: command.id,
                action: command.action || "unknown",
                ok: false,
                message: err.toString(),
                time: new Date().toUTCString()
            });
            if (statusText) {
                statusText.text = "Error: " + err.toString();
            }
        }
    }

    function schedulePoll() {
        if (!state.listening) {
            return;
        }
        // Both calls are individually guarded so a single bad tick (malformed
        // legacy command.json, a queue file processing error, etc.) can never
        // stop app.scheduleTask from re-arming below -- otherwise the recurring
        // loop dies silently and the panel is left showing "connected" while no
        // longer actually polling anything.
        try {
            writeHeartbeat("Bridge polling.");
        } catch (heartbeatErr) {
            logBridgeError("heartbeat", heartbeatErr);
        }
        try {
            poll(undefined);
        } catch (pollErr) {
            logBridgeError("poll", pollErr);
        }
        try {
            pollQueue();
        } catch (queueErr) {
            logBridgeError("pollQueue", queueErr);
        }
        app.scheduleTask("$.global.AE_AI_BRIDGE_SCHEDULED_POLL()", state.pollMs, false);
    }

    function numberParam(params, key, fallback) {
        if (params && params[key] !== undefined && !isNaN(parseFloat(params[key]))) {
            return parseFloat(params[key]);
        }
        return fallback;
    }

    function vectorParam(value, fallback) {
        if (value instanceof Array) {
            return value;
        }
        return fallback;
    }

    function vector2Param(value, fallback) {
        if (value instanceof Array && value.length >= 2) {
            return [value[0], value[1]];
        }
        return fallback;
    }

    function colorParam(value, fallback) {
        if (value instanceof Array && value.length >= 3) {
            return [value[0], value[1], value[2]];
        }
        if (typeof value === "string" && value.charAt(0) === "#" && value.length === 7) {
            return [
                parseInt(value.substr(1, 2), 16) / 255,
                parseInt(value.substr(3, 2), 16) / 255,
                parseInt(value.substr(5, 2), 16) / 255
            ];
        }
        return fallback;
    }

    function lightTypeParam(value) {
        if (value === "parallel") {
            return LightType.PARALLEL;
        }
        if (value === "spot") {
            return LightType.SPOT;
        }
        if (value === "ambient") {
            return LightType.AMBIENT;
        }
        return LightType.POINT;
    }

    function maskModeParam(value) {
        if (value === "subtract") {
            return MaskMode.SUBTRACT;
        }
        if (value === "intersect") {
            return MaskMode.INTERSECT;
        }
        if (value === "lighten") {
            return MaskMode.LIGHTEN;
        }
        if (value === "darken") {
            return MaskMode.DARKEN;
        }
        if (value === "difference") {
            return MaskMode.DIFFERENCE;
        }
        if (value === "none") {
            return MaskMode.NONE;
        }
        return MaskMode.ADD;
    }

    function trackMatteTypeParam(value) {
        if (value === "alpha-inverted" || value === "alphaInverted") {
            return TrackMatteType.ALPHA_INVERTED;
        }
        if (value === "luma") {
            return TrackMatteType.LUMA;
        }
        if (value === "luma-inverted" || value === "lumaInverted") {
            return TrackMatteType.LUMA_INVERTED;
        }
        return TrackMatteType.ALPHA;
    }

    function blendingModeParam(value) {
        if (value === "add") {
            return BlendingMode.ADD;
        }
        if (value === "alphaAdd") {
            return BlendingMode.ALPHA_ADD;
        }
        if (value === "classicColorBurn") {
            return BlendingMode.CLASSIC_COLOR_BURN;
        }
        if (value === "classicColorDodge") {
            return BlendingMode.CLASSIC_COLOR_DODGE;
        }
        if (value === "classicDifference") {
            return BlendingMode.CLASSIC_DIFFERENCE;
        }
        if (value === "color") {
            return BlendingMode.COLOR;
        }
        if (value === "colorBurn") {
            return BlendingMode.COLOR_BURN;
        }
        if (value === "colorDodge") {
            return BlendingMode.COLOR_DODGE;
        }
        if (value === "dancingDissolve") {
            return BlendingMode.DANCING_DISSOLVE;
        }
        if (value === "darken") {
            return BlendingMode.DARKEN;
        }
        if (value === "darkerColor") {
            return BlendingMode.DARKER_COLOR;
        }
        if (value === "difference") {
            return BlendingMode.DIFFERENCE;
        }
        if (value === "dissolve") {
            return BlendingMode.DISSOLVE;
        }
        if (value === "exclusion") {
            return BlendingMode.EXCLUSION;
        }
        if (value === "hardLight") {
            return BlendingMode.HARD_LIGHT;
        }
        if (value === "hardMix") {
            return BlendingMode.HARD_MIX;
        }
        if (value === "hue") {
            return BlendingMode.HUE;
        }
        if (value === "lighten") {
            return BlendingMode.LIGHTEN;
        }
        if (value === "lighterColor") {
            return BlendingMode.LIGHTER_COLOR;
        }
        if (value === "linearBurn") {
            return BlendingMode.LINEAR_BURN;
        }
        if (value === "linearDodge") {
            return BlendingMode.LINEAR_DODGE;
        }
        if (value === "linearLight") {
            return BlendingMode.LINEAR_LIGHT;
        }
        if (value === "luminescentPremul") {
            return BlendingMode.LUMINESCENT_PREMUL;
        }
        if (value === "luminosity") {
            return BlendingMode.LUMINOSITY;
        }
        if (value === "screen") {
            return BlendingMode.SCREEN;
        }
        if (value === "multiply") {
            return BlendingMode.MULTIPLY;
        }
        if (value === "overlay") {
            return BlendingMode.OVERLAY;
        }
        if (value === "pinLight") {
            return BlendingMode.PIN_LIGHT;
        }
        if (value === "saturation") {
            return BlendingMode.SATURATION;
        }
        if (value === "silhouetteAlpha") {
            return BlendingMode.SILHOUETE_ALPHA;
        }
        if (value === "silhouetteLuma") {
            return BlendingMode.SILHOUETTE_LUMA;
        }
        if (value === "softLight") {
            return BlendingMode.SOFT_LIGHT;
        }
        if (value === "stencilAlpha") {
            return BlendingMode.STENCIL_ALPHA;
        }
        if (value === "stencilLuma") {
            return BlendingMode.STENCIL_LUMA;
        }
        if (value === "subtract") {
            return BlendingMode.SUBTRACT;
        }
        if (value === "vividLight") {
            return BlendingMode.VIVID_LIGHT;
        }
        return BlendingMode.NORMAL;
    }

    function justificationParam(value) {
        if (value === "center") {
            return ParagraphJustification.CENTER_JUSTIFY;
        }
        if (value === "right") {
            return ParagraphJustification.RIGHT_JUSTIFY;
        }
        return ParagraphJustification.LEFT_JUSTIFY;
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function lerp(a, b, t) {
        return a + (b - a) * t;
    }

    function setKey(prop, time, value, influence) {
        if (!prop || value === undefined) {
            return;
        }
        prop.setValueAtTime(time, value);
        var idx = prop.nearestKeyIndex(time);
        try {
            prop.setInterpolationTypeAtKey(idx, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
        } catch (interpErr) {}
        var dims = value instanceof Array ? value.length : 1;
        try {
            prop.setTemporalEaseAtKey(idx, easeArray(dims, influence), easeArray(dims, influence));
        } catch (easeErr) {
            try {
                prop.setTemporalEaseAtKey(idx, easeArray(1, influence), easeArray(1, influence));
            } catch (fallbackEaseErr) {}
        }
    }

    function easeArray(count, influence) {
        var result = [];
        var i;
        for (i = 0; i < count; i++) {
            result.push(new KeyframeEase(0, influence));
        }
        return result;
    }

    function pad2(value) {
        return value < 10 ? "0" + value : String(value);
    }

    $.global.AE_AI_BRIDGE_SCHEDULED_POLL = function () {
        if (state.listening) {
            schedulePoll();
        }
    };

    try {
        var panel = buildUI(thisObj);
        if (panel && panel.layout) {
            panel.layout.layout(true);
            panel.layout.resize();
        }
        if (panel instanceof Window) {
            panel.center();
            panel.show();
        }
    } catch (bridgeUiErr) {
        var fallback = (thisObj instanceof Panel)
            ? thisObj
            : new Window("palette", BRIDGE_NAME, undefined, { resizeable: true });
        fallback.orientation = "column";
        fallback.alignChildren = ["fill", "top"];
        fallback.margins = 12;
        fallback.add("statictext", undefined, "AE AI Bridge failed to load:", { multiline: true });
        var errText = fallback.add("edittext", undefined, bridgeUiErr.toString(), { multiline: true, readonly: true });
        errText.preferredSize.height = 160;
        if (fallback.layout) {
            fallback.layout.layout(true);
            fallback.layout.resize();
        }
        if (fallback instanceof Window) {
            fallback.center();
            fallback.show();
        }
    }
})(this);
