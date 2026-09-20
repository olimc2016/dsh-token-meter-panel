/**
 * 构建浏览器半侧 bundle。
 *
 * DSH 的客户端模块系统要求产物是「惰性 CJS factory」包装：
 *   window.__ModuleLoader__.load({ id: "<包名>", factory: (require) => { ... return module.exports } })
 * 其中 require 只能解析外壳播种的基座模块（react / react-dom / @deepseek-ai/dsh-client-* 等），
 * 所以这些必须标记为 external，不能被打进 bundle。
 *
 * 用法：node tools/build-client.mjs [--watch]
 */
import { build, context } from 'esbuild';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const watch = process.argv.includes('--watch');

/** 外壳基座模块（PLATFORM_MODULES）：必须 external，否则运行期解析冲突 */
const external = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-locale',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-resources',
  '@deepseek-ai/dsh-client-ui-layout',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-renderer',
  '@deepseek-ai/dsh-client-ui-settings',
  '@deepseek-ai/dsh-client-ui-sidebar',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-session',
];

const options = {
  entryPoints: ['src/client/index.js'],
  outfile: 'lib/client.js',
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  external,
  sourcemap: true,
  legalComments: 'none',
  banner: {
    js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(pkg.name)}, factory: (require) => {\nvar module = { exports: {} }; var exports = module.exports;`,
  },
  footer: {
    js: 'return module.exports; } });',
  },
};

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('watching src/client/index.js → lib/client.js');
} else {
  const result = await build({ ...options, metafile: true });
  const out = result.metafile.outputs['lib/client.js'];
  console.log(`built lib/client.js: ${(out.bytes / 1024).toFixed(1)} KB (gzip ≈ ${(out.gzip ?? 0) / 1024 > 0 ? ((out.gzip ?? 0) / 1024).toFixed(1) + ' KB' : 'n/a'})`);
}
