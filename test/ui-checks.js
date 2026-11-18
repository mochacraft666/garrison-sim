/* 页面内检查函数：由 test/ui-smoke.mjs 注入并逐项调用 */
(function () {
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  function checkGraph() {
    var g = window.__APP__.graph, cv = document.getElementById('graph');
    var px = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    var ink = 0;
    for (var i = 3; i < px.length; i += 4) if (px[i] > 0) ink++;
    return { nodes: g.nodes.length, w: cv.width, h: cv.height, inkRatio: Math.round(ink / (px.length / 4) * 1000) / 1000 };
  }

  function checkZoom() {
    var g = window.__APP__.graph, cv = document.getElementById('graph');
    var r = cv.getBoundingClientRect();
    cv.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true, cancelable: true }));
    var z = g.zoom;
    cv.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: r.left + 40, clientY: r.top + 40 }));
    return { zoomed: Math.round(z * 100) / 100, reset: g.zoom === 1, panReset: g.panX === 0 && g.panY === 0 };
  }

  async function checkTabs() {
    document.querySelector('.gtab[data-view="matrix"]').click();
    await sleep(220);
    document.querySelector('.gtab[data-view="graph"]').click();
    await sleep(450);
    return { nodes: window.__APP__.graph.nodes.length, shown: document.getElementById('graph').style.display };
  }

  async function checkTrash() {
    var app = window.__APP__, before = app.S.field.length;
    var slot = document.querySelector('.slot.filled');
    var sr = slot.getBoundingClientRect();
    var tr = document.getElementById('trash');
    var trR = tr.getBoundingClientRect();
    var base = { bubbles: true, cancelable: true, pointerId: 1, button: 0 };
    slot.dispatchEvent(new PointerEvent('pointerdown', Object.assign({ clientX: sr.left + 20, clientY: sr.top + 20 }, base)));
    document.dispatchEvent(new PointerEvent('pointermove', Object.assign({ clientX: trR.left + trR.width / 2, clientY: trR.top + trR.height / 2 }, base)));
    await sleep(40);
    var hot = tr.classList.contains('hot'), dragging = document.body.classList.contains('dragging');
    document.dispatchEvent(new PointerEvent('pointerup', Object.assign({ clientX: trR.left + trR.width / 2, clientY: trR.top + trR.height / 2 }, base)));
    await sleep(80);
    return { before: before, after: app.S.field.length, hot: hot, dragging: dragging };
  }

  async function previewOpen() {
    document.getElementById('btnOptions').click();
    await sleep(520);
    var g = window.__APP__.getPreviewGraph();
    var cv = document.querySelector('.opt-preview');
    var before = g ? g.params.charge : null;
    var slider = document.querySelector('#optBody input[type=range]');
    if (slider) { slider.value = 1.7; slider.dispatchEvent(new Event('input', { bubbles: true })); }
    await sleep(220);
    return {
      isGraph: !!(g && g.nodes && g.setParams), nodes: g ? g.nodes.length : 0,
      w: cv ? cv.width : 0, before: before, after: g ? g.params.charge : null
    };
  }

  async function previewClose() { document.getElementById('closeOpt').click(); await sleep(120); return true; }

  async function solveStrict() {
    var app = window.__APP__;
    app.S.field = ['折桠', '烈夏', '真理'];
    app.renderAll();
    document.getElementById('btnSolve').click();
    await sleep(100);
    var prefill = JSON.stringify(app.getTargets());
    var tg = app.getTargets();
    Object.keys(tg).forEach(function (k) { delete tg[k]; });
    tg['炎'] = 3;
    document.getElementById('optStrict').checked = true;
    document.getElementById('runSolve').click();
    await sleep(700);
    var r = window.__LAST_SOLVE__ || { solutions: [] };
    var bad = r.solutions.filter(function (s) {
      return Object.keys(s.state.tiers).some(function (n) {
        var lv = s.state.tiers[n].active ? s.state.tiers[n].level : 0;
        return n === '炎' ? lv !== 1 : lv !== 0;
      });
    });
    return { prefill: prefill, count: r.solutions.length, bad: bad.length, strict: r.strict, ms: r.elapsed };
  }

  window.__UI_CHECKS__ = {
    graph: checkGraph, zoom: checkZoom, tabs: checkTabs, trash: checkTrash,
    previewOpen: previewOpen, previewClose: previewClose, solveStrict: solveStrict
  };
})();
