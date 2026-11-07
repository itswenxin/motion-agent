// Standalone checkmark pop demo: two comps, scale + opacity keys, no footage, fonts or plugins.
// Preserves the existing AE project in a separate recovery file before creating
// a new project. Does not overwrite the original project or existing demos.
(function () {
    var root = new Folder('~/Desktop/Motion-Agent-Demo');
    if (!root.exists && !root.create()) throw new Error('Cannot create demo folder');
    var output = new File(root.fsName + '/Checkmark_Demo.aep');
    if (output.exists) throw new Error('Demo already exists; refusing to overwrite');
    var recovery = null;
    var originalPath = app.project && app.project.file ? app.project.file.fsName : null;
    if (app.project && app.project.numItems > 0) {
        var recoveryDir = new Folder(root.fsName + '/Recovery');
        if (!recoveryDir.exists && !recoveryDir.create()) throw new Error('Cannot create recovery folder');
        recovery = new File(recoveryDir.fsName + '/Existing_AE_Project_Recovery_' + new Date().getTime() + '.aep');
        app.project.save(recovery);
        if (!recovery.exists) throw new Error('Recovery file missing; original project left open');
    }
    app.newProject();
    app.beginUndoGroup('Create standalone checkmark demo');

    var paper = [247 / 255, 246 / 255, 242 / 255];
    var green = [81 / 255, 92 / 255, 70 / 255];
    var white = [247 / 255, 249 / 255, 242 / 255];
    var sourceTimes = [3.25, 3.375, 3.45833333333333, 3.5];
    var sourceValues = [[0, 0, 100], [128, 128, 100], [92, 92, 100], [100, 100, 100]];
    var opacityTimes = [3.25, 3.33333333333333, 3.70829264322917, 3.79170735677083];
    var opacityValues = [0, 100, 100, 0];

    function ease(prop, index, influence) {
        var count = prop.value instanceof Array ? prop.value.length : 1;
        var incoming = [], outgoing = [];
        for (var d = 0; d < count; d++) {
            incoming.push(new KeyframeEase(0, influence));
            outgoing.push(new KeyframeEase(0, influence));
        }
        prop.setInterpolationTypeAtKey(index, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
        prop.setTemporalEaseAtKey(index, incoming, outgoing);
    }

    function makeDemo(name, slow) {
        var comp = app.project.items.addComp(name, 1280, 720, 1, slow ? 3.25 : 4.5, 48);
        comp.bgColor = paper;
        var background = comp.layers.addSolid(paper, 'Background / warm white', 1280, 720, 1, comp.duration);
        background.locked = true;

        var button = comp.layers.addShape();
        button.name = 'Button / editable rounded square';
        var buttonGroup = button.property('ADBE Root Vectors Group').addProperty('ADBE Vector Group');
        buttonGroup.name = 'Rounded square';
        var buttonContents = buttonGroup.property('ADBE Vectors Group');
        var rectangle = buttonContents.addProperty('ADBE Vector Shape - Rect');
        rectangle.property('ADBE Vector Rect Size').setValue([216, 216]);
        rectangle.property('ADBE Vector Rect Roundness').setValue(60);
        var fill = buttonContents.addProperty('ADBE Vector Graphic - Fill');
        fill.property('ADBE Vector Fill Color').setValue(green);
        button.property('ADBE Transform Group').property('ADBE Position').setValue([640, 360]);

        var check = comp.layers.addShape();
        check.name = 'AI BtnGlass Check';
        check.threeDLayer = true;
        check.label = 9;
        check.comment = 'Editable shape. Scale and opacity keys reconstructed from repository script. Not an archived original project.';
        var checkGroup = check.property('ADBE Root Vectors Group').addProperty('ADBE Vector Group');
        checkGroup.name = 'Checkmark / editable vector path';
        var checkContents = checkGroup.property('ADBE Vectors Group');
        var pathProperty = checkContents.addProperty('ADBE Vector Shape - Group').property('ADBE Vector Shape');
        var path = new Shape();
        path.vertices = [[-38.25, 2.25], [-13.5, 27], [40.5, -27]];
        path.inTangents = [[0, 0], [0, 0], [0, 0]];
        path.outTangents = [[0, 0], [0, 0], [0, 0]];
        path.closed = false;
        pathProperty.setValue(path);
        var stroke = checkContents.addProperty('ADBE Vector Graphic - Stroke');
        stroke.property('ADBE Vector Stroke Color').setValue(white);
        stroke.property('ADBE Vector Stroke Width').setValue(15.75);
        stroke.property('ADBE Vector Stroke Line Cap').setValue(2);
        stroke.property('ADBE Vector Stroke Line Join').setValue(2);
        var transform = check.property('ADBE Transform Group');
        transform.property('ADBE Position').setValue([640, 360, 0]);
        var scale = transform.property('ADBE Scale');
        var opacity = transform.property('ADBE Opacity');
        function mapTime(t) { return slow ? 0.5 + (t - 3.25) * 4 : t; }
        for (var k = 0; k < sourceTimes.length; k++) {
            scale.setValueAtTime(mapTime(sourceTimes[k]), sourceValues[k]);
            ease(scale, k + 1, k === 1 ? 78 : 68);
        }
        for (var o = 0; o < opacityTimes.length; o++) {
            opacity.setValueAtTime(mapTime(opacityTimes[o]), opacityValues[o]);
            ease(opacity, o + 1, 70);
        }
        var labels = ['Zero scale', 'Overshoot / 128%', 'Rebound / 92%', 'Settle / 100%'];
        for (var m = 0; m < sourceTimes.length; m++) {
            comp.markerProperty.setValueAtTime(mapTime(sourceTimes[m]), new MarkerValue(labels[m]));
        }
        comp.workAreaStart = slow ? 0 : 3;
        comp.workAreaDuration = slow ? 3.25 : 1.5;
        comp.time = slow ? 1.5 : 3.5;
        comp.comment = slow ? 'Four-times-slower demonstration. Same scale values; timings stretched for explanation.' : 'Original source timing, easing influences and opacity keys. Shapes reconstructed for this standalone demo.';
        return {comp: comp, check: check, scale: scale, opacity: opacity};
    }

    var original = makeDemo('01 - Checkmark - source timing', false);
    var slow = makeDemo('02 - Checkmark - slow motion x4', true);
    slow.comp.openInViewer();
    for (var layerIndex = 1; layerIndex <= slow.comp.numLayers; layerIndex++) slow.comp.layer(layerIndex).selected = false;
    slow.check.selected = true;
    slow.scale.selected = true;
    slow.opacity.selected = true;
    app.endUndoGroup();
    app.project.save(output);
    if (!output.exists) throw new Error('AE demo save failed');
    var report = new File(root.fsName + '/demo-verification.txt');
    report.encoding = 'UTF-8';
    report.open('w');
    report.write('Created standalone reconstruction, not original archived AEP.\n' +
        'demo=' + output.fsName + '\n' +
        'previousProject=' + originalPath + '\n' +
        'recovery=' + (recovery ? recovery.fsName : 'not needed') + '\n' +
        'compositions=2\n' +
        'layersPerComposition=' + slow.comp.numLayers + '\n' +
        'scaleKeys=' + slow.scale.numKeys + '\n' +
        'opacityKeys=' + slow.opacity.numKeys + '\n' +
        'sourceScaleTimes=' + sourceTimes.join(',') + '\n' +
        'externalAssets=0\n' +
        'thirdPartyEffects=0\n');
    report.close();
})();
