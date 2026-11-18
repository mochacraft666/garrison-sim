/* 卫戍协议·配队模拟器 — 界面与交互 */
(function () {
  'use strict';
  var DATA = window.__DATA__;
  var core = Core.makeCore(DATA);
  var PALETTE = ['#e6c27a', '#63c6e8', '#a98cf0', '#5fd39a', '#e2605c', '#e0a45e', '#7ec8e3', '#c9a45c', '#8fd6a8', '#d98cc0'];
  var COLORS = {};
  core.covenants.forEach(function (c, i) {
    COLORS[c.name] = c.kind === '核心' ? '#e6c27a' : PALETTE[(i % (PALETTE.length - 1)) + 1];
  });
  var TIER_COLORS = GraphView.TIER_COLORS;
  var AVA = (DATA.avatars || {});

  var S = {
    field: [], bench: [], elite: {}, pivots: {}, bans: [], locked: {},
    maxSlots: 8, view: 'graph', search: '', covFilter: null, tierFilter: 0, filterMode: 'tier',
    autoBench: { on: false, covs: [] },
    settings: { grav: 1, charge: 1, len: 1, standard: true, litOnly: false, treePending: true },
    selected: null, archive: false
  };
  var undoStack = [];
  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, html) { var d = document.createElement(tag); if (cls) d.className = cls; if (html != null) d.innerHTML = html; return d; }
  // 方案内展示顺序：等阶低的在左、高的在右（同为稳定排序）
  function teamByTier(names) {
    return names.slice().sort(function (a, b) {
      var ta = core.opByName[a] ? (core.opByName[a].tierNum || 0) : 0;
      var tb = core.opByName[b] ? (core.opByName[b].tierNum || 0) : 0;
      return ta - tb;
    });
  }
  function snap() { return JSON.stringify({ field: S.field, bench: S.bench, elite: S.elite, pivots: S.pivots, maxSlots: S.maxSlots, archive: S.archive }); }
  function pushUndo() { undoStack.push(snap()); if (undoStack.length > 80) undoStack.shift(); }
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove('show'); }, 1800); }

  function compute() {
    return core.compute({ field: S.field, bench: S.bench, elite: Object.keys(S.elite).filter(function (k) { return S.elite[k]; }), pivots: S.pivots, bans: S.bans });
  }
  var ST = compute();

  function renderHeader() {
    $('season').textContent = DATA.meta ? DATA.meta.season : '规程';
    $('stField').textContent = S.field.length + '/' + S.maxSlots;
    $('stBench').textContent = S.bench.length;
    $('stLit').textContent = ST.tierCount;
    $('stRate').textContent = ST.totalRate;
  }

  var ART = DATA.art || null;
  // 分享版：头像不打包，按「干员名 → 游戏内 id」映射在线加载（可多镜像重试）
  function avatarURL(name, i) {
    if (!ART) return '';
    var id = ART.avatarIds && ART.avatarIds[name];
    var bases = ART.bases || [];
    return id && bases[i] ? bases[i] + id + '.png' : '';
  }
  function opAvatar(name, size) {
    var op = core.opByName[name];
    var color = TIER_COLORS[((op && op.tierNum) || 1) - 1];
    var d = el('div');
    d.style.cssText = 'width:' + size + 'px;height:' + size + 'px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:' + Math.round(size * 0.4) + 'px;color:#0c1116;background:' + color + ';overflow:hidden';
    function initial() { d.innerHTML = ''; d.textContent = (name || '?')[0]; }
    var src = AVA[name] || avatarURL(name, 0);
    if (!src) { initial(); return d; }
    var im = el('img');
    im.style.cssText = 'width:100%;height:100%;object-fit:cover';
    im.loading = 'lazy';
    im.referrerPolicy = 'no-referrer';
    var mi = 0;
    im.onerror = function () {
      mi++;
      var next = AVA[name] ? '' : avatarURL(name, mi);
      if (next) im.src = next; else initial();
    };
    im.src = src;
    d.appendChild(im);
    return d;
  }

  function renderSlots() {
    var wrap = $('slots'); wrap.innerHTML = '';
    for (var i = 0; i < S.maxSlots; i++) {
      var name = S.field[i];
      var slot = el('div', 'slot ' + (name ? 'filled' : 'empty') + (S.selected && S.selected.slot === i ? ' sel' : ''));
      slot.dataset.slot = String(i);
      if (name) {
        var op = core.opByName[name];
        slot.appendChild(opAvatar(name, 44));
        slot.appendChild(el('div', 's-nm', name));
        slot.appendChild(el('div', 's-tags', (op.covs || []).join(' · ')));
        if (S.elite[name]) slot.appendChild(el('div', 's-elite', '精锐'));
        if (S.locked[name]) slot.appendChild(el('div', 's-lock', '锁定'));
        if (S.pivots[name]) slot.appendChild(el('div', 's-elite', '⚙' + S.pivots[name]));
      }
      wrap.appendChild(slot);
    }
  }

  function renderBench() {
    var b = $('bench'); b.innerHTML = '';
    S.bench.forEach(function (name) {
      var d = el('div', 'b-op');
      d.dataset.name = name;
      d.appendChild(opAvatar(name, 62));
      d.appendChild(el('div', 'b-nm', name));
      d.addEventListener('click', function () {
        if (window.__suppressClick) return;
        pushUndo();
        S.bench = S.bench.filter(function (n) { return n !== name; });
        renderAll();
      });
      b.appendChild(d);
    });
    $('benchHint').textContent = S.bench.length ? '整备区 ' + S.bench.length + ' 人 · 不占场上人数' : '备用干员 · 不占场上人数';
  }

  function poolMatches(op) {
    if (op.name === '盟约·辅助干员') return false; // 策略赠送，不出现在候选池
    if (S.filterMode === 'cov' && S.covFilter && op.covs.indexOf(S.covFilter) < 0) return false;
    if (S.filterMode === 'tier' && S.tierFilter && op.tierNum !== S.tierFilter) return false;
    if (S.search && op.name.indexOf(S.search) < 0) return false;
    return true;
  }

  function renderPool() {
    var box = $('pool'); box.innerHTML = '';
    var ranked = core.rankCandidates(ST, { elite: Object.keys(S.elite), pivots: S.pivots, bans: S.bans });
    var rankMap = {}; ranked.forEach(function (r, i) { rankMap[r.op] = i; });
    var list = core.operators.filter(poolMatches).slice().sort(function (a, b) {
      var ra = rankMap[a.name] == null ? 999 : rankMap[a.name];
      var rb = rankMap[b.name] == null ? 999 : rankMap[b.name];
      return ra - rb || a.tierNum - b.tierNum;
    });
    $('poolCount').textContent = list.length + ' / ' + (core.operators.length - 1);
    list.forEach(function (op) {
      var onField = S.field.indexOf(op.name) >= 0;
      var d = el('div', 'op' + (onField ? ' on-field' : ''));
      d.dataset.name = op.name;
      d.appendChild(opAvatar(op.name, 46));
      d.appendChild(el('div', 'nm', op.name));
      var cv = el('div', 'cv');
      op.covs.filter(function (c) { return c !== '绝技'; }).forEach(function (c) { var i = el('i', null, c); i.style.color = COLORS[c] || '#8a97a6'; cv.appendChild(i); });
      d.appendChild(cv);
      var rk = rankMap[op.name] != null ? ranked[rankMap[op.name]] : null;
      if (rk && rk.dTier > 0) d.appendChild(el('div', 'badge', '点亮' + (rk.litCovs[0] || '')));
      d.addEventListener('click', function () { if (window.__suppressClick) return; scheduleDetail(op.name); });
      d.addEventListener('dblclick', function () { cancelDetail(); addOp(op.name); });
      d.addEventListener('pointerdown', function (e) { startDrag(e, op.name, 'pool'); });
      d.addEventListener('contextmenu', function (e) { e.preventDefault(); S.locked[op.name] = !S.locked[op.name]; toast(S.locked[op.name] ? '锁定 ' + op.name : '取消锁定 ' + op.name); renderSlots(); });
      d.addEventListener('pointerenter', function () { hlCovs(op.covs, true); });
      d.addEventListener('pointerleave', function () { hlCovs(op.covs, false); });
      box.appendChild(d);
    });
  }

  function renderCovenants() {
    var box = $('covList'); box.innerHTML = '';
    var shown = core.covenants.filter(function (c) { return (ST.counts[c.name] || 0) > 0 && (!S.settings.litOnly || ST.tiers[c.name].active); });
    shown.sort(function (a, b) {
      var aa = ST.tiers[a.name].active ? 1 : 0, ab = ST.tiers[b.name].active ? 1 : 0;
      var ca = ST.counts[a.name] || 0, cb = ST.counts[b.name] || 0;
      return ab - aa || cb - ca || a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name, 'zh');
    });
    if (!shown.length) box.appendChild(el('div', 'empty-tip', '拖入干员后，这里显示相关盟约'));
    var groups = [['', shown]];
    groups.forEach(function (g) {
      if (g[0]) box.appendChild(el('div', 'cov-group', g[0]));
      g[1].forEach(function (c) {
        var t = ST.tiers[c.name];
        var active = t.active;
        var banned = S.bans.indexOf(c.name) >= 0;
        var d = el('div', 'cov' + (active ? ' active' : '') + (banned ? ' banned' : '') + (active ? '' : ' dim'));
        d.style.setProperty('--cc', COLORS[c.name]);
        d.dataset.cov = c.name;
        var ico = el('div', 'cov-badge');
        if (DATA.icons && DATA.icons[c.name]) {
          var ic = el('img', 'cov-ico');
          ic.src = DATA.icons[c.name];
          ico.appendChild(ic);
        } else ico.textContent = c.name.charAt(0);
        d.appendChild(ico);
        var body = el('div', 'cov-body');
        var row = el('div', 'row1');
        row.appendChild(el('span', 'nm', c.name));
        if (c.kind === '附加' && c.countRule !== 'field') row.appendChild(el('span', 'gate', c.countRule === 'field+bench' ? '整备区' : c.countRule === 'elite' ? '精锐' : ''));
        if (banned) row.appendChild(el('span', 'ban', '禁用'));
        row.appendChild(el('span', 'cnt', t.count + ' / ' + (t.nextAt == null ? t.at : t.nextAt) + (active ? ' <b>' + t.level + '档</b>' : '')));
        body.appendChild(row);
        var bar = el('div', 'bar'); var fill = el('i');
        var pct = t.nextAt == null ? 100 : Math.min(100, Math.round(t.count / t.nextAt * 100));
        fill.style.width = pct + '%'; bar.appendChild(fill); body.appendChild(bar);
        var eff = el('div', 'eff' + (active ? ' on' : ''));
        eff.textContent = t.level > 0 ? c.tiers[t.level - 1].body : c.tiers[0].body;
        body.appendChild(eff);
        var rate = ST.rates[c.name];
        if (active && (rate.perRound || rate.oneShot)) {
          body.appendChild(el('div', 'rate', (rate.perRound ? '每回合 +' + rate.perRound + ' 层' : '') + (rate.oneShot ? ' · 单次 +' + rate.oneShot : '')));
        }
        if (c.layerGates && c.layerGates.length) body.appendChild(el('div', 'gate', '层数：' + c.layerGates.map(function (x) { return x.label; }).join(' / ')));
        d.appendChild(body);
        d.addEventListener('click', function () { S.covFilter = S.covFilter === c.name ? null : c.name; renderCovFilter(); renderPool(); });
        d.addEventListener('pointerenter', function () { highlightCov(c.name); });
        d.addEventListener('pointerleave', function () { highlightCov(null); });
        box.appendChild(d);
      });
    });
    $('covHint').textContent = ST.litCount + ' / 26 已激活';
  }

  var OPS_COVS = ['远见', '奇迹', '投资人'];
  function renderCovFilter() {
    var box = $('covFilter'); if (!box) return;
    box.innerHTML = '';
    var all = el('button', 'chip' + (S.covFilter ? '' : ' on'), '全部');
    all.onclick = function () { S.covFilter = null; renderCovFilter(); renderPool(); };
    box.appendChild(all);
    var secs = [
      ['大盟约', core.covenants.filter(function (c) { return c.kind === '核心'; })],
      ['小盟约', core.covenants.filter(function (c) { return c.kind === '附加' && OPS_COVS.indexOf(c.name) < 0 && c.name !== '绝技'; })],
      ['运营盟约', core.covenants.filter(function (c) { return OPS_COVS.indexOf(c.name) >= 0; })]
    ];
    secs.forEach(function (s) {
      box.appendChild(el('div', 'chip-sec', s[0]));
      s[1].forEach(function (c) {
        var d = el('button', 'chip ' + (c.kind === '核心' ? 'core' : 'extra') + (S.covFilter === c.name ? ' on' : ''), c.name);
        d.onclick = function () { S.covFilter = S.covFilter === c.name ? null : c.name; renderCovFilter(); renderPool(); };
        box.appendChild(d);
      });
    });
  }

  function renderTree() {
    var box = $('tree'); if (!box) return;
    box.innerHTML = '';
    if (!S.field.length) { box.innerHTML = '<div class="empty-tip">还没有干员：先配几个人，这里会画出一棵「第几步点亮了什么」的树</div>'; return; }
    var W = Math.max(560, box.clientWidth - 36), H = Math.max(360, box.clientHeight - 24);
    var n = S.field.length;
    var stepX = n > 1 ? (W - 140) / (n - 1) : 0;
    var spineY = Math.round(H * 0.62);
    var svg = [];
    var litTags = [];
    var prevLevels = {};
    var lanes = 0;
    for (var i = 0; i < n; i++) {
      var st = core.compute({ field: S.field.slice(0, i + 1), bench: S.bench, elite: Object.keys(S.elite).filter(function (k) { return S.elite[k]; }), pivots: S.pivots, bans: S.bans });
      Object.keys(st.tiers).forEach(function (cov) {
        var lv = st.tiers[cov].level, pv = prevLevels[cov] || 0;
        if (lv > pv) {
          litTags.push({ cov: cov, level: lv, step: i });
          prevLevels[cov] = lv;
          lanes = Math.max(lanes, litTags.filter(function (t) { return t.step === i; }).length);
        }
      });
    }
    // 每个干员的 x
    var xs = S.field.map(function (_, i) { return 90 + i * stepX; });
    // 盟约标签：按首次点亮步归位，纵向错开
    var usedY = {};
    litTags.forEach(function (t) {
      var baseY = spineY - 150;
      var k = 0;
      while (usedY[t.step + ':' + k]) k++;
      usedY[t.step + ':' + k] = 1;
      t.x = xs[t.step];
      t.y = baseY - k * 40;
    });
    litTags.forEach(function (t) {
      svg.push('<path d="M' + t.x + ' ' + (spineY - 34) + ' L' + t.x + ' ' + (t.y + 16) + '" stroke="' + COLORS[t.cov] + '" stroke-width="1.2" fill="none" opacity="0.55"/>');
      var thr = core.covByName[t.cov].tiers[t.level - 1].at;
      svg.push('<g><rect x="' + (t.x - 46) + '" y="' + t.y + '" width="92" height="26" rx="13" fill="#111a22" stroke="' + COLORS[t.cov] + '" stroke-width="1.1"/>' +
        '<text x="' + t.x + '" y="' + (t.y + 17) + '" text-anchor="middle" fill="' + COLORS[t.cov] + '" font-size="11.5">' + t.cov + ' ' + thr + '人</text></g>');
    });
    // 主轴
    if (n > 1) svg.push('<line x1="' + xs[0] + '" y1="' + spineY + '" x2="' + xs[n - 1] + '" y2="' + spineY + '" stroke="#2b3946" stroke-width="2"/>');
    // 干员节点（含头像裁切）
    var defs = [];
    S.field.forEach(function (name, i) {
      var x = xs[i], op = core.opByName[name];
      var col = TIER_COLORS[(op.tierNum || 1) - 1];
      if (AVA[name]) {
        defs.push('<clipPath id="tc' + i + '"><circle cx="' + x + '" cy="' + spineY + '" r="25"/></clipPath>');
        svg.push('<image href="' + AVA[name] + '" x="' + (x - 25) + '" y="' + (spineY - 25) + '" width="50" height="50" preserveAspectRatio="xMidYMid slice" clip-path="url(#tc' + i + ')"/>');
      }
      svg.push('<circle cx="' + x + '" cy="' + spineY + '" r="27" fill="' + (AVA[name] ? 'none' : '#0d141b') + '" stroke="' + col + '" stroke-width="2.5"/>');
      if (!AVA[name]) svg.push('<text x="' + x + '" y="' + (spineY + 6) + '" text-anchor="middle" fill="#dfe7ef" font-size="16" font-weight="700">' + (name || '?')[0] + '</text>');
      svg.push('<text x="' + x + '" y="' + (spineY + 47) + '" text-anchor="middle" fill="#aebcc9" font-size="11">' + name + '</text>');
      svg.push('<text x="' + x + '" y="' + (spineY - 34) + '" text-anchor="middle" fill="#5d6b7a" font-size="10">' + (i + 1) + '</text>');
    });
    // 未点亮提示
    var pending = core.covenants.filter(function (c) { return (ST.counts[c.name] || 0) > 0 && !ST.tiers[c.name].active; });
    var py = H - 42;
    if (pending.length && S.settings.treePending) {
      svg.push('<text x="14" y="' + (py - 10) + '" fill="#6f7d8c" font-size="11">有成员但未点亮：</text>');
      pending.forEach(function (c, k) {
        var x = 110 + k * 96;
        svg.push('<rect x="' + x + '" y="' + (py - 22) + '" width="88" height="24" rx="12" fill="#101820" stroke="#33404e"/>');
        svg.push('<text x="' + (x + 44) + '" y="' + (py - 6) + '" text-anchor="middle" fill="#7f8d9b" font-size="11">' + c.name + ' ' + (ST.counts[c.name]) + '/' + (ST.tiers[c.name].nextAt == null ? ST.tiers[c.name].at : ST.tiers[c.name].nextAt) + '</text>');
      });
    }
    box.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="100%" preserveAspectRatio="xMidYMid meet"><defs>' + defs.join('') + '</defs>' + svg.join('') + '</svg>';
  }

  function renderMatrix() {
    var box = $('matrix'); box.innerHTML = '';
    if (!S.field.length) { box.innerHTML = '<div class="empty-tip">还没有干员</div>'; return; }
    var table = el('table');
    var thead = el('thead'), tr = el('tr');
    tr.appendChild(el('th', null, '干员 / 盟约'));
    var cols = core.covenants.filter(function (c) { return (ST.counts[c.name] || 0) > 0; });
    if (!cols.length) { box.innerHTML = '<div class="empty-tip">当前配队还没有产生任何盟约人数</div>'; return; }
    cols.forEach(function (c) { tr.appendChild(el('th', 'rot', c.name)); });
    thead.appendChild(tr); table.appendChild(thead);
    var tbody = el('tbody');
    S.field.forEach(function (name) {
      var r = el('tr');
      var td0 = el('td', 'rowname', name); td0.style.width = '64px';
      r.appendChild(td0);
      cols.forEach(function (c) {
        var cell = el('td');
        cell.style.setProperty('--c', COLORS[c.name]);
        if (!ST.tiers[c.name].active) cell.classList.add('mute');
        if (core.opByName[name].covs.indexOf(c.name) >= 0) cell.className += ' hit';
        if (ST.tiers[c.name].active) cell.classList.add('lit');
        r.appendChild(cell);
      });
      tbody.appendChild(r);
    });
    table.appendChild(tbody); box.appendChild(table);
  }

  var graph = new GraphView.Graph($('graph'));
  graph.setData(core);
  function hlCovs(covs, on) {
    covs.forEach(function (c) {
      var card = document.querySelector('.cov[data-cov="' + c + '"]');
      if (card) card.classList.toggle('hl', on);
      var node = graph.nodes.find(function (n) { return n.type === 'cov' && n.name === c; });
      if (node) node.hl = on;
    });
    graph.draw();
  }

  function highlightCov(name) {
    graph.hover = name ? (graph.nodes.find(function (n) { return n.type === 'cov' && n.name === name; }) || null) : null;
    graph.draw();
  }

  var drag = null;
  function startDrag(e, name, from, index) {
    if (e.button === 2) return;
    e.preventDefault();
    drag = { name: name, from: from, index: index == null ? -1 : index, moved: false, ghost: null };
    var g = el('div', 'drag-ghost', name);
    g.style.left = e.clientX + 'px'; g.style.top = e.clientY + 'px';
    document.body.appendChild(g);
    drag.ghost = g;
    document.addEventListener('pointermove', onDragMove);
    document.addEventListener('pointerup', onDragUp, { once: true });
  }
  function onDragMove(e) {
    if (!drag) return;
    if (!drag.moved) document.body.classList.add('dragging');
    drag.moved = true;
    drag.ghost.style.left = e.clientX + 'px'; drag.ghost.style.top = e.clientY + 'px';
    document.querySelectorAll('.drag-over').forEach(function (n) { n.classList.remove('drag-over'); });
    var t = dropTarget(e.clientX, e.clientY);
    if (t) t.classList.add('drag-over');
    var tr = $('trash'); if (tr) tr.classList.toggle('hot', !!(t && t.id === 'trash'));
  }
  function dropTarget(x, y) {
    var els = document.elementsFromPoint(x, y);
    for (var i = 0; i < els.length; i++) {
      var n = els[i];
      if (n.id === 'trash') return n;
      if (n.classList && (n.classList.contains('slot') || n.classList.contains('bench'))) return n;
    }
    return null;
  }
  function onDragUp(e) {
    document.removeEventListener('pointermove', onDragMove);
    if (!drag) return;
    var t = dropTarget(e.clientX, e.clientY);
    document.body.classList.remove('dragging');
    if (drag.ghost) drag.ghost.remove();
    document.querySelectorAll('.slot.drag-over,.bench.drag-over').forEach(function (n) { n.classList.remove('drag-over'); });
    var d = drag; drag = null;
    if (!d.moved) return;
    window.__suppressClick = true;
    setTimeout(function () { window.__suppressClick = false; }, 60);
    if (!t) return;
    if (t.id === 'trash') { pushUndo(); removeAny(d); renderAll(); toast('已移除 ' + d.name); return; }
    if (t.classList.contains('bench')) { pushUndo(); toBench(d); renderAll(); return; }
    var idx = parseInt(t.dataset.slot, 10);
    pushUndo();
    toSlot(d, idx);
    renderAll();
  }

  function removeAny(d) {
    if (d.from === 'slot') {
      if (S.locked[d.name]) { toast('已锁定：先解锁再移除'); return; }
      S.field = S.field.filter(function (n) { return n !== d.name; });
      delete S.elite[d.name]; delete S.pivots[d.name];
    } else if (d.from === 'bench') {
      var i = d.index >= 0 ? d.index : S.bench.indexOf(d.name);
      if (i >= 0) S.bench.splice(i, 1);
    }
  }

  function toBench(d) {
    if (d.from === 'bench') return;
    if (d.from === 'slot') {
      if (S.locked[d.name]) { toast('已锁定：先解锁再放入整备区'); return; }
      S.field = S.field.filter(function (n) { return n !== d.name; });
    }
    S.bench.push(d.name);
  }

  function toSlot(d, idx) {
    var target = S.field[idx];
    if (d.from === 'slot') {
      var src = S.field.indexOf(d.name);
      if (src < 0 || src === idx) return;
      S.field.splice(src, 1);
      var ni = idx > src ? idx - 1 : idx;
      S.field.splice(Math.min(ni, S.field.length), 0, d.name);
      return;
    }
    if (d.from === 'bench') {
      var bi = d.index >= 0 ? d.index : S.bench.indexOf(d.name);
      if (bi >= 0) S.bench.splice(bi, 1);
      if (target && d.name !== target) S.bench.push(target);
      S.field[idx] = d.name;
      return;
    }
    if (S.field.indexOf(d.name) >= 0) return;
    S.field[idx] = d.name;
    S.field = S.field.slice(0, S.maxSlots);
  }

  function wantsBench(name) {
    if (!S.autoBench.on) return false;
    var op = core.opByName[name]; if (!op) return false;
    return op.covs.some(function (c) { return S.autoBench.covs.indexOf(c) >= 0; });
  }

  function addOp(name) {
    if (S.field.indexOf(name) >= 0) { removeFromField(name); return; }
    if (wantsBench(name)) { pushUndo(); S.bench.push(name); renderAll(); toast(name + ' 已放入整备区'); return; }
    if (S.field.length >= S.maxSlots) { toast('场上已满（' + S.maxSlots + ' 人），可先放进整备区'); return; }
    pushUndo(); S.field.push(name); renderAll();
  }
  function placeAt(name, idx) {
    var cur = S.field.indexOf(name);
    if (cur >= 0) S.field.splice(cur, 1);
    S.field = S.field.filter(function (n) { return n !== name; });
    S.field.splice(Math.min(idx, S.field.length), 0, name);
    S.field = S.field.slice(0, S.maxSlots);
  }
  function swapSlot(name, idx) {
    var from = S.field.indexOf(name);
    if (from < 0 || from === idx) return;
    var other = S.field[idx];
    if (other) { S.field[from] = other; S.field[idx] = name; }
    else { S.field.splice(from, 1); S.field.splice(Math.min(idx, S.field.length), 0, name); }
  }
  function removeFromField(name) {
    if (S.locked[name]) { toast('已锁定：先右键解锁再移除'); return; }
    pushUndo();
    S.field = S.field.filter(function (n) { return n !== name; });
    delete S.elite[name]; delete S.pivots[name];
    renderAll();
  }
  function addToBench(name) {
    if (S.locked[name] && S.field.indexOf(name) >= 0) { toast('已锁定：先解锁再放入整备区'); return; }
    if (S.bench.indexOf(name) >= 0) return;
    S.field = S.field.filter(function (n) { return n !== name; });
    S.bench.push(name);
  }

  var detailTimer = null;
  function scheduleDetail(name) { clearTimeout(detailTimer); detailTimer = setTimeout(function () { showDetail(name); }, 150); }
  function cancelDetail() { clearTimeout(detailTimer); }
  function hideDetail() { $('detail').classList.remove('show'); }

  function showDetail(name) {
    var op = core.opByName[name]; if (!op) return;
    var d = $('detail'); d.classList.add('show');
    var isElite = !!S.elite[name];
    var html = '<h3>' + name + ' <span style="font-size:11px;color:#8a97a6">' + op.tier + '阶 · ' + (op.traitType || '') + '</span></h3>';
    html += '<div class="k">盟约</div><div class="t">' + op.covs.map(function (c) { return '<b style="color:' + COLORS[c] + '">' + c + '</b>'; }).join(' · ') + '</div>';
    html += '<div class="k">特质（' + (isElite ? '精锐' : '初始') + '）</div><div class="t">' + (isElite ? op.trait2 : op.trait1) + '</div>';
    if (isElite && op.trait1) html += '<div class="k">初始档</div><div class="t" style="opacity:.55">' + op.trait1 + '</div>';
    html += '<div class="k">快捷操作</div><div class="d-actions"></div>';
    d.innerHTML = html;
    var sel = document.createElement('select');
    sel.className = 'pivotSel';
    var o0 = document.createElement('option');
    o0.value = ''; o0.textContent = '变形同构体：无';
    sel.appendChild(o0);
    core.covenants.forEach(function (c) {
      var o = document.createElement('option');
      o.value = c.name; o.textContent = '变形同构体 → ' + c.name;
      if (S.pivots[name] === c.name) o.selected = true;
      sel.appendChild(o);
    });
    sel.onchange = function () {
      pushUndo();
      if (this.value) S.pivots[name] = this.value; else delete S.pivots[name];
      if (this.value) toast(name + ' 视为【' + this.value + '】成员');
      renderAll();
    };
    d.appendChild(sel);
    var acts = d.querySelector('.d-actions');
    if (acts) {
      var bElite = el('button', 'btn' + (S.elite[name] ? ' on' : ''), S.elite[name] ? '精锐 ✓' : '切精锐');
      bElite.onclick = function () { pushUndo(); S.elite[name] = !S.elite[name]; renderAll(); showDetail(name); };
      var bLock = el('button', 'btn' + (S.locked[name] ? ' on' : ''), S.locked[name] ? '已锁定' : '锁定');
      bLock.onclick = function () { S.locked[name] = !S.locked[name]; renderAll(); showDetail(name); };
      var onField = S.field.indexOf(name) >= 0, onBench = S.bench.indexOf(name) >= 0;
      var bDel = el('button', 'btn', onField ? '移出配队' : onBench ? '移出整备区' : '加入场上');
      bDel.onclick = function () {
        if (onField) { removeFromField(name); hideDetail(); return; }
        if (onBench) { pushUndo(); S.bench.splice(S.bench.indexOf(name), 1); renderAll(); hideDetail(); return; }
        pushUndo(); if (S.field.length < S.maxSlots) S.field.push(name); else { S.bench.push(name); toast('场上已满，已放入整备区'); } renderAll(); showDetail(name);
      };
      [bElite, bLock, bDel].forEach(function (b) { acts.appendChild(b); });
      if (!onField && !onBench) {
        var bBench = el('button', 'btn', '加入整备区');
        bBench.onclick = function () { pushUndo(); S.bench.push(name); renderAll(); showDetail(name); };
        acts.appendChild(bBench);
      }
    }
  }

  function renderTierFilter() {
    var box = $('tierFilter');
    if (!box) return;
    box.innerHTML = '';
    [0, 1, 2, 3, 4, 5, 6].forEach(function (t) {
      var b = el('button', 'chip tier' + (S.tierFilter === t ? ' on' : ''), t ? core.TIER_NAMES[t - 1] : '全部');
      b.onclick = function () { S.tierFilter = t; renderTierFilter(); renderPool(); };
      box.appendChild(b);
    });
  }

  function renderAll() {
    ST = compute();
    renderHeader(); renderSlots(); renderBench(); renderPool(); renderCovenants(); renderMatrix(); renderTierFilter();
    var eh = $('emptyHint'); if (eh) eh.style.display = (S.view === 'graph' && !S.field.length) ? 'flex' : 'none';
    if (S.view === 'graph') graph.update(ST);
    if (S.view === 'tree') renderTree();
    save();
  }

  var KEY = 'garrison-sim-v1';
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ field: S.field, bench: S.bench, elite: S.elite, pivots: S.pivots, bans: S.bans, maxSlots: S.maxSlots, archive: S.archive, autoBench: S.autoBench, settings: S.settings })); } catch (e) {}
  }
  function load() {
    try {
      var raw = localStorage.getItem(KEY); if (!raw) return;
      var o = JSON.parse(raw);
      S.field = (o.field || []).filter(function (n) { return core.opByName[n]; });
      S.bench = (o.bench || []).filter(function (n) { return core.opByName[n]; });
      S.elite = o.elite || {}; S.pivots = o.pivots || {}; S.bans = o.bans || [];
      S.maxSlots = o.maxSlots === 9 ? 9 : 8; S.archive = !!o.archive;
      if (o.autoBench) S.autoBench = { on: !!o.autoBench.on, covs: o.autoBench.covs || [] };
      if (o.settings) {
        ['grav', 'charge', 'len'].forEach(function (k) { if (typeof o.settings[k] === 'number') S.settings[k] = o.settings[k]; });
        S.settings.standard = o.settings.standard !== false;
        S.settings.litOnly = !!o.settings.litOnly;
        S.settings.treePending = o.settings.treePending !== false;
      }
    } catch (e) {}
  }

  var solveTargets = {};
  function buildSolveTags() {
    var coreBox = $('tagCore'), extraBox = $('tagExtra');
    coreBox.innerHTML = ''; extraBox.innerHTML = '';
    core.covenants.forEach(function (c) {
      var box = c.kind === '核心' ? coreBox : extraBox;
      var btn = el('button', 'tag', c.name);
      btn.dataset.cov = c.name;
      btn.onclick = function () { cycleTarget(c, btn); };
      box.appendChild(btn);
    });
  }
  function syncTags() {
    document.querySelectorAll('.tag').forEach(function (t) {
      var cov = t.dataset.cov, at = solveTargets[cov], c = core.covByName[cov];
      var last = c.tiers[c.tiers.length - 1].at;
      t.className = 'tag' + (at ? (at === last ? ' lv2' : ' lv1') : '');
      t.textContent = cov + (at ? ' ' + at : '');
    });
  }
  // 一键配队流程：打开求解器时，若还没选目标，就按当前阵容已点亮的盟约与档位预填
  function prefillTargets() {
    if (Object.keys(solveTargets).length) return;
    var lit = core.covenants.filter(function (c) { return ST.tiers[c.name].active && !ST.tiers[c.name].banned; });
    lit.slice(0, 4).forEach(function (c) {
      var lv = ST.tiers[c.name].level;
      if (lv > 0) solveTargets[c.name] = c.tiers[Math.min(lv, c.tiers.length) - 1].at;
    });
  }
  function cycleTarget(c, btn) {
    var ats = c.tiers.map(function (t) { return t.at; });
    var cur = solveTargets[c.name] || 0;
    var idx = ats.indexOf(cur);
    var next = idx + 1 >= ats.length ? 0 : ats[idx + 1];
    if (next) solveTargets[c.name] = next; else delete solveTargets[c.name];
    syncTags();
    btn.className = 'tag' + (next ? (next === ats[ats.length - 1] ? ' lv2' : ' lv1') : '');
    btn.textContent = c.name + (next ? ' ' + next : '');
  }
  function runSolve() {
    var targets = Object.keys(solveTargets).map(function (k) { return { cov: k, at: solveTargets[k] }; });
    if (!targets.length) { toast('先选至少一个盟约档位'); return; }
    var maxSize = $('optArchive').checked ? 9 : 8;
    var pivotOn = $('optPivot').checked;
    var pivotBudget = pivotOn ? Math.max(0, Math.min(3, parseInt($('pivotCount').value, 10) || 0)) : 0;
    var locked = $('optLocked').checked ? S.field.slice() : [];
    if (locked.length > maxSize) { toast('场上人数超过上限'); return; }
    var strict = $('optStrict') ? $('optStrict').checked : false;
    var harmony = $('optHarmony') ? $('optHarmony').checked : true;
    var sortMode = $('optSort') ? $('optSort').value : 'cov';
    var t0 = performance.now();
    var r = Solver.solve(core, {
      targets: targets, maxSize: maxSize, bans: S.bans, locked: locked, pivotBudget: pivotBudget,
      elite: Object.keys(S.elite).filter(function (k) { return S.elite[k]; }),
      bench: S.bench, strict: strict, harmony: harmony, sortMode: sortMode
    });
    var ms = Math.round(performance.now() - t0);
    window.__LAST_SOLVE__ = r;
    $('solveStat').textContent = '用时 ' + ms + 'ms · 搜索 ' + (r.searched || 0) + ' 名候选 · ' + r.solutions.length + ' 个方案（每种人数显示前 12 套）' + (strict ? ' · 严格模式' : '') + (harmony ? ' · 允许魔王' : ' · 不带魔王') + (sortMode === 'tier' ? ' · 等阶优先' : ' · 盟约优先') + (r.truncated ? ' · 已达上限' : '');
    var box = $('results'); box.innerHTML = '';
    if (!r.solutions.length) { box.innerHTML = '<div class="empty-tip">' + (r.note || '没有满足条件的配队，试试降低档位或取消 BAN') + '</div>'; return; }
    var perSize = {};
    var shown = r.solutions.filter(function (s) { perSize[s.size] = (perSize[s.size] || 0) + 1; return perSize[s.size] <= 12; });
    shown.forEach(function (sol) {
      var d = el('div', 'res');
      var top = el('div', 'top');
      top.appendChild(el('span', 'size', sol.size + ' 人'));
      top.appendChild(el('span', 'stat', '总等阶 ' + (sol.totalTier || 0)));
      top.appendChild(el('span', 'stat', '激活 ' + (sol.litCount || 0) + ' 盟约'));
      top.appendChild(el('span', 'stat', '点亮 ' + sol.tierCount + ' 档'));
      if (sol.extraTiers > 0) top.appendChild(el('span', 'stat', '额外 ' + sol.extraTiers + ' 档'));
      if (sol.totalRate) top.appendChild(el('span', 'stat', '每回合 +' + sol.totalRate + ' 层'));
      var piv = Object.keys(sol.pivots || {}).length;
      if (piv) top.appendChild(el('span', 'stat', '变形同构体 ' + piv));
      if (sol.elite && sol.elite.length) top.appendChild(el('span', 'stat', '精锐 ' + sol.elite.length));
      if (sol.bench && sol.bench.length) top.appendChild(el('span', 'stat', '整备区 ' + sol.bench.length + ' 人'));
      var load = el('button', 'btn', '载入'); load.style.marginLeft = 'auto';
      load.onclick = function () { applyTeam(sol); };
      top.appendChild(load);
      var main = el('div', 'resmain');
      main.appendChild(top);
      var team = el('div', 'team');
      teamByTier(sol.team).forEach(function (n) {
        var m = el('div', 'mini');
        var dot = el('span', 'd'); dot.style.background = TIER_COLORS[(core.opByName[n].tierNum || 1) - 1];
        m.appendChild(dot); m.appendChild(document.createTextNode(n));
        if (sol.pivots && sol.pivots[n]) { var p = el('span', null, '⚙'); p.style.color = '#e6c27a'; m.appendChild(p); }
        team.appendChild(m);
      });
      main.appendChild(team);
      d.appendChild(main);
      d.appendChild(covIconRow(sol));
      box.appendChild(d);
    });
    $('solveInfo').textContent = r.note || '';
  }
  function litCovs(sol) {
    var arr = [];
    core.covenants.forEach(function (c) {
      var t = sol.state && sol.state.tiers[c.name];
      if (t && t.active) arr.push({ name: c.name, level: t.level });
    });
    arr.sort(function (a, b) { return b.level - a.level || a.name.localeCompare(b.name, 'zh'); });
    return arr;
  }
  function covIconRow(sol) {
    var row = el('div', 'covs');
    litCovs(sol).forEach(function (x) {
      var w = el('span', 'covic');
      w.title = x.name + ' · ' + x.level + ' 档';
      if (DATA.icons && DATA.icons[x.name]) { var im = el('img'); im.src = DATA.icons[x.name]; im.alt = x.name; w.appendChild(im); }
      else w.appendChild(document.createTextNode(x.name));
      var b = el('b', null, String(x.level)); w.appendChild(b);
      row.appendChild(w);
    });
    return row;
  }
  function applyTeam(sol) {
    pushUndo();
    S.field = teamByTier(sol.team).slice(0, S.maxSlots);
    S.pivots = {};
    Object.keys(sol.pivots || {}).forEach(function (n) { S.pivots[n] = sol.pivots[n]; });
    S.elite = {};
    (sol.elite || []).forEach(function (n) { S.elite[n] = 1; });
    if (sol.bench) S.bench = sol.bench.slice();
    renderAll();
    $('solverOverlay').classList.remove('show');
    toast('已载入 ' + sol.size + ' 人配队');
  }

  var WIZ = { step: 1, targets: {}, results: [] };

  // 设置页示意小图：直接复用正式图谱的 Graph 实现，参数与主图共享
  var prevGraph = null;
  function mountPreview(box) {
    var cv = document.createElement('canvas');
    cv.className = 'opt-preview';
    box.appendChild(cv);
    var g = null;
    try {
      g = new GraphView.Graph(cv);
      g.setPreview({
        covs: ['乌萨斯', '精准', '聚合'],
        ops: ['折桠', '烈夏', '真理', '乌啾', '灰喉', '迷迭香'],
        links: [['折桠', '乌萨斯'], ['烈夏', '乌萨斯'], ['真理', '乌萨斯'],
                ['乌啾', '乌萨斯'], ['乌啾', '聚合'], ['灰喉', '精准'], ['迷迭香', '精准']]
      }, S.settings);
      // 弹层刚插入时 canvas 还没完成布局，等下一帧再按实际尺寸重排一次
      prevGraph = g;
      var fit = function () { if (!g) return; g.resize(); g.setParams(S.settings); };
      requestAnimationFrame(fit);
      if (window.ResizeObserver) new ResizeObserver(fit).observe(cv);
    } catch (e) { console.error('preview', e); }
  }

  function openOptions() {
    $('optOverlay').classList.add('show');
    buildOptions();
  }
  function applyGraphSettings() {
    if (graph && graph.setParams) graph.setParams(S.settings);
    if (prevGraph) prevGraph.setParams(S.settings);
  }

  function oRow(labelText, checked, onChange, hint) {
    var row = el('div', 'opt-row');
    var lab = el('label');
    var cb = document.createElement('input');
    cb.type = 'checkbox'; cb.checked = !!checked;
    cb.onchange = function () { onChange(this.checked); };
    lab.appendChild(cb); lab.appendChild(document.createTextNode(labelText));
    row.appendChild(lab);
    if (hint) row.appendChild(el('span', 'hint', hint));
    return row;
  }

  function oSlider(name, key, min, max, step, desc) {
    var row = el('div', 'opt-slider');
    row.appendChild(el('span', null, name));
    var inp = document.createElement('input');
    inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step; inp.value = S.settings[key];
    var val = el('span', 'val', (+S.settings[key]).toFixed(1));
    inp.oninput = function () {
      S.settings[key] = parseFloat(this.value);
      val.textContent = (+this.value).toFixed(1);
      applyGraphSettings(); save();
    };
    row.appendChild(inp); row.appendChild(val);
    row.appendChild(el('div', 'desc', desc));
    return row;
  }

  function buildOptions() {
    var b = $('optBody'); if (!b) return;
    b.innerHTML = '';
    var s1 = el('div', 'opt-sec');
    s1.appendChild(el('h4', null, '配队区'));
    s1.appendChild(oRow('人事部档案（场上上限 9）', S.maxSlots === 9, function (v) {
      S.archive = v; S.maxSlots = v ? 9 : 8;
      if (S.field.length > S.maxSlots) S.field = S.field.slice(0, S.maxSlots);
      renderAll();
    }, '需要「人事部档案」道具时开启'));
    b.appendChild(s1);

    var s2 = el('div', 'opt-sec');
    s2.appendChild(el('h4', null, '干员栏'));
    s2.appendChild(oRow('自动整备', S.autoBench.on, function (v) { S.autoBench.on = v; save(); }, '勾选下列盟约后，带该盟约的干员被加入时直接进整备区'));
    var checks = el('div', 'opt-checks');
    ['远见', '奇迹', '投资人', '助力'].forEach(function (c) {
      var lab = el('label');
      var cb = document.createElement('input');
      cb.type = 'checkbox'; cb.checked = S.autoBench.covs.indexOf(c) >= 0;
      cb.onchange = function () {
        var i = S.autoBench.covs.indexOf(c);
        if (this.checked && i < 0) S.autoBench.covs.push(c);
        if (!this.checked && i >= 0) S.autoBench.covs.splice(i, 1);
        save();
      };
      lab.appendChild(cb); lab.appendChild(document.createTextNode(c));
      checks.appendChild(lab);
    });
    s2.appendChild(checks);
    b.appendChild(s2);

    var s3 = el('div', 'opt-sec');
    s3.appendChild(el('h4', null, '盟约栏'));
    s3.appendChild(oRow('只显示已点亮的盟约', S.settings.litOnly, function (v) { S.settings.litOnly = v; save(); renderCovenants(); }, '关闭时，有成员但未点亮的盟约也会灰化显示'));
    b.appendChild(s3);

    var s4 = el('div', 'opt-sec');
    s4.appendChild(el('h4', null, '配队树'));
    s4.appendChild(oRow('显示「有成员但未点亮」的盟约', S.settings.treePending, function (v) { S.settings.treePending = v; save(); renderTree(); }));
    b.appendChild(s4);

    var s5 = el('div', 'opt-sec');
    s5.appendChild(el('h4', null, '关系图谱'));
    s5.appendChild(oRow('使用标准结构布局', S.settings.standard, function (v) {
      S.settings.standard = v; applyGraphSettings(); save();
    }, '开：初始按环形锚点铺开，整体更规整；关：随机铺开，让节点自己长成最终的形状'));
    s5.appendChild(oSlider('引力', 'grav', 0.2, 3, 0.1, '向心力：把整个图谱的质心拉回画布中心的强度。太小会漂出视野，太大则全挤向中间。'));
    s5.appendChild(oSlider('斥力', 'charge', 0, 2, 0.1, '节点之间互相推开的强度。越大越分散、间距越大。'));
    s5.appendChild(oSlider('边长', 'len', 0.4, 2.2, 0.1, '干员与盟约之间连线的理想长度。越大连线越长、图越舒展。'));
    s5.appendChild(el('div', 'opt-preview-note', '下面是用同一套受力规则的示意小图，拖动滑杆可实时看到变化（3 个大节点 + 6 个小节点）：'));
    mountPreview(s5);
    b.appendChild(s5);
  }

  function openWizard() { WIZ.step = 1; WIZ.targets = {}; WIZ.results = []; renderWizard(); $('wizardOverlay').classList.add('show'); }

  function wizCard(c) {
    var ats = c.tiers.map(function (t) { return t.at; });
    var cur = WIZ.targets[c.name] || 0;
    var d = el('div', 'wcard' + (cur ? ' on' : ''));
    if (DATA.icons && DATA.icons[c.name]) { var im = el('img'); im.src = DATA.icons[c.name]; d.appendChild(im); }
    var box = el('div');
    box.appendChild(el('div', 'nm', c.name));
    box.appendChild(el('div', 'ts', ats.join(' / ') + ' 人激活'));
    d.appendChild(box);
    d.appendChild(el('span', 'lv', cur ? cur + ' 档' : ''));
    d.onclick = function () {
      var idx = ats.indexOf(cur);
      var next = idx + 1 >= ats.length ? 0 : ats[idx + 1];
      if (next) WIZ.targets[c.name] = next; else delete WIZ.targets[c.name];
      renderWizard();
    };
    return d;
  }

  function renderWizard() {
    $('wizStep').textContent = '第 ' + WIZ.step + ' 步 / 共 3 步';
    $('wizPrev').style.visibility = WIZ.step === 1 ? 'hidden' : 'visible';
    $('wizNext').textContent = WIZ.step === 3 ? '重新计算' : '下一步';
    var b = $('wizBody'); b.innerHTML = '';
    if (WIZ.step < 3) {
      var kind = WIZ.step === 1 ? '核心' : '附加';
      b.appendChild(el('div', 'wsec', WIZ.step === 1 ? '第 1 步：选择你想玩的核心盟约体系（点一次 = 3 档，再点 = 6 档，第三次取消）' : '第 2 步：选择想点亮的附加盟约（可跳过）'));
      var grid = el('div', 'wgrid');
      core.covenants.filter(function (c) { return c.kind === kind; }).forEach(function (c) { grid.appendChild(wizCard(c)); });
      b.appendChild(grid);
      $('wizTip').textContent = WIZ.step === 1 ? '已选 ' + Object.keys(WIZ.targets).length + ' 条' : '已选 ' + Object.keys(WIZ.targets).length + ' 条，下一步出方案';
    } else {
      var targets = Object.keys(WIZ.targets).map(function (k) { return { cov: k, at: WIZ.targets[k] }; });
      if (!targets.length) { b.appendChild(el('div', 'empty-tip', '还没有选任何盟约，先返回上一步选目标')); $('wizTip').textContent = ''; return; }
      if (!WIZ.results.length) {
        var r = Solver.solve(core, { targets: targets, maxSize: S.maxSlots, bans: S.bans, pivotBudget: 0 });
        WIZ.results = r.solutions.slice(0, 10);
        WIZ.note = r.note;
      }
      if (!WIZ.results.length) { b.appendChild(el('div', 'empty-tip', WIZ.note || '没有满足条件的配队，试试降低档位或减少目标')); $('wizTip').textContent = ''; return; }
      b.appendChild(el('div', 'wsec', '第 3 步：这些配队能满足你的目标，按人数从少到多'));
      WIZ.results.forEach(function (sol) {
        var d = el('div', 'wres');
        var top = el('div', 'top');
        top.appendChild(el('span', null, '<b style="color:var(--gold)">' + sol.size + ' 人</b>'));
        top.appendChild(el('span', null, '点亮 ' + sol.tierCount + ' 档'));
        if (sol.totalTier) top.appendChild(el('span', null, '总等阶 ' + sol.totalTier));
        if (sol.totalRate) top.appendChild(el('span', null, '每回合 +' + sol.totalRate + ' 层'));
        var load = el('button', 'btn', '载入');
        load.style.marginLeft = 'auto';
        load.onclick = function () {
          pushUndo();
          S.field = teamByTier(sol.team).slice(0, S.maxSlots);
          S.pivots = {};
          Object.keys(sol.pivots || {}).forEach(function (n) { S.pivots[n] = sol.pivots[n]; });
          renderAll();
          $('wizardOverlay').classList.remove('show');
          toast('已载入 ' + sol.size + ' 人配队');
        };
        top.appendChild(load);
        d.appendChild(top);
        var team = el('div', 'team');
        teamByTier(sol.team).forEach(function (n) {
          var m = el('div', 'mini');
          var dot = el('span', 'd'); dot.style.background = TIER_COLORS[(core.opByName[n].tierNum || 1) - 1]; m.appendChild(dot);
          m.appendChild(document.createTextNode(n));
          team.appendChild(m);
        });
        d.appendChild(team);
        b.appendChild(d);
      });
      $('wizTip').textContent = '共 ' + WIZ.results.length + ' 套方案';
    }
  }

  var HELP = [
    '<h4>配队操作</h4>',
    '<ul>',
    '<li><b>双击</b>左侧候选干员：加入场上（场上有则移回候选）。</li>',
    '<li><b>双击</b>场上或整备区的干员：移除。</li>',
    '<li><b>单击</b>任意干员：打开详情（延迟 260ms，所以不会和双击冲突），详情里可设置变形同构体、切精锐、锁定。</li>',
    '<li><b>拖拽</b>：候选池 / 场上 / 整备区之间互相移动；拖到已占用的格子即替换。</li>',
    '<li>拖动时顶部会出现<b>红色删除区</b>，拖进去即移除。</li>',
    '<li><b>Shift + 单击</b>：切换初始 / 精锐（精锐用第二档特质，影响层数增速与绝技计数）。</li>',
    '<li><b>右键</b>场上干员或候选卡：锁定 / 解锁（求解时保留）。</li>',
    '<li><b>Delete</b>：移除上次点选的干员；<b>Ctrl/⌘ + Z</b> 或顶栏 ↶：撤销。</li>',
    '<li>拖到<b>整备区</b>：放入替补席，不占场上人数，但会计入远见 / 奇迹 / 投资人。</li>',
    '<li>顶栏<b>人事部档案</b>：场上上限 8 → 9。</li>',
    '<li>顶栏<b>选项</b>：自动整备（远见/奇迹/投资人/助力 直接进整备区）、场上人数、盟约栏过滤、配队树开关、图谱的引力/斥力/边长与标准结构布局，都集中在这里。</li>',
    '</ul>',
    '<h4>盟约规则</h4>',
    '<ul>',
    '<li><b>双档激活</b>：核心盟约 3 人 / 6 人两档；附加盟约 2/3、2/5、3、2、1 不等。</li>',
    '<li><b>层数</b>：效果常写成「+23% + 0.9×层数」。本工具只计算「每回合增速」与「单次收益」，不承诺绝对层数（取决于回合数、装备与策略）。</li>',
    '<li><b>调和</b>：激活时使所有核心盟约激活人数 +1。</li>',
    '<li><b>独行</b>：只有恰好 1 名独行干员时生效。</li>',
    '<li><b>绝技</b>：统计的是精锐状态的干员数，不是绝技成员数。</li>',
    '<li><b>远见 / 奇迹 / 投资人</b>：整备区的成员也计入。</li>',
    '<li><b>协防干员</b>：阵营被禁（BAN）时的兜底盟约。</li>',
    '<li><b>卡西米尔 6 档</b>：依赖整备区最右侧的卡西米尔干员。</li>',
    '</ul>',
    '<h4>求解器</h4>',
    '<ul>',
    '<li>核心盟约点一次 = 3 档，再点 = 6 档，第三次取消；附加盟约同理循环。</li>',
    '<li>结果按<b>人数升序</b>排列，同人数按附带点亮档位、层数增速排序；每种人数最多显示 12 套。</li>',
    '<li>可勾选<b>人事部档案</b>（9 人）、<b>使用变形同构体</b>并指定数量（N=0 时完全不计转职，搜索空间更小）。</li>',
    '<li><b>严格模式</b>：只允许点亮你勾选的目标盟约，且档位与目标完全一致（不多不少）；调和、独行等附带点亮也算「多」。</li>',
    '<li><b>队伍中允许魔王</b>：魔王是真实单位，占 1 个上场位，入队后调和生效（所有核心盟约 +1 人）。默认允许求解器把魔王编入队伍；取消勾选则完全不考虑调和。策略赠送的「盟约·辅助干员」不会出现在候选池。</li>',
    '<li><b>排序</b>：默认「激活盟约优先」，人数相同先比激活盟约数，再比总等阶、每回合叠层；「棋子等阶优先」则先比总等阶。两种口径各有取舍，可按自己的偏好切换。</li>',
    '<li>求解会补上规则：调和让核心盟约少 1 人、独行至多 1 人、绝技自动按精锐计算、远见/奇迹/投资人计入整备区、协防干员按被 BAN 阵营兜底。</li>',
    '<li>顶栏<b>本局禁用</b>：禁用的盟约不能作为目标，相关干员会降权。</li>',
    '</ul>',
    '<h4>变形同构体</h4>',
    '<ul>',
    '<li>装备「盟约特色道具 + 变形同构体」后，干员被视为某个盟约的成员。</li>',
    '<li>本工具建模为<b>额外计入</b>目标盟约（原生盟约保留），图上以金色虚线边表示。</li>',
    '<li>求解时只在「某盟约差 1 人」时尝试补位，并受数量上限约束。</li>',
    '</ul>',
    '<h4 id="helpNotice">版权与使用限制</h4>',
    '<ul>',
    '<li><b>非官方</b>：本工具由玩家制作，与上海鹰角网络科技有限公司及其关联公司无关，不代表官方立场，也不含任何自动化、外挂、破解或修改游戏客户端的功能。</li>',
    '<li><b>素材版权</b>：《明日方舟 / Arknights》的游戏数据、干员名称、立绘头像、技能与盟约文本版权归上海鹰角网络科技有限公司所有；本工具仅作非商业的学习交流展示。</li>',
    '<li><b>数据来源</b>：干员名单、盟约人数与效果文本整理自 PRTS（https://prts.wiki/，站点内容 CC BY-NC-SA 4.0），阈值与文案与 NGA 解包整理帖交叉校验；对 PRTS 内容的再整理（data/operators.json、data/covenants.json）同样以 CC BY-NC-SA 4.0 提供。</li>',
    '<li><b>不收费</b>：本工具不收费、不投放广告、不接收捐赠，也不通过任何形式变现。</li>',
    '<li><b>分享版与完整版</b>：公开传播的分享版不打包任何官方美术资源，头像由浏览器从第三方公开图源在线加载；完整版内联的头像与图标仅限个人自用，请勿公开传播或二次分发。</li>',
    '<li><b>下架承诺</b>：如权利人认为本工具或页面内容侵犯其权益，请通过发布页面联系作者；作者将在收到通知后立即移除相关内容并下架，不设置任何对抗性条件。</li>',
    '</ul>',
    '<div class="help-note">继续使用即表示你理解：本工具不提供任何官方授权，素材权利归原权利人所有。</div>'
  ].join('');

  function openHelp(scrollEnd) {
    $('helpBody').innerHTML = HELP;
    $('helpOverlay').classList.add('show');
    if (scrollEnd) setTimeout(function () { var b = $('helpBody'); if (b) b.scrollTop = b.scrollHeight; }, 40);
  }

  function bindEvents() {
    $('search').addEventListener('input', function (e) { S.search = e.target.value.trim(); renderPool(); });
    $('btnUndo').onclick = function () {
      var s = undoStack.pop(); if (!s) return;
      var o = JSON.parse(s); S.field = o.field; S.bench = o.bench; S.elite = o.elite; S.pivots = o.pivots; S.maxSlots = o.maxSlots;
      renderAll();
    };
    $('btnClear').onclick = function () { pushUndo(); S.field = []; S.bench = []; S.elite = {}; S.pivots = {}; renderAll(); };
    $('btnBan').onclick = function () { openBanDialog(); };
    $('btnSave').onclick = function () { save(); toast('已保存到本地'); };
    $('btnSolve').onclick = function () { prefillTargets(); syncTags(); $('solverOverlay').classList.add('show'); };
    $('closeSolver').onclick = function () { $('solverOverlay').classList.remove('show'); };
    $('runSolve').onclick = runSolve;
    $('optPivot').onchange = function () { $('pivotCount').disabled = !this.checked; };
    $('btnOptions').onclick = openOptions;
    $('closeOpt').onclick = function () {
      $('optOverlay').classList.remove('show');
      prevGraph = null;
    };
    $('btnWizard').onclick = openWizard;
    $('closeWizard').onclick = function () { $('wizardOverlay').classList.remove('show'); };
    $('wizPrev').onclick = function () { if (WIZ.step > 1) { WIZ.step--; if (WIZ.step < 3) WIZ.results = []; renderWizard(); } };
    $('wizNext').onclick = function () {
      if (WIZ.step < 3) { WIZ.step++; if (WIZ.step === 3) WIZ.results = []; renderWizard(); }
      else { WIZ.results = []; renderWizard(); }
    };
    $('btnHelp').onclick = function () { openHelp(false); };
    if ($('btnNotice')) $('btnNotice').onclick = function () { openHelp(true); };
    $('closeHelp').onclick = function () { $('helpOverlay').classList.remove('show'); };
    document.querySelectorAll('.fmode').forEach(function (b) {
      b.onclick = function () {
        S.filterMode = b.dataset.mode;
        document.querySelectorAll('.fmode').forEach(function (x) { x.classList.toggle('on', x === b); });
        $('tierFilter').style.display = S.filterMode === 'tier' ? 'flex' : 'none';
        $('covFilter').style.display = S.filterMode === 'cov' ? 'flex' : 'none';
        renderPool();
      };
    });
    $('btnShare').onclick = function () {
      var u = location.href.split('#')[0] + '#t=' + encodeURIComponent(S.field.join(',')) + (S.bench.length ? '&b=' + encodeURIComponent(S.bench.join(',')) : '');
      var done = function () { toast('配队码已复制到剪贴板'); };
      if (navigator.clipboard) navigator.clipboard.writeText(u).then(done, function () { prompt('复制这条链接：', u); });
      else prompt('复制这条链接：', u);
    };
    $('btnPng').onclick = function () {
      try {
        var a = document.createElement('a');
        a.download = '卫戍配队图谱.png';
        a.href = document.getElementById('graph').toDataURL('image/png');
        a.click(); toast('已导出图谱');
      } catch (e) { toast('导出失败'); }
    };
    document.querySelectorAll('.gtab').forEach(function (b) {
      b.onclick = function () {
        document.querySelectorAll('.gtab').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        S.view = b.dataset.view;
        $('graph').style.display = S.view === 'graph' ? 'block' : 'none';
        $('matrix').style.display = S.view === 'matrix' ? 'block' : 'none';
        $('tree').style.display = S.view === 'tree' ? 'block' : 'none';
        if (S.view === 'graph') { graph.resize(); graph.update(ST); }
        if (S.view === 'tree') renderTree();
      };
    });
    $('slots').addEventListener('click', function (e) {
      var slot = e.target.closest('.slot'); if (!slot) return;
      var idx = parseInt(slot.dataset.slot, 10);
      var name = S.field[idx]; if (!name) return;
      if (window.__suppressClick) return;
      if (e.shiftKey) { pushUndo(); S.elite[name] = !S.elite[name]; renderAll(); toast(S.elite[name] ? name + ' 转为精锐' : name + ' 回到初始'); return; }
      S.selected = { slot: idx, name: name };
      scheduleDetail(name);
    });
    $('slots').addEventListener('dblclick', function (e) {
      var slot = e.target.closest('.slot'); if (!slot) return;
      var name = S.field[parseInt(slot.dataset.slot, 10)]; if (!name) return;
      cancelDetail(); removeFromField(name); hideDetail();
    });
    $('bench').addEventListener('click', function (e) {
      var b = e.target.closest('.b-op'); if (!b) return;
      if (window.__suppressClick) return;
      scheduleDetail(b.dataset.name);
    });
    $('bench').addEventListener('dblclick', function (e) {
      var b = e.target.closest('.b-op'); if (!b) return;
      cancelDetail();
      var i = S.bench.indexOf(b.dataset.name);
      if (i >= 0) { pushUndo(); S.bench.splice(i, 1); renderAll(); }
      hideDetail();
    });
    document.addEventListener('click', function (e) {
      if (e.target.closest('#detail') || e.target.closest('.slot') || e.target.closest('.op') || e.target.closest('.b-op') || e.target.closest('#trash')) return;
      hideDetail();
    });
    $('slots').addEventListener('contextmenu', function (e) {
      var slot = e.target.closest('.slot'); if (!slot) return;
      e.preventDefault();
      var name = S.field[parseInt(slot.dataset.slot, 10)]; if (!name) return;
      S.locked[name] = !S.locked[name]; toast(S.locked[name] ? '锁定 ' + name : '取消锁定'); renderSlots();
    });
    $('slots').addEventListener('pointerdown', function (e) {
      var slot = e.target.closest('.slot'); if (!slot) return;
      var name = S.field[parseInt(slot.dataset.slot, 10)]; if (!name || e.button === 2) return;
      startDrag(e, name, 'slot', S.field.indexOf(name));
    });
    $('bench').addEventListener('pointerdown', function (e) {
      var b = e.target.closest('.b-op'); if (!b) return;
      startDrag(e, b.dataset.name, 'bench', S.bench.indexOf(b.dataset.name));
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (S.selected && S.selected.name) { removeFromField(S.selected.name); S.selected = null; }
      }
      if (e.key === 'Escape') { $('solverOverlay').classList.remove('show'); $('helpOverlay').classList.remove('show'); $('wizardOverlay').classList.remove('show'); hideDetail(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); var s = undoStack.pop(); if (s) { var o = JSON.parse(s); S.field = o.field; S.bench = o.bench; S.elite = o.elite; S.pivots = o.pivots; S.maxSlots = o.maxSlots; renderAll(); } }
    });
  }

  function openBanDialog() {
    var names = core.covenants.map(function (c) { return c.name; });
    var input = prompt('输入要禁用的盟约（顿号/逗号分隔，留空清除）：\n' + names.join('、'), S.bans.join('、'));
    if (input == null) return;
    S.bans = input.split(/[、,，\s]+/).filter(Boolean).filter(function (n) { return core.covByName[n]; });
    renderAll();
    toast(S.bans.length ? '已禁用 ' + S.bans.length + ' 条盟约' : '已清除禁用');
  }

  load();
  try {
    if (location.hash.indexOf('#demo') === 0) {
      var demoCov = (location.hash.match(/cov=([^&]+)/) || [])[1] || '乌萨斯';
      var demo = core.operators.filter(function (o) { return o.covs.indexOf(demoCov) >= 0; }).slice(0, 6);
      S.field = demo.map(function (o) { return o.name; });
      if (location.hash.indexOf('full=1') >= 0) {
        var picked = [], seenCombo = {};
        core.operators.forEach(function (o) {
          if (picked.length >= 8) return;
          var k = o.covs.join('|');
          if (seenCombo[k]) return;
          seenCombo[k] = 1; picked.push(o.name);
        });
        S.field = picked.slice(0, 8);
      }
      if (location.hash.indexOf('bench=1') >= 0) {
        var bdemo = core.operators.filter(function (o) { return o.covs.indexOf('远见') >= 0; }).slice(0, 2);
        S.bench = bdemo.map(function (o) { return o.name; });
      }
      if (location.hash.indexOf('solve=1') >= 0) {
        setTimeout(function () { $('solverOverlay').classList.add('show'); runSolve(); }, 60);
        solveTargets[demoCov] = 6;
        document.querySelectorAll('.tag').forEach(function (t) {
          if (t.dataset.cov === demoCov) { t.className = 'tag lv2'; t.textContent = demoCov + ' 6'; }
        });
      }
      if (location.hash.indexOf('wizard=1') >= 0) {
        setTimeout(function () {
          openWizard();
          if (location.hash.indexOf('step=2') >= 0) { WIZ.step = 2; renderWizard(); }
          if (location.hash.indexOf('step=3') >= 0) { WIZ.targets['乌萨斯'] = 6; WIZ.targets['精准'] = 2; WIZ.step = 3; WIZ.results = []; renderWizard(); }
        }, 120);
      }
      if (location.hash.indexOf('opt=1') >= 0) {
        setTimeout(openOptions, 120);
      }
      if (location.hash.indexOf('help=1') >= 0) {
        setTimeout(openHelp, 120);
      }
      if (location.hash.indexOf('mode=cov') >= 0) {
        setTimeout(function () { var b = document.querySelector('.fmode[data-mode="cov"]'); if (b) b.click(); }, 80);
      }
      if (location.hash.indexOf('detail=1') >= 0) {
        setTimeout(function () { var n = S.field[0]; if (n) { showDetail(n); } }, 80);
      }
      if (location.hash.indexOf('tree=1') >= 0) {
        setTimeout(function () { var t = document.querySelector('.gtab[data-view="tree"]'); if (t) t.click(); }, 70);
      }
      if (location.hash.indexOf('matrix=1') >= 0) {
        setTimeout(function () { document.querySelector('.gtab[data-view="matrix"]').click(); }, 60);
      }
    }
    if (location.hash.indexOf('#t=') === 0) {
      var q = decodeURIComponent(location.hash.slice(3)).split('&');
      var names = q[0].split(',').filter(Boolean).filter(function (n) { return core.opByName[n]; });
      document.body.setAttribute('data-hashdebug', names.length + '|' + names.join('|') + '|raw=' + q[0]);
      if (names.length) { S.field = names.slice(0, 9); S.maxSlots = S.field.length > 8 ? 9 : 8; }
      q.slice(1).forEach(function (part) {
        var kv = part.split('=');
        if (kv[0] === 'b') S.bench = kv[1].split(',').filter(function (n) { return core.opByName[n]; });
        if (kv[0] === 'e') kv[1].split(',').filter(Boolean).forEach(function (n) { S.elite[n] = true; });
        if (kv[0] === 'ban') S.bans = kv[1].split(',').filter(Boolean);
      });
    }
  } catch (e) {}
  buildOptions();
  if (graph && graph.setParams) graph.setParams(S.settings);
  buildSolveTags();
  syncTags();
  renderCovFilter();
  $('covFilter').style.display = 'none';
  bindEvents();
  var archiveBtn = el('button', 'btn ghost', '人事部档案 8');
  archiveBtn.onclick = function () {
    S.archive = !S.archive; S.maxSlots = S.archive ? 9 : 8;
    if (S.field.length > S.maxSlots) S.field = S.field.slice(0, S.maxSlots);
    archiveBtn.textContent = '人事部档案 ' + S.maxSlots;
    renderAll();
  };
  archiveBtn.textContent = '人事部档案 ' + (S.archive ? 9 : '8');
  archiveBtn.className = 'stat';
  archiveBtn.style.cursor = 'pointer';
  document.querySelector('header .stats').appendChild(archiveBtn);
  try { renderAll(); } catch (e) { window.__UI_ERROR__ = (e && e.stack) || String(e); }
  window.__APP__ = {
    S: S, core: core, renderAll: renderAll, graph: graph, solve: Solver.solve, compute: compute,
    getTargets: function () { return solveTargets; },
    getPreviewGraph: function () { return prevGraph; }
  };
})();
