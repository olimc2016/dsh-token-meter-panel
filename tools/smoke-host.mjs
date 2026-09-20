/**
 * 宿主半侧烟测：不启动 DSH，直接 import 插件模块，用一个假的 ctx 调用 apply()，
 * 检查：路由是否注册、schema 是否成立、聚合是否能出数、设置读写是否生效。
 * 需要能解析 @deepseek-ai/schemastery —— 见 tools/run-smoke.ps1 的 NODE_PATH。
 */
import { pathToFileURL } from 'node:url';

const target = pathToFileURL('F:/DSH/tools/token-meter-plugin/lib/index.js').href;

let mod;
try {
  mod = await import(target);
} catch (error) {
  console.error('IMPORT FAILED:', error.message);
  process.exit(1);
}
console.log('exports:', Object.keys(mod).join(', '));
console.log('name:', mod.name);
console.log('inject:', JSON.stringify(mod.inject));
console.log('Config schema present:', typeof mod.Config === 'object' && mod.Config !== null);

const routes = [];
const effects = [];
const logs = [];
const settingStore = { registered: null, watchers: [] };
const fakeSettings = {
  register(ns, schema, opts) {
    settingStore.registered = { ns, schema, opts };
    return {
      get: () => ({
        dailyBudget: 50, alertAtPercent: 80, showBalance: false, officialOnly: true,
        apiKeyEnv: 'DEEPSEEK_API_KEY', refreshSeconds: 60,
        offPeak: { 'deepseek-flash': { cacheHit: 0.02, cacheMiss: 1, output: 4 }, 'deepseek-v4-pro': { cacheHit: 0.15, cacheMiss: 4.5, output: 13.5 } },
        peak: { 'deepseek-flash': { cacheHit: 0.04, cacheMiss: 2, output: 8 }, 'deepseek-v4-pro': { cacheHit: 0.3, cacheMiss: 9, output: 27 } },
      }),
      watch(cb) { settingStore.watchers.push(cb); return () => { settingStore.watchers.length = 0; }; },
      update() {}, replace() {},
    };
  },
};
const ctx = {
  settings: fakeSettings,
  webServer: {
    register(spec) {
      routes.push(spec);
      return () => { const i = routes.indexOf(spec); if (i >= 0) routes.splice(i, 1); };
    },
  },
  get(name) { return name === 'credentials' ? undefined : ctx[name]; },
  logger: Object.assign((name) => ({ info: (m) => logs.push(['info', name ? `[${name}] ${m}` : m]), warn: (m) => logs.push(['warn', m]), error: (m) => logs.push(['error', m]), debug: () => {} }), {
    info: (m) => logs.push(['info', m]),
    warn: (m) => logs.push(['warn', m]),
    error: (m) => logs.push(['error', m]),
    debug: () => {},
  }),
  // Cordis 的 ctx.inject(names, cb) 是反应式依赖：服务就绪后回调执行，服务消失则子 fiber 卸载。
  // 这里服务已在位，因此同步触发回调并收集它注册的 effect。
  inject(names, callback) {
    const scoped = Object.create(this);
    scoped.effect = (cb, label) => { effects.push({ label, dispose: cb() }); return { dispose() {} }; };
    callback(scoped);
    return { dispose() {} };
  },
  effect(cb, label) { effects.push({ label, dispose: cb() }); return { dispose() {} }; },
};

mod.apply(ctx, {});
// 设置 namespace 的注册要等 schemastery 动态导入完成，让出一个 tick 再看结果
await new Promise((resolve) => setTimeout(resolve, 50));
console.log('\n--- registered routes ---');
for (const r of routes) console.log(`  ${r.kind} ${r.path}`);
console.log('--- effects ---');
for (const e of effects) console.log(`  ${e.label ?? '(unlabeled)'} -> disposer=${typeof e.dispose}`);
console.log('--- settings namespace ---', settingStore.registered?.ns, 'base=', JSON.stringify(settingStore.registered?.opts));
console.log('--- logs ---');
for (const [lvl, m] of logs) console.log(`  ${lvl}: ${m}`);

// 打一次真实路由：/token-meter-panel/health
const health = routes.find((r) => r.path.endsWith('/health'));
if (health) {
  let body = '', status = 0;
  const res = { writeHead: (s) => { status = s; }, end: (b) => { body = b; } };
  await health.handler({ method: 'GET', url: '/token-meter-panel/health' }, res);
  console.log(`\nGET /token-meter-panel/health -> ${status}`);
  console.log(body.slice(0, 400));
}

// 打一次真实路由：/token-meter-panel/summary（真扫会话目录）
const sum = routes.find((r) => r.path.endsWith('/summary'));
if (sum) {
  const t0 = Date.now();
  let body = '', status = 0;
  const res = { writeHead: (s) => { status = s; }, end: (b) => { body = b; } };
  await sum.handler({ method: 'GET', url: '/token-meter-panel/summary?refresh=1' }, res);
  const parsed = JSON.parse(body);
  console.log(`\nGET /token-meter-panel/summary -> ${status} in ${Date.now() - t0}ms`);
  if (parsed.ok) {
    const d = parsed.data;
    console.log(`  files=${d.filesScanned} calls=${d.calls} days=${Object.keys(d.days).length} sessions=${Object.keys(d.sessions).length} elapsed=${d.elapsedMs}ms today=${d.today} peakNow=${d.peakNow}`);
    console.log(`  today bucket: ${JSON.stringify(d.days[d.today] ?? null).slice(0, 220)}`);
  } else {
    console.log('  error:', parsed.error);
  }
}

// 余额路由（未配置凭据时应优雅返回）
const bal = routes.find((r) => r.path.endsWith('/balance'));
if (bal) {
  let body = '';
  const res = { writeHead: () => {}, end: (b) => { body = b; } };
  await bal.handler({ method: 'GET', url: '/token-meter-panel/balance' }, res);
  console.log(`\nGET /token-meter-panel/balance -> ${body.slice(0, 260)}`);
}

// 卸载：disposer 应把路由摘干净
for (const e of effects) e.dispose?.();
console.log(`\nafter dispose: routes=${routes.length} (expect 0)`);
