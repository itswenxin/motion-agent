// Keyframe health check for the open project (read-only).
// Flags what makes motion look stiff or jittery:
//   LINEAR    linear interpolation on a moving key pair (speed jumps in steps)
//   DENSE     more than 4 keys per second inside one continuous move (traced samples)
//   WOBBLE    speed rises again inside a single eased segment, or reverses direction
// Report: ~/Library/Application Support/Motion Agent/runtime/audit_keyframes.txt
(function () {
    var p = app.project, out = [], counts = { LINEAR: 0, DENSE: 0, WOBBLE: 0 };
    function mag(a, b) { if (a instanceof Array) { var s = 0; for (var i = 0; i < a.length; i++) s += (b[i] - a[i]) * (b[i] - a[i]); return Math.sqrt(s); } return Math.abs(b - a); }
    function check(c, L, pr, path) {
        if (pr.numKeys < 2) return;
        var fd = c.frameDuration, q, issues = [];
        for (q = 1; q < pr.numKeys; q++) {
            var o = pr.keyOutInterpolationType(q);
            if (o === KeyframeInterpolationType.HOLD) continue;
            if (mag(pr.keyValue(q), pr.keyValue(q + 1)) < 1e-6) continue;
            if (o === KeyframeInterpolationType.LINEAR || pr.keyInInterpolationType(q + 1) === KeyframeInterpolationType.LINEAR) { issues.push("LINEAR k" + q); counts.LINEAR++; }
            var t0 = pr.keyTime(q), t1 = pr.keyTime(q + 1), prev = -1, peaked = false, rose = false, t;
            for (t = t0; t < t1 - fd * 0.5; t += fd) {
                var s = mag(pr.valueAtTime(t, true), pr.valueAtTime(t + fd, true));
                if (prev >= 0) { if (s < prev - 1e-3) peaked = true; else if (peaked && s > prev * 1.08 + 0.05) rose = true; }
                prev = s;
            }
            if (rose) { issues.push("WOBBLE k" + q + "-" + (q + 1)); counts.WOBBLE++; }
        }
        // Dense runs: consecutive moving keys closer than 0.25 s
        var run = 1;
        for (q = 1; q < pr.numKeys; q++) {
            var moving = pr.keyOutInterpolationType(q) !== KeyframeInterpolationType.HOLD && mag(pr.keyValue(q), pr.keyValue(q + 1)) > 1e-6;
            if (moving && pr.keyTime(q + 1) - pr.keyTime(q) < 0.25 && pr.keyTime(q + 1) - pr.keyTime(q) > fd * 1.5) { run++; if (run === 4) { issues.push("DENSE from k" + (q - 2)); counts.DENSE++; } } else run = 1;
        }
        if (issues.length) out.push(c.name + " | " + L.name + " | " + path + pr.name + " | " + issues.join(", "));
    }
    function walk(c, L, g, path) {
        for (var i = 1; i <= g.numProperties; i++) {
            var pr = g.property(i);
            if (pr.propertyType === PropertyType.PROPERTY) {
                var hiddenLeader = false; try { hiddenLeader = pr.isSeparationLeader && pr.dimensionsSeparated; } catch (e) {}
                if (pr.canVaryOverTime && !hiddenLeader) check(c, L, pr, path);
            }
            else walk(c, L, pr, path + pr.name + ">");
        }
    }
    for (var i = 1; i <= p.numItems; i++) {
        var c = p.item(i); if (!(c instanceof CompItem)) continue;
        for (var l = 1; l <= c.numLayers; l++) walk(c, c.layer(l), c.layer(l), "");
    }
    out.unshift("LINEAR " + counts.LINEAR + " · DENSE " + counts.DENSE + " · WOBBLE " + counts.WOBBLE);
    var dir = new Folder("~/Library/Application Support/Motion Agent/runtime"); if (!dir.exists) dir.create();
    var f = new File(dir.fsName + "/audit_keyframes.txt"); f.encoding = "UTF-8"; f.open("w"); f.write(out.join("\n")); f.close();
})();
