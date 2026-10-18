# DSH 插件开发 / 测试 / 验证 / 发布规范

> 版本：v1.0 · 2026-10-18
> 来源：`dsh-token-meter-panel`（= `dsh-token-mb`）、`dsh-worktodo` 两个插件的完整实践，含踩过的真实事故。
> 适用：DSH（DeepSeek Harness）宿主插件 / 客户端插件的开发与发版。
> 原则：**能自动拦住的错误绝不靠人眼**；**看起来全绿 ≠ 真的测过**；**公开仓库里不放任何账号/凭据材料**。

---

## 0. 一页速查（三张清单）

### 改动前
- [ ] 先跑一遍 `npm test`，确认基线是绿的（不绿就别动，否则分不清是谁弄坏的）
- [ ] 确认构建工具链可用：`npm run build` 真的产出了新文件（见 §6 的三个坑）
- [ ] 改宿主半侧 → 记住「必须重启 DSH 才生效」；只改客户端 → 必须重新构建 `lib/client.js`

### 提交前
- [ ] `npm test` 8/8（或项目全部自检项）
- [ ] 新增/修改了判定逻辑 → 做一次**反向验证**（故意破坏，确认测试会 FAIL，再恢复）
- [ ] `git status` 干净，产物（`lib/client.js`、`.map`）与源码同一提交
- [ ] 没把 token / 邮箱 / 账号找回材料写进任何被提交的文件

### 发布前
- [ ] `package.json` 版本号 + `CHANGELOG.md` 条目（写"用户可感知的变化"）
- [ ] `npm pack --dry-run` 检查打包白名单（不能含 node_modules、私有文档、截图）
- [ ] tag 与 npm 产物同一 commit
- [ ] 发布后核验：`dist-tags`、tarball 文件清单、provenance
- [ ] 真机重启 + 面板实际数据对账一次（§4）

---

## 1. 项目结构约定

```
<plugin>/
  package.json          # name / version / dsh.client / dsh.bundle.patch / files 白名单
  cordis.patch.yml      # 插槽行（id 必须唯一，多包名时各自不同）
  lib/
    index.js            # 宿主半侧入口：export name / inject / apply(ctx, config)
    client.js           # 浏览器半侧【构建产物，必须入库】
    client.js.map
  src/
    core.mjs            # 与宿主/客户端共享的纯逻辑（可单测）
    client/index.js     # 浏览器半侧源码（React.createElement，无 JSX）
    chrome-storage.mjs 等
  tools/
    build-client.mjs    # esbuild 打包 lib/client.js（构建期注入包名等常量）
    setup-modules.mjs   # 链接 DSH 本体依赖（@deepseek-ai/*）+ esbuild
    verify-*.mjs        # 纯逻辑回归
    smoke-host.mjs      # 宿主烟测（假 ctx）
    smoke-client.mjs    # 客户端烟测（桩 React）
    make-twin.mjs       # 生成孪生包（多包名）
    verify-twin.mjs     # 双包名互不冲突的守护
    preview.mjs         # 真数据 + 真 bundle 的页面预览（截图/看版式）
  docs/                 # 设计稿、规格（不含账号材料）
  README.md / README.en.md / CHANGELOG.md / LICENSE / THIRD-PARTY-NOTICES.md
```

**硬约定**
1. `lib/client.js` **入库**：用户从 npm/GitHub 安装时不能现场构建。CI 需能重建出同样内容。
2. `files` 白名单显式列出（`lib`、`src`、`cordis.patch.yml`、文档、LICENSE），避免打包垃圾。
3. 一个仓库只维护**一份源码**。多包名用生成器（`make-twin`），**禁止复制分叉**。

---

## 2. 开发规范

### 2.1 宿主与渲染分离

- `inject` **只写必需**服务（通常 `['webServer']`）。可选服务（`settings`、`deepseekAccount`）用 `ctx.inject([...], cb)` 探测，缺失时降级而不是整体加载失败。
- 取服务用 `ctx.get?.('name') ?? ctx.name` 双通道，兼容不同组合与测试桩。
- 浏览器半侧只做展示与交互；一切数据/写操作都经宿主的 HTTP 路由（客户端不能直接碰文件、凭据、设置）。

### 2.2 多包名（同源码不同名）

所有会撞车的标识**一律由包名派生**，不要让两个名字共用：

| 标识 | 派生方式 | 撞车后果 |
|---|---|---|
| 插件 `name` | 包名去 `dsh-` 前缀 | 加载器重复 |
| webServer 路由前缀 | `/${短名}` | 第二个插件 register 抛错 |
| settings 命名空间 | `/${短名}` 同源 | 配置互相覆盖 |
| 浏览器 slot id | 短名（主包可保留历史值） | 侧栏重复注册 |
| locale 命名空间 | 短名 | 词典互相覆盖 |
| cordis 插槽行 id | 写在各自 `cordis.patch.yml` | 加载器报重复行 |

> 实测：两个包同时装进一个 profile 也不冲突 —— 但前提是上表全部做到。`verify-twin` 就是守这条的。

### 2.3 数据源与口径（最容易出"用户不信"的地方）

**优先级**：官方账号会话 → 官方网页登录态 → 本地数据兜底。降级必须知道"为什么降级"并给出可执行指引。

**鉴权不可混用**（实测）：

| 接口族 | 账号会话 token | 网页 userToken |
|---|---|---|
| `/api/v0/users/*`（余额、累计消费） | ✅ `x-dsh-auth-token` | ✅ Bearer |
| `/api/v0/usage/by_api_key/*`（按天用量） | ✅ `x-dsh-auth-token` | ✅ Bearer |
| 同一接口换另一种头 | ❌ `Authorization Failed` / `INVALID_PARAM` | ❌ |

- 账号会话路径要带官方那 5 个客户端头：`x-client-bundle-id`（故意为空）、`x-client-platform`、`x-client-version`、`x-client-locale`、`x-client-timezone-offset`。
- **时间窗口必须对齐**（如北京零点）：`start`/`end` 不对齐 → `INVALID_PARAM`。窗口跨度决定桶粒度（长窗口按天、当天按小时）。

**口径纪律**
- **同一张表只放同一口径的数字**。官方金额与本地推算混排 → 用户会发现"加不上"，信任瞬间归零（真实事故）。
- 估算值必须标注"估算 / 允许几分差异"，并在脚注写明算式与四舍五入。
- 金额用**十进制字符串**相加（避免 `0.1+0.2`）；展示固定小数位（小额至少 4 位）。
- 每个派生数字都要能回答："它来自哪、怎么算的、和官方差多少是正常的"。

### 2.4 配置与凭据

- 设置项全部走 schemastery schema，`description` 写中文；默认值单点定义在 `DEFAULTS`，schema 与代码共用。
- 凭据**只存引用**（`role('credential-ref')`），永不写日志、永不回显。
- 面板内可改设置 → 宿主提供 `POST /<prefix>/settings`，服务端校验（非负/范围）后 `settings.update(ns, patch)`，清缓存让下一次 `/summary` 立即生效。
- 设置写接口必须做：**字段白名单 + 类型/范围校验 + 体积上限**。

### 2.5 UI 约定

- **同一排的卡片必须同一 surface**（同圆角、同阴影、同底色），否则视觉"不在一个平面"（真实事故：18px vs 16px、`0 14px 40px` vs `0 10px 32px`）。
- 窄栏用 `flex-wrap` + `minmax(180px, 1fr)`，**不要**用固定网格让某一列被挤成一字一行。
- 数字：`font-variant-numeric: tabular-nums` + `white-space: nowrap`；表格用 `colSpan` 时**不要**加 `tableLayout: fixed`（会折行）。
- 文案：正文一句话，解释放 `title`/tooltip；中英双语同步维护。
- 图表：柱上只留一个主标签（值或占比，别叠加）；x 轴标签过密要抽稀。

### 2.6 安全与隐私（硬红线）

- **公开仓库不得出现**：任何账号名+邮箱组合、token、`.npmrc` 内容、账号找回/客服沟通材料、内部绝对路径、用户会话截图。
- token 只以「临时 npmrc + `chmod 600`」形式存在于内存/临时目录，**用完立即删除**；不得写进仓库、脚本、命令行历史。
- 账号/凭据类文档只放**仓库外的私有目录**（如 `~/Documents/...`），或只在对话中给出。
- 撤回公开内容要**快**：发现已推送 → 立刻 `git reset` 撤回本地提交；若已推送，改中性文案并考虑历史清理（force-push 会影响他人克隆，需先确认）。

---

## 3. 测试规范

### 3.1 分层（每层职责单一）

| 层 | 文件 | 覆盖 | 要求 |
|---|---|---|---|
| 纯逻辑回归 | `verify-core` / `verify-generations` / `verify-zstd` / `verify-rates` / `verify-storage` | 聚合、去重、解析、计价 | 不依赖个人路径；找不到数据**跳过**而不是失败 |
| 宿主烟测 | `smoke-host` | 路由、设置、余额/用量、更新通道 | **假 ctx**，网络一律打桩（`globalThis.fetch`），不允许真出网 |
| 客户端烟测 | `smoke-client` | bundle 能注册、slot id/包名派生一致、首屏能渲染 | 桩 React，无浏览器 |
| 双包名守护 | `verify-twin` | 生成孪生包 + 标识互不相同 + 在孪生包内跑它自己的烟测 | 必须真跑，不能只看字符串 |

### 3.2 铁律（血泪教训）

1. **测试必须跑"刚构建的产物"**。
   事故：`node_modules/esbuild` 是指向 `/tmp` 的软链，系统清理 `/tmp` 后构建**静默失败**，而烟测加载的是**旧** `lib/client.js` → 全绿，但测的是上一版代码。
   规范：
   - 构建脚本失败必须**非零退出**，CI/本地都要 `set -e`；
   - `npm test` 的第一步应校验产物新鲜度（构建后比较 mtime/hash，或构建前删产物）；
   - 任何"改完代码结果一模一样"的现象，先怀疑构建。

2. **反向验证（mutation check）**：新增或修改判定逻辑后，**故意破坏一次**，确认测试 FAIL，再恢复。
   没有通过反向验证的测试**不许入库** —— 假测试比没测试更危险（给人虚假安全感）。
   真实案例：一个"用有数据状态遍历对象树"的假渲染测试，故意把 bug 塞回去仍然 PASS → 已撤，不入库。

3. **断言"会撞车的事实"**，不要断言实现细节：行 id、路由前缀、命名空间、slot id、窗口对齐、口径一致、金额自洽。

4. **回归样例要能离开这台机器跑**：禁止硬编码 `/Users/<你>`；用 fixture 或环境变量，缺失则跳过。

5. **网络全部打桩**：烟测里出现真实 fetch 就是缺陷（会偶发失败、泄露 token、拖慢 CI）。

### 3.3 已知缺口（必须补，验收标准写死）

- **渲染期异常（白屏）没有可靠闸门**。渲染分支里的 `ReferenceError` 只在真实渲染时炸，假渲染（遍历对象树）到不了该分支。
  正确做法：真 React + 最小 DOM（happy-dom / linkedom / 自写 createElement→HTML）**真挂载**一次"有数据"的完整面板。
  验收：**故意去掉 `params` 里的 `index` 时该测试必须 FAIL**。

### 3.4 跨平台

- CI 必须 ubuntu + windows 双跑（路径分隔符、权限、换行、大小写、行尾差异）。
- 不要依赖系统 `PATH`：DSH 桌面端进程的 PATH 只有 `/usr/bin:/bin:/usr/sbin:/sbin`；调用 CLI 用包内入口 + `ELECTRON_RUN_AS_NODE=1`。
- 平台差异（macOS `Contents/Resources/app.asar`、Windows `resources/app.asar`）要有单元用例覆盖。

---

## 4. 验证规范（发版前必须做的）

1. **自检全绿**：`npm test` 8/8（或等价全套）。
2. **产物与源码一致**：重新构建后 `git status` 无差异（证明入库产物可重建）。
3. **双端验证**：
   - 版式：`node tools/preview.mjs --open`（真 bundle + 本机真数据，看布局/换行/折行）；
   - 真机：**完全退出 DSH 再启动** → 打开面板 → 核对数据。插件是启动时加载的，改宿主必须重启。
4. **数据对账**（不能只看"有数"）：
   - 今日金额 vs 官方网页金额；
   - 30 天窗口总金额 vs 官方；
   - 分档合计 vs 明细行相加；
   - 四个窗口（今日/7天/30天/本月）互相自洽。
5. **回归截图存档**：每次发布留一张真机截图（存私有目录，不入公开仓库）。
6. **异常路径验证**：断网、未登录、无凭据、只有本地数据、浏览器 token 过期 → 面板必须给出可执行提示，不能白屏/空转。

---

## 5. 发布规范

### 5.1 版本与提交

- 语义化版本；`package.json` + `CHANGELOG.md` 同一次提交更新。
- **tag 与 npm 产物必须是同一 commit**（先 bump → 提交 → tag → 发布，避免 tag 指旧代码）。
- 提交信息写"为什么改"，不写"改了啥"。

### 5.2 npm 发布方式（优先级从高到低）

1. **Trusted Publisher（OIDC，推荐）**
   - 绑定：包页 → Trusted Publisher → GitHub Actions → `<org-or-user>` / `<repo>` / `<workflow 文件名>` / Environment 留空。
   - **跨账号可绑**：包属于 npm 账号 A、仓库属于 GitHub 账号 B，完全合法（绑的是"仓库+工作流"）。
   - 工作流：`id-token: write` + `npm publish --provenance --access public`，全程无 token。
2. **临时 token（次选，仅应急）**
   - 临时 npmrc：`printf '//registry.npmjs.org/:_authToken=%s\n' "$T" > "$TMP/.npmrc"; chmod 600`，用 `NPM_CONFIG_USERCONFIG` 指向它。
   - 指定官方源：`--registry=https://registry.npmjs.org/`（本机 pnpm 默认源可能是镜像）。
   - **发布后立即删除临时 npmrc，并撤销该 token**（尤其 token 曾出现在聊天/日志里时）。

### 5.3 发布前打包检查

```bash
npm pack --dry-run     # 看 files 白名单命中了什么
```

必须满足：只含 `lib/`、`src/`、`cordis.patch.yml`、README/CHANGELOG/LICENSE；**不含** `node_modules`、截图、`docs/marketplace-research.md` 类内部笔记、任何 `.npmrc`/凭据。

### 5.4 发布后核验

```bash
curl -s https://registry.npmjs.org/<pkg> | jq '.dist-tags, .versions | keys'
curl -s -o /tmp/p.tgz "<tarball-url>" && tar tzf /tmp/p.tgz | head -20   # 文件清单
```

核对：`latest` 指向新版本、版本号正确、`repository`/`description` 正常、tarball 内含 `lib/index.js` 与 `lib/client.js`。

### 5.5 回滚与兜底

- **npm 版本不可撤销**：发错只能发新补丁版；严重缺陷可 `npm deprecate <pkg>@<ver> "原因 + 替代版本"`。
- **包名所属账号不可用**时（真实事故）：
  - 用可控账号下的**新包名**继续发布（同源码，`make-twin` 生成）；
  - README 只写事实与替代安装方式，**不写账号原因**；
  - 已装旧名用户走 GitHub tag 更新路径（`github:<owner>/<repo>#vX`），不要留死路。

### 5.6 账号与凭据治理

- 2FA **必须备份恢复码**；记录在密码管理器里。
- 账号找回材料（工单、身份验证、客服往返）只存私有文件，**绝不入公开仓库**。
- 身份验证正路：GitHub 侧提供的 secret gist（含指定暗号）+ 另一可控账号的关联证据（同仓库、同代码、同维护者链路）。

---

## 6. 环境与工具链规范（本机踩过的三个坑）

1. **pnpm registry 可能是镜像**
   本机实测指向 `https://repo.harmonyos.com/npm/` → 装 `esbuild` 报 `is not in the npm registry / No authorization header`。
   规范：装包显式 `--registry=https://registry.npmjs.org/`；CI 用官方源。

2. **esbuild 禁止装 `/tmp`**
   系统会清理 `/tmp`，软链悬空后构建失败而烟测测旧产物。
   规范：统一装在持久目录（如 `~/.dsh/tools/esb`），`npm run setup` 负责链接；`build` 失败必须显式报错。

3. **`pnpm add/install` 会清掉手工链接的 `@deepseek-ai/*`**
   `schemastery` / `dsh-home-paths` 来自 DSH 本体，不在公共 registry 的同一位置。
   规范：任何 `pnpm add` 之后**必须**再跑一次 `npm run setup`，否则 `verify-*` 会报「设置 schema 加载失败」。

4. **github.com 网络不稳**：push 失败（`Empty reply` / HTTP2 framing）时改用 `git -c http.version=HTTP/1.1` + 重试；`api.github.com` 通常可用。

---

## 7. 事故复盘速查（现象 → 根因 → 已落成的规范）

| 现象 | 根因 | 规范条款 |
|---|---|---|
| 面板白屏 | 轴标签 `map` 缺 `index` 参数 → 渲染期 ReferenceError | §3.3 需要真挂载闸门；§3.2 反向验证 |
| 自检"全绿"但改了代码没生效 | esbuild 悬空 → 构建静默失败 → 测旧产物 | §3.2.1、§6.2 |
| 官方用量一直「未连接」 | 只支持浏览器 `userToken`，桌面端账号会话应用 `x-dsh-auth-token` | §2.3 鉴权矩阵 |
| 接口返回 `INVALID_PARAM` | 时间窗口未对齐（非北京零点） | §2.3 窗口对齐 |
| 表里金额"加不上" | 官方金额与本地推算混在同一张表 | §2.3 口径纪律 |
| 三栏像不在一个平面 | 两个 surface（圆角/阴影不同） | §2.5 |
| 窄栏文字一字一行 | 固定网格 + `auto` 列抢宽 | §2.5 flex-wrap |
| npm 发布 E404 | Trusted Publisher 未绑定（且包名账号不可用） | §5.2、§5.5 |
| 账号材料进了公开仓库 | 未区分"公开文档"与"私密材料" | §2.6 硬红线 |
| 发布后 tag 与 npm 内容不一致 | 先 tag 后 bump | §5.1 |

---

## 8. 文档与留痕

- `README`：面向用户（是什么、装什么、怎么用、不同点）。
- `docs/design-vX.md`：面向自己（设计定稿、取舍过程）。
- `CHANGELOG`：面向升级用户（可感知变化 + 迁移提示）。
- 内部调查笔记（竞品、账号、排查过程）→ **私有目录**，不入公开仓库。
- 每次发布在私有目录留一份"版本 + 关键数据截图 + 对账结果"的存档，便于回溯。

---

## 9. 附：两个参考实现

| 插件 | 仓库 | 值得参考的点 |
|---|---|---|
| Token 面板 | `olimc2016/dsh-token-meter-panel`（npm: `dsh-token-mb`） | 多包名派生、官方免登录取数、口径分离、真机预览工具、低余额提醒、面板内改设置 |
| 工作待办 | `olimc2016/dsh-worktodo` | 跨会话持久数据、优先级/截止/项目视图、与 agent 工具联动 |

> 两个插件共同的结论：**把"能自动验证的"都做成脚本**，把"只能人判断的"写成清单；**发版前必须真机看一眼**。
