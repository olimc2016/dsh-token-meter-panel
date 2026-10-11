/**
 * 建本地模块解析入口（跨平台，替代原先只有 Windows 才有的 tools/setup-modules.ps1）。
 *
 * 为什么需要：在仓库目录里直接开发/自检时，`import '@deepseek-ai/schemastery'`
 * 会从 <repo>/node_modules 往上找，而这个包只存在于**已安装的 DSH** 里
 * （profile 的 node_modules，或桌面端载荷）。这里把 profile 里那几个包链进本仓库，
 * 让 verify-rates / smoke-host 和 esbuild 构建在干净 checkout 里也能跑起来。
 *
 * Windows 用 junction（不需要管理员权限），POSIX 用普通目录符号链接。
 *
 * 用法：
 *   node tools/setup-modules.mjs
 *   DSH_PROFILE_DIR=~/.dsh/profiles/web node tools/setup-modules.mjs
 *   DSH_ESBUILD=~/somewhere/node_modules/esbuild node tools/setup-modules.mjs
 */
import { existsSync, lstatSync, mkdirSync, readlinkSync, symlinkSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nodeModules = join(repo, 'node_modules');
const linkType = process.platform === 'win32' ? 'junction' : 'dir';

const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh');
const profileDir = process.env.DSH_PROFILE_DIR
  || join(dshHome, 'profiles', process.env.DSH_PROFILE || 'desktop');

/** 需要的基座包 → 候选来源（按顺序找第一个存在的） */
const wanted = [
  ['@deepseek-ai/schemastery', [join(profileDir, 'node_modules', '@deepseek-ai', 'schemastery')]],
  ['@deepseek-ai/cosmokit', [join(profileDir, 'node_modules', '@deepseek-ai', 'cosmokit')]],
  // 官方家目录解析库（与整个 harness 共用同一套 $DSH_HOME/~/.dsh 规则）；
  // 缺失时插件会退回等价实现，不影响使用
  ['@deepseek-ai/dsh-home-paths', [join(profileDir, 'node_modules', '@deepseek-ai', 'dsh-home-paths')]],
  ['esbuild', [
    process.env.DSH_ESBUILD,
    join(repo, 'node_modules', 'esbuild'),
    join(process.env.APPDATA ?? '', 'npm', 'node_modules', 'esbuild'),
    '/usr/local/lib/node_modules/esbuild',
    '/opt/homebrew/lib/node_modules/esbuild',
  ].filter(Boolean)],
];

mkdirSync(nodeModules, { recursive: true });
const linked = [];
const missing = [];

for (const [name, candidates] of wanted) {
  const linkPath = join(nodeModules, ...name.split('/'));
  const existing = existsSync(linkPath) || (() => { try { lstatSync(linkPath); return true; } catch { return false; } })();

  // 已经是「指向本仓库外」的链接：先判断目标是否还有效
  if (existing) {
    let isLink = false;
    try { isLink = lstatSync(linkPath).isSymbolicLink(); } catch { /* ignore */ }
    if (!isLink) {
      linked.push([name, `已存在真实目录，跳过（${linkPath}）`]);
      continue;
    }
    const current = readlinkSync(linkPath);
    if (existsSync(resolve(dirname(linkPath), current))) {
      linked.push([name, `已链接 → ${current}`]);
      continue;
    }
    rmSync(linkPath, { recursive: true, force: true }); // 悬空链接
  }

  const target = candidates.find((c) => existsSync(c));
  if (!target) {
    missing.push([name, candidates]);
    continue;
  }
  mkdirSync(dirname(linkPath), { recursive: true });
  symlinkSync(target, linkPath, linkType);
  linked.push([name, `新链接 → ${target}`]);
}

console.log(`仓库: ${repo}`);
console.log(`profile: ${profileDir}\n`);
for (const [name, how] of linked) console.log(`  ok   ${name.padEnd(28)} ${how}`);
if (missing.length) {
  console.log('');
  for (const [name, candidates] of missing) {
    console.log(`  MISS ${name}（找过: ${candidates.join(' | ')}）`);
  }
  console.log('\n提示：schemastery/cosmokit 来自已安装的 DSH profile；esbuild 可用 `npm install --no-save esbuild` 或 `npm i -g esbuild` 装上后重跑本脚本。');
  console.log('缺失只会让「设置 schema 相关自检」和「重建 client bundle」跳过，不影响核心聚合逻辑。');
  console.log('注意：如果插件是以 `link:` 方式装进 profile（本地开发），profile 的 node_modules 里可能没有 schemastery');
  console.log('     （link 不会安装目标的依赖），此时 verify-rates 会失败 —— 把包解到本仓库 node_modules 即可。');
  console.log('     DSH 自己的 app.asar 里有这两个包（dsh/node_modules/@deepseek-ai/{schemastery,cosmokit}）。');
}
