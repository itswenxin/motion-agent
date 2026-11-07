// Motion Agent easing library (ES3 / ExtendScript).
// Applies standard cubic-bezier easing curves to After Effects keyframe pairs, so motion is
// built from real keyframes with smooth Bézier speed curves that designers can edit.
//
//   $.evalFile(new File("<repo>/ae_scripts/lib/easing.jsx"));
//   MAEase.apply(prop, 1, 2, "easeOutQuint");          // keys 1 → 2
//   MAEase.apply(prop, 1, 2, [0.05, 0.7, 0.1, 1]);     // any CSS cubic-bezier
//   MAEase.applyAll(prop, "m3EmphasizedDecelerate");    // every moving key pair
//
// Conversion (exact for one segment): cubic-bezier(x1, y1, x2, y2) over a move of rate R = Δ/T
//   out influence = x1·100 %,      out speed = (y1 / x1)·R
//   in  influence = (1 − x2)·100 %, in  speed = ((1 − y2) / (1 − x2))·R
// R is read from AE itself (the speed AE stores for a linear segment), so it is in AE's own
// units for every property type: spatial path length, scale per axis, rotation, colour, etc.
// Curves with y outside 0..1 (back/overshoot) cannot be made from two keys; add a key instead.
//
// Preset values are the published cubic-bezier numbers from: easings.net (Robert Penner's
// equations, BSD), Material Design 3 easing tokens, IBM Carbon motion, and the CSS keywords.

var MAEase = (function () {
    var P = {
        // CSS keywords
        ease: [0.25, 0.1, 0.25, 1], easeIn: [0.42, 0, 1, 1], easeOut: [0, 0, 0.58, 1], easeInOut: [0.42, 0, 0.58, 1],
        // easings.net (Penner)
        easeInSine: [0.12, 0, 0.39, 0], easeOutSine: [0.61, 1, 0.88, 1], easeInOutSine: [0.37, 0, 0.63, 1],
        easeInQuad: [0.11, 0, 0.5, 0], easeOutQuad: [0.5, 1, 0.89, 1], easeInOutQuad: [0.45, 0, 0.55, 1],
        easeInCubic: [0.32, 0, 0.67, 0], easeOutCubic: [0.33, 1, 0.68, 1], easeInOutCubic: [0.65, 0, 0.35, 1],
        easeInQuart: [0.5, 0, 0.75, 0], easeOutQuart: [0.25, 1, 0.5, 1], easeInOutQuart: [0.76, 0, 0.24, 1],
        easeInQuint: [0.64, 0, 0.78, 0], easeOutQuint: [0.22, 1, 0.36, 1], easeInOutQuint: [0.83, 0, 0.17, 1],
        easeInExpo: [0.7, 0, 0.84, 0], easeOutExpo: [0.16, 1, 0.3, 1], easeInOutExpo: [0.87, 0, 0.13, 1],
        easeInCirc: [0.55, 0, 1, 0.45], easeOutCirc: [0, 0.55, 0.45, 1], easeInOutCirc: [0.85, 0, 0.15, 1],
        // Material Design 3
        m3Standard: [0.2, 0, 0, 1], m3StandardDecelerate: [0, 0, 0, 1], m3StandardAccelerate: [0.3, 0, 1, 1],
        m3EmphasizedDecelerate: [0.05, 0.7, 0.1, 1], m3EmphasizedAccelerate: [0.3, 0, 0.8, 0.15], m3Legacy: [0.4, 0, 0.2, 1],
        // IBM Carbon
        carbonProductiveStandard: [0.2, 0, 0.38, 0.9], carbonProductiveEntrance: [0, 0, 0.38, 0.9], carbonProductiveExit: [0.2, 0, 1, 0.9],
        carbonExpressiveStandard: [0.4, 0.14, 0.3, 1], carbonExpressiveEntrance: [0, 0, 0.3, 1], carbonExpressiveExit: [0.4, 0.14, 1, 1]
    };

    function curve(c) {
        if (c instanceof Array) return c;
        if (!P[c]) throw new Error("Unknown easing preset: " + c);
        return P[c];
    }
    function clampInf(v) { return Math.max(0.1, Math.min(100, v)); }

    // AE's own rate (Δ/T, per ease dimension, signed) for keys k1→k2, read from a temporary linear segment.
    function rates(prop, k1, k2) {
        var o1 = prop.keyOutInterpolationType(k1), i1 = prop.keyInInterpolationType(k1);
        var o2 = prop.keyOutInterpolationType(k2), i2 = prop.keyInInterpolationType(k2);
        var e1in = prop.keyInTemporalEase(k1), e2out = prop.keyOutTemporalEase(k2);
        prop.setInterpolationTypeAtKey(k1, i1, KeyframeInterpolationType.LINEAR);
        prop.setInterpolationTypeAtKey(k2, KeyframeInterpolationType.LINEAR, o2);
        var r = [], e = prop.keyOutTemporalEase(k1), j;
        for (j = 0; j < e.length; j++) r.push(e[j].speed);
        // Spatial and colour speeds are reported unsigned; non-spatial scalars keep their sign.
        return { r: r, restore: { e1in: e1in, e2out: e2out, i1: i1, o2: o2 } };
    }

    function apply(prop, k1, k2, c) {
        var b = curve(c), x1 = b[0], y1 = b[1], x2 = b[2], y2 = b[3];
        if (y1 < 0 || y1 > 1 || y2 < 0 || y2 > 1) throw new Error("Overshoot curves need an extra key; use a 3-key overshoot instead.");
        var info = rates(prop, k1, k2), outE = [], inE = [], j;
        for (j = 0; j < info.r.length; j++) {
            var R = info.r[j];
            var so = x1 > 0 ? (y1 / x1) * R : (y1 > 0 ? 100 * R : 0);
            var si = x2 < 1 ? ((1 - y2) / (1 - x2)) * R : ((1 - y2) > 0 ? 100 * R : 0);
            outE.push(new KeyframeEase(so, clampInf(x1 * 100)));
            inE.push(new KeyframeEase(si, clampInf((1 - x2) * 100)));
        }
        prop.setInterpolationTypeAtKey(k1, info.restore.i1, KeyframeInterpolationType.BEZIER);
        prop.setInterpolationTypeAtKey(k2, KeyframeInterpolationType.BEZIER, info.restore.o2);
        prop.setTemporalEaseAtKey(k1, info.restore.e1in, outE);
        prop.setTemporalEaseAtKey(k2, inE, info.restore.e2out);
        // setTemporalEaseAtKey resets HOLD: put a HOLD back if the far side was holding.
        if (info.restore.o2 === KeyframeInterpolationType.HOLD) prop.setInterpolationTypeAtKey(k2, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.HOLD);
        return { out: outE.length, curve: b };
    }

    function same(a, b) {
        if (a instanceof Array) { for (var i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 1e-6) return false; return true; }
        return Math.abs(a - b) < 1e-6;
    }

    // Ease every key pair that actually moves (skips holds and equal values).
    function applyAll(prop, c) {
        var n = 0, q;
        for (q = 1; q < prop.numKeys; q++) {
            if (prop.keyOutInterpolationType(q) === KeyframeInterpolationType.HOLD) continue;
            if (same(prop.keyValue(q), prop.keyValue(q + 1))) continue;
            apply(prop, q, q + 1, c); n++;
        }
        return n;
    }

    return { presets: P, apply: apply, applyAll: applyAll, curve: curve };
})();
