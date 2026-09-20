# 上架文案（0.1.0）

市场收录一般会抓取 `package.json` 的 `description` 与仓库 README 首屏。
下面两段是给目录源/表单用的简短文案，按需复制。

---

## 中文

**名称**：Token 用量面板（dsh-token-meter-panel）

**一句话**：在 DSH 侧栏看今天花了多少钱、钱花在哪、缓存帮你省了多少。

**简介（约 120 字）**：
DSH 只记 token 不算钱，这个插件把用量翻译成人民币。侧栏独立面板显示今日消费、预算进度、
7/30 天趋势、今日分时、成本构成与按会话明细，并支持账户余额查询与超预算告警。
按 DeepSeek 官方费率折算（含高峰/空闲两档），把「缓存命中省下多少」做成显性指标——
本机实测缓存命中率 98%，一天省下 ¥60 量级。费率与预算均可在设置里改。

**分类**：费用 / 用量统计 / Web UI

**亮点**：
1. 成本构成拆开看：输出 token 往往只占总量极小部分，却吃掉四成花费——这是最反直觉、也最该被看见的一条
2. 缓存命中省下的钱单独列示（命中价只有未命中的 1/50）
3. 按会话明细 + 子代理归因，知道是哪个会话在烧钱
4. 未知模型不猜价：只累加 token，宁可少一个数字也不给错数字
5. 深浅色主题自适应，配色用 DSH 自己的主题变量

**关键词**：token、用量、花费、计费、成本、预算、缓存命中、面板

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
