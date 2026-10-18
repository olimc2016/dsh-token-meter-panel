/**
 * 生成孪生包 `dist/dsh-token-mb/` —— 与主力包 `dsh-token-meter-panel` **代码完全相同**，
 * 只有包名和各类标识不同。
 *
 * 为什么必须换标识：两个包可能被同时装进一个 profile。重复的插槽行 id、重复的 webServer 路由、
 * 重复的 settings namespace、重复的浏览器侧 slot id / locale 命名空间，都会让加载器直接报错。
 * 所以：
 *   - 宿主半侧：`name` / `ROUTE_BASE` / settings 命名空间 / 升级 spec 全部由**包名**派生（lib/index.js）；
 *   - 浏览器半侧：slot id / 路由前缀 / locale 命名空间由构建期注入的包名派生（tools/build-client.mjs 的 define）；
 *   - 插槽行 id 在各自的 cordis.patch.yml 里写死（`token-meter-panel` / `token-meter-mb`）。
 *
 * 用法：
 *   node tools/make-twin.mjs          # 生成 dist/dsh-token-mb
 *   npm publish dist/dsh-token-mb     # 发布孪生包（npm 侧需为新包名绑一次 Trusted Publisher）
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const TWIN_NAME = 'dsh-token-mb';
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const OUT = join(REPO, 'dist', TWIN_NAME);

/** 会被复制进孪生包的条目（源码、产物、脚本、法务与文档） */
const COPY = ['src', 'lib', 'tools', 'README.md', 'README.en.md', 'CHANGELOG.md', 'LICENSE', 'THIRD-PARTY-NOTICES.md'];

/**
 * 生成（或重新生成）孪生包。
 * @returns {string} 生成目录的绝对路径
 */
export function makeTwin() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  for (const item of COPY) {
    const from = join(REPO, item);
    if (!existsSync(from)) continue;
    cpSync(from, join(OUT, item), { recursive: true });
  }

  // package.json：只改包名与描述（其余字段与主力包完全一致）
  const pkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'));
  pkg.name = TWIN_NAME;
  pkg.description = pkg.description.replace(
    '（社区插件，非官方）',
    `（社区插件，非官方；即 dsh-token-meter-panel 的短名孪生包，二者代码相同，可同时安装）`,
  );
  // 发布在 dist/dsh-token-mb 里执行 `npm publish` 时，npm 会先跑 prepublishOnly。
  // 孪生包不是「主力包」，在里面再跑一遍 npm test 会让 verify-twin 递归生成
  // dist/dsh-token-mb/dist/dsh-token-mb，并按主力包身份断言失败（4 项红），
  // 直接卡住发布。根目录发布仍保留 prepublishOnly；孪生包由根目录测试覆盖。
  delete pkg.scripts?.prepublishOnly;
  writeFileSync(join(OUT, 'package.json'), `${JSON.stringify(pkg, null, 4)}\n`);

  // 插槽补丁：行 id 与模块名都换成孪生包自己的
  const patch = readFileSync(join(REPO, 'cordis.patch.yml'), 'utf8')
    .replace(/id: token-meter-panel/g, 'id: token-meter-mb')
    .replace(/name: 'dsh-token-meter-panel'/g, `name: '${TWIN_NAME}'`);
  writeFileSync(join(OUT, 'cordis.patch.yml'), patch);

  // README 标题与首行说明也换掉，免得两个上架页看起来一模一样却没有区分
  for (const file of ['README.md', 'README.en.md']) {
    const path = join(OUT, file);
    if (!existsSync(path)) continue;
    const text = readFileSync(path, 'utf8')
      .replace('# dsh-token-meter-panel', `# ${TWIN_NAME}`)
      .replace(
        '[English](README.en.md) | 中文',
        '[English](README.en.md) | 中文\n\n> 本包与 [`dsh-token-meter-panel`](https://www.npmjs.com/package/dsh-token-meter-panel) **代码完全相同**，只是包名更短、标识独立 —— 两个包可以同时安装，互不冲突。',
      );
    writeFileSync(path, text);
  }

  // 浏览器半侧必须按孪生包的包名重建（构建期注入包名 → 派生 slot id 与路由前缀）
  execFileSync(process.execPath, ['tools/build-client.mjs'], { cwd: OUT, stdio: 'inherit' });
  return OUT;
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const dir = makeTwin();
  console.log(`\n孪生包已生成：${dir}`);
  console.log(`发布：npm publish ${dir}`);
  console.log(`（npm 侧需要为 ${TWIN_NAME} 这个新包名重新绑定一次 Trusted Publisher）`);
}

export { REPO, OUT, pathToFileURL };
