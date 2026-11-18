import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { makeCore } = require('../src/core.js');
const { solve } = require('../src/solver.js');

const cov = (name, kind, tiers, countRule) => ({
  id: name, name, kind,
  thresholds: tiers,
  tiers: tiers.map((at) => ({ at, label: at + name, body: 'x' })),
  layerGates: [], notes: [], countRule: countRule || 'field'
});
const COVS = [
  cov('炎', '核心', [3, 6]),
  cov('萨尔贡', '核心', [3, 6]),
  cov('精准', '附加', [2, 3]),
  cov('调和', '附加', [1], 'harmony'),
  cov('独行', '附加', [1], 'solo'),
  cov('绝技', '附加', [2, 5], 'elite'),
  cov('远见', '附加', [2], 'field+bench'),
  cov('协防干员', '附加', [2], 'fallback'),
  cov('卡西米尔', '核心', [3, 6], 'bench-right'),
];
const op = (name, covs) => ({ name, tier: 'Ⅰ', tierNum: 1, covs, traitType: '持续叠加', trait1: '', trait2: '' });

test('调和：5 炎 + 魔王 6 人点亮 6 炎（剪枝不会漏解）', () => {
  const core = makeCore({ covenants: COVS, operators: [op('H', ['调和']), ...['A','B','C','D','E'].map(n => op(n, ['炎']))] });
  const r = solve(core, { targets: [{ cov: '炎', at: 6 }], maxSize: 8 });
  const hit = r.solutions.find(s => s.team.includes('H') && s.size === 6);
  assert.ok(hit, '应找到 5 炎 + 魔王 的 6 人方案');
  assert.equal(hit.state.tiers['炎'].level, 2);
});

test('排序：人数相同按总等阶降序', () => {
  const mk = (n, t) => { const o = op(n, ['炎']); o.tierNum = t; return o; };
  const core = makeCore({ covenants: COVS, operators: [mk('A', 1), mk('B', 6), mk('C', 3), mk('D', 6)] });
  const r = solve(core, { targets: [{ cov: '炎', at: 3 }], maxSize: 8, harmony: false });
  assert.ok(r.solutions.length > 0);
  for (let i = 1; i < r.solutions.length; i++) assert.ok(r.solutions[i - 1].size <= r.solutions[i].size, '人数应升序');
  const s3 = r.solutions.filter(s => s.size === 3);
  assert.ok(s3.length > 0);
  assert.equal(s3[0].totalTier, 15, '应优先 6+6+3');
  for (let i = 1; i < s3.length; i++) {
    assert.ok(s3[i - 1].totalTier >= s3[i].totalTier, '同人数总等阶应降序');
  }
});

test('排序模式：盟约优先 vs 等阶优先', () => {
  const COVS2 = COVS.concat([cov('迅捷', '附加', [1])]);
  const mk = (n, covs, t, trait1) => { const o = op(n, covs); o.tierNum = t; if (trait1) o.trait1 = trait1; return o; };
  const core = makeCore({ covenants: COVS2, operators: [
    mk('A', ['炎'], 6), mk('B', ['炎'], 6), mk('C', ['炎'], 1, '<战斗中>【炎】层数+5'), mk('D', ['炎', '迅捷'], 1)
  ] });
  const covR = solve(core, { targets: [{ cov: '炎', at: 3 }], maxSize: 8, harmony: false, sortMode: 'cov' });
  const tierR = solve(core, { targets: [{ cov: '炎', at: 3 }], maxSize: 8, harmony: false, sortMode: 'tier' });
  assert.ok(covR.solutions[0].team.includes('D'), '盟约优先应选带迅捷的 D');
  assert.ok(covR.solutions[0].litCount >= 2);
  assert.ok(tierR.solutions[0].team.includes('C'), '等阶优先应选层数更高的 C 队');
  assert.equal(tierR.solutions[0].totalTier, 13);
});

test('是否允许魔王：允许则 5 炎 + 魔王 6 人，不允许则无解', () => {
  const core = makeCore({ covenants: COVS, operators: [op('H', ['调和']), ...['A','B','C','D','E'].map(n => op(n, ['炎']))] });
  const on = solve(core, { targets: [{ cov: '炎', at: 6 }], maxSize: 8, harmony: true });
  const off = solve(core, { targets: [{ cov: '炎', at: 6 }], maxSize: 8, harmony: false });
  assert.ok(on.solutions.some(s => s.team.includes('H') && s.size === 6), '允许魔王：6 人方案');
  assert.equal(off.solutions.length, 0, '不允许魔王：5 炎凑不到 6');
});

test('绝技：求解时把在场干员按精锐计算', () => {
  const core = makeCore({ covenants: COVS, operators: [op('L', ['绝技']), op('M', ['绝技'])] });
  const r = solve(core, { targets: [{ cov: '绝技', at: 2 }], maxSize: 8 });
  assert.ok(r.solutions.length > 0);
  const s = r.solutions[0];
  assert.equal(s.size, 2);
  assert.deepEqual(s.elite.slice().sort(), ['L', 'M']);
});

test('独行：只出 1 人方案', () => {
  const core = makeCore({ covenants: COVS, operators: [op('S1', ['独行']), op('S2', ['独行'])] });
  const r = solve(core, { targets: [{ cov: '独行', at: 1 }], maxSize: 8 });
  assert.ok(r.solutions.length > 0);
  assert.ok(r.solutions.every(s => s.size === 1));
});

test('远见：整备区成员计入，场上只需 1 人', () => {
  const core = makeCore({ covenants: COVS, operators: [op('F1', ['远见']), op('F2', ['远见'])] });
  const r = solve(core, { targets: [{ cov: '远见', at: 2 }], bench: ['F2'], maxSize: 8 });
  const s = r.solutions[0];
  assert.ok(s, '应找到方案');
  assert.equal(s.size, 1);
  assert.equal(s.state.tiers['远见'].level, 1);
});

test('协防干员：被 BAN 阵营的干员作为兜底计入', () => {
  const core = makeCore({ covenants: COVS, operators: [op('A', ['炎']), op('B', ['炎'])] });
  const r = solve(core, { targets: [{ cov: '协防干员', at: 2 }], bans: ['炎'], maxSize: 8 });
  assert.ok(r.solutions.length > 0, 'BAN 炎的干员应能凑出 2 协防');
  assert.equal(r.solutions[0].size, 2);
});

test('严格模式：只点亮目标盟约、档位恰好一致', () => {
  const ops = [op('A', ['炎']), op('B', ['炎']), op('C', ['炎']), op('D', ['炎']),
               op('E', ['炎']), op('F', ['炎']), op('P', ['精准']), op('Q', ['精准'])];
  const core = makeCore({ covenants: COVS, operators: ops });
  const r = solve(core, { targets: [{ cov: '炎', at: 3 }], maxSize: 8, strict: true });
  assert.ok(r.solutions.length > 0);
  r.solutions.forEach(s => {
    assert.equal(s.state.tiers['炎'].level, 1, '炎应恰好在 3 档（不能到 6）');
    Object.keys(s.state.tiers).forEach(n => {
      if (n !== '炎') assert.equal(s.state.tiers[n].level, 0, n + ' 不该被点亮');
    });
  });
});

test('严格模式：附带点亮别的盟约时无解', () => {
  const ops = ['A','B','C'].map(n => op(n, ['炎', '精准']));
  const core = makeCore({ covenants: COVS, operators: ops });
  const loose = solve(core, { targets: [{ cov: '炎', at: 3 }], maxSize: 8 });
  const strict = solve(core, { targets: [{ cov: '炎', at: 3 }], maxSize: 8, strict: true });
  assert.ok(loose.solutions.length > 0);
  assert.equal(strict.solutions.length, 0);
});

test('变形同构体：只在差 1 人时补位', () => {
  const ops = [op('A', ['炎']), op('B', ['炎']), op('C', ['精准']), op('D', ['精准'])];
  const core = makeCore({ covenants: COVS, operators: ops });
  const r = solve(core, { targets: [{ cov: '炎', at: 3 }, { cov: '精准', at: 2 }], pivotBudget: 1, maxSize: 8, harmony: false });
  const s = r.solutions.find(x => x.size === 4 && Object.keys(x.pivots).length === 1);
  assert.ok(s, '1 名精准干员转职成炎，4 人即可满足 3 炎 + 2 精准');
  assert.equal(s.state.tiers['炎'].level, 1);
});
