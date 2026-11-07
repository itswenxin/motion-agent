// Close every open composition except the main one, so the user only sees the comp to preview.
// Set MAIN below (or define $.global.MA_MAIN_COMP before $.evalFile). Leaves MAIN open at 0 s.
// Uses File > Close (menu command 4) on each comp's viewer; closing the viewer also closes its timeline.
(function () {
    var MAIN = ($.global.MA_MAIN_COMP) ? $.global.MA_MAIN_COMP : "Main";
    var p = app.project, main = null, n = 0;
    for (var i = 1; i <= p.numItems; i++) {
        var c = p.item(i);
        if (!(c instanceof CompItem)) continue;
        if (c.name === MAIN) { main = c; continue; }
        c.openInViewer();
        app.executeCommand(4);
        n++;
    }
    try { p.renderQueue.showWindow(false); } catch (e) {}
    if (main) { main.openInViewer(); main.time = 0; }
})();
