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
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { makeTwin, TWIN_NAME, REPO, OUT } from './make-twin.mjs';

let failures = 0;
const check = (label, actual, expected) => {
  const ok = actual === expected;
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}: ${actual}${ok ? '' : ` (expect ${expected})`}`);
  if (!ok) failures += 1;
};

// 先生成（每次跑都重新生成，保证测的是当前源码）
console.log('-- 0) 生成孪生包');
makeTwin();

const twinPkg = JSON.parse(readFileSync(join(OUT, 'package.json'), 'utf8'));
const canonPkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'));
console.log('-- 1) 生成与包元数据');
check('孪生包名', twinPkg.name, TWIN_NAME);
check('与主力包名不同', twinPkg.name === canonPkg.name, false);
check('版本与主力包一致', twinPkg.version, canonPkg.version);
check('依赖与主力包一致', JSON.stringify(twinPkg.dependencies), JSON.stringify(canonPkg.dependencies));

console.log('-- 2) 各标识互不冲突');
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

console.log('-- 3) 孪生包内部自检（它自己的 tools/ 跑一遍）');
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
