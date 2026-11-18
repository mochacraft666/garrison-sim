import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { makeCore } = require('../src/core.js');

const COVS = [
  { id:'c1', name:'炎', kind:'核心', thresholds:[3,6], tiers:[{at:3,label:'3炎',body:'x'},{at:6,label:'6炎',body:'y'}], layerGates:[], notes:[], countRule:'field' },
  { id:'c2', name:'萨尔贡', kind:'核心', thresholds:[3,6], tiers:[{at:3,label:'3萨',body:'x'},{at:6,label:'6萨',body:'y'}], layerGates:[], notes:[], countRule:'field' },
  { id:'c3', name:'精准', kind:'附加', thresholds:[2,3], tiers:[{at:2,label:'2精准',body:'x'},{at:3,label:'3精准',body:'y'}], layerGates:[], notes:[], countRule:'field' },
  { id:'c4', name:'调和', kind:'附加', thresholds:[1], tiers:[{at:1,label:'1调和',body:'x'}], layerGates:[], notes:[], countRule:'harmony' },
  { id:'c5', name:'独行', kind:'附加', thresholds:[1], tiers:[{at:1,label:'1独行',body:'x'}], layerGates:[], notes:[], countRule:'solo' },
  { id:'c6', name:'远见', kind:'附加', thresholds:[2], tiers:[{at:2,label:'2远见',body:'x'}], layerGates:[], notes:[], countRule:'field+bench' },
  { id:'c7', name:'绝技', kind:'附加', thresholds:[2,5], tiers:[{at:2,label:'2精锐',body:'x'},{at:5,label:'5精锐',body:'y'}], layerGates:[], notes:[], countRule:'elite' },
];
const op = (name, covs, t1, t2) => ({ name, tier:'Ⅰ', tierNum:1, covs, traitType:'持续叠加', trait1:t1||'', trait2:t2||'' });
const OPS = [
  op('A',['炎'],'<战斗中>每次开启技能时使已激活的【炎】层数+1（每回合至多叠加2层）','<战斗中>每次开启技能时使已激活的【炎】层数+2（每回合至多叠加4层）'),
  op('B',['炎']), op('C',['炎']), op('D',['炎']), op('E',['炎']), op('F',['炎']),
  op('G',['调和']), op('H',['独行']), op('I',['独行']),
  op('J',['远见']), op('K',['远见']),
  op('L',['绝技']), op('M',['绝技']),
  op('N',['精准']), op('O',['精准']),
];
const core = makeCore({ covenants: COVS, operators: OPS });
const names = (n) => n;

test('3 炎点亮一档，6 炎点亮两档', () => {
  let s = core.compute({ field: ['A','B','C'] });
  assert.equal(s.tiers['炎'].count, 3);
  assert.equal(s.tiers['炎'].level, 1);
  s = core.compute({ field: ['A','B','C','D','E','F'] });
  assert.equal(s.tiers['炎'].level, 2);
});

test('调和使核心盟约人数 +1', () => {
  const s = core.compute({ field: ['A','B','G'] });
  assert.equal(s.tiers['炎'].count, 3);
  assert.equal(s.tiers['炎'].level, 1);
});

test('独行 ≥2 人时失效并告警', () => {
  const s = core.compute({ field: ['H','I'] });
  assert.equal(s.tiers['独行'].level, 0);
  assert.ok(s.warnings.some(w => w.includes('独行')));
  const s1 = core.compute({ field: ['H'] });
  assert.equal(s1.tiers['独行'].level, 1);
});

test('远见统计整备区', () => {
  const s = core.compute({ field: ['J'], bench: ['K'] });
  assert.equal(s.tiers['远见'].count, 2);
  assert.equal(s.tiers['远见'].level, 1);
});

test('绝技只统计精锐状态的干员', () => {
  let s = core.compute({ field: ['L','M'] });
  assert.equal(s.tiers['绝技'].count, 0);
  s = core.compute({ field: ['L','M'], elite: ['L'] });
  assert.equal(s.tiers['绝技'].count, 1);
  assert.equal(s.tiers['绝技'].level, 0);
  s = core.compute({ field: ['L','M'], elite: ['L','M'] });
  assert.equal(s.tiers['绝技'].level, 1);
});

test('层数增速只在盟约点亮后生效，精锐使用第二档特质', () => {
  let s = core.compute({ field: ['A','B'] });          // 炎 2 人未点亮
  assert.equal(s.rates['炎'].perRound, 0);
  s = core.compute({ field: ['A','B','C'] });          // 3 人点亮
  assert.equal(s.rates['炎'].perRound, 2);
  s = core.compute({ field: ['A','B','C'], elite: ['A'] });
  assert.equal(s.rates['炎'].perRound, 4);
});

test('单次叠加计入 oneShot', () => {
  const one = makeCore({ covenants: COVS, operators: [op('P',['精准'],'<获得时>【精准】层数+2'), op('Q',['精准'],'<获得时>【精准】层数+2'), op('R',['炎'],''), op('S',['炎'],''), op('T',['炎'],'')] });
  const s = one.compute({ field: ['P','Q','R','S','T'] });
  assert.equal(s.rates['精准'].oneShot, 4);
  assert.equal(s.totalRate, 0, '获得时类效果不计入每回合叠层');
});

test('人数去重：同名干员只算一次', () => {
  const s = core.compute({ field: ['A','A','B','C'] });
  assert.equal(s.tiers['炎'].count, 3);
});

test('BAN 掉的盟约不计入点亮', () => {
  const s = core.compute({ field: ['A','B','C'], bans: ['炎'] });
  assert.equal(s.tiers['炎'].active, false);
  assert.equal(s.litCount, 0);
});

test('整备区同名干员只算一次（远见）', () => {
  const s = core.compute({ field: ['J','K'], bench: ['J'] });
  assert.equal(s.tiers['远见'].count, 2);
});

test('协防干员：被 BAN 阵营的干员作为兜底计入', () => {
  const covs = COVS.concat([{ id:'c9', name:'协防干员', kind:'附加', thresholds:[2], tiers:[{at:2,label:'2协防',body:'x'}], layerGates:[], notes:[], countRule:'fallback' }]);
  const local = makeCore({ covenants: covs, operators: OPS });
  const s = local.compute({ field: ['A','B'], bans: ['炎'] });
  assert.equal(s.tiers['协防干员'].count, 2);
  assert.equal(s.tiers['协防干员'].level, 1);
  const none = local.compute({ field: ['A','B'] });
  assert.equal(none.tiers['协防干员'].count, 0);
});

test('调和被 BAN 时不再给核心盟约 +1', () => {
  const s = core.compute({ field: ['A','B','G'], bans: ['调和'] });
  assert.equal(s.tiers['炎'].count, 2);
  assert.equal(s.tiers['炎'].level, 0);
});

test('卡西米尔 6 档：整备区最右侧不是卡西米尔时给出告警', () => {
  const K = (n) => op(n, ['卡西米尔']);
  const kas = makeCore({
    covenants: COVS.concat([{ id:'k', name:'卡西米尔', kind:'核心', thresholds:[3,6], tiers:[{at:3,label:'3卡',body:'x'},{at:6,label:'6卡',body:'y'}], layerGates:[], notes:[], countRule:'bench-right' }]),
    operators: [K('K1'),K('K2'),K('K3'),K('K4'),K('K5'),K('K6'), op('Z',['精准'])]
  });
  let s = kas.compute({ field: ['K1','K2','K3','K4','K5','K6'] });
  assert.equal(s.tiers['卡西米尔'].level, 2);
  assert.ok(s.warnings.some(w => w.includes('卡西米尔')));
  s = kas.compute({ field: ['K1','K2','K3','K4','K5','K6'], bench: ['Z','K1'] });
  assert.ok(!s.warnings.some(w => w.includes('卡西米尔')));
});
