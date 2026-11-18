import fs from 'node:fs/promises';
import path from 'node:path';

const PAGE = '卫戍协议·规程/PRTS盟约记录';
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) GarrisonSim/1.0' };
const API = 'https://prts.wiki/api.php';

async function get(url) {
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(url + ' -> ' + r.status);
  return r.text();
}
async function prtsSections() {
  const url = API + '?action=parse&page=' + encodeURIComponent(PAGE) + '&prop=sections&format=json';
  const j = JSON.parse(await get(url));
  return j.parse.sections;
}
async function prtsSection(idx) {
  const url = API + '?action=parse&page=' + encodeURIComponent(PAGE) + '&prop=wikitext&section=' + idx + '&format=json';
  const j = JSON.parse(await get(url));
  return j.parse.wikitext['*'];
}
function splitTop(s, sep) {
  const out = []; let cur = ''; let d1 = 0, d2 = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '{' && s[i+1] === '{') { d1++; cur += '{{'; i++; continue; }
    if (s[i] === '}' && s[i+1] === '}') { d1--; cur += '}}'; i++; continue; }
    if (s[i] === '[' && s[i+1] === '[') { d2++; cur += '[['; i++; continue; }
    if (s[i] === ']' && s[i+1] === ']') { d2--; cur += ']]'; i++; continue; }
    if (s[i] === sep && d1 === 0 && d2 === 0) { out.push(cur); cur = ''; continue; }
    cur += s[i];
  }
  out.push(cur); return out;
}
function parseTemplate(inner) {
  const parts = splitTop(inner, '|');
  const obj = { _name: parts[0].trim() };
  for (const p of parts.slice(1)) {
    const k = p.indexOf('=');
    if (k < 0) { (obj._pos ||= []).push(p.trim()); continue; }
    obj[p.slice(0, k).trim()] = p.slice(k + 1).trim();
  }
  return obj;
}
function extractTemplates(text, name) {
  const out = []; const tag = '{{' + name; let i = 0;
  while ((i = text.indexOf(tag, i)) >= 0) {
    let depth = 0, j = i;
    for (; j < text.length - 1; j++) {
      if (text[j] === '{' && text[j+1] === '{') { depth++; j++; continue; }
      if (text[j] === '}' && text[j+1] === '}') { depth--; j++; if (depth === 0) break; }
    }
    const inner = text.slice(i + 2, j - 1);
    out.push({ start: i, data: parseTemplate(inner) });
    i = j + 1;
  }
  return out;
}
function clean(s = '') {
  let t = s;
  for (let n = 0; n < 6; n++) t = t.replace(/\{\{color\|[^|]*\|([^{}]*)\}\}/g, '$1').replace(/\{\{(ruby|lang)\|([^{}|]*)(\|[^{}]*)?\}\}/g, '$2');
  t = t.replace(/<br\s*\/?>/g, '；').replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2').replace(/\[\[([^\]]*)\]\]/g, '$1');
  t = t.replace(/\{\{[^{}]*\}\}/g, '').replace(/'''?/g, '').replace(/&nbsp;/g, ' ');
  return t.replace(/\s+/g, ' ').trim();
}

const ROOT = process.cwd();
const RAW = path.join(ROOT, 'data', 'raw');
await fs.mkdir(RAW, { recursive: true });
await fs.mkdir(path.join(ROOT, 'data'), { recursive: true });

const log = [];
const secs = await prtsSections();
const byTitle = (kw) => secs.find(s => String(s.line).includes(kw));
const coreSec = byTitle('核心盟约'), extraSec = byTitle('附加盟约'), dbSec = byTitle('干员数据库');
if (!dbSec) throw new Error('section not found');
log.push('sections: ' + secs.map(s => s.index + ':' + s.line).join(' | '));

const sDb = await prtsSection(dbSec.index);
await fs.writeFile(path.join(RAW, 's8.txt'), sDb, 'utf8');

// tier markers
const tierMarks = [];
const reTier = /阶干员/g; let m;
while ((m = reTier.exec(sDb))) {
  const back = sDb.slice(Math.max(0, m.index - 80), m.index);
  const mm = back.match(/([ⅠⅡⅢⅣⅤⅥ])[^ⅠⅡⅢⅣⅤⅥ]*$/);
  if (mm) tierMarks.push({ pos: m.index, tier: mm[1] });
}
const tierNum = { 'Ⅰ':1,'Ⅱ':2,'Ⅲ':3,'Ⅳ':4,'Ⅴ':5,'Ⅵ':6 };

const tpls = extractTemplates(sDb, '卫戍协议/参战干员');
const ops = [];
for (const { start, data } of tpls) {
  const tier = [...tierMarks].reverse().find(x => x.pos < start)?.tier || '?';
  const covs = [data['盟约1'], data['盟约2'], data['盟约3']].map(clean).filter(Boolean);
  ops.push({
    name: clean(data['干员']),
    tier, tierNum: tierNum[tier] || 0,
    covs,
    traitType: clean(data['特质类型']),
    trait1: clean(data['特质1']),
    trait2: clean(data['特质2'] || ''),
  });
}

// covenants from community alliances.js (structured thresholds)
const allySrc = await get('https://raw.githubusercontent.com/wakingseasons/garrison-tool/main/alliances.js');
const aObj = JSON.parse(allySrc.slice(allySrc.indexOf('{'), allySrc.lastIndexOf('}') + 1));
const CORE = new Set(['炎','萨尔贡','维多利亚','谢拉格','阿戈尔','叙拉古','卡西米尔','乌萨斯','伊比利亚','莱塔尼亚']);
const COUNT_RULE = {
  '远见':'field+bench','奇迹':'field+bench','投资人':'field+bench',
  '绝技':'elite','调和':'harmony','独行':'solo','协防干员':'fallback','卡西米尔':'bench-right',
};
const covenants = Object.entries(aObj).map(([name, v], i) => {
  const tiers = (v.rules || []).filter(r => r.kind === 'members' && r.threshold != null)
    .map(r => ({ at: r.threshold, label: r.label, body: r.body }))
    .sort((a, b) => a.at - b.at);
  const layerGates = (v.rules || []).filter(r => r.kind === 'layers').map(r => ({ label: r.label, body: r.body }));
  const notes = (v.rules || []).filter(r => r.kind === 'note').map(r => r.body);
  return {
    id: 'c' + String(i + 1).padStart(2, '0'),
    name, kind: CORE.has(name) ? '核心' : '附加',
    thresholds: v.thresholds || tiers.map(t => t.at),
    tiers, layerGates, notes,
    countRule: COUNT_RULE[name] || 'field',
    source: v.source || '',
  };
});

// char table -> charId / class / rarity
const ctTxt = await get('https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData/master/zh_CN/gamedata/excel/character_table.json');
await fs.writeFile(path.join(RAW, 'character_table.json'), ctTxt, 'utf8');
const ct = JSON.parse(ctTxt);
const PROF = { PIONEER:'先锋', WARRIOR:'近卫', TANK:'重装', SNIPER:'狙击', CASTER:'术师', MEDIC:'医疗', SUPPORT:'辅助', SPECIAL:'特种', TOKEN:'召唤物', TRAP:'陷阱' };
const nameMap = new Map();
for (const [id, v] of Object.entries(ct)) {
  if (!v || !v.name) continue;
  const nm = v.name.trim();
  if (!nameMap.has(nm)) nameMap.set(nm, []);
  nameMap.get(nm).push({ id, profession: PROF[v.profession] || v.profession, rarity: v.rarity });
}
const missing = [];
for (const op of ops) {
  const hit = nameMap.get(op.name) || [];
  const best = hit.find(h => !/_2$/.test(h.id)) || hit[0];
  op.charId = best?.id || '';
  op.profession = best?.profession || '';
  op.rarity = best?.rarity ?? null;
  if (!best) missing.push(op.name);
}

const covNames = new Set(covenants.map(c => c.name));
const badCov = [...new Set(ops.flatMap(o => o.covs))].filter(c => !covNames.has(c));

const season = '规程·序列Ⅰ';
const out = { season, updatedAt: new Date().toISOString().slice(0, 10), source: 'PRTS + NGA解包/社区alliances.js', operators: ops, covenants };
await fs.writeFile(path.join(ROOT, 'data', 'operators.json'), JSON.stringify(ops, null, 1), 'utf8');
await fs.writeFile(path.join(ROOT, 'data', 'covenants.json'), JSON.stringify(covenants, null, 1), 'utf8');
await fs.writeFile(path.join(ROOT, 'data', 'meta.json'), JSON.stringify({ season, fetchedAt: out.updatedAt, counts: { ops: ops.length, covs: covenants.length } }, null, 1), 'utf8');

console.log(JSON.stringify({
  ops: ops.length, covs: covenants.length,
  tierDist: ops.reduce((a, o) => (a[o.tier] = (a[o.tier] || 0) + 1, a), {}),
  missingCharId: missing,
  badCov,
  noTrait2: ops.filter(o => !o.trait2).length,
  sample: ops.slice(0, 3),
  covSample: covenants.slice(0, 2),
}, null, 1));
