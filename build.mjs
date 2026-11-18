import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const read = (p) => fs.readFile(path.join(ROOT, p), 'utf8');
const REPL = (tpl, key, val) => tpl.replace('/*__' + key + '__*/', () => val);

const [tpl, css, coreJs, solverJs, graphJs, uiJs] = await Promise.all([
  read('src/index.tpl.html'), read('src/styles.css'), read('src/core.js'),
  read('src/solver.js'), read('src/graph.js'), read('src/ui.js'),
]);
const covenants = JSON.parse(await read('data/covenants.json'));
const operators = JSON.parse(await read('data/operators.json'));
const meta = JSON.parse(await read('data/meta.json'));
let avatars = {};
try { avatars = JSON.parse(await read('data/avatars.json')); } catch (e) { avatars = {}; }
let icons = {};
try { icons = JSON.parse(await read('data/covenant-icons.json')); } catch (e) { icons = {}; }

// --public：分享版，不打包官方美术资源；头像改为运行时在线加载（包内只有 URL 映射）
const wantPublic = process.argv.includes('--public');
let art = null;
if (wantPublic) {
  avatars = {}; icons = {};
  let avatarIds = {};
  try { avatarIds = JSON.parse(await read('data/raw/avatar-map.json')); } catch (e) { avatarIds = {}; }
  art = {
    avatarIds: avatarIds,
    bases: [
      'https://cdn.jsdelivr.net/gh/yuanyan3060/ArknightsGameResource@main/avatar/',
      'https://raw.githubusercontent.com/yuanyan3060/ArknightsGameResource/main/avatar/'
    ]
  };
}

// ---- 断言 ----
const errs = [];
if (operators.length !== 143) errs.push('干员数量异常: ' + operators.length);
if (covenants.length !== 26) errs.push('盟约数量异常: ' + covenants.length);
const covNames = new Set(covenants.map(c => c.name));
for (const o of operators) {
  if (!o.covs.length) errs.push('干员无盟约: ' + o.name);
  for (const c of o.covs) if (!covNames.has(c)) errs.push('未知盟约 ' + c + ' @ ' + o.name);
}
for (const c of covenants) if (!c.tiers.length) errs.push('盟约无档位: ' + c.name);
const dup = operators.map(o => o.name).filter((n, i, a) => a.indexOf(n) !== i);
if (dup.length) errs.push('重名干员: ' + dup.join(','));
if (errs.length) { console.error('BUILD FAILED:\n - ' + errs.join('\n - ')); process.exit(1); }

const data = { meta: Object.assign({}, meta, { avatarCount: Object.keys(avatars).length, iconCount: Object.keys(icons).length }), covenants, operators, avatars, icons };
if (art) data.art = art;

let html = tpl;
const wantSelftest = process.argv.includes('--selftest');
html = REPL(html, 'STYLES', css);
html = REPL(html, 'DATA', JSON.stringify(data));
html = REPL(html, 'CORE', coreJs);
html = REPL(html, 'SOLVER', solverJs);
html = REPL(html, 'GRAPH', graphJs);
html = REPL(html, 'UI', uiJs);

if (/\/*__[A-Z]+__\*\//.test(html)) { console.error('模板占位符未全部替换'); process.exit(1); }

if (wantSelftest) {
  const selftest = await read('test/selftest.js');
  const errHook = '<scr' + 'ipt>window.__EARLY_ERRORS__=[];window.addEventListener("error",function(e){window.__EARLY_ERRORS__.push((e.message||"error")+" @"+(e.filename||"")+":"+(e.lineno||0));});</scr' + 'ipt>';
  html = html.replace('<body>', '<body>' + errHook);
  html = html.replace('</body>', '<scr' + 'ipt>\n' + selftest + '\n</scr' + 'ipt>\n</body>');
}

await fs.mkdir(path.join(ROOT, 'dist'), { recursive: true });
const outName = wantPublic ? '卫戍配队模拟器-分享版.html'
  : wantSelftest ? '卫戍配队模拟器-自检.html' : '卫戍配队模拟器.html';
await fs.writeFile(path.join(ROOT, 'dist', outName), html, 'utf8');
console.log('OK 干员 ' + operators.length + ' / 盟约 ' + covenants.length + ' / 头像 ' + Object.keys(avatars).length + (wantPublic ? '（分享版：不含美术资源）' : ''));
console.log('体积 ' + (Buffer.byteLength(html) / 1024).toFixed(1) + ' KB → dist/' + outName);
