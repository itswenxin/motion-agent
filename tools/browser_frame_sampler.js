// Browser frame sampler for references you can watch but not download
// (Behance projects with embedded Vimeo players, YouTube embeds, portfolio sites).
//
// 1. Open the player page itself in the browser (for Vimeo: https://player.vimeo.com/video/<id>,
//    taken from the Behance page's iframe src), so the <video> element is on the top-level page.
// 2. Paste this whole file into the browser's JavaScript tool and call:
//      await motionAgentSample({ fps: 12, width: 480 })        // contact sheet + motion energy
//      await motionAgentShowFrame(1.25)                         // one full-size frame, for measuring
//    Then take a screenshot of the page: the sheet / frame is drawn full-window.
// 3. The returned JSON (size, duration, energy per frame, holds) goes into the case notes.
//
// It only reads the video the page already plays. If drawing a frame throws a security error,
// the video is cross-origin protected: fall back to pausing and screenshotting the player.

(function () {
  function findVideo() {
    const vids = [...document.querySelectorAll("video")].filter((v) => v.videoWidth > 0);
    vids.sort((a, b) => b.videoWidth * b.videoHeight - a.videoWidth * a.videoHeight);
    if (!vids.length) throw new Error("No playing <video> on this page. Open the player URL itself.");
    return vids[0];
  }
  async function seek(v, t) {
    if (Math.abs(v.currentTime - t) < 1e-4) return;
    await new Promise((res) => { v.addEventListener("seeked", res, { once: true }); v.currentTime = t; });
  }
  function grab(v, w) {
    const h = Math.round((w * v.videoHeight) / v.videoWidth);
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(v, 0, 0, w, h);
    return { canvas: c, data: g.getImageData(0, 0, w, h).data };
  }
  function energy(a, b) {
    let s = 0;
    for (let i = 0; i < a.length; i += 4) {
      s += Math.abs((a[i] + a[i + 1] + a[i + 2]) - (b[i] + b[i + 1] + b[i + 2])) / 3;
    }
    return s / (a.length / 4);
  }
  function fullWindow(node) {
    document.body.innerHTML = "";
    document.body.style.cssText = "margin:0;background:#fff;overflow:auto";
    node.style.cssText = "display:block;max-width:100vw;height:auto";
    document.body.appendChild(node);
  }

  window.motionAgentSample = async function (opts) {
    const o = Object.assign({ fps: 12, width: 480, cols: 6, maxFrames: 72, hold: 0.35 }, opts || {});
    const v = findVideo();
    v.pause(); v.muted = true;
    const dur = v.duration;
    const step = Math.max(1 / o.fps, dur / o.maxFrames);
    const shots = [];
    for (let t = 0; t < dur - 1e-3; t += step) {
      await seek(v, t);
      shots.push({ t: +t.toFixed(3), ...grab(v, o.width) });
    }
    const e = shots.map((s, i) => (i ? +energy(shots[i - 1].data, s.data).toFixed(2) : 0));
    const holds = [];
    let start = null;
    for (let i = 1; i < e.length; i++) {
      const still = e[i] < o.hold;
      if (still && start === null) start = shots[i - 1].t;
      if ((!still || i === e.length - 1) && start !== null) {
        if (shots[i].t - start >= 0.15) holds.push([start, shots[i].t]);
        start = null;
      }
    }
    // Contact sheet: every frame with its timestamp.
    const w = 240, h = Math.round((w * v.videoHeight) / v.videoWidth);
    const rows = Math.ceil(shots.length / o.cols);
    const sheet = document.createElement("canvas");
    sheet.width = o.cols * (w + 6) + 6; sheet.height = rows * (h + 20) + 6;
    const g = sheet.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, sheet.width, sheet.height);
    g.font = "12px sans-serif"; g.fillStyle = "#000";
    shots.forEach((s, k) => {
      const x = 6 + (k % o.cols) * (w + 6), y = 6 + Math.floor(k / o.cols) * (h + 20);
      g.drawImage(s.canvas, x, y, w, h);
      g.fillText(s.t.toFixed(2) + "s  e" + e[k], x, y + h + 14);
    });
    fullWindow(sheet);
    return { width: v.videoWidth, height: v.videoHeight, duration: +dur.toFixed(3), step: +step.toFixed(4),
             frames: shots.length, holds, energy: e.map((x, i) => [shots[i].t, x]) };
  };

  window.motionAgentShowFrame = async function (t) {
    const v = findVideo();
    v.pause();
    await seek(v, t);
    const { canvas } = grab(v, v.videoWidth);
    fullWindow(canvas);
    return { t, width: v.videoWidth, height: v.videoHeight };
  };
})();
