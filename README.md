# dsh-token-meter-panel

> DSH（DeepSeek Harness）的 Token 用量与花费面板插件。
> 在侧栏加一个独立视图：今天花了多少钱、花在哪、缓存帮你省了多少。

[English](README.en.md) | 中文

---

> **本插件是社区插件，并非 DeepSeek 官方插件。** 与深度求索（DeepSeek）无隶属、合作或背书关系。
> 项目名使用官方品牌规范建议的缩写 **DSH**；"DeepSeek"、"DeepSeek Harness" 是深度求索公司的商标。
>
> **面板里的金额是本机估算，不是官方账单。** 内置费率核对自
> [DeepSeek 官方定价页](https://api-docs.deepseek.com/zh-cn/quick_start/pricing)（采集日期见下文），
> 价格可能随时变动，**请以官方页面为准**；本插件不作任何计费承诺。

---

## 它解决什么问题

DSH 会把每次模型调用的 token 用量记在会话日志里，但**只记 token，不算钱**——内核里没有任何计价代码。

这个插件把用量翻译成你真正关心的东西：

- **今天花了多少**（人民币），还剩多少预算
- **钱花在哪**：缓存命中输入 / 未命中输入 / 输出 三类各占多少
- **缓存省了多少**：DeepSeek 的缓存命中价只有未命中的 1/50，这个数字通常很大
- **哪个会话在烧钱**：按会话列明细，子代理会话单独打标
- **什么时候在烧**：今日 24 小时分布，标出峰值

![面板预览](docs/preview-dark.png)

---

## 功能

| 区块 | 内容 |
|---|---|
| 今日消费 | 金额大字、预算进度条、与上次使用对比、账户余额（可选） |
| 四宫格 | 未命中输入 / 缓存命中输入 / 输出 token、缓存命中率 + 调用次数 |
| 每日趋势 | 可切近 7 天 / 近 30 天，柱状按三类 token 堆叠，悬浮看当天明细 |
| 今日分时 | 24 小时 token 分布，标出峰值小时 |
| 成本构成 | 三类 token 各花了多少钱与占比，并给出「若没有硬盘缓存今天要花多少」 |
| 按会话明细 | 今日每个会话的 token、调用次数、消费，子代理会话打标 |
| 本会话实时 | 当前对话的实时用量（来自官方 `tokenUsage` 投影） |

配色固定语义（青 = 缓存命中输入，蓝 = 未命中输入，紫 = 输出），全部使用 DSH 自己的
`--dsw-*` 主题变量，因此在深浅色主题下都与界面一致。

---

## 安装

> **当前状态：尚未发布到 npm**（npm 账号注册中）。现在请用 GitHub Release 里的 tarball 安装。

### 方式一：GitHub Release 的 tarball（现在可用）

1. 到 [Releases](https://github.com/olimc2016/dsh-token-meter-panel/releases) 下载
   `dsh-token-meter-panel-0.1.0.tgz`
2. 装进 profile：

```bash
dsh plugin --profile desktop add ./dsh-token-meter-panel-0.1.0.tgz
```

### 方式二：npm（发布后可用）

```bash
dsh plugin --profile desktop add dsh-token-meter-panel
dsh plugin --profile web add dsh-token-meter-panel
```

### 方式三：从源码（开发者）

```bash
git clone https://github.com/olimc2016/dsh-token-meter-panel.git
cd dsh-token-meter-panel
npm install
npm run setup     # 建本地模块解析 junction，详见「开发」
npm test
dsh plugin --profile desktop add .
```

装完**必须重启 DSH Desktop**（插件 bundle 只在宿主启动时解析，`cordis.patch.yml` 的热重载不覆盖它）。

重启后侧栏最下方出现「Token」仪表盘图标，点开即是面板。

权限与数据边界：本插件只读本机会话日志、不写文件、不执行命令；唯一的联网是账户余额查询，
在设置里关掉即完全零出网。详见「[隐私与权限](#隐私与权限)」。

---

## 计费口径

按 **DeepSeek 官方定价**折算，**不是** DSH 内置能力。

- 现售模型：`deepseek-flash`、`deepseek-v4-pro`
  （`deepseek-chat` / `deepseek-reasoner` 已于 2026-07-24 下线，旧的 `deepseek-v4-flash` 名称仍可用但按 Flash 价计费）
- **分高峰 / 空闲两档，空闲价 = 高峰价的一半**
  高峰 = 北京时间周一至周五 9:00–12:00、14:00–18:00（法定节假日除外，本插件暂不识别节假日）
- 缓存命中输入价只有未命中的 1/50 ~ 1/30，是本插件最想让你看见的数字
- `reasoningTokens` 已包含在 `outputTokens` 内，不重复计价
- **未知模型不猜价**：只累加 token，不计金额——宁可少一个数字，也不给错数字
- 价格来源：<https://api-docs.deepseek.com/zh-cn/quick_start/pricing>（内置价采集于 2026-09-19）

费率、每日预算、告警阈值、刷新间隔、是否显示余额，都可以在
**设置 → 插件 → token-meter-panel** 里改。改完立刻生效（会触发重新聚合）。

---

## 数据从哪来

两部分结合：

1. **全量日志聚合**（按天历史的唯一来源）
   扫描 `$DSH_HOME/sessions/<工作区>/<会话>/session[.v3].jsonl.zstd`，
   取每条 `assistant/message` 的 `data.usage`，按北京时间分桶聚合。
2. **官方投影**（当前会话实时用量）
   面板里的「本会话实时」走 DSH 的 `useProjection('tokenUsage')`。

### 三个必须知道的实现细节

DSH 的 `.jsonl.zstd` 是**追加写入的多帧 zstd**：

- `zlib.zstdDecompressSync()` 只解第一帧（实测 5.3MB 只出 187 字节）
- `zlib.createZstdDecompress()` 流式解压出完第一帧后报 `Unknown frame descriptor`
- 正确做法是**扫描帧边界后逐帧解压**（与 `@deepseek-ai/dsh-session-persistence-jsonl`
  的 `scanZstdFrames` 同构，见 `src/zstd.mjs`）

聚合口径的两个坑：

- 同一会话 `session.jsonl`(v0) 与 `session.v3.jsonl` 并存时**只认 v3**，否则用量翻倍
- `data.stream[].chunk.usage` 与 `data.usage` 是同一份数据，重复累加也会翻倍

### 已知盲区（数据源本身的限制，不是 bug）

会话标题生成与联网搜索这两类调用**不落 usage**，因此无法计入花费；
活跃会话仍在追加写入，所以「今日」是下界（面板底部有如实标注）。

---

## 隐私与权限

先给结论：**只读本机会话日志（仅用于「按会话明细」）、不执行命令、不写任何文件；能查到的官方数据直接用官方接口。**

| 权限 | 本插件的实际情况 |
|---|---|
| **文件（读）** | 只读 `$DSH_HOME/sessions/**/session[.v3].jsonl[.zstd]`（DSH 自己的会话日志目录，只用于按会话明细） |
| **文件（写）** | **无**——官方数据每次现查，本地聚合只在内存里，两者都不落盘 |
| **网络** | ① 账户余额（公开 API，可在设置里关）；② 官方用量（Platform 端点，与平台「用量」页同源，需要 userToken） |
| **命令执行** | **无**——不 spawn 任何进程 |
| **凭据** | 仅按**引用名**（`DEEPSEEK_API_KEY` / `DEEPSEEK_PLATFORM_TOKEN`）向 DSH 凭据服务取值，密钥只在宿主进程内存中使用，**不下发到浏览器、不写入日志、不进任何文件** |

余额查询：

- 请求 `GET https://api.deepseek.com/user/balance`，**只在宿主（Node）侧发起**，浏览器拿不到密钥
- 面板顶部左上角显示「账户余额 ¥x」；显示「未开启」表示你在设置里关掉了它，
  显示「查询失败」表示凭据缺失或接口返回异常
- 在**设置 → 插件 → dsh-token-meter-panel** 里可以开关，以及改凭据名

官方用量（面板的主数据源）：

- **零配置**：插件会**自动读取浏览器登录态**（Edge / Chrome / Chromium / Brave 的 Local Storage 里
  `platform.deepseek.com` 的 `userToken`），你不需要复制粘贴或配置任何东西
  - 只读流程：把浏览器的 `Local Storage/leveldb` **复制到系统临时目录**再解析（原文件被浏览器占用），解析完立即删除；
    **不写你的用户目录**，且**只取 `platform.deepseek.com` 这一条记录**，不外发、不落盘
  - 读不到时（站点未登录 / 非标准 profile / 格式变动）面板显示「官方：未连接 **[连接官方]**」：
    点一下打开官方账单页，登录后回到面板即自动生效
- 也可手动指定：凭据名 `DEEPSEEK_PLATFORM_TOKEN`（网页登录态 `userToken`），优先级高于自动读取
- 数据端点 `platform.deepseek.com/api/v0/usage/by_api_key/{cost,amount}`（与平台「用量」页同源）：
  今日消费、四宫格、每日趋势、今日分时、**历史表**、成本构成都来自它
- 只有 **按会话明细** 是官方没有的维度，仍来自本地日志（卡头标注「本地日志」）
- 面板上有 **官方账单页 ↗**，一键跳到 `platform.deepseek.com/usage` 自己核对

本机 HTTP 路由（面板取数用）：

- `GET /token-meter-panel/summary`、`/token-meter-panel/balance`、`/token-meter-panel/health`
- **只返回聚合数字**（token 数、金额、调用次数、会话 ID），**不返回对话正文、文件路径或凭据**
- 三条路由都经过 DSH `connection` 服务的 Host/Origin 围栏与浏览器鉴权（`requestRejection`）

---

## 配置

设置 namespace：`token-meter-panel`

| 项 | 默认 | 说明 |
|---|---|---|
| `dailyBudget` | 50 | 每日预算（元），0 = 不限额 |
| `alertAtPercent` | 80 | 达到预算百分比时告警（进度条变色） |
| `showBalance` | true | 是否查询并显示账户余额（关掉 = 完全零出网） |
| `apiKeyEnv` | `DEEPSEEK_API_KEY` | 余额查询用的凭据名 |
| `refreshSeconds` | 60 | 面板自动刷新间隔（秒），0 = 不自动刷新 |
| `officialOnly` | true | 只统计 DeepSeek 官方计费的调用（第三方 provider 不计入花费） |
| `offPeak` / `peak` | 官方现价 | 两个模型在空闲/高峰档下的单价（元/百万 token） |

---

## 工作原理

```
浏览器（面板）  ──fetch──▶  宿主路由                    ──▶  采集内核
 lib/client.js              lib/index.js                     src/core.mjs + src/zstd.mjs
 注册 sidebar.panellist     GET /token-meter-panel/summary   读 ~/.dsh/sessions
 注册 main keyed slot       GET /token-meter-panel/balance   多帧 zstd 解码
 useProjection(tokenUsage)  GET /token-meter-panel/health    按天/会话/模型聚合
```

宿主半侧注册一个 `token-meter-panel` 设置 namespace，浏览器半侧注册两个 slot 贡献点：
`sidebar.panellist`（侧栏图标，`id: tokenmeter`）与 `main`（中栏面板，`key: tokenmeter`）——
两者必须同名，点侧栏图标才能切到面板。

三条只读路由都复用 DSH `connection` 服务的 `requestRejection` 做 Host/Origin 围栏与浏览器认证。

---

## 开发

```bash
npm run setup    # 建本地模块解析入口（junction，见下）
npm test         # 采集自检 + 宿主烟测 + 客户端烟测
npm run build    # 重建 lib/client.js（改 src/client/index.js 后必须执行）
npm run watch    # watch 模式，配合 DSH client-hmr 可自动热替换
```

目录结构：

```
├── package.json          # dsh.bundle.patch（宿主层）+ dsh.client（浏览器层）
├── cordis.patch.yml      # 把宿主半侧插进 profile 层栈
├── lib/index.js          # 宿主半侧：聚合缓存、HTTP 路由、余额、设置
├── lib/client.js         # 浏览器半侧（esbuild 产物，勿手改）
├── src/core.mjs          # 采集内核：扫描 / 聚合 / 费率 / 时区
├── src/zstd.mjs          # 多帧 zstd 解码
├── src/client/index.js   # 面板源码（改这个）
├── docs/                 # 面板截图 + 上架文案
├── LICENSE               # MIT
├── THIRD-PARTY-NOTICES.md# 第三方许可声明
└── tools/                # 构建与自检脚本
```

> **`npm run setup` 为什么需要**：Node 解析 junction/symlink 时使用**真实路径**，
> 插件目录内的 `import '@deepseek-ai/schemastery'` 不会去 profile 的 `node_modules` 找。
> 该脚本在插件目录内建 junction 指向基座包。缺失时插件会优雅降级：不注册设置项，其余功能照常。
> **运行时不需要这一步**：宿主的 Node 服务进程以应用目录为解析起点，能正常命中基座包。

改宿主代码（`lib/index.js`、`src/core.mjs`）需要重启 DSH 才生效；
改客户端代码重建 `lib/client.js` 后，DSH 的 client-hmr 会自动替换（不必刷新页面）。

---

## 许可

本项目以 **MIT** 许可证发布，见 [LICENSE](LICENSE)。

其中 `src/zstd.mjs` 的 Zstandard 多帧帧扫描逻辑改写自 DeepSeek Harness 的
`@deepseek-ai/dsh-session-persistence-jsonl`（MIT，`Copyright (c) 2026 DeepSeek`），
其版权与许可声明已按要求保留，详见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。
