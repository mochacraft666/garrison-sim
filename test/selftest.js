/* 页面自检：打开 dist/卫戍配队模拟器-自检.html 即自动运行
 * 覆盖：图谱渲染 / 缩放复位 / 三视图切换 / 拖入删除区 / 设置页预览同源 / 求解预填 / 严格模式
 * 结果写入 window.__SELFTEST__（数组），右下角显示面板，标题显示通过数。
 */
(function () {
  // 自检版页面始终运行；普通版不会注入这段脚本
  var R = [];
  var running = true;
  var stageName = '';
  function stage(n) { stageName = n; render(); try { document.title = '自检运行中 · ' + n; } catch (e) {} }
  function add(name, ok, detail) {
    R.push({ name: name, ok: !!ok, detail: detail == null ? '' : String(detail) });
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

  function render() {
    var p = document.getElementById('selftestPanel');
    if (!p) {
      p = document.createElement('div');
      p.id = 'selftestPanel';
      p.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:99999;background:#141a22;border:1px solid #3a4651;border-radius:8px;padding:10px 12px;font:12px/1.7 system-ui,sans-serif;color:#dfe7ef;max-width:460px;box-shadow:0 8px 30px rgba(0,0,0,.55)';
      document.body.appendChild(p);
    }
    var pass = R.filter(function (x) { return x.ok; }).length;
    var title = running ? ('自检运行中… ' + stageName) : ('自检 ' + pass + '/' + R.length + (R.length && pass === R.length ? ' 全部通过' : ' 有失败'));
    var color = running ? '#8ab4f8' : (R.length && pass === R.length ? '#7ee0a3' : '#f0a35e');
    var html = '<div style="font-weight:700;margin-bottom:6px;color:' + color + '">' + title + '</div>';
    R.forEach(function (x) {
      html += '<div style="margin:2px 0"><span style="color:' + (x.ok ? '#7ee0a3' : '#ff6b6b') + '">' + (x.ok ? 'PASS' : 'FAIL') + '</span> ' + esc(x.name) + (x.detail ? '<span style="color:#8a97a5"> · ' + esc(x.detail) + '</span>' : '') + '</div>';
    });
    html += '<div style="margin-top:6px;color:#8a97a5">完整结果见 window.__SELFTEST__</div>';
    p.innerHTML = html;
    document.title = '自检 ' + pass + '/' + R.length;
  }

  async function run() {
    render();
    for (var w = 0; w < 40 && !window.__APP__; w++) await sleep(100);
    var app = window.__APP__;
    if (!app) {
      var diag = [
        'ready=' + document.readyState,
        '数据=' + (window.__DATA__ ? '有' : '无'),
        'Core=' + (typeof window.Core),
        '候选卡=' + document.querySelectorAll('.card').length,
        '错误=' + ((window.__EARLY_ERRORS__ || []).join(' | ') || '无'),
        'UI错误=' + ((window.__UI_ERROR__ || '').split('\n')[0] || '无')
      ].join(' / ');
      add('应用初始化', false, diag);
      running = false; render(); window.__SELFTEST__ = R; return;
    }
    var S = app.S;
    if (window.__UI_ERROR__) add('界面初始化', false, String(window.__UI_ERROR__).split('\n')[0]);
    var backup = JSON.parse(JSON.stringify({
      field: S.field, bench: S.bench, elite: S.elite, pivots: S.pivots,
      bans: S.bans, maxSlots: S.maxSlots
    }));
    var lsBackup = {};
    try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); lsBackup[k] = localStorage.getItem(k); } } catch (e) {}

    var covOps = app.core.operators.filter(function (o) { return o.covs.indexOf('炎') >= 0; }).slice(0, 3).map(function (o) { return o.name; });
    S.field = covOps.slice(); S.bench = []; S.elite = {}; S.pivots = {};
    app.renderAll();
    await sleep(500);

    // 1. 图谱渲染
    stage('图谱渲染');
    try {
      var g = app.graph, cv = document.getElementById('graph');
      var px = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
      var ink = 0;
      for (var j = 3; j < px.length; j += 4) if (px[j]) ink++;
      var ratio = ink / (px.length / 4);
      add('图谱渲染', g.nodes.length > 0 && ratio > 0.002, g.nodes.length + ' 节点 / 画布覆盖 ' + (ratio * 100).toFixed(1) + '%');
    } catch (e) { add('图谱渲染', false, e.message); }

    // 2. 滚轮缩放 + 双击复位
    stage('缩放复位');
    try {
      var cv2 = document.getElementById('graph');
      var r = cv2.getBoundingClientRect();
      cv2.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true, cancelable: true }));
      var z = app.graph.zoom;
      cv2.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: r.left + 50, clientY: r.top + 50 }));
      add('滚轮缩放 / 双击复位', z > 1 && app.graph.zoom === 1, 'zoom ' + z.toFixed(2) + ' → ' + app.graph.zoom);
    } catch (e) { add('滚轮缩放 / 双击复位', false, e.message); }

    // 3. 三视图切换后回到图谱
    stage('三视图');
    try {
      var mtab = document.querySelector('.gtab[data-view="matrix"]');
      var gtab = document.querySelector('.gtab[data-view="graph"]');
      if (!mtab || !gtab) throw new Error('找不到视图按钮');
      mtab.click(); await sleep(200); gtab.click(); await sleep(350);
      var cv3 = document.getElementById('graph');
      add('三视图切换', app.graph.nodes.length > 0 && cv3.width > 0, '返回图谱 ' + app.graph.nodes.length + ' 节点 / 宽 ' + cv3.width);
    } catch (e) { add('三视图切换', false, e.message); }

    // 4. 拖入删除区
    stage('删除区');
    try {
      var before = S.field.length;
      var slot = document.querySelector('.slot.filled');
      if (!slot) throw new Error('没有可拖的干员');
      var sr = slot.getBoundingClientRect();
      var base = { bubbles: true, cancelable: true, pointerId: 1, button: 0 };
      slot.dispatchEvent(new PointerEvent('pointerdown', Object.assign({ clientX: sr.left + 20, clientY: sr.top + 20 }, base)));
      document.body.classList.add('dragging');
      await sleep(60);
      var tr = document.getElementById('trash');
      var trr = tr.getBoundingClientRect();
      var mid = { clientX: trr.left + trr.width / 2, clientY: trr.top + trr.height / 2 };
      document.dispatchEvent(new PointerEvent('pointermove', Object.assign({}, base, mid)));
      await sleep(60);
      var hot = tr.classList.contains('hot');
      document.dispatchEvent(new PointerEvent('pointerup', Object.assign({}, base, mid)));
      await sleep(100);
      add('拖入删除区', S.field.length === before - 1, before + ' 人 → ' + S.field.length + ' 人' + (hot ? ' · 高亮生效' : ' · 未高亮'));
    } catch (e) { add('拖入删除区', false, e.message); }

    // 5. 设置页预览与主图同源
    stage('预览同源');
    try {
      document.getElementById('btnOptions').click();
      await sleep(500);
      var pg = app.getPreviewGraph();
      var pcv = document.querySelector('.opt-preview');
      var slider = document.querySelector('#optBody input[type=range]');
      if (!pg) throw new Error('预览 Graph 未创建');
      var pBefore = JSON.stringify(pg.params);
      if (slider) {
        var mn = parseFloat(slider.min || '0'), mx = parseFloat(slider.max || '2');
        var cur = parseFloat(slider.value);
        slider.value = String(Math.abs(cur - mx) < 0.001 ? mn : mx);
        slider.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(150);
      }
      var changed = JSON.stringify(pg.params) !== pBefore;
      add('设置页预览同源', pg.nodes.length === 9 && pcv && pcv.width > 0 && changed,
        '节点 ' + pg.nodes.length + ' / 画布宽 ' + (pcv ? pcv.width : 0) + (changed ? ' / 滑杆已同步' : ' / 滑杆未同步'));
      document.getElementById('closeOpt').click();
    } catch (e) { add('设置页预览同源', false, e.message); }

    // 6. 打开求解器按当前阵容预填
    stage('求解预填');
    var tg = app.getTargets();
    Object.keys(tg).forEach(function (k) { delete tg[k]; });
    S.field = covOps.slice(); app.renderAll();
    document.getElementById('btnSolve').click();
    await sleep(100);
    var pref = Object.keys(app.getTargets());
    add('打开求解器预填目标', pref.length > 0, pref.join(' / ') || '空');

    // 7. 严格模式：只点亮目标盟约与档位
    stage('严格模式');
    try {
      Object.keys(tg).forEach(function (k) { delete tg[k]; });
      tg['炎'] = 3;
      var cb = document.getElementById('optStrict');
      if (cb) cb.checked = true;
      window.__LAST_SOLVE__ = null;
      document.getElementById('runSolve').click();
      for (var t = 0; t < 40 && !window.__LAST_SOLVE__; t++) await sleep(100);
      var res = window.__LAST_SOLVE__;
      var bad = res ? res.solutions.filter(function (s) {
        return Object.keys(s.state.tiers).some(function (n) {
          var lv = s.state.tiers[n].active ? s.state.tiers[n].level : 0;
          return n === '炎' ? lv !== 1 : lv !== 0;
        });
      }).length : -1;
      add('严格模式求解', !!res && res.solutions.length > 0 && bad === 0,
        res ? res.solutions.length + ' 个方案 / 越界 ' + bad : '超时未返回');
    } catch (e) { add('严格模式求解', false, e.message); }

    // 还原现场
    try {
      S.field = backup.field; S.bench = backup.bench; S.elite = backup.elite;
      S.pivots = backup.pivots; S.bans = backup.bans; S.maxSlots = backup.maxSlots;
      document.querySelectorAll('.overlay.show').forEach(function (o) { o.classList.remove('show'); });
      try { localStorage.clear(); Object.keys(lsBackup).forEach(function (k2) { localStorage.setItem(k2, lsBackup[k2]); }); } catch (e2) {}
      app.renderAll();
    } catch (e) { add('还原现场', false, e.message); }

    window.__SELFTEST__ = R;
    running = false;
    render();
    try { console.table(R); } catch (e) {}
  }

  window.addEventListener('load', function () {
    setTimeout(function () {
      setTimeout(function () {
        if (running) { add('自检超时', false, '停在「' + stageName + '」'); running = false; render(); window.__SELFTEST__ = R; }
      }, 15000);
      run().catch(function (e) {
        add('自检异常', false, String((e && (e.stack || e.message)) || e).split('\n')[0]);
        running = false; render(); window.__SELFTEST__ = R;
      });
    }, 500);
  });
  window.addEventListener('unhandledrejection', function (ev) {
    var r = ev.reason;
    add('未捕获异常', false, String((r && (r.stack || r.message)) || r).split('\n')[0]);
    running = false; render(); window.__SELFTEST__ = R;
  });
})();
