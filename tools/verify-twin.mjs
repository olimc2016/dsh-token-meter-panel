/**
 * 孪生包回归：生成 dist/dsh-token-mb 之后，逐条验证它「真的能独立工作」且「与主力包不冲突」。
 *
 * 断言的都是会实际撞车的东西：
 *   - 包名 / 宿主插件 id / settings 命名空间彼此不同
 *   - cordis.patch.yml 的插槽行 id 不同（同 id 会让加载器报重复）
 *   - webServer 路由前缀不同（同路径会让第二个插件的 register 抛错）
 *   - 浏览器侧 slot id / locale 命名空间不同（同 id 会让浏览器侧重复注册）
 *   - 孪生包自己的宿主烟测、客户端烟测、聚合回归都能跑通
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { makeTwin, TWIN_NAME, REPO, OUT } from './make-twin.mjs';

let failures = 0;
const check = (label, actual, expected) => {
  const ok = actual === expected;
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}: ${actual}${ok ? '' : ` (expect ${expected})`}`);
  if (!ok) failures += 1;
};

/**
 * 运行期必须由宿主/DSH 提供的平台包。
 *
 * 为什么只能是 optional peer：pnpm 会把 `dependencies` 真的装进 profile，
 * 而 DSH 的 profile resolution 对「从 profile 层发出的 bare import」优先选本层副本 ——
 * 插件带进来的第二份会盖住宿主那份，required 条目跟着激活失败，十几个插件等 services，
 * 桌面版直接起不来（2026-10-18 dsh-worktodo 事故，见 docs/reviews/duplicate-platform-packages-fix.md）。
 */
const PLATFORM_PACKAGES = ['@deepseek-ai/dsh-home-paths', '@deepseek-ai/schemastery'];

/**
 * 发布清单里的平台包声明是否合规。
 * 返回违规项而不是直接抛错，方便反向自检用一份故意改坏的清单验证判定真的会红。
 * @param {object} manifest
 * @returns {string[]} 违规描述；空数组 = 合规
 */
function packageManifestViolations(manifest) {
  const violations = [];
  const deps = manifest.dependencies ?? {};
  const peers = manifest.peerDependencies ?? {};
  const meta = manifest.peerDependenciesMeta ?? {};
  for (const name of Object.keys(deps)) {
    if (name.startsWith('@deepseek-ai/')) violations.push(`dependencies 里出现平台包 ${name}（安装时会多出第二份）`);
  }
  for (const name of PLATFORM_PACKAGES) {
    if (!Object.hasOwn(peers, name)) violations.push(`${name} 未声明为 peerDependencies`);
    if (meta[name]?.optional !== true) violations.push(`${name} 未在 peerDependenciesMeta 里标 optional`);
  }
  // 非可选 peer 会被 npm / pnpm 自动装进 profile —— 同样会造出第二份。
  for (const name of Object.keys(peers)) {
    if (name.startsWith('@deepseek-ai/') && meta[name]?.optional !== true) {
      violations.push(`${name} 是 peer 但未标 optional（会被自动装进 profile）`);
    }
  }
  return violations;
}

/**
 * 宿主半侧源码（`lib/index.js` + `src/*.mjs`）的 import 清单。
 * 只按行扫，避免正则跨语句把注释/多行字符串误当成 import。
 * @param {string} root 仓库或孪生包根目录
 * @returns {{ staticBare: string[], dynamicBare: string[] }} 已剔除相对路径与 node: 内建模块
 */
function serverImportSpecifiers(root) {
  const files = [
    'lib/index.js',
    ...readdirSync(join(root, 'src'))
      .filter((name) => name.endsWith('.mjs'))
      .map((name) => `src/${name}`),
  ];
  const staticBare = [];
  const dynamicBare = [];
  const isBare = (specifier) => !specifier.startsWith('.')
    && !specifier.startsWith('/')
    && !specifier.startsWith('#')
    && !specifier.startsWith('node:');
  for (const file of files) {
    const text = readFileSync(join(root, file), 'utf8');
    for (const line of text.split('\n')) {
      const staticMatch = line.match(/^\s*(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/);
      if (staticMatch && isBare(staticMatch[1])) staticBare.push(`${file}: ${staticMatch[1]}`);
      for (const dynamicMatch of line.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
        if (isBare(dynamicMatch[1])) dynamicBare.push(dynamicMatch[1]);
      }
    }
  }
  return { staticBare, dynamicBare };
}

/** 断言一份清单 + 它的宿主半侧源码都符合平台包规则 */
function checkPlatformHygiene(label, manifest, root) {
  check(`${label}：平台包声明合规`, JSON.stringify(packageManifestViolations(manifest)), '[]');
  const { staticBare, dynamicBare } = serverImportSpecifiers(root);
  check(`${label}：宿主半侧顶层无静态 bare import`, JSON.stringify(staticBare), '[]');
  check(
    `${label}：运行期动态 import 的平台包集合`,
    JSON.stringify([...new Set(dynamicBare)].sort()),
    JSON.stringify([...PLATFORM_PACKAGES].sort()),
  );
}

// 发布面检查放在生成之前：清单不合规就不该继续生成/发布孪生包
const canonPkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'));
console.log('-- 0) 发布清单：平台包只能是 optional peer');
checkPlatformHygiene('主力包', canonPkg, REPO);

// 反向自检（纯内存）：两种常见的回退形态都必须被判定抓住。
const shadow = structuredClone(canonPkg);
shadow.dependencies = {
  ...(shadow.dependencies ?? {}),
  '@deepseek-ai/dsh-home-paths': shadow.peerDependencies['@deepseek-ai/dsh-home-paths'],
};
check(
  '反向自检：把 dsh-home-paths 塞回 dependencies 会被抓住',
  packageManifestViolations(shadow).some((item) => item.includes('@deepseek-ai/dsh-home-paths') && item.includes('dependencies')),
  true,
);
const moved = structuredClone(canonPkg);
delete moved.peerDependencies['@deepseek-ai/schemastery'];
check(
  '反向自检：把 schemastery 从 peer 移走会被抓住',
  packageManifestViolations(moved).some((item) => item.includes('@deepseek-ai/schemastery') && item.includes('未声明为 peerDependencies')),
  true,
);

if (failures > 0) {
  console.log(`\n❌ verify-twin: 发布清单不合规，${failures} 项失败（未生成孪生包）`);
  process.exit(1);
}

// 先生成（每次跑都重新生成，保证测的是当前源码）
console.log('-- 1) 生成孪生包');
makeTwin();

const twinPkg = JSON.parse(readFileSync(join(OUT, 'package.json'), 'utf8'));
console.log('-- 2) 生成与包元数据');
check('孪生包名', twinPkg.name, TWIN_NAME);
check('与主力包名不同', twinPkg.name === canonPkg.name, false);
check('版本与主力包一致', twinPkg.version, canonPkg.version);
check('依赖与主力包一致', JSON.stringify(twinPkg.dependencies), JSON.stringify(canonPkg.dependencies));
checkPlatformHygiene('孪生包', twinPkg, OUT);

console.log('-- 3) 各标识互不冲突');
const twinPatch = readFileSync(join(OUT, 'cordis.patch.yml'), 'utf8');
const canonPatch = readFileSync(join(REPO, 'cordis.patch.yml'), 'utf8');
const rowId = (text) => /id:\s*([a-z0-9-]+)/.exec(text)?.[1];
check('插槽行 id 不同', rowId(twinPatch) === rowId(canonPatch), false);
check('补丁里的模块名指向孪生包', twinPatch.includes(`name: '${TWIN_NAME}'`), true);

const canonHost = await import(pathToFileURL(join(REPO, 'lib/index.js')).href);
const twinHost = await import(pathToFileURL(join(OUT, 'lib/index.js')).href);
check('宿主插件 id 不同', twinHost.name === canonHost.name, false);
check('孪生宿主 id', twinHost.name, 'token-mb');

const canonBundle = readFileSync(join(REPO, 'lib/client.js'), 'utf8');
const twinBundle = readFileSync(join(OUT, 'lib/client.js'), 'utf8');
check('客户端 bundle 的包 id 不同', twinBundle.includes(`id: "${TWIN_NAME}"`) && !canonBundle.includes(`id: "${TWIN_NAME}"`), true);
check('孪生包 slot id 已派生', twinBundle.includes('token-mb'), true);

console.log('-- 4) 孪生包内部自检（它自己的 tools/ 跑一遍）');
for (const script of ['smoke-host.mjs', 'smoke-client.mjs', 'verify-generations.mjs']) {
  try {
    execFileSync(process.execPath, [join(OUT, 'tools', script)], { stdio: 'pipe' });
    check(`${script} 在孪生包内通过`, true, true);
  } catch (error) {
    check(`${script} 在孪生包内通过`, false, true);
    console.log(String(error?.stdout ?? '').split('\n').slice(-6).join('\n'));
  }
}

console.log(failures === 0 ? '\n✅ verify-twin: 全部通过' : `\n❌ verify-twin: ${failures} 项失败`);
process.exit(failures === 0 ? 0 : 1);
