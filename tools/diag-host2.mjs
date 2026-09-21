/** 诊断：在 DSH 之外调用本插件宿主半侧，跑一次 /summary，打印官方取数的真实结果 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { apply } from '../lib/index.js';

const refs = {};
for (const m of readFileSync(join(process.env.USERPROFILE, '.dsh', '.credentials.yaml'), 'utf8')
  .matchAll(/^\s+([A-Z0-9_]+):\s*(\S+)\s*$/gm)) refs[m[1]] = m[2];
console.log('凭据：', Object.keys(refs).join(', '));
console.log('PLATFORM_TOKEN:', refs.DEEPSEEK_PLATFORM_TOKEN ? `${refs.DEEPSEEK_PLATFORM_TOKEN.slice(0, 6)}****（len ${refs.DEEPSEEK_PLATFORM_TOKEN.length}）` : '无');

const routes = new Map();
const ctx = {
  logger: Object.assign((...a) => console.log('[plugin]', ...a), { warn: (...a) => console.log('[plugin WARN]', ...a) }),
  get: (name) => (name === 'credentials' ? { resolve: async (ref) => (refs[ref] ? { value: refs[ref] } : null) } : undefined),
  inject: () => {},
  effect: (fn) => { try { fn(); } catch { /* ignore */ } return () => {}; },
  webServer: { register: ({ path, handler }) => { routes.set(path, handler); return () => {}; } },
};

apply(ctx, {});
await new Promise((r) => setTimeout(r, 500));
console.log('路由：', [...routes.keys()].join(', '));

const handler = routes.get('/token-meter-panel/summary');
let body = '';
const res = { writeHead() {}, end(chunk) { body = String(chunk); } };

async function hit(label, url) {
  body = '';
  const t0 = Date.now();
  await handler({ method: 'GET', url, headers: { host: '127.0.0.1:43120' } }, res);
  const ms = Date.now() - t0;
  const env = JSON.parse(body);
  const d = env.data ?? env;
  console.log(`\n[${label}] ${ms}ms  ok=${env.ok}`);
  console.log('  meterSource =', d.meterSource);
  console.log('  official    =', JSON.stringify(d.official)?.slice(0, 300));
  console.log('  今日 cny    =', d.days?.[d.today]?.cny, ' calls =', d.days?.[d.today]?.calls);
  return d;
}

await hit('第 1 次（冷）', '/token-meter-panel/summary');
for (const wait of [6000, 12000, 20000]) {
  await new Promise((r) => setTimeout(r, wait));
  await hit(`等 ${wait / 1000}s 后`, '/token-meter-panel/summary?refresh=1');
}
