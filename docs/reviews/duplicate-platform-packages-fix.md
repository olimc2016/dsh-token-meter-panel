# 重复平台包隐患：审计、修复与 profile 模拟

- 日期：2026-10-18
- 仓库：`~/Documents/deepseek-harness/default-workspace/dsh-token-meter-panel`
- 基线：HEAD `f9a9aa2`；版本保持 `0.6.6`，**未改 CHANGELOG 的版本段、未发版、未 push、未打 tag**
- 同源事故：`~/Documents/deepseek-harness/default-workspace/dsh-worktodo/docs/reviews/duplicate-platform-packages.md`
- 规范依据：`~/Documents/deepseek-harness/default-workspace/dsh-worktodo/docs/process/development-standard.md` §2.7

## 1. 结论

**问题成立，已修。** 本仓库发布名是 `dsh-token-mb`（`npm run twin` 生成）；改前它的
`package.json` 把两个宿主平台包放在 `dependencies` 里：

| 包 | 改前声明 | 是否宿主提供 | 判断依据 |
|---|---|---|---|
| `@deepseek-ai/dsh-home-paths` | `dependencies: ^0.2.0-rc.2` | **是** | `~/.dsh/profiles/desktop/node_modules/@deepseek-ai/dsh-home-paths` 已存在；`lib/index.js:420` 动态 import 它，失败有等价实现兜底 |
| `@deepseek-ai/schemastery` | `dependencies: ^3.18.2` | **是** | `~/.dsh/profiles/desktop/node_modules/@deepseek-ai/schemastery` 已存在（0.2.x 宿主用它做设置 schema）；`lib/index.js:326` 动态 import 它 |
| `@deepseek-ai/cordis` | `peerDependencies: ^4.0.2`，**未标 optional** | **是** | 非可选 peer 会被 npm / pnpm 自动装进 profile，同样可能多出一份；本轮一并改成 optional |
| `@deepseek-ai/dsh-settings` | optional peer | 是 | 原本就合规 |
| `@deepseek-ai/dsh-host-webserver` | optional peer | 是 | 原本就合规 |

**源码 import 形态本来是对的**，不需要改代码：

- `lib/index.js:326`：`const { default: z } = await import('@deepseek-ai/schemastery')`，在
  `loadConfigSchema()` 的 `try` 里；失败返回 `null`（`lib/index.js` 的 `configSchema().then` 里
  `if (!Schema) return;`，设置注册直接跳过）。
- `lib/index.js:420`：`const official = await import('@deepseek-ai/dsh-home-paths')`，在
  `resolveSessionsRoot()` 的 `try` 里；失败回落到 `$DSH_HOME` / `~/.dsh` 的等价实现。
- 服务端入口 `lib/index.js` 顶层只静态 import `node:` 内建和本地 `../src/core.mjs`；
  `src/core.mjs` / `src/zstd.mjs` / `src/chrome-storage.mjs` 顶层也只有 `node:` 与本地模块。
  **没有任何平台包的顶层静态 import。**
- `src/client/index.js` 的 `import React from 'react'` 是浏览器半侧，由构建 external 处理
  （`tools/build-client.mjs` 的 `external` 列表），不属于服务端加载链。
- 其它 `dependencies`：改前只有上面两个 `@deepseek-ai/*`，改后为 **空**。`tools/` 里的
  `classic-level` 是开发诊断脚本的 import，不在 `files` 白名单、不随包发布，也不进入 profile。

因此本轮真正的缺陷是**发布清单**：两个平台包会作为实体依赖被装进 profile，其中
`dsh-home-paths ^0.2.0-rc.2` 在宿主已升到 0.2.1 时仍会锁到 0.2.0，形成第二份并抢在宿主前面解析。

## 2. 改动

### 2.1 `package.json`

| 项 | 改前 | 改后 |
|---|---|---|
| `dependencies` | `dsh-home-paths ^0.2.0-rc.2`、`schemastery ^3.18.2` | `{}` |
| `peerDependencies` | 三个（cordis / settings / host-webserver） | 五个：新增 `dsh-home-paths ^0.2.0-rc.2`、`schemastery ^3.18.2` |
| `peerDependenciesMeta` | settings / host-webserver optional | 五个全部 `optional: true`（含 cordis、两个平台包） |
| `devDependencies` | `esbuild ^0.28.2` | 新增 `@deepseek-ai/dsh-home-paths 0.2.0-rc.2`、`@deepseek-ai/schemastery 3.18.4`，其余不变 |

为什么 devDependencies 要同时加：干净 checkout 里 `pnpm install` 只装 devDependencies 时，
`verify-rates` / `smoke-host` / `verify-twin` 仍要能解析这两个包；只写成 peer 时它们不会被装。
版本取宿主当前实际提供的精确版本（0.2.0-rc.2 / 3.18.4），peer 范围沿用原声明。

### 2.2 源码

无需改动。现有动态 import + 失败降级已经满足「平台包缺失只降级本插件」；本轮用测试把
这个形态钉死，防止以后有人改回顶层静态 import。

### 2.3 lockfile

本仓库**从来没有** `pnpm-lock.yaml` / `package-lock.json`（`git log --all -- pnpm-lock.yaml`
为空；`.github/workflows/test.yml` 明确写了「仓库没有 lockfile」，CI 用
`npm install --ignore-scripts`）。因此没有可同步的 lockfile，本轮**没有新增** lockfile；
`pnpm pack` / 干净 `pnpm install --ignore-scripts` 均能通过（见 §5）。

## 3. 防线（加在既有 `tools/verify-twin.mjs`，不新增脚本）

`tools/verify-twin.mjs` 是 `npm test` 的最后一项，本来就负责发布面；在它开头新增
「-- 0) 发布清单」段（行 32–131），在生成孪生包之前先跑：

1. `dependencies` 里不得出现任何 `@deepseek-ai/*`；
2. `dsh-home-paths` / `schemastery` 必须同时出现在 `peerDependencies` 且
   `peerDependenciesMeta.<name>.optional === true`；
3. **所有** `@deepseek-ai/*` peer 都必须 optional（覆盖 cordis 这种「非可选 peer 被自动安装」）；
4. 扫 `lib/index.js` + `src/*.mjs`：顶层不得静态 import 任何 bare 包；
5. 运行期动态 import 的 bare 包集合必须恰好等于 `['@deepseek-ai/dsh-home-paths',
   '@deepseek-ai/schemastery']`；
6. 对主力包和生成的孪生包各跑一遍 1–5；
7. 内置反向自检：把 `dsh-home-paths` 塞回 `dependencies`、把 `schemastery` 从 peer 移走，
   校验器都必须返回违规。

清单不合规时在生成孪生包之前就 `exit 1`，避免「先产出一个坏包再报错」。

### 3.1 反向自检实跑（真改文件，非只调函数）

把 `@deepseek-ai/dsh-home-paths` 真的塞回 `package.json.dependencies`（保留 optional peer），
实跑 `node tools/verify-twin.mjs`：

```
-- 0) 发布清单：平台包只能是 optional peer
  FAIL 主力包：平台包声明合规: ["dependencies 里出现平台包 @deepseek-ai/dsh-home-paths（安装时会多出第二份）"] (expect [])

❌ verify-twin: 发布清单不合规，1 项失败（未生成孪生包）
EXIT=1
```

恢复后重跑，全套通过（见 §5）。这证明断言不是只对内存副本生效的「假测试」。

## 4. profile 模拟

### 4.1 环境

用真实 tarball + 真实 pnpm 11.7.0，模拟 DSH 的两层解析：

```
/tmp/tm-sim/
  profiles/                         # 宿主安装层（顶层平台包）
    package.json                    # @deepseek-ai/dsh-home-paths 0.2.1-rc.2
    node_modules/@deepseek-ai/...   # schemastery 3.18.5
    desktop/                        # 修好后的 tarball
      package.json                  # 只依赖 dsh-token-mb 的 tarball
      node_modules/dsh-token-mb/
    desktop-bad/                    # 反向样本：HEAD 清单的 tarball（name 改成 dsh-token-mb-bad）
```

- tarball：`cd dist/dsh-token-mb && pnpm pack` → `dsh-token-mb-0.6.6.tgz`
- 宿主层：`pnpm add @deepseek-ai/dsh-home-paths@0.2.1-rc.2 @deepseek-ai/schemastery@3.18.5`
  （模拟「宿主已升级、插件仍锁 0.2.0」的事故形态；`^0.2.0-rc.2` 按 semver 不会选 0.2.1-rc.2）
- profile：`pnpm install` 只装 tarball，不额外手动放任何平台包
- 反向样本：从 `git show HEAD:package.json` 取旧清单，把两个平台包放回 `dependencies`，
  重新 pack 后装进 `desktop-bad`

### 4.2 结果

| 检查 | 修好后 | 反向样本（HEAD 清单） |
|---|---|---|
| profile `node_modules` 顶层的 `@deepseek-ai` | **不存在**（只有 `dsh-token-mb`） | 顶层也不存在，但 profile 内 `.pnpm` 多出第二份 |
| profile 内 `.pnpm` 的平台包 | 无（全部来自宿主层） | `@deepseek-ai+dsh-home-paths@0.2.0-rc.2`、`@deepseek-ai+schemastery@3.18.5`、`cordis`、`cosmokit` |
| 插件目录内 `node_modules/@deepseek-ai` | **不存在** | 不存在（pnpm isolated 布局把它放在 profile 的 `.pnpm` 虚拟仓库，而不是插件目录） |
| 从 `plugin/lib/index.js` 解析 `dsh-home-paths` | `profiles/node_modules/.pnpm/@deepseek-ai+dsh-home-paths@0.2.1-rc.2.../lib/index.js`，**version=0.2.1-rc.2（宿主）** | `desktop-bad/node_modules/.pnpm/@deepseek-ai+dsh-home-paths@0.2.0-rc.2.../lib/index.js`，**version=0.2.0-rc.2（第二份）** |
| 解析 `schemastery` | `profiles/node_modules/...@3.18.5`（宿主） | `desktop-bad/node_modules/...@3.18.5`（第二份，版本恰好相同，但路径已在本层） |
| 加载插件模块 | `import` 成功，`name=token-mb`，`resolveSessionsRoot` 正常 | —— |

关键点：**修好后解析路径全部落在 `profiles/node_modules`（宿主层），没有任何一条落在
`desktop/node_modules` 内；反向样本解析到 `desktop-bad/node_modules` 的 0.2.0 副本，
确实会抢在宿主 0.2.1 前面。** pnpm 11 的 isolated 布局把第二份放在 profile 的 `.pnpm`
虚拟仓库而不是顶层 `node_modules/@deepseek-ai`；它仍然在 profile 内，仍然优先于宿主层，
事故机制不变。

### 4.3 平台包完全缺失时的降级

把修好后的插件目录复制到 `/tmp/tm-isolated/app/plugin`（父目录链上没有任何 `node_modules`），
`DSH_HOME=/tmp/tm-isolated/fake-home` 下直接 import 并调用：

```
import ok, name= token-mb
resolveSessionsRoot= /tmp/tm-isolated/fake-home/sessions
loadConfigSchema= null
ISOLATED_EXIT=0
```

说明平台包缺失时只有本插件降级（家目录回退、设置 schema 跳过），模块加载不抛、不会连累宿主。

## 5. 验证结果（均显式检查退出码）

| 项 | 命令 | 结果 |
|---|---|---|
| 构建 | `node tools/build-client.mjs` | exit 0，`built lib/client.js: 92.2 KB` |
| 原有全套 | `tools/{verify-generations,verify-core,verify-zstd,verify-rates,verify-storage,smoke-host,smoke-client,smoke-render,verify-twin}.mjs` 顺序执行 | **9/9 通过，exit 0** |
| 孪生包 | `verify-twin` 内含 `makeTwin()` + 在孪生包内跑 `smoke-host` / `smoke-client` / `verify-generations` | 全通过，exit 0 |
| 干净安装 | 临时副本 `pnpm install --ignore-scripts`（模拟 CI 的 `npm install --ignore-scripts`） | exit 0，devDependencies 解析到 0.2.0-rc.2 / 3.18.4 |
| 干净副本复验 | 上述副本里 `build-client` + `verify-rates` + `smoke-host` + `verify-twin` | 全部 exit 0 |
| 打包 | `pnpm pack`（主力包与 `dist/dsh-token-mb`） | 均 exit 0 |
| 反向自检 | 改坏 `dependencies` 后跑 `verify-twin` | **exit 1**（见 §3.1），恢复后 exit 0 |

说明：本机没有 `npm` 可执行文件，故用同一 `node` 顺序执行 `package.json` 里 `test` 的等价命令；
不是只跑最后一项。`pnpm install` 不带 `--ignore-scripts` 时 pnpm 11 会因 esbuild 的
build script 未批准而 exit 1（`ERR_PNPM_IGNORED_BUILDS`），这是 pnpm 的构建脚本审批策略；
仓库 CI 使用 `npm install --ignore-scripts`，且 `--ignore-scripts` 下构建与测试均通过。

## 6. 未做 / 不确定

1. **没有在真实 DSH 桌面版上重启验证**：本轮只做到 tarball + 假 profile 的解析层模拟；
   真机启动受宿主当前安装状态影响，需用户装新版本后完全退出再启动确认。
2. **没有 Windows 现场**：profile 模拟在 macOS 上完成；pnpm 布局在 Windows 上可能不同
   （junction / 顶层 hoist），但「profile 内多一份 → 优先本层」的解析规则不变。
3. **没有同步 lockfile**：仓库本来就没有 lockfile，且 CI 明确用 npm 无 lockfile 安装；
   若后续决定改用 pnpm + frozen-lockfile，需要单独引入并维护 lockfile。
4. **版本号 / CHANGELOG 未动**：按约定由发版人决定；未 commit 版本段、未 push、未打 tag。
5. **`tools/` 里的 `classic-level` 诊断脚本**没有补依赖声明：它们不随包发布、不进入
   profile，不属于本次运行时依赖审计范围。
6. 本轮唯一的行为变化是依赖声明；插件源码与 `lib/client.js` 构建产物没有语义改动
   （构建后除本轮新增的本报告外，`git status` 仅 `package.json` 与 `tools/verify-twin.mjs`）。
