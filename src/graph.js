/* 关系图谱：干员 ↔ 盟约 二部图（Canvas 力导向，可拖拽） */
(function (global) {
  'use strict';

  var DATA = global.__DATA__ || {};

  var TIER_COLORS = ['#7f8c99', '#6fa86f', '#4f9ad6', '#9b7fd4', '#e0a45e', '#e2746a'];
  var CORE_COLOR = '#e6c27a';
  var PALETTE = ['#63c6e8', '#a98cf0', '#5fd39a', '#e2605c', '#e0a45e', '#7ec8e3', '#c9a45c', '#8fd6a8', '#d98cc0'];

  var R_OP = 21, R_COV = 24;

  function Graph(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.nodes = []; this.links = [];
    this.hover = null; this.dragNode = null; this.dragging = false;
    this.zoom = 1; this.panX = 0; this.panY = 0; this.panning = null;
    this.alpha = 0;
    this.dpr = Math.max(1, Math.min(2, global.devicePixelRatio || 1));
    this.core = null; this.state = null;
    this.params = { grav: 1, charge: 1, len: 1, standard: true };
    var self = this;

    this._pos = function (e) {
      var r = canvas.getBoundingClientRect();
      var sx = self.w / (r.width || 1), sy = self.h / (r.height || 1);
      var mx = (e.clientX - r.left) * sx, my = (e.clientY - r.top) * sy;
      return { x: (mx - self.panX) / self.zoom, y: (my - self.panY) / self.zoom };
    };
    this._hit = function (p) {
      var best = null, bd = 1e9;
      self.nodes.forEach(function (n) {
        var d = (n.x - p.x) * (n.x - p.x) + (n.y - p.y) * (n.y - p.y);
        var rr = (n.r + 8) * (n.r + 8);
        if (d < rr && d < bd) { bd = d; best = n; }
      });
      return best;
    };

    canvas.addEventListener('pointermove', function (e) {
      var p = self._pos(e);
      if (self.panning) {
        var r0 = canvas.getBoundingClientRect();
        var sx0 = self.w / (r0.width || 1), sy0 = self.h / (r0.height || 1);
        self.panX = self.panning.px + (e.clientX - self.panning.x) * sx0;
        self.panY = self.panning.py + (e.clientY - self.panning.y) * sy0;
        self.draw();
        return;
      }
      if (self.dragNode) {
        self.dragNode.x = p.x; self.dragNode.y = p.y;
        self.dragNode.vx = 0; self.dragNode.vy = 0;
        self.alpha = Math.max(self.alpha, 0.45);
        self.start();
        return;
      }
      var best = self._hit(p);
      if (best !== self.hover) { self.hover = best; self.draw(); }
      canvas.style.cursor = best ? 'grab' : 'default';
    });

    canvas.addEventListener('pointerdown', function (e) {
      var p = self._pos(e);
      var n = self._hit(p);
      if (!n) {
        self.panning = { x: e.clientX, y: e.clientY, px: self.panX, py: self.panY };
        canvas.style.cursor = 'grabbing';
        return;
      }
      e.preventDefault();
      self.dragNode = n; self.dragging = true; n.fixed = true;
      canvas.style.cursor = 'grabbing';
      self.alpha = Math.max(self.alpha, 0.5); self.start();
    });

    canvas.addEventListener('pointerup', function () {
      if (self.dragNode) { self.dragNode.fixed = false; self.dragNode = null; }
      self.panning = null;
      canvas.style.cursor = 'grab';
    });
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      var r = canvas.getBoundingClientRect();
      var sx = self.w / (r.width || 1), sy = self.h / (r.height || 1);
      var mx = (e.clientX - r.left) * sx, my = (e.clientY - r.top) * sy;
      var wx = (mx - self.panX) / self.zoom, wy = (my - self.panY) / self.zoom;
      var f = e.deltaY < 0 ? 1.1 : 0.9;
      self.zoom = Math.max(0.45, Math.min(3, self.zoom * f));
      self.panX = mx - wx * self.zoom;
      self.panY = my - wy * self.zoom;
      self.draw();
    }, { passive: false });
    canvas.addEventListener('dblclick', function () {
      self.zoom = 1; self.panX = 0; self.panY = 0; self.draw();
    });
    canvas.addEventListener('pointerleave', function () {
      if (self.dragNode) { self.dragNode.fixed = false; self.dragNode = null; }
      if (self.hover) { self.hover = null; self.draw(); }
    });

    global.addEventListener('resize', function () { self.resize(); });
    if (global.ResizeObserver) {
      this._ro = new global.ResizeObserver(function () { self.resize(); });
      this._ro.observe(canvas);
    }
    this.resize();
    this._raf = null;
  }

  Graph.prototype.resize = function () {
    var w = this.canvas.clientWidth || 600, h = this.canvas.clientHeight || 400;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.w = w; this.h = h;
    if (this.nodes.length) { this.reanchor(); this.alpha = 0.7; this.start(); }
    this.draw();
  };

  Graph.prototype.setData = function (core) {
    this.core = core;
    this.colors = {};
    core.covenants.forEach(function (c, i) {
      this.colors[c.name] = c.kind === '核心' ? CORE_COLOR : PALETTE[i % PALETTE.length];
    }, this);
  };

  Graph.prototype.reanchor = function () {
    var covs = this.nodes.filter(function (n) { return n.type === 'cov'; });
    var cx = this.w / 2, cy = this.h / 2;
    var R = Math.min(this.w, this.h) * (covs.length > 10 ? 0.36 : 0.30);
    covs.forEach(function (n, i) {
      var a = -Math.PI / 2 + (i / Math.max(1, covs.length)) * Math.PI * 2;
      n.ax = cx + Math.cos(a) * R;
      n.ay = cy + Math.sin(a) * R * 0.95;
    });
    var ops = this.nodes.filter(function (n) { return n.type === 'op'; });
    ops.forEach(function (n, i) {
      var mine = covs.filter(function (c) { return n.op.covs.indexOf(c.name) >= 0; });
      var a = mine.length
        ? mine.reduce(function (s, c) { return s + Math.atan2(c.ay - cy, c.ax - cx); }, 0) / mine.length
        : (i / Math.max(1, ops.length)) * Math.PI * 2;
      var r = R * 0.48;
      n.ax = cx + Math.cos(a) * r;
      n.ay = cy + Math.sin(a) * r * 0.95;
    });
  };

  Graph.prototype.update = function (state) {
    var self = this;
    this.state = state;
    if (this.preview) { this.buildPreview(); return; }
    if (!this.core) return;
    var core = this.core;
    var old = {};
    this.nodes.forEach(function (n) { old[n.id] = n; });

    var nodes = [], links = [];
    var covs = core.covenants.filter(function (c) { return (state.counts[c.name] || 0) > 0; });

    covs.forEach(function (c) {
      var prev = old['c:' + c.name];
      nodes.push({
        id: 'c:' + c.name, type: 'cov', name: c.name, kind: c.kind, r: R_COV, src: (DATA.icons && DATA.icons[c.name]) || '',
        x: prev ? prev.x : this.w / 2, y: prev ? prev.y : this.h / 2,
        vx: 0, vy: 0, ax: 0, ay: 0,
        level: state.tiers[c.name].level, count: state.counts[c.name],
        color: this.colors[c.name]
      });
    }, this);

    (state.field || []).forEach(function (name, oi) {
      var op = core.opByName[name];
      if (!op) return;
      var prev = old['o:' + name];
      nodes.push({
        id: 'o:' + name, type: 'op', name: name, op: op, r: R_OP, idx: oi, src: (DATA.avatars && DATA.avatars[name]) || '',
        x: prev ? prev.x : this.w / 2, y: prev ? prev.y : this.h / 2,
        vx: 0, vy: 0, ax: 0, ay: 0,
        color: TIER_COLORS[(op.tierNum || 1) - 1]
      });
    }, this);

    nodes.forEach(function (n) {
      if (n.type !== 'op') return;
      (n.op.covs || []).forEach(function (cov) {
        var t = nodes.find(function (m) { return m.type === 'cov' && m.name === cov; });
        if (t) links.push({ a: n, b: t, color: t.color });
      });
    });

    this.nodes = nodes; this.links = links;
    this.reanchor();
    this.loadImages();
    // 新节点从锚点附近轻微抖入，避免全部叠在中心
    nodes.forEach(function (n) {
      if (!old[n.id]) {
        if (self.params.standard) {
          n.x = n.ax + (Math.random() - 0.5) * 30;
          n.y = n.ay + (Math.random() - 0.5) * 30;
        } else {
          n.x = self.w / 2 + (Math.random() - 0.5) * self.w * 0.5;
          n.y = self.h / 2 + (Math.random() - 0.5) * self.h * 0.5;
        }
      }
    });
    this.alpha = 1;
    this.start();
  };

  // 设置页示意小图：与正式图谱共用同一套 Graph 实现，只是换了一份迷你数据
  Graph.prototype.setPreview = function (spec, params) {
    this.preview = spec;
    if (params) this.params = params;
    this.update();
  };

  Graph.prototype.buildPreview = function () {
    var spec = this.preview, self = this;
    var w = this.w, h = this.h;
    var cx = w / 2, cy = h / 2;
    var R = Math.min(w, h) * 0.32;
    var nodes = [], links = [];

    spec.covs.forEach(function (name, i) {
      var a = -Math.PI / 2 + (i / spec.covs.length) * Math.PI * 2;
      nodes.push({
        id: 'c:' + name, type: 'cov', name: name, kind: 'extra', r: 22,
        x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R,
        ax: cx + Math.cos(a) * R, ay: cy + Math.sin(a) * R,
        vx: 0, vy: 0, level: i === 0 ? 2 : 1, count: 6 - i,
        color: PALETTE[i % PALETTE.length],
        src: (DATA.icons && DATA.icons[name]) || ''
      });
    });

    spec.ops.forEach(function (name, i) {
      var op = (self.core && self.core.opByName && self.core.opByName[name]) || null;
      var covs = (op && op.covs) || [];
      var host = nodes.filter(function (m) { return m.type === 'cov' && covs.indexOf(m.name) >= 0; })[0] || nodes[0];
      var a2 = -Math.PI / 2 + (i / spec.ops.length) * Math.PI * 2;
      var rr = R * 0.6;
      nodes.push({
        id: 'o:' + name, type: 'op', name: name, op: op, r: 16, idx: i,
        x: cx + Math.cos(a2) * rr, y: cy + Math.sin(a2) * rr,
        ax: host ? host.ax * 0.6 + cx * 0.4 : cx,
        ay: host ? host.ay * 0.6 + cy * 0.4 : cy,
        vx: 0, vy: 0, color: TIER_COLORS[2],
        src: (DATA.avatars && DATA.avatars[name]) || ''
      });
    });

    if (spec.links) {
      spec.links.forEach(function (pair) {
        var a = nodes.filter(function (m) { return m.type === 'op' && m.name === pair[0]; })[0];
        var b = nodes.filter(function (m) { return m.type === 'cov' && m.name === pair[1]; })[0];
        if (a && b) links.push({ a: a, b: b, color: b.color });
      });
    } else {
      nodes.forEach(function (n) {
        if (n.type !== 'op' || !n.op) return;
        (n.op.covs || []).forEach(function (c) {
          var t = nodes.filter(function (m) { return m.type === 'cov' && m.name === c; })[0];
          if (t) links.push({ a: n, b: t, color: t.color });
        });
      });
    }

    this.nodes = nodes; this.links = links;
    this.loadImages();
    this.alpha = 1;
    this.start();
  };

  Graph.prototype.start = function () {
    var self = this;
    if (this._raf) return;
    var step = function () {
      self._raf = null;
      if (self.alpha < 0.008 && !self.dragNode) { self.draw(); return; }
      self.simulate();
      self.draw();
      self._raf = global.requestAnimationFrame(step);
    };
    this._raf = global.requestAnimationFrame(step);
  };

  Graph.prototype.setParams = function (p) {
    if (p) {
      if (p.grav != null) this.params.grav = p.grav;
      if (p.charge != null) this.params.charge = p.charge;
      if (p.len != null) this.params.len = p.len;
      if (p.standard != null) this.params.standard = p.standard;
    }
    this.alpha = Math.max(this.alpha, 0.6);
    this.start();
  };

  // 参考 d3-force 的三力模型：链接力(弹簧) + 多体力(两两排斥) + 向心力(质心归中)
  // alpha 为模拟"热度"，每帧衰减；三种力都按 alpha 缩放，收敛后自然静止。
  Graph.prototype.simulate = function () {
    var nodes = this.nodes, links = this.links;
    var P = this.params;
    if (!nodes.length) { this.alpha = 0; return; }
    var w = this.w, h = this.h;
    var n = nodes.length, alpha = this.alpha;

    // ① 链接力：把有关系的两个节点拉到目标边长附近（d3 link force：直接位移）
    links.forEach(function (l) {
      var dx = l.a.x - l.b.x, dy = l.a.y - l.b.y;
      var d = Math.sqrt(dx * dx + dy * dy) || 1;
      var target = 118 * P.len * Math.max(0.7, Math.min(w, h) / 520);
      var k = ((d - target) / d) * 0.42 * alpha;
      var ox = dx * k, oy = dy * k;
      l.a.x -= ox; l.a.y -= oy;
      l.b.x += ox; l.b.y += oy;
    });

    // 标准结构布局：盟约锚在环形位置，干员围绕自己的盟约（锚点弹簧力）
    if (P.standard) {
      nodes.forEach(function (nd) {
        var k = (nd.type === 'cov' ? 0.06 : 0.014) * alpha;
        nd.vx += (nd.ax - nd.x) * k;
        nd.vy += (nd.ay - nd.y) * k;
      });
    }

    // ② 多体力：所有节点两两排斥，含碰撞分离（d3 many-body force）
    for (var i = 0; i < n; i++) {
      var A = nodes[i];
      for (var j = i + 1; j < n; j++) {
        var B = nodes[j];
        var dx2 = B.x - A.x, dy2 = B.y - A.y;
        var d2 = dx2 * dx2 + dy2 * dy2;
        if (d2 < 1) { d2 = 1; dx2 = (Math.random() - 0.5) * 0.6; dy2 = (Math.random() - 0.5) * 0.6; }
        var dd = Math.sqrt(d2);
        var charge = (A.type === 'cov' || B.type === 'cov' ? 13000 : 7800) * P.charge;
        var f = (charge / Math.max(d2, 60)) * alpha;
        if (f > 6) f = 6;
        var ux2 = dx2 / dd, uy2 = dy2 / dd;
        A.vx -= ux2 * f; A.vy -= uy2 * f;
        B.vx += ux2 * f; B.vy += uy2 * f;
        var minD = A.r + B.r + 14;
        if (dd < minD) {
          var push = (minD - dd) * 0.5 * alpha;
          A.vx -= ux2 * push; A.vy -= uy2 * push;
          B.vx += ux2 * push; B.vy += uy2 * push;
        }
      }
    }

    // ③ 向心力：整体平移，把质心挪到画布中心（d3 forceCenter 的做法：刚性平移，不给速度）
    var mx = 0, my = 0;
    nodes.forEach(function (nd) { mx += nd.x; my += nd.y; });
    mx /= n; my /= n;
    var shift = Math.min(1, 0.08 * P.grav * alpha);
    var ox3 = (w / 2 - mx) * shift, oy3 = (h / 2 - my) * shift;
    nodes.forEach(function (nd) {
      if (nd.fixed) return;
      nd.x += ox3; nd.y += oy3;
    });

    // 积分：速度衰减 + 边界反弹
    nodes.forEach(function (nd) {
      if (nd.fixed) { nd.vx = 0; nd.vy = 0; return; }
      nd.vx *= 0.72; nd.vy *= 0.72;
      nd.x += nd.vx; nd.y += nd.vy;
      var pad = nd.r + 8;
      if (nd.x < pad) { nd.x = pad; nd.vx = Math.abs(nd.vx) * 0.3; }
      if (nd.x > w - pad) { nd.x = w - pad; nd.vx = -Math.abs(nd.vx) * 0.3; }
      if (nd.y < pad) { nd.y = pad; nd.vy = Math.abs(nd.vy) * 0.3; }
      if (nd.y > h - pad) { nd.y = h - pad; nd.vy = -Math.abs(nd.vy) * 0.3; }
    });

    this.alpha += (0 - this.alpha) * 0.018;
    if (this.alpha < 0.004) this.alpha = 0;
  };

  // 头像/盟约图标：懒加载到 Image 对象，加载完成后再重绘一次
  Graph.prototype.loadImages = function () {
    var self = this;
    this.imgs = this.imgs || {};
    this.nodes.forEach(function (n) {
      if (!n.src || self.imgs[n.id]) return;
      var im = new Image();
      im.onload = function () { self.draw(); };
      im.src = n.src;
      self.imgs[n.id] = im;
    });
  };

  function hexPath(ctx, x, y, r) {
    for (var i = 0; i < 6; i++) {
      var a = Math.PI / 6 + i * Math.PI / 3;
      var px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  Graph.prototype.draw = function () {
    var ctx = this.ctx, dpr = this.dpr, w = this.w, h = this.h;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    var hover = this.hover;
    var nodes = this.nodes, links = this.links;

    // 空图谱不画提示文字：由页面上的 #emptyHint 统一显示，避免两段文字叠在一起
    if (!nodes.length) return;

    ctx.save();
    ctx.translate(this.panX, this.panY);
    ctx.scale(this.zoom, this.zoom);

    var related = null;
    if (hover) {
      related = {}; related[hover.id] = 1;
      links.forEach(function (l) {
        if (l.a === hover) related[l.b.id] = 1;
        if (l.b === hover) related[l.a.id] = 1;
      });
    }

    links.forEach(function (l) {
      var active = hover ? (l.a === hover || l.b === hover) : true;
      ctx.beginPath(); ctx.moveTo(l.a.x, l.a.y); ctx.lineTo(l.b.x, l.b.y);
      if (hover && !active) ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      else if (hover) ctx.strokeStyle = l.color + 'cc';
      else ctx.strokeStyle = 'rgba(200,220,255,0.12)';
      ctx.lineWidth = hover && active ? 2 : 1;
      ctx.stroke();
    });

    var imgs = this.imgs || {};
    nodes.forEach(function (n) {
      var dim = hover && !related[n.id];
      ctx.globalAlpha = dim ? 0.26 : 1;
      var img = imgs[n.id];
      var ready = img && img.complete && img.width > 0;
      if (n.type === 'cov') {
        var active = n.level > 0;
        ctx.beginPath(); hexPath(ctx, n.x, n.y, n.r);
        ctx.fillStyle = active ? '#0f1822' : '#0b1219'; ctx.fill();
        if (ready) {
          ctx.save(); ctx.beginPath(); hexPath(ctx, n.x, n.y, n.r - 2); ctx.clip();
          ctx.globalAlpha = (dim ? 0.26 : 1) * (active ? 0.95 : 0.4);
          ctx.drawImage(img, n.x - n.r * 0.82, n.y - n.r * 0.82, n.r * 1.64, n.r * 1.64);
          ctx.restore();
        } else {
          ctx.fillStyle = active ? '#e6c27a' : '#8a97a6';
          ctx.font = '600 11px "Microsoft YaHei",sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(n.name.slice(0, 2), n.x, n.y);
        }
        ctx.beginPath(); hexPath(ctx, n.x, n.y, n.r);
        ctx.strokeStyle = active ? n.color : 'rgba(150,165,180,0.45)';
        ctx.lineWidth = active ? 2.4 : 1.2; ctx.stroke();
        if (active) {
          ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 6, 0, Math.PI * 2);
          ctx.strokeStyle = n.color + '30'; ctx.lineWidth = 6; ctx.stroke();
        }
        var label = n.count + (active ? ' ✓' : '');
        ctx.font = '600 10px "Microsoft YaHei",sans-serif';
        var tw = ctx.measureText(label).width + 10;
        roundRect(ctx, n.x - tw / 2, n.y + n.r + 3, tw, 15, 7.5);
        ctx.fillStyle = 'rgba(10,15,21,0.92)'; ctx.fill();
        ctx.strokeStyle = active ? n.color : 'rgba(150,165,180,0.35)'; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = active ? n.color : '#8a97a6';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(label, n.x, n.y + n.r + 11);
      } else {
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = '#0d161e'; ctx.fill();
        if (ready) {
          ctx.save(); ctx.beginPath(); ctx.arc(n.x, n.y, n.r - 1.5, 0, Math.PI * 2); ctx.clip();
          ctx.drawImage(img, n.x - n.r, n.y - n.r, n.r * 2, n.r * 2);
          ctx.restore();
        } else {
          ctx.fillStyle = n.color;
          ctx.font = '700 15px "Microsoft YaHei",sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText((n.name || '?').charAt(0), n.x, n.y + 1);
        }
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.strokeStyle = n.color; ctx.lineWidth = 2.2; ctx.stroke();
        ctx.font = '10px "Microsoft YaHei",sans-serif';
        var nw = ctx.measureText(n.name).width + 10;
        var ny = n.y + n.r + 3;
        roundRect(ctx, n.x - nw / 2, ny, nw, 14, 7);
        ctx.fillStyle = 'rgba(8,12,17,0.88)'; ctx.fill();
        ctx.fillStyle = dim ? '#55616e' : '#b6c4d3';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(n.name, n.x, ny + 7.5);
      }
      ctx.globalAlpha = 1;
    });
    ctx.restore();
  };

  function drawHex(ctx, x, y, r, color, active, alpha) {
    ctx.beginPath();
    for (var i = 0; i < 6; i++) {
      var a = Math.PI / 6 + i * Math.PI / 3;
      var px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = active ? color : 'rgba(30,40,50,' + (0.9 * alpha) + ')';
    ctx.fill();
    ctx.strokeStyle = active ? color : 'rgba(120,140,160,' + (0.5 * alpha) + ')';
    ctx.lineWidth = 1.5; ctx.stroke();
  }

  var api = { Graph: Graph, TIER_COLORS: TIER_COLORS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.GraphView = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
