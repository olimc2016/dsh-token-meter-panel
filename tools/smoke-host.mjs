/**
 * 宿主半侧烟测：不启动 DSH，直接 import 插件模块，用一个假的 ctx 调用 apply()，
 * 检查：路由是否注册、schema 是否成立、聚合是否能出数、设置读写是否生效。
 * 需要能解析 @deepseek-ai/schemastery —— 本机解析不到时会退化成「无 schema」，仍可跑完。
 */
// 用相对本文件的路径，别写死任何人的机器路径；URL 本身就是合法的 import specifier
const target = new URL('../lib/index.js', import.meta.url).href;
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
        dailyBudget: 50, alertAtPercent: 80, showBalance: true, officialOnly: true,
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
  // 官方账号服务（桌面端账号登录）：余额走这里，不需要 API Key。
  // 返回形状与 @deepseek-ai/dsh-deepseek-account-platform 一致：
  //   { status: 'ready', value: normal_wallets(充值), bonusWallets: bonus_wallets(赠送) }
  deepseekAccount: {
    async getBalance(client) {
      settingStore.balanceClient = client;
      return {
        status: 'ready',
        value: [{ currency: 'CNY', balance: '12.34' }],
        bonusWallets: [{ currency: 'CNY', balance: '1.66' }],
      };
    },
  },
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

// ---- 余额路由：账号路径必须真的出数（这是桌面端默认形态） ----
// 回归点：早先只实现了 API Key 路径，账号登录的用户永远只看到「未配置凭据」。
const bal = routes.find((r) => r.path.endsWith('/balance'));
let smokeFailures = 0;
if (bal) {
  const call = async (url) => {
    let body = '', status = 0;
    const res = { writeHead: (s) => { status = s; }, end: (b) => { body = b; } };
    await bal.handler({ method: 'GET', url }, res);
    return { status, payload: JSON.parse(body)?.data };
  };

  const account = await call('/token-meter-panel/balance?locale=zh-CN&refresh=1');
  const info = account.payload?.balance_infos?.[0];
  const accountOk = account.payload?.ok === true
    && account.payload?.source === 'account'
    && info?.currency === 'CNY'
    && info?.topped_up_balance === '12.34'
    && info?.granted_balance === '1.66'
    && info?.total_balance === '14.00'; // 12.34 + 1.66：十进制字符串相加不能写成 13.999999999
  const clientOk = settingStore.balanceClient?.timezoneOffsetSeconds !== undefined
    && typeof settingStore.balanceClient?.version === 'string';
  console.log(`\nGET /token-meter-panel/balance (账号路径) -> ${account.status} ${JSON.stringify(account.payload)}`);
  console.log(`  ${accountOk ? 'PASS' : 'FAIL'} 账号余额映射（total=${info?.total_balance} 充值=${info?.topped_up_balance} 赠送=${info?.granted_balance}）`);
  console.log(`  ${clientOk ? 'PASS' : 'FAIL'} 传了官方平台要求的调用方元数据（version/locale/timezoneOffsetSeconds）`);
  if (!accountOk) smokeFailures += 1;
  if (!clientOk) smokeFailures += 1;

  // 回退路径：没有账号服务、也没有凭据时，应明确说明而不是抛错
  const routes2 = [];
  const ctx2 = {
    settings: {
      register: () => ({
        get: () => ({
          dailyBudget: 50, showBalance: true, apiKeyEnv: 'DEEPSEEK_API_KEY', officialOnly: true, refreshSeconds: 60,
          offPeak: { 'deepseek-flash': { cacheHit: 0.02, cacheMiss: 1, output: 4 }, 'deepseek-v4-pro': { cacheHit: 0.15, cacheMiss: 4.5, output: 13.5 } },
          peak: { 'deepseek-flash': { cacheHit: 0.04, cacheMiss: 2, output: 8 }, 'deepseek-v4-pro': { cacheHit: 0.3, cacheMiss: 9, output: 27 } },
        }),
        watch: () => () => {},
        update() {}, replace() {},
      }),
    },
    webServer: { register: (spec) => { routes2.push(spec); return () => {}; } },
    get: () => undefined,
    logger: Object.assign(() => ({ info() {}, warn() {}, error() {}, debug() {} }), { info() {}, warn() {}, error() {}, debug() {} }),
    inject(names, cb) { const s = Object.create(this); s.effect = (fn) => { fn(); return { dispose() {} }; }; cb(s); return { dispose() {} }; },
    effect(cb) { cb(); return { dispose() {} }; },
  };
  mod.apply(ctx2, {});
  await new Promise((resolve) => setTimeout(resolve, 30));
  const bal2 = routes2.find((r) => r.path.endsWith('/balance'));
  let body2 = '';
  await bal2.handler({ method: 'GET', url: '/token-meter-panel/balance' }, { writeHead: () => {}, end: (b) => { body2 = b; } });
  const fallback = JSON.parse(body2)?.data;
  const fallbackOk = fallback?.ok === false && fallback?.source === 'apikey' && /未配置凭据|账号未登录/.test(fallback?.error ?? '');
  console.log(`  ${fallbackOk ? 'PASS' : 'FAIL'} 无账号、无凭据时回退 API Key 并给出明确原因：${fallback?.error}`);
  if (!fallbackOk) smokeFailures += 1;
}

// 卸载：disposer 应把路由摘干净
for (const e of effects) e.dispose?.();
console.log(`\nafter dispose: routes=${routes.length} (expect 0)`);
console.log(smokeFailures === 0 ? 'HOST SMOKE OK' : `HOST SMOKE FAILED (${smokeFailures})`);
if (smokeFailures > 0) process.exit(1);
