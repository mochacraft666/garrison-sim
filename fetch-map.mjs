import fs from 'node:fs/promises';
const ct = JSON.parse(await fs.readFile('data/raw/character_table.json', 'utf8'));
const ops = JSON.parse(await fs.readFile('data/operators.json', 'utf8'));
const byName = {};
for (const [id, v] of Object.entries(ct)) {
  if (!v || typeof v !== 'object' || !v.name) continue;
  if (!byName[v.name]) byName[v.name] = id;
}
const map = {}, missing = [];
for (const o of ops) { if (byName[o.name]) map[o.name] = byName[o.name]; else missing.push(o.name); }
await fs.writeFile('data/raw/avatar-map.json', JSON.stringify(map, null, 1));
const ids = [...new Set(Object.values(map))];
await fs.writeFile('data/raw/ids.txt', ids.join('\n') + '\n');
console.log('匹配 ' + Object.keys(map).length + '/' + ops.length + ' 唯一charId ' + ids.length + (missing.length ? ' 缺失: ' + missing.join('、') : ''));
