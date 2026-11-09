// Apply keys fitted by tools/fit_keys.py (ES3 / ExtendScript). Do not run directly: the generated
// file defines MA_KEYS = {comp, layer, fps, holds:[frames], channels:[{name, p, k:[[frame, value, slope]]}]}
// and then evaluates this file.
// Each key gets Bézier interpolation with influence 33.333 % and speed = slope × fps, which is exactly the
// cubic Hermite spline fitted in Python. HOLD keys are set last (setTemporalEaseAtKey resets HOLD).
// Report: ~/Library/Application Support/Motion Agent/runtime/apply_keys.txt
(function () {
    var log = [], ok = false;
    var rep = new File(Folder.userData.fsName + "/Motion Agent/runtime/apply_keys.txt");
    function write() { try { rep.open("w"); rep.write((ok ? "OK\n" : "FAILED\n") + log.join("\n")); rep.close(); } catch (e) {} }
    try {
        if (typeof MA_KEYS === "undefined") { log.push("MA_KEYS is not defined"); write(); return; }
        var D = MA_KEYS, comp = null, i, j, q;
        for (i = 1; i <= app.project.numItems; i++) {
            var it = app.project.item(i);
            if (it instanceof CompItem && it.name === D.comp) { comp = it; break; }
        }
        if (!comp) { log.push("comp not found: " + D.comp); write(); return; }
        var L = comp.layer(D.layer);
        if (!L) { log.push("layer not found: " + D.layer); write(); return; }
        comp.openInViewer();
        var T = L.property("ADBE Transform Group"), KI = KeyframeInterpolationType;
        var pos = T.property("ADBE Position");
        for (i = 0; i < D.channels.length; i++) {
            if (String(D.channels[i].p).indexOf("ADBE Position_") === 0 && !pos.dimensionsSeparated) {
                pos.dimensionsSeparated = true;
                log.push("position separated into X/Y/Z");
            }
        }
        app.beginUndoGroup("Apply fitted keys");
        var props = [];
        for (i = 0; i < D.channels.length; i++) {
            var ch = D.channels[i], pr = T.property(ch.p), K = ch.k;
            if (!pr) { log.push("property not found: " + ch.p); continue; }
            var lo = K[0][0] / D.fps, hi = K[K.length - 1][0] / D.fps;
            // Replace only keys inside the fitted range, keep the rest of the timeline.
            for (q = pr.numKeys; q >= 1; q--) { var tq = pr.keyTime(q); if (tq >= lo - 1e-4 && tq <= hi + 1e-4) pr.removeKey(q); }
            var isScale = ch.p === "ADBE Scale";
            for (j = 0; j < K.length; j++) {
                var v = K[j][1];
                if (isScale) v = L.threeDLayer ? [v, v, v] : [v, v];
                pr.setValueAtTime(K[j][0] / D.fps, v);
            }
            for (j = 0; j < K.length; j++) {
                var ki = pr.nearestKeyIndex(K[j][0] / D.fps), dims = pr.keyInTemporalEase(ki).length, e = [], s = K[j][2] * D.fps;
                for (q = 0; q < dims; q++) e.push(new KeyframeEase((isScale && q === 2) ? 0 : s, 33.333));
                pr.setInterpolationTypeAtKey(ki, KI.BEZIER, KI.BEZIER);
                pr.setTemporalEaseAtKey(ki, e, e);
            }
            comp.time = lo;
            props.push(pr);
            log.push(ch.name + ": " + K.length + " keys " + K[0][0] + "-" + K[K.length - 1][0]);
        }
        for (i = 0; i < props.length; i++) {
            for (j = 0; j < D.holds.length; j++) {
                var kk = props[i].nearestKeyIndex(D.holds[j] / D.fps);
                if (Math.abs(props[i].keyTime(kk) * D.fps - D.holds[j]) < 0.01) props[i].setInterpolationTypeAtKey(kk, props[i].keyInInterpolationType(kk), KI.HOLD);
            }
        }
        app.endUndoGroup();
        ok = true;
    } catch (err) {
        log.push("error: " + String(err));
    }
    write();
})();
