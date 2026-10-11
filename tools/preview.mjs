/**
 * 面板预览生成器：把**真实的客户端 bundle** 在一个独立 HTML 页里渲染出来，
 * 用真实的本机聚合数据填充，方便截图评审 / 改 UI 时对照，不需要启动 DSH。
 *
 * 做法：不需要 React —— 页内用一个极小的 React 垫片（createElement/useState/useEffect…）
 * 把面板产出的元素树直接落成 DOM（面板全部用内联样式，所以视觉等价），
 * 再配合 DSH 的主题变量（--dsw-alias-*）模拟深浅色。
 *
 * 用法：
 *   node tools/preview.mjs                 # 生成 /tmp/dsh-panel-preview.html 并打印路径
 *   node tools/preview.mjs --open          # 生成后直接用默认浏览器打开
 *   node tools/preview.mjs --out x.html --width 1120
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const argv = process.argv.slice(2);
const argOf = (flag, fallback) => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const OUT = resolve(argOf('--out', '/tmp/dsh-panel-preview.html'));
const WIDTH = Number(argOf('--width', 1000));

/** 取真实数据：用假 ctx 跑一遍宿主半侧的 /summary 与 /balance */
async function collectData() {
  // 累计消费走 get_user_summary —— 预览里别打真网络，给一个与本机余额同量级的假值
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes('/api/v0/users/get_user_summary')) {
      return { ok: true, status: 200, json: async () => ({ data: { biz_data: { total_costs: [{ currency: 'CNY', amount: '38.6617931000000000' }] } } }) };
    }
    throw new Error(`preview: unexpected fetch ${url}`);
  };
  const mod = await import(new URL('../lib/index.js', import.meta.url).href);
  const routes = [];
  const fakeSettings = {
    register: () => ({
      get: () => ({
        dailyBudget: 50, alertAtPercent: 80, showBalance: true, officialOnly: true,
        apiKeyEnv: 'DEEPSEEK_API_KEY', refreshSeconds: 60, scanBudgetMs: 8000, historyDays: 30,
        skin: 'glass', autoUpdate: false,
        offPeak: { 'deepseek-flash': { cacheHit: 0.02, cacheMiss: 1, output: 4 }, 'deepseek-v4-pro': { cacheHit: 0.15, cacheMiss: 4.5, output: 13.5 } },
        peak: { 'deepseek-flash': { cacheHit: 0.04, cacheMiss: 2, output: 8 }, 'deepseek-v4-pro': { cacheHit: 0.3, cacheMiss: 9, output: 27 } },
      }),
      watch: () => () => {},
      update() {}, replace() {},
    }),
  };
  const ctx = {
    settings: fakeSettings,
    // 账号服务：用本机实测到的真实余额，让预览里的余额块是有数的
    deepseekAccount: {
      async getBalance() {
        return { status: 'ready', value: [{ currency: 'CNY', balance: '91.2898273800000000' }], bonusWallets: [{ currency: 'CNY', balance: '2.0588434400000000' }] };
      },
      async getPlatformSession() {
        return { origin: 'https://platform.deepseek.com', token: 'preview-session', requestHeaders: {} };
      },
    },
    webServer: { register: (spec) => { routes.push(spec); return () => {}; } },
    get(name) { return name === 'deepseekAccount' ? ctx.deepseekAccount : undefined; },
    logger: Object.assign(() => ({ info() {}, warn() {}, error() {}, debug() {} }), { info() {}, warn() {}, error() {}, debug() {} }),
    inject(names, cb) { const s = Object.create(this); s.effect = (fn) => { fn(); return { dispose() {} }; }; cb(s); return { dispose() {} }; },
    effect(cb) { cb(); return { dispose() {} }; },
  };
  await mod.apply(ctx, {});
  await new Promise((r) => setTimeout(r, 80));
  const call = async (path, url) => {
    const route = routes.find((r) => r.path.endsWith(path));
    let body = '';
    await route.handler({ method: 'GET', url }, { writeHead: () => {}, end: (b) => { body = b; } });
    return JSON.parse(body)?.data;
  };
  const summary = await call('/summary', '/token-meter-panel/summary?refresh=1');
  const balance = await call('/balance', '/token-meter-panel/balance?refresh=1&locale=zh-CN');
  globalThis.fetch = realFetch;
  return { summary, balance };
}

const { summary, balance } = await collectData();
const bundle = readFileSync(join(REPO, 'lib', 'client.js'), 'utf8');

const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>DSH Token 面板预览</title>
<style>
  :root {
    --dsw-alias-label-primary: #e6e9ef;
    --dsw-alias-label-secondary: #a9b1c1;
    --dsw-alias-label-tertiary: #7c8598;
    --dsw-alias-border-l1: rgba(255,255,255,.10);
    --dsw-alias-border-l2: rgba(255,255,255,.18);
    --dsw-alias-bg-layer-1: rgba(255,255,255,.045);
    --dsw-alias-bg-layer-2: rgba(47,125,255,.10);
    --dsw-alias-brand-primary: #2f7dff;
    --dsw-alias-state-success-primary: #3fb950;
    --dsw-alias-state-warn-primary: #e3b341;
    --dsw-alias-state-error-primary: #f85149;
    --dsw-alias-interactive-bg-hover: rgba(255,255,255,.08);
  }
  html, body { margin: 0; background: #0b0f19; color: #e6e9ef;
    font: 13px/1.5 -apple-system, "SF Pro Text", "PingFang SC", "Microsoft YaHei", sans-serif; }
  #stage { width: ${WIDTH}px; margin: 24px auto 40px; }
</style></head>
<body>
<div id="stage"></div>
<script>
// ---- 极小 React 垫片：面板只用 createElement / useState / useEffect / useRef / useMemo / useCallback ----
const React = {
  createElement(type, props, ...children) {
    return { type, props: props || {}, children: children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false) };
  },
  // 预览用：数据类状态（形如 {status, data}）直接换成真实 payload，其余原样；
  // 这样不需要真的跑 React 更新，就能把「有数据」的样子渲染出来。
  useState(init) {
    const value = typeof init === 'function' ? init() : init;
    if (value && typeof value === 'object' && 'status' in value && 'data' in value) {
      const summaryLike = value.status === 'loading' || value.status === 'failed';
      return [summaryLike
        ? { status: 'ready', data: DATA.summary, error: null, at: Date.now(), refresh: () => {} }
        : { status: 'ready', data: DATA.balance, reload: () => {} }, () => {}];
    }
    return [value, () => {}];
  },
  useEffect() {}, useLayoutEffect() {},
  useRef(v) { return { current: v }; },
  useMemo(fn) { return fn(); },
  useCallback(fn) { return fn; },
  Fragment: 'fragment',
};
function render(node, parent) {
  if (node === null || node === undefined || node === false) return;
  if (Array.isArray(node)) { node.forEach((n) => render(n, parent)); return; }
  if (typeof node === 'string' || typeof node === 'number') { parent.appendChild(document.createTextNode(String(node))); return; }
  const { type, props, children } = node;
  if (typeof type === 'function') { render(type(props), parent); return; }
  const el = document.createElement(type === 'fragment' ? 'div' : type);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === 'children' || v === null || v === undefined) continue;
    if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) { if (sv !== null && sv !== undefined) el.style[sk] = sv; } }
    else if (k === 'className') el.className = v;
    else if (k === 'key' || k === 'title') { if (k === 'title') el.title = v; }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (typeof v === 'boolean') { if (v) el.setAttribute(k, ''); }
    else el.setAttribute(k, v);
  }
  render(children, el);
  parent.appendChild(el);
}

// ---- DSH 模块加载器 + 假 ctx ----
const DATA = ${JSON.stringify({ summary, balance })};
let panelComponent = null;
let DICTS = { zh: {}, en: {} };
window.__ModuleLoader__ = { load(entry) { const mod = entry.factory((n) => (n === 'react' ? React : {})); mod.apply({
  slots: {
    inject: (key, cb) => cb(),
    register: (spec, component) => { if (spec.name === 'main') panelComponent = component; return () => {}; },
  },
  locale: { register: (ns, dict) => { DICTS = dict; return () => {}; } },
  effect: (cb) => { cb(); return () => {}; },
}); } };
</script>
<script>${bundle}</script>
<script>
const t = (k) => DICTS.zh[k] ?? k;
render(panelComponent({ t, useProjection: undefined }), document.getElementById('stage'));
</script>
</body></html>
`;

writeFileSync(OUT, html);
console.log(`preview written: ${OUT}`);
console.log(`  summary: ${summary?.calls ?? 0} calls / ¥${summary?.days?.[summary.today]?.cny ?? 0} today · balance ok=${Boolean(balance?.ok)}`);
if (argv.includes('--open')) {
  const { execFileSync } = await import('node:child_process');
  execFileSync('open', [OUT]);
  console.log('opened in the default browser');
}
