# 上架文案（0.6.5）

市场收录一般会抓取 `package.json` 的 `description` 与仓库 README 首屏。
下面两段是给目录源/表单用的简短文案，按需复制。

> 2026-10 更新：DSH 主线进入 0.2.x 后，一批同类插件被版本闸门拒绝或缺少必要依赖。
> 文案已把「兼容 0.2.x / 零外部依赖 / 账号登录也能看余额」提到最前面 —— 这三条是当前最有效的差异点。

---

## 中文

**名称**：Token 用量面板（dsh-token-meter-panel）

**一句话**：兼容 DSH 0.2.x、零外部依赖的 Token 用量 / 花费 / 余额面板；在 DSH 侧栏看今天花了多少钱、钱花在哪、缓存帮你省了多少、账户还剩多少。

**简介（约 130 字）**：
DSH 只记 token 不算钱，这个插件把用量翻译成人民币。**兼容 DSH 0.2.x（0.2.0-rc.2 实测）**，
**零外部依赖**——会话日志的多帧 zstd 用纯 JS 自己解压，不需要 zstd/zstdcat/Homebrew。
侧栏独立面板显示今日消费、预算进度、7/30 天趋势、今日分时、成本构成与按会话明细；
余额支持 **DeepSeek 账号登录与 API Key 两条路**（桌面端默认账号登录，不需要 API Key）。
按官方费率折算并区分**高峰/空闲两档**，把「缓存命中省下多少」做成显性指标——
本机实测缓存命中率 99%，一天省下 ¥60 量级。

**分类**：费用 / 用量统计 / Web UI

**亮点**：
1. **装得上**：兼容 DSH 0.2.x（0.2.0-rc.2 实测）；不少同类插件仍锁在 0.1.x，会被 DSH 的版本闸门拒绝
2. **零外部依赖**：多帧 zstd 纯 JS 解码（`src/zstd.mjs`），不需要 zstd/zstdcat/Homebrew——依赖外部二进制的插件在 macOS 桌面端基本用不了（DSH 主进程 PATH 不含 `/opt/homebrew/bin`）
3. **余额双路**：账号登录走官方账号服务，API Key 走 `/user/balance`；只有 API Key 的老插件在账号登录环境里只会显示"未配置凭据"
4. **峰/谷分档计价**：按官方规则（北京时间工作日 9-12、14-18 为高峰）分别计价，币种 CNY 对得上官方现价
5. 成本构成拆开看：输出 token 往往只占总量极小部分，却吃掉四成花费
6. 缓存命中省下的钱单独列示（命中价只有未命中的 1/50）
7. 按会话明细 + 子代理归因，知道是哪个会话在烧钱；未知模型不猜价
8. 增量扫描：文件没变就复用上次聚合结果，只重算变动过的日志

**关键词**：token、用量、花费、余额、计费、成本、预算、峰谷、缓存命中、面板、DSH 0.2

---

## English

**Name**: Token usage panel (dsh-token-meter-panel)

**One-liner**: A DSH sidebar view for what you spent today, where it went, and how much the disk cache saved.

**Summary (~90 words)**:
DSH records tokens but prices nothing. This plugin turns usage into money: a dedicated sidebar
panel with today's spend, budget bar, 7/30-day trend, hourly distribution, cost breakdown and a
per-session table, plus optional account balance and over-budget alerts. Costs follow DeepSeek's
official rates including peak/off-peak tiers. Cache savings are a first-class metric — cache hits
cost 1/50 of a miss, and on a real machine with a 98% hit rate that is tens of CNY a day.
Rates and budget are configurable in Settings.

**Categories**: Cost / Usage stats / Web UI

**Highlights**:
1. Cost breakdown that shows the counter-intuitive part: output tokens are a tiny share of volume
   but often ~40% of the bill
2. Cache savings shown explicitly (hit price is 1/50 of a miss)
3. Per-session breakdown with subagent attribution
4. Unknown models are never guessed: tokens counted, money omitted
5. Light/dark adaptive, using DSH's own theme variables

**Keywords**: token, usage, cost, billing, budget, cache hit, panel

---

## 提交清单（发布后核对）

- [ ] `npm publish` 成功，`npm view dsh-token-meter-panel version` 返回 0.1.0
- [ ] GitHub 仓库公开，README 首屏有截图
- [ ] 仓库打 tag `v0.1.0` 并建 Release（正文用本目录 CHANGELOG 的 0.1.0 段落）
- [ ] 向目标目录源提交条目（源与表单地址见调研结论）
- [ ] 用干净环境验证一次安装：`dsh plugin --profile <新 profile> add dsh-token-meter-panel` + 重启
