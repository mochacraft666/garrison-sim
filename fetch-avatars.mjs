import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const CT_URL = 'https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData/master/zh_CN/gamedata/excel/character_table.json';
const AVA = (id) => 'https://raw.githubusercontent.com/yuanyan3060/ArknightsGameResource/main/avatar/' + id + '.png';
const UA = { 'User-Agent': 'Mozilla/5.0 GarrisonSim/1.0' };

async function getBuf(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return Buffer.from(await r.arrayBuffer());
    } catch (e) {
      if (i === tries - 1) throw e;
      await new Promise(r => setTimeout(r, 400 * (i + 1)));
    }
  }
}

await fs.mkdir(path.join(ROOT, 'data/raw/avatars'), { recursive: true });
const ctPath = path.join(ROOT, 'data/raw/character_table.json');
let ctRaw;
try { ctRaw = await fs.readFile(ctPath, 'utf8'); console.log('character_table 已缓存'); }
catch { console.log('下载 character_table…'); ctRaw = (await getBuf(CT_URL)).toString('utf8'); await fs.writeFile(ctPath, ctRaw); }
const ct = JSON.parse(ctRaw);

const ops = JSON.parse(await fs.readFile(path.join(ROOT, 'data/operators.json'), 'utf8'));
const byName = {};
for (const [id, v] of Object.entries(ct)) {
  if (!v || typeof v !== 'object' || !v.name) continue;
  if (v.isNotObtainable) {}
  if (!byName[v.name]) byName[v.name] = id;
}
const map = {}, missing = [];
for (const o of ops) {
  if (byName[o.name]) map[o.name] = byName[o.name];
  else missing.push(o.name);
}
console.log('匹配 ' + Object.keys(map).length + '/' + ops.length + (missing.length ? '，缺失: ' + missing.join('、') : ''));

const ids = [...new Set(Object.values(map))];
let ok = 0, fail = [];
let idx = 0;
const workers = Array.from({ length: 6 }, async () => {
  while (idx < ids.length) {
    const id = ids[idx++];
    const f = path.join(ROOT, 'data/raw/avatars', id + '.png');
    try { await fs.access(f); ok++; continue; } catch {}
    try { const b = await getBuf(AVA(id)); await fs.writeFile(f, b); ok++; }
    catch (e) { fail.push(id + ':' + e.message); }
  }
});
await Promise.all(workers);
await fs.writeFile(path.join(ROOT, 'data/raw/avatar-map.json'), JSON.stringify(map, null, 1));
console.log('头像下载完成 ' + ok + '/' + ids.length + (fail.length ? '，失败 ' + fail.length + ': ' + fail.slice(0, 5).join(', ') : ''));
