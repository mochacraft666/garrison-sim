/* 界面冒烟测试：连接已启动的 headless Edge（浏览器级 CDP + flatten session）
 * 覆盖：图谱渲染 / 缩放复位 / 切页 / 拖到删除区 / 选项页预览同源 / 一键求解严格模式
 * 用法：先启动 Edge（--remote-debugging-port=9555 --remote-allow-origins=*），再 node test/ui-smoke.mjs [port]
 */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const PORT = Number(process.argv[2] || process.env.UI_PORT || 9555);
const CHECKS = path.join(ROOT, 'test', 'ui-checks.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getJson(p) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path: p, timeout: 2000 }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
  });
}

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.errors = []; this.sessionId = null;
    ws.addEventListener('error', (ev) => this.errors.push('ws error: ' + (ev.message || 'unknown')));
    ws.addEventListener('close', (ev) => this.errors.push('ws closed: ' + ev.code));
    ws.addEventListener('message', async (ev) => {
      let raw = ev.data;
      if (typeof raw !== 'string') {
        if (raw instanceof ArrayBuffer) raw = Buffer.from(raw).toString('utf8');
        else if (raw && typeof raw.text === 'function') raw = await raw.text();
      }
      const msg = JSON.parse(raw);
      if (msg.id && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        clearTimeout(p.timer);
        if (msg.error) p.reject(new Error(msg.error.message)); else p.resolve(msg.result);
      } else if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        this.errors.push('exception: ' + ((d.exception && d.exception.description) || d.text));
      } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        this.errors.push('console.error: ' + msg.params.args.map((a) => (a.value !== undefined ? a.value : a.description)).join(' '));
      }
    });
  }
  send(method, params = {}, sessionId = this.sessionId) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('CDP 超时: ' + method));
      }, 20000);
      this.pending.set(id, { resolve, reject, timer });
      const msg = { id, method, params };
      if (sessionId) msg.sessionId = sessionId;
      this.ws.send(JSON.stringify(msg));
    });
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error((d.exception && d.exception.description) || d.text);
    }
    return r.result.value;
  }
}

let ws = null;
const out = { checks: {}, errors: [], shots: [], failed: [] };
try {
  const ver = await getJson('/json/version');
  ws = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('浏览器级 CDP 连接失败')); });
  const cdp = new CDP(ws);
  const { targetInfos } = await cdp.send('Target.getTargets');
  const page = targetInfos.find((t) => t.type === 'page' && /^file:/.test(t.url)) || targetInfos.find((t) => t.type === 'page');
  if (!page) throw new Error('找不到页面 target');
  out.page = page.url;
  const attach = await cdp.send('Target.attachToTarget', { targetId: page.targetId, flatten: true });
  cdp.sessionId = attach.sessionId;
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');

  let ready = false;
  for (let i = 0; i < 100; i++) {
    ready = await cdp.eval('!!window.__APP__ && document.querySelectorAll(".slot.filled").length > 0');
    if (ready) break;
    await sleep(150);
  }
  if (!ready) throw new Error('页面未就绪（__APP__ 或初始阵容缺失）');
  await sleep(900);

  const shot = async (name) => {
    const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(path.join(ROOT, name), Buffer.from(r.data, 'base64'));
    out.shots.push(name);
  };

  await cdp.eval(await fs.readFile(CHECKS, 'utf8'));

  const run = async (name, method) => {
    try { out.checks[name] = await cdp.eval('__UI_CHECKS__.' + method + '()'); }
    catch (e) { out.checks[name] = { error: e.message }; out.failed.push(name); }
  };

  await run('graph', 'graph');
  await shot('screenshots/e1-graph.png');
  await run('zoom', 'zoom');
  await shot('screenshots/e2-zoom.png');
  await run('tabs', 'tabs');
  await run('trash', 'trash');
  await shot('screenshots/e3-trash.png');
  await run('preview', 'previewOpen');
  await shot('screenshots/e4-options.png');
  await run('previewClose', 'previewClose');
  await run('solve', 'solveStrict');
  await shot('screenshots/e5-solve.png');

  out.errors = cdp.errors;
  try { await cdp.send('Browser.close', {}, null); } catch (e) {}
} catch (e) {
  out.fatal = e.message;
  out.failed.push('fatal');
} finally {
  try { if (ws) ws.close(); } catch (e) {}
  console.log(JSON.stringify(out, null, 2));
  const fatal = out.fatal || Object.values(out.checks).some((c) => c && c.error);
  process.exit(fatal ? 1 : 0);
}
