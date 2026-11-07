(function () {
    var expected = new File('~/Desktop/Motion-Agent-Demo/Checkmark_Demo.aep').fsName;
    if (!app.project.file || app.project.file.fsName !== expected) throw new Error('Open the standalone demo first');
    var comp = null;
    for (var i = 1; i <= app.project.numItems; i++) {
        var item = app.project.item(i);
        if (item instanceof CompItem && item.name === '02 - Checkmark - slow motion x4') comp = item;
    }
    if (!comp) throw new Error('Demo composition missing');
    comp.time = 1.5;
    comp.openInViewer();
    for (var l = 1; l <= comp.numLayers; l++) comp.layer(l).selected = false;
    app.project.save();
    comp.saveFrameToPng(1.5, new File('~/Desktop/Motion-Agent-Demo/Demo_Preview.png'));
})();
