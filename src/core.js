/* 卫戍协议·配队模拟器 — 规则内核（纯函数，浏览器/Node 通用）
 * 术语一律使用官方用语：干员 / 盟约 / 变形同构体。
 * 数据来自 PRTS《卫戍协议·规程/PRTS盟约记录》与 NGA 解包整理。
 */
(function (global) {
  'use strict';

  var TIER_NAMES = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ'];

  function uniq(arr) {
    var seen = Object.create(null), out = [];
    (arr || []).forEach(function (x) { if (x != null && x !== '' && !seen[x]) { seen[x] = 1; out.push(x); } });
    return out;
  }

  function makeCore(data) {
    var covenants = data.covenants.slice();
    var operators = data.operators.slice();
    var covByName = Object.create(null);
    covenants.forEach(function (c) { covByName[c.name] = c; });
    var opByName = Object.create(null);
    operators.forEach(function (o) { opByName[o.name] = o; });

    var CORE_COVS = covenants.filter(function (c) { return c.kind === '核心'; }).map(function (c) { return c.name; });

    /* ---------- 特质解析：把「层数+N（每回合至多M层）」变成可计算的数据 ---------- */
    var RE_GAIN = /((?:【[^】]+】)+)\s*层数\+(\d+)(?:\s*（每回合至多叠加(\d+)层）)?/g;
    var RE_CONVERT = /转化(\d+)层【([^】]+)】临时层数为固定层数/;

    function parseTrait(text, op) {
      var out = { gains: [], convert: null, raw: text || '' };
      if (!text) return out;
      var m;
      RE_GAIN.lastIndex = 0;
      while ((m = RE_GAIN.exec(text))) {
        var covs = (m[1].match(/【([^】]+)】/g) || []).map(function (s) { return s.slice(1, -1); });
        var n = parseInt(m[2], 10);
        var cap = m[3] ? parseInt(m[3], 10) : null;
        covs.forEach(function (cov) {
          if (!covByName[cov]) return;
          out.gains.push({ cov: cov, amount: n, perRoundCap: cap, oneShot: /获得时|首次/.test(text) });
        });
      }
      var c = text.match(RE_CONVERT);
      if (c) out.convert = { amount: parseInt(c[1], 10), cov: c[2] };
      return out;
    }

    operators.forEach(function (op) {
      op.traitParsed = {
        1: parseTrait(op.trait1, op),
        2: parseTrait(op.trait2 || op.trait1, op)
      };
    });

    function traitFor(op, elite) { return op.traitParsed[elite && op.trait2 ? 2 : 1]; }

    /* ---------- 核心计算 ---------- */
    function compute(input) {
      input = input || {};
      var field = uniq(input.field).map(function (n) { return opByName[n]; }).filter(Boolean);
      var bench = uniq(input.bench).map(function (n) { return opByName[n]; }).filter(Boolean);
      var elite = Object.create(null);
      (input.elite || []).forEach(function (n) { elite[n] = 1; });
      var pivots = input.pivots || {};
      var bans = Object.create(null);
      (input.bans || []).forEach(function (n) { bans[n] = 1; });
      var extraLayers = input.extraLayers || {};
      var warnings = [];

      var members = Object.create(null);     // 原始成员（含转职）
      covenants.forEach(function (c) { members[c.name] = Object.create(null); });

      function addMember(op, cov) {
        if (!cov || !members[cov]) return;
        members[cov][op.name] = 1;
      }
      field.forEach(function (op) {
        op.covs.forEach(function (cov) { addMember(op, cov); });
        if (pivots[op.name]) addMember(op, pivots[op.name]);      // 变形同构体：额外计入
      });

      var counts = Object.create(null);
      covenants.forEach(function (c) {
        var set = members[c.name];
        var n = Object.keys(set).length;
        if (c.countRule === 'field+bench') {
          bench.forEach(function (op) {
            if (set[op.name]) return;                 // 同名干员只算一次
            if (op.covs.indexOf(c.name) >= 0 || pivots[op.name] === c.name) n++;
          });
        }
        if (c.countRule === 'fallback') {
          // 协防干员：本命成员 + 阵营（盟约）被 BAN 的干员作为兜底计入，同名只算一次
          var fb = Object.create(null);
          Object.keys(set).forEach(function (n2) { fb[n2] = 1; });
          field.forEach(function (op) {
            if (op.covs.some(function (cov) { return bans[cov]; })) fb[op.name] = 1;
          });
          n = Object.keys(fb).length;
        }
        if (c.countRule === 'elite') {
          // 绝技：按「在场精英化人数」计算，与是否携带该盟约无关
          n = field.filter(function (op) { return elite[op.name]; }).length;
        }
        counts[c.name] = n;
      });

      // 调和：使场上已有成员的核心盟约人数 +1
      var harmonyActive = counts['调和'] >= 1 && !bans['调和'];
      if (harmonyActive) {
        CORE_COVS.forEach(function (cn) { if (counts[cn] > 0) counts[cn] += 1; });
      }

      // 独行：≥2 人失效
      if (counts['独行'] >= 2) {
        warnings.push('独行：场上 ' + counts['独行'] + ' 名，≥2 人时盟约失效');
        counts['独行'] = 0;
      }

      var tiers = Object.create(null);
      var rates = Object.create(null);
      var litList = [];
      covenants.forEach(function (c) {
        var n = counts[c.name];
        var level = 0, curAt = 0, nextAt = null;
        c.tiers.forEach(function (t) { if (n >= t.at) { level++; curAt = t.at; } });
        for (var i = 0; i < c.tiers.length; i++) { if (c.tiers[i].at > n) { nextAt = c.tiers[i].at; break; } }
        var active = level > 0 && !bans[c.name];
        if (bans[c.name] && level > 0) warnings.push('【' + c.name + '】本局已禁用，不计入点亮');
        tiers[c.name] = {
          count: n, level: level, active: active, at: curAt, nextAt: nextAt,
          gap: nextAt == null ? 0 : nextAt - n, banned: !!bans[c.name],
          kind: c.kind, rule: c.countRule
        };
        if (active) litList.push(c.name);

        // 层数增速：仅在盟约点亮后生效
        var perRound = 0, oneShot = 0, sources = [];
        if (active) {
          field.forEach(function (op) {
            var tr = traitFor(op, !!elite[op.name]);
            tr.gains.forEach(function (g) {
              if (g.cov !== c.name) return;
              if (g.oneShot) { oneShot += g.amount; sources.push({ op: op.name, value: g.amount, type: '单次' }); }
              else {
                var v = g.perRoundCap != null ? g.perRoundCap : g.amount;
                perRound += v; sources.push({ op: op.name, value: v, type: '每回合' });
              }
            });
            if (tr.convert && tr.convert.cov === c.name) sources.push({ op: op.name, value: tr.convert.amount, type: '转换' });
          });
        }
        rates[c.name] = { perRound: perRound, oneShot: oneShot, sources: sources, extra: extraLayers[c.name] || 0 };
      });

      // 卡西米尔 6 档：召唤依赖整备区最右侧的卡西米尔干员
      if (tiers['卡西米尔'] && tiers['卡西米尔'].active && tiers['卡西米尔'].level >= 2) {
        var right = bench.length ? bench[bench.length - 1] : null;
        if (!right || right.covs.indexOf('卡西米尔') < 0) {
          warnings.push('卡西米尔 6 档：整备区最右侧不是卡西米尔干员，召唤效果无法触发');
        }
      }

      var litCount = litList.length;
      var tierCount = 0;
      covenants.forEach(function (c) { tierCount += tiers[c.name].active ? tiers[c.name].level : 0; });
      var totalRate = 0;
      // 「获得时」类效果只用于点亮/档位，不计入每回合叠层
      covenants.forEach(function (c) { totalRate += (rates[c.name].perRound + rates[c.name].extra); });

      return {
        field: field.map(function (o) { return o.name; }),
        bench: bench.map(function (o) { return o.name; }),
        counts: counts, tiers: tiers, rates: rates, warnings: warnings,
        lit: litList, litCount: litCount, tierCount: tierCount, totalRate: totalRate,
        harmony: harmonyActive
      };
    }

    /* ---------- 候选推荐 ---------- */
    function rankCandidates(state, opts) {
      opts = opts || {};
      var excluded = Object.create(null);
      (opts.exclude || []).forEach(function (n) { excluded[n] = 1; });
      var onField = Object.create(null);
      state.field.forEach(function (n) { onField[n] = 1; });
      var base = compute({ field: state.field, bench: state.bench, elite: opts.elite, pivots: opts.pivots, bans: opts.bans, extraLayers: opts.extraLayers });

      var out = [];
      operators.forEach(function (op) {
        if (op.name === '盟约·辅助干员') return; // 策略赠送单位，不参与配队
        if (onField[op.name] || excluded[op.name]) return;
        if (opts.onlyCov && op.covs.indexOf(opts.onlyCov) < 0) return;
        var next = compute({ field: base.field.concat([op.name]), bench: state.bench, elite: opts.elite, pivots: opts.pivots, bans: opts.bans, extraLayers: opts.extraLayers });
        var dTier = next.tierCount - base.tierCount;
        var dLit = next.litCount - base.litCount;
        var dRate = next.totalRate - base.totalRate;
        var reasons = [], litCovs = [];
        op.covs.forEach(function (cov) {
          var a = base.tiers[cov], b = next.tiers[cov];
          if (!a) return;
          if (b.level > a.level) { reasons.push('点亮【' + cov + '】' + (b.level === 2 ? ' 6 档' : '')); litCovs.push(cov); }
          else if (a.nextAt != null && b.count === a.nextAt) reasons.push('【' + cov + '】' + a.count + '→' + a.nextAt + '，点亮');
          else if (a.nextAt != null) reasons.push('【' + cov + '】' + b.count + '/' + a.nextAt);
        });
        if (dRate > 0) reasons.push('每回合 +' + dRate + ' 层');
        out.push({
          op: op.name, opRef: op, dTier: dTier, dLit: dLit, dRate: dRate,
          score: dTier * 1000 + dLit * 300 + dRate * 5,
          reasons: reasons.slice(0, 3), litCovs: litCovs, covs: op.covs, tierNum: op.tierNum
        });
      });
      out.sort(function (a, b) { return b.score - a.score || a.op.localeCompare(b.op, 'zh'); });
      return out;
    }

    return {
      data: data, covenants: covenants, operators: operators,
      covByName: covByName, opByName: opByName,
      compute: compute, rankCandidates: rankCandidates,
      traitFor: function (op, elite) { return traitFor(opByName[op] || op, elite); },
      CORE_COVS: CORE_COVS, TIER_NAMES: TIER_NAMES
    };
  }

  var api = { makeCore: makeCore };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.Core = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
