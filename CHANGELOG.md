# 变更记录

## 0.1.0 — 首次发布

### 面板

- 侧栏独立视图（`sidebar.panellist` 图标 + `main` keyed 面板，id 同名）
- 今日消费：人民币金额、预算进度条、与上次使用对比、账户余额（可选）
- 四宫格指标：未命中输入 / 缓存命中输入 / 输出 token、缓存命中率 + 调用次数
- 每日趋势：近 7 天 / 近 30 天切换，按三类 token 堆叠，悬浮显示当天明细
- 今日分时：24 小时 token 分布 + 峰值小时
- 成本构成：三类 token 各自花费与占比，并给出「无硬盘缓存时的对照花费」
- 按会话明细：今日每个会话的消费降序表，子代理会话打标
- 本会话实时：来自官方 `tokenUsage` 投影的当前对话用量
- 深色 / 浅色主题自适应（全部使用 DSH 的 `--dsw-*` 主题变量）

### 采集

- 多帧 zstd 逐帧解码（`zstdDecompressSync` 只解第一帧、流式解码报 `Unknown frame descriptor`，
  两者都不可用；按帧边界扫描后逐帧解压）
- 会话日志三层目录扫描，兼容工作区下直接放日志的形态
- 同一会话 v3 与 v0 并存时只认 v3（避免用量翻倍）
- 从 `assistant/attempt` 的流式末块补回重试/中断的用量
- 按北京时间（UTC+8）分桶，与机器时区解耦
- 子代理会话归因到父会话（读 `session.parentSession` 与 `subagent/descriptor.label`）

### 计费

- DeepSeek 官方费率：`deepseek-flash` 与 `deepseek-v4-pro`，各含高峰 / 空闲两档
- 高峰判定：北京时间周一至周五 9:00–12:00、14:00–18:00（法定节假日不识别）
- 未知模型不猜价：只累加 token，不计金额
- 费率、预算、告警阈值、刷新间隔均可在设置里改，改动即时生效

### 设置

- 注册 `token-meter-panel` 设置 namespace（schemastery schema，含中文字段描述）
- 服务缺失时优雅降级：不注册设置项，其余功能照常
- `showBalance` 默认关闭：不开开关时插件零出网

### HTTP 路由（宿主半侧）

- `GET /token-meter-panel/summary` — 聚合结果，`?refresh=1` 强制重算
- `GET /token-meter-panel/balance` — 官方账户余额（可选，需凭据）
- `GET /token-meter-panel/health` — 自检
- 三条路由均复用 DSH `connection.requestRejection` 做 Host/Origin 围栏与浏览器认证
- 聚合结果带 5 秒 TTL 缓存，避免面板轮询触发全量重扫

### 已知限制

- 会话标题生成与联网搜索两次调用不落 usage，无法计入花费
- 活跃会话仍在追加写入，「今日」为下界（面板底部如实标注）
- 法定节假日不识别，节假日会被按高峰价计（偏保守）
