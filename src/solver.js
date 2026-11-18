/* 求解器：给定目标盟约档位，求满足条件的最少人数配队（设计一）
 * 规则：
 *  - 调和：可选「是否允许魔王入队」；魔王占 1 人，调和让核心盟约 +1（下界与剪枝都计入）
 *  - 独行：至多 1 名独行干员，否则失效
 *  - 绝技：按精锐人数计算，求解时把在场干员全部视为精锐
 *  - 远见 / 奇迹 / 投资人：整备区成员也计入
 *  - 协防干员：被 BAN 阵营的干员作为兜底计入
 *  - 变形同构体：只在某盟约差 1 人时补位，受数量上限约束
 *  - 严格模式：只允许点亮目标盟约，且档位恰好等于目标档位
 * 输出按「人数升序 → 点亮档位降序 → 层数增速降序」排序。
 */
(function (global) {
  'use strict';

  function solve(core, opts) {
    opts = opts || {};
    var t0 = Date.now();
    var budgetMs = opts.budgetMs || 900;
    var limit = opts.limit || 3000; // 需要足够多的样本才能把「激活盟约多」的方案搜出来
    var sortMode = opts.sortMode === 'tier' ? 'tier' : 'cov';
    var maxSize = opts.maxSize || 8;
    var strict = !!opts.strict;
    var allowHarmony = opts.harmony !== false; // 是否允许「魔王」这类调和干员入队（占 1 人，调和让核心 +1）

    var bans = Object.create(null);
    (opts.bans || []).forEach(function (n) { bans[n] = 1; });
    if (!allowHarmony) bans['调和'] = 1; // 不允许魔王：调和干员不进候选，调和也不生效
    var exclude = Object.create(null);
    (opts.exclude || []).forEach(function (n) { exclude[n] = 1; });
    var locked = (opts.locked || []).filter(function (n) { return core.opByName[n]; });
    var lockedSet = Object.create(null);
    locked.forEach(function (n) { lockedSet[n] = 1; });
    var pivotBudget = Math.max(0, opts.pivotBudget || 0);
    var userElite = (opts.elite || []).filter(function (n) { return core.opByName[n]; });
    var bench = (opts.bench || []).filter(function (n) { return core.opByName[n]; });

    var targets = (opts.targets || []).filter(function (t) { return t && t.at > 0 && core.covByName[t.cov]; });
    if (!targets.length) return { solutions: [], note: '未选择目标盟约', elapsed: 0 };

    var bannedTargets = targets.filter(function (t) { return bans[t.cov]; });
    if (bannedTargets.length) {
      return { solutions: [], note: '目标中包含已禁用盟约：' + bannedTargets.map(function (t) { return t.cov; }).join('、'), elapsed: 0 };
    }

    var need = Object.create(null);
    targets.forEach(function (t) { need[t.cov] = t.at; });
    var needList = targets.map(function (t) { return { cov: t.cov, at: t.at, c: core.covByName[t.cov] }; });
    var eliteTarget = needList.some(function (t) { return t.c.countRule === 'elite'; });
    var soloTarget = !!need['独行'];
    var hasCoreTarget = needList.some(function (t) { return t.c.kind === '核心'; });

    function hasSolo(o) { return o.covs.indexOf('独行') >= 0; }
    function isHarmony(o) { return o.covs.indexOf('调和') >= 0; }

    var lockedHarmony = locked.some(function (n) { return isHarmony(core.opByName[n]); });
    var lockedSolo = locked.some(function (n) { return hasSolo(core.opByName[n]); });

    // 整备区对「远见 / 奇迹 / 投资人」的固定贡献（同名只算一次）
    var benchAdd = Object.create(null);
    core.covenants.forEach(function (c) {
      if (c.countRule !== 'field+bench') return;
      var once = Object.create(null), n = 0;
      bench.forEach(function (name) {
        if (once[name]) return;
        once[name] = 1;
        if (core.opByName[name].covs.indexOf(c.name) >= 0) n++;
      });
      benchAdd[c.name] = n;
    });

    function targetLevel(c, at) { var lv = 0; c.tiers.forEach(function (x) { if (x.at <= at) lv++; }); return lv; }

    // 候选池：覆盖目标盟约的干员 + 允许时的调和干员（魔王）+ 被 BAN 阵营的兜底干员
    var pool = core.operators.filter(function (o) {
      if (o.name === '盟约·辅助干员') return false; // 策略赠送单位，不参与配队
      if (exclude[o.name] || lockedSet[o.name]) return false;
      if (o.covs.some(function (c) { return need[c]; })) return true;
      if (allowHarmony && hasCoreTarget && isHarmony(o)) return true;
      if (need['协防干员'] && o.covs.some(function (c) { return bans[c]; })) return true;
      return false;
    }).map(function (o) {
      var cover = o.covs.filter(function (c) { return need[c]; }).length;
      return { op: o, cover: cover };
    });
    pool.sort(function (a, b) { return b.cover - a.cover || b.op.tierNum - a.op.tierNum; });
    var P = pool.map(function (x) { return x.op; });

    var solutions = [], seen = Object.create(null), visits = 0, complete = true, stop = false;

    // 剪枝：用「最乐观」的有效人数判断名额是否够补齐，全部特殊计数都计入
    function prune(chosen, room) {
      var all = locked.concat(chosen);
      var raw = Object.create(null), fb = Object.create(null), solo = 0, harm = false;
      var eliteCount = all.length;                    // 绝技：在场每个人都可以精锐
      all.forEach(function (o) {
        if (hasSolo(o)) solo++;
        if (isHarmony(o) && !bans['调和']) harm = true;
        if (o.covs.some(function (c) { return bans[c]; })) fb[o.name] = 1;
        o.covs.forEach(function (c) { if (need[c]) raw[c] = (raw[c] || 0) + 1; });
      });
      if (soloTarget && solo > 1) return true;
      for (var i = 0; i < needList.length; i++) {
        var t = needList[i], have = raw[t.cov] || 0;
        if (t.c.countRule === 'field+bench') have += benchAdd[t.cov] || 0;
        if (t.c.countRule === 'fallback') {
          var set = Object.create(null);
          all.forEach(function (o) { if (o.covs.indexOf(t.cov) >= 0) set[o.name] = 1; });
          Object.keys(fb).forEach(function (n2) { set[n2] = 1; });
          have = Object.keys(set).length;
        }
        if (t.c.countRule === 'elite') {
          if (eliteCount + room < t.at) return true;
          continue;
        }
        if (t.c.kind === '核心' && harm && (have > 0 || room > 0)) have += 1;
        if (have + room + pivotBudget < t.at) return true;
      }
      return false;
    }

    function evaluate(chosen) {
      var team = locked.concat(chosen);
      var names = team.map(function (o) { return o.name; });
      if (names.length > maxSize) return null;

      // 绝技：把在场干员全部视为精锐（精锐只影响层数增速与绝技计数）
      var elite = Object.create(null);
      userElite.forEach(function (n) { elite[n] = 1; });
      if (eliteTarget) names.forEach(function (n) { elite[n] = 1; });

      // 变形同构体：逐次补「差 1」的缺口，每次重新评估（把调和 / 整备区 / 兜底都算进去）
      var pivots = Object.create(null);
      var remainingPivot = pivotBudget;
      var st = core.compute({ field: names, bench: bench, elite: Object.keys(elite), pivots: pivots, bans: opts.bans, extraLayers: opts.extraLayers });
      while (remainingPivot > 0) {
        var gap = null;
        for (var i = 0; i < needList.length; i++) {
          if ((st.counts[needList[i].cov] || 0) < needList[i].at) { gap = needList[i]; break; }
        }
        if (!gap) break;
        var pick = null;
        for (var j = 0; j < team.length; j++) {
          var o = team[j];
          if (o.covs.indexOf(gap.cov) >= 0 || pivots[o.name]) continue;
          pick = o; break;
        }
        if (!pick) break;
        pivots[pick.name] = gap.cov;
        remainingPivot--;
        st = core.compute({ field: names, bench: bench, elite: Object.keys(elite), pivots: pivots, bans: opts.bans, extraLayers: opts.extraLayers });
      }

      var ok = needList.every(function (t) { return (st.counts[t.cov] || 0) >= t.at; });
      if (!ok) return null;

      // 严格模式：只点亮目标盟约，且档位与目标档位完全一致（不多不少）
      if (strict) {
        for (var k = 0; k < core.covenants.length; k++) {
          var c = core.covenants[k];
          var got = st.tiers[c.name].active ? st.tiers[c.name].level : 0;
          var want = need[c.name] ? targetLevel(c, need[c.name]) : 0;
          if (got !== want) return null;
        }
      }

      var key = names.slice().sort().join('|');
      if (seen[key]) return null;
      seen[key] = 1;

      var targetTiers = 0;
      needList.forEach(function (t) { targetTiers += st.tiers[t.cov].level; });
      var totalTier = 0;
      team.forEach(function (o) { totalTier += (o.tierNum || 0); });
      return {
        team: names, size: names.length, bench: bench.slice(), elite: Object.keys(elite),
        pivots: pivots, tierCount: st.tierCount, extraTiers: st.tierCount - targetTiers, totalTier: totalTier,
        totalRate: st.totalRate, litCount: st.litCount, strict: strict,
        warnings: st.warnings.slice(), state: st
      };
    }

    function dfs(chosen, startIdx, k) {
      if (stop) return;
      if (++visits % 2048 === 0 && Date.now() - t0 > budgetMs) { complete = false; stop = true; return; }
      if (chosen.length === k) {
        var res = evaluate(chosen);
        if (res) { solutions.push(res); if (solutions.length >= limit) stop = true; }
        return;
      }
      if (prune(chosen, k - chosen.length)) return;
      for (var i = startIdx; i < P.length && !stop; i++) {
        var o = P[i];
        if (soloTarget && hasSolo(o) && (lockedSolo || chosen.some(hasSolo))) continue;
        chosen.push(o);
        dfs(chosen, i + 1, k);
        chosen.pop();
      }
    }

    // 下界：调和让核心盟约少 1 人；整备区已提供的名额要扣掉；绝技至少要 at 名在场干员
    var startK = locked.length;
    needList.forEach(function (t) {
      var base = t.at;

      if (t.c.countRule === 'field+bench') base = Math.max(0, base - (benchAdd[t.cov] || 0));
      if (t.c.countRule === 'fallback') base = 0;
      startK = Math.max(startK, base);
    });
    if (!startK) startK = 1;
    if (startK > maxSize) {
      return { solutions: [], note: '场上上限 ' + maxSize + ' 人，无法放下最少 ' + startK + ' 人的方案', elapsed: Date.now() - t0, searched: P.length };
    }
    var topK = Math.min(maxSize, startK + 6);
    for (var k = startK; k <= topK && !stop; k++) {
      dfs([], 0, k);
    }

    // 排序：人数少 >（激活盟约多 / 总等阶高，可切换）> 每回合叠层多
    solutions.sort(function (a, b) {
      if (a.size !== b.size) return a.size - b.size;
      if (sortMode === 'tier') {
        if (b.totalTier !== a.totalTier) return b.totalTier - a.totalTier;
      } else {
        if (b.litCount !== a.litCount) return b.litCount - a.litCount;
        if (b.totalTier !== a.totalTier) return b.totalTier - a.totalTier;
      }
      return b.totalRate - a.totalRate || b.tierCount - a.tierCount || a.team.join().localeCompare(b.team.join(), 'zh');
    });

    return {
      solutions: solutions.slice(0, limit),
      searched: P.length,
      elapsed: Date.now() - t0,
      complete: complete,
      truncated: solutions.length >= limit,
      strict: strict,
      sortMode: sortMode
    };
  }

  var api = { solve: solve };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.Solver = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
