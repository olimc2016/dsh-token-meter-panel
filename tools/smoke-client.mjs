/**
 * 客户端 bundle 烟测：在没有浏览器的环境里模拟 DSH 的模块加载器，
 * 验证 lib/client.js 能注册 factory、能实例化、apply() 会把两个 slot 注册进 ctx.slots。
 * 这能在安装/重启 DSH 之前抓出大部分格式与逻辑错误。
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8'));
const bundlePath = join(here, '..', 'lib', 'client.js');
const code = readFileSync(bundlePath, 'utf8');
// 包名派生的期望值：同一个仓库两个包名（dsh-token-meter-panel / dsh-token-mb）共用源码，
// 靠构建期注入的包名派生出各自的 slot id / locale 命名空间；主力包沿用历史 id `tokenmeter`。
const shortName = pkg.name.replace(/^dsh-/, '');
const expectedSlot = shortName === 'token-meter-panel' ? 'tokenmeter' : shortName;

let captured = null;
globalThis.window = {
  __ModuleLoader__: {
    load(entry) { captured = entry; },
  },
};

// 用 Function 执行 bundle（等价于浏览器加载 <script>）
// eslint-disable-next-line no-new-func
new Function(code)();

if (!captured) {
  console.error('FAIL: bundle 没有调用 window.__ModuleLoader__.load');
  process.exit(1);
}
console.log('registered id:', captured.id);
console.log('factory type:', typeof captured.factory);

// 模拟外壳的 require：只提供基座模块
const stubReact = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
  useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
  useEffect: () => {},
  useRef: (v) => ({ current: v }),
  useMemo: (fn) => fn(),
  useCallback: (fn) => fn,
};
const requireStub = (name) => {
  if (name === 'react') return stubReact;
  if (name === 'react/jsx-runtime') return { jsx: (t, p) => ({ type: t, props: p }), jsxs: (t, p) => ({ type: t, props: p }) };
  throw new Error(`unexpected require: ${name}`);
};

const mod = captured.factory(requireStub);
console.log('exports:', Object.keys(mod).join(', '));
console.log('inject:', JSON.stringify(mod.inject));

// 模拟 ctx.slots / ctx.locale / ctx.effect
const registrations = [];
const effects = [];
const locales = [];
const ctx = {
  slots: {
    inject(key, cb) { registrations.push({ kind: 'inject', key }); cb(); return () => {}; },
    register(spec, component) {
      registrations.push({ kind: 'register', spec, component });
      return () => {};
    },
  },
  locale: { register: (ns, dict) => { locales.push({ ns, keys: Object.keys(dict.zh ?? {}) }); return () => {}; } },
  effect(cb, label) { effects.push({ label, dispose: cb() }); return { dispose() {} }; },
};

mod.apply(ctx);
console.log('\nlocale namespaces:', JSON.stringify(locales));
console.log('effects:', effects.map((e) => e.label ?? '(none)').join(', '));
console.log('slot interactions:');
for (const r of registrations) {
  if (r.kind === 'inject') console.log(`  inject  ${r.key}`);
  else console.log(`  register name=${r.spec.name} id=${r.spec.id ?? '-'} key=${r.spec.key ?? '-'} component=${typeof r.component}`);
}

// 关键断言：
//  1) 侧栏入口与 main 面板的 id/key 必须同名，否则点侧栏图标选不中面板；
//  2) 两者都必须等于「包名派生出来的 slot id」，locale 命名空间同理 ——
//     这条保证孪生包（另一个包名）不会和主力包注册同一个 id / 同一个命名空间。
const panel = registrations.find((r) => r.kind === 'register' && r.spec.name === 'sidebar.panellist');
const main = registrations.find((r) => r.kind === 'register' && r.spec.name === 'main');
const sameKey = Boolean(panel && main && panel.spec.id === main.spec.key);
const idsOk = panel?.spec.id === expectedSlot && main?.spec.key === expectedSlot;
const bundleIdOk = captured.id === pkg.name;
const localeOk = locales.length === 1 && locales[0].ns === shortName;
console.log(`\npackage         : ${pkg.name}（期望 slot id = ${expectedSlot}）`);
console.log(`assert bundle id === package name -> ${bundleIdOk ? 'PASS' : 'FAIL'} (${captured.id})`);
console.log(`assert id(${panel?.spec.id}) === key(${main?.spec.key}) -> ${sameKey ? 'PASS' : 'FAIL'}`);
console.log(`assert slot id 派生正确 -> ${idsOk ? 'PASS' : 'FAIL'} (${panel?.spec.id})`);
console.log(`assert locale 命名空间独立 -> ${localeOk ? 'PASS' : 'FAIL'} (${locales.map((l) => l.ns).join(', ')})`);
if (!(sameKey && idsOk && bundleIdOk && localeOk)) process.exit(1);

// 顺带确认面板组件能渲染出一棵元素树（用假 React）
try {
  const tree = main.component({ t: (k) => k, useProjection: undefined });
  console.log('panel render root type:', typeof tree === 'object' ? tree.type : typeof tree);
  console.log('panel render children:', Array.isArray(tree.children) ? tree.children.length : 'n/a');
} catch (error) {
  console.log('panel first render (loading state) ->', String(error?.message ?? error));
}
console.log('\nCLIENT SMOKE OK');
