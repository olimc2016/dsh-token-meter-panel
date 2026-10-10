/**
 * token-meter-panel 采集内核：把 DSH 会话日志聚合成「按天 / 按会话 / 按模型」的用量与花费。
 * 只依赖 node: 内置模块与 ./zstd.mjs，可独立测试（tools/*.mjs 直接跑它）。
 */

import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { readSessionRecords } from './zstd.mjs';

/* ------------------------------------------------------------------ *
 * 费率表（CNY / 百万 token）
 * 来源：https://api-docs.deepseek.com/zh-cn/quick_start/pricing （核实于 2026-09-19）
 * 规则要点：
 *   - 现实售模型只有 deepseek-flash 与 deepseek-v4-pro（deepseek-chat / reasoner 已下线）
 *   - 分「高峰 / 空闲」两档，空闲价 = 高峰价的一半
 *   - 高峰 = 北京时间周一至周五 9:00-12:00 与 14:00-18:00（法定节假日除外，本工具不识别节假日）
 *   - 缓存命中输入价只有未命中的 1/50 ~ 1/30，是本工具最值得显示的省钱项
 * ------------------------------------------------------------------ */
export const PRICING_SOURCE = 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing';
export const PRICING_FETCHED_AT = '2026-09-19';
export const PRICE_TIERS = {
  'deepseek-flash': {
    label: 'deepseek-flash',
    cacheHit: { offPeak: 0.02, peak: 0.04 },
    cacheMiss: { offPeak: 1, peak: 2 },
    output: { offPeak: 4, peak: 8 },
  },
  'deepseek-v4-pro': {
    label: 'deepseek-v4-pro',
    cacheHit: { offPeak: 0.15, peak: 0.3 },
    cacheMiss: { offPeak: 4.5, peak: 9 },
    output: { offPeak: 13.5, peak: 27 },
  },
  /* 退役模型名，实际由 V4.1-Flash 提供服务，按 Flash 价计费 */
  'deepseek-v4-flash': {
    label: 'deepseek-flash（退役名 v4-flash）',
    cacheHit: { offPeak: 0.02, peak: 0.04 },
    cacheMiss: { offPeak: 1, peak: 2 },
    output: { offPeak: 4, peak: 8 },
  },
  'deepseek-v4-flash-vision-exp': {
    label: 'deepseek-flash（vision-exp）',
    cacheHit: { offPeak: 0.02, peak: 0.04 },
    cacheMiss: { offPeak: 1, peak: 2 },
    output: { offPeak: 4, peak: 8 },
  },
};
/**
 * 计费口径：只有 DeepSeek 官方路由的调用才折算 CNY，其他 provider（第三方中转、
 * 自建端点等）只记 token、不给金额。
 *   - deepseek-official：API Key 路由（@deepseek-ai/dsh-llm-deepseek-api-key 注册）
 *   - deepseek-account ：桌面端 DeepSeek 账号登录路由（@deepseek-ai/dsh-llm-deepseek-account）
 * 两个 id 必须与基座实际注册的 provider 名一致：只写死 official 时，用桌面端
 * 账号登录的会话（本地日志里 source.provider === 'deepseek-account'）一条都统计不到。
 */
export const OFFICIAL_PROVIDERS = ['deepseek-official', 'deepseek-account'];
/** @deprecated 改用 OFFICIAL_PROVIDERS；仅保留旧名，避免破坏外部导入。 */
export const BILLING_PROVIDER = OFFICIAL_PROVIDERS[0];

/* ------------------------------------------------------------------ *
 * 时间：一律按北京时间（UTC+8）分桶，与机器时区解耦
 * ------------------------------------------------------------------ */
const CST_MS = 8 * 3600 * 1000;
export const toCst = (ms) => new Date(ms + CST_MS);
/** 'YYYY-MM-DD'（北京时间） */
export const dayKeyOf = (ms) => toCst(ms).toISOString().slice(0, 10);
/** 0-23（北京时间） */
export const hourOf = (ms) => toCst(ms).getUTCHours();
/** 是否高峰时段：北京时间周一至周五 9-12、14-18 */
export function isPeakHour(ms) {
  const d = toCst(ms);
  const dow = d.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  const h = d.getUTCHours() + d.getUTCMinutes() / 60;
  return (h >= 9 && h < 12) || (h >= 14 && h < 18);
}

/* ------------------------------------------------------------------ *
 * 单次调用的花费
 * ------------------------------------------------------------------ */
/**
 * @param {{inputTokens?:number, cacheReadTokens?:number, outputTokens?:number, cacheWriteTokens?:number}} usage
 * @param {string} model 模型名
 * @param {number} ms 该次调用的时间戳（epoch ms）
 * @param {object} rates 费率表（可选，形如 PRICE_TIERS）
 * @returns {{cny:number, peak:boolean, priced:boolean, tier:string, unit:{hit:number,miss:number,out:number}}|null}
 *          未知模型返回 null：只记 token、不猜价钱（宁可不显示金额，也不给错数字）
 */
export function costOf(usage, model, ms, rates = PRICE_TIERS) {
  const tier = rates[model];
  if (!tier) return null; // 未知模型：只记 token，不猜价钱
  const peak = isPeakHour(ms);
  const pick = (p) => (typeof p === 'number' ? p : peak ? p.peak : p.offPeak);
  const hit = pick(tier.cacheHit), miss = pick(tier.cacheMiss), out = pick(tier.output);
  const cny =
    ((usage.inputTokens || 0) / 1e6) * miss +
    ((usage.cacheReadTokens || 0) / 1e6) * hit +
    ((usage.outputTokens || 0) / 1e6) * out;
  return { cny, peak, priced: true, tier: model, unit: { hit, miss, out } };
}

/* ------------------------------------------------------------------ *
 * 从一条日志记录里取用量（唯一权威口径）
 *   - assistant/message 携带 data.usage
 *   - assistant/attempt（重试/中断）的用量只在流式块的最后一个 usage chunk 里
 *   - data.stream[].chunk.usage 与 data.usage 是同一份数据，重复累加会翻倍
 * ------------------------------------------------------------------ */
export function usageOf(rec) {
  if (rec.type === 'assistant/message' && rec.data?.usage) {
    return { usage: rec.data.usage, source: rec.data.message?.source, time: rec.time };
  }
  if (rec.type === 'assistant/attempt') {
    const stream = rec.data?.stream;
    if (Array.isArray(stream)) {
      for (let i = stream.length - 1; i >= 0; i--) {
        const u = stream[i]?.chunk?.usage;
        if (u) return { usage: u, source: undefined, time: rec.time };
      }
    }
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * 聚合
 * ------------------------------------------------------------------ */
function blankBucket() {
  return {
    miss: 0, hit: 0, out: 0, cacheWrite: 0, reasoning: 0, calls: 0,
    cny: 0, peakCalls: 0, unpricedCalls: 0,
    // 峰/谷分档累计（同一批 token 在高峰、空闲两档分别花了多少）
    tier: {
      peak: { hit: 0, miss: 0, out: 0, cny: 0, calls: 0 },
      offPeak: { hit: 0, miss: 0, out: 0, cny: 0, calls: 0 },
    },
    firstTime: null, lastTime: null,
    byHour: new Array(24).fill(0),
    models: new Map(),
  };
}

function accumulate(bucket, usage, model, ms, cost) {
  bucket.miss += usage.inputTokens || 0;
  bucket.hit += usage.cacheReadTokens || 0;
  bucket.out += usage.outputTokens || 0;
  bucket.cacheWrite += usage.cacheWriteTokens || 0;
  bucket.reasoning += usage.reasoningTokens || 0;
  bucket.calls += 1;
  if (bucket.firstTime == null || ms < bucket.firstTime) bucket.firstTime = ms;
  if (bucket.lastTime == null || ms > bucket.lastTime) bucket.lastTime = ms;
  if (cost) {
    bucket.cny += cost.cny;
    if (cost.peak) bucket.peakCalls += 1;
    // 按该次调用所处的档位分别记账（峰/谷各一份），后面面板要分开显示再汇总
    const t = cost.peak ? bucket.tier.peak : bucket.tier.offPeak;
    t.hit += usage.cacheReadTokens || 0;
    t.miss += usage.inputTokens || 0;
    t.out += usage.outputTokens || 0;
    t.cny += cost.cny;
    t.calls += 1;
  } else {
    bucket.unpricedCalls += 1;
  }
  bucket.byHour[hourOf(ms)] += (usage.inputTokens || 0) + (usage.cacheReadTokens || 0) + (usage.outputTokens || 0);
  if (model) bucket.models.set(model, (bucket.models.get(model) || 0) + 1);
}

function packBucket(b) {
  const totalIn = b.hit + b.miss;
  const packTier = (t) => ({
    miss: t.miss, hit: t.hit, out: t.out,
    calls: t.calls, cny: Number(t.cny.toFixed(6)),
  });
  return {
    miss: b.miss, hit: b.hit, out: b.out, cacheWrite: b.cacheWrite, reasoning: b.reasoning,
    calls: b.calls, cny: Number(b.cny.toFixed(6)), peakCalls: b.peakCalls, unpricedCalls: b.unpricedCalls,
    firstTime: b.firstTime, lastTime: b.lastTime,
    hitRate: totalIn > 0 ? Number(((100 * b.hit) / totalIn).toFixed(1)) : null,
    byHour: b.byHour,
    models: Object.fromEntries(b.models),
    tier: b.tier ? { peak: packTier(b.tier.peak), offPeak: packTier(b.tier.offPeak) } : undefined,
  };
}

/** 把 src 桶累加进 dst —— 用于缓存复用：每个文件的贡献单独算，命中缓存时直接合并。 */
function mergeBucket(dst, src) {
  dst.miss += src.miss; dst.hit += src.hit; dst.out += src.out;
  dst.cacheWrite += src.cacheWrite; dst.reasoning += src.reasoning;
  dst.calls += src.calls; dst.cny += src.cny;
  dst.peakCalls += src.peakCalls; dst.unpricedCalls += src.unpricedCalls;
  if (src.firstTime != null && (dst.firstTime == null || src.firstTime < dst.firstTime)) dst.firstTime = src.firstTime;
  if (src.lastTime != null && (dst.lastTime == null || src.lastTime > dst.lastTime)) dst.lastTime = src.lastTime;
  for (let i = 0; i < 24; i += 1) dst.byHour[i] += src.byHour[i];
  for (const tier of ['peak', 'offPeak']) {
    const a = dst.tier[tier], b = src.tier[tier];
    a.hit += b.hit; a.miss += b.miss; a.out += b.out; a.cny += b.cny; a.calls += b.calls;
  }
  for (const [m, n] of src.models) dst.models.set(m, (dst.models.get(m) || 0) + n);
}

/**
 * 算「一个会话日志文件」对总量的贡献，与全局状态无关 —— 因此可以按 (mtimeMs, size) 缓存：
 * 文件没变就直接合并上次的结果，跳过解压与解析（工作机上全量重扫曾要 70 秒）。
 * @param {object[]} records 该文件的记录
 * @param {{rates:object, includeOtherProviders:boolean, billingProviders:string[]}} opts
 * @param {object} f 文件描述（workspace/sessionId）
 */
function contributionOf(records, opts, f) {
  const { rates, includeOtherProviders, billingProviders } = opts;
  const days = new Map();
  const models = new Map();
  const providers = new Map();
  const bucket = blankBucket();
  bucket.id = f.sessionId;
  bucket.workspace = f.workspace;
  bucket.title = null;
  bucket.createdAt = null;
  bucket.delegationDepth = 0;
  bucket.parentId = null;
  bucket.agentLabel = null;
  let calls = 0;
  let unpriced = 0;

  for (const rec of records) {
    if (rec.type === 'session') {
      bucket.createdAt = rec.createdAt ?? rec.time ?? null;
      bucket.delegationDepth = rec.delegationDepth ?? 0;
      bucket.parentId = rec.parentSession ?? null;
      continue;
    }
    if (rec.type === 'subagent/descriptor') {
      bucket.agentLabel = rec.data?.label ?? rec.data?.description ?? bucket.agentLabel;
      continue;
    }
    if (rec.type === 'session/title' && rec.data?.title) {
      bucket.title = rec.data.title;
      continue;
    }
    const got = usageOf(rec);
    if (!got) continue;
    const provider = got.source?.provider ?? 'unknown';
    const model = got.source?.model ?? 'unknown';
    const billed = billingProviders.includes(provider);
    if (!billed && !includeOtherProviders) continue;

    calls += 1;
    const cost = billed ? costOf(got.usage, model, got.time, rates) : null;
    if (billed && !cost) unpriced += 1;
    const tokens = (got.usage.inputTokens || 0) + (got.usage.cacheReadTokens || 0) + (got.usage.outputTokens || 0);

    const dk = dayKeyOf(got.time);
    if (!days.has(dk)) days.set(dk, blankBucket());
    accumulate(days.get(dk), got.usage, model, got.time, cost);
    accumulate(bucket, got.usage, model, got.time, cost);

    const mk = `${provider} | ${model}`;
    if (!models.has(mk)) models.set(mk, blankBucket());
    accumulate(models.get(mk), got.usage, model, got.time, cost);

    const pt = providers.get(provider) ?? { calls: 0, tokens: 0, cny: 0 };
    pt.calls += 1; pt.tokens += tokens; pt.cny += cost ? cost.cny : 0;
    providers.set(provider, pt);
  }
  bucket.isSubagent = bucket.delegationDepth > 0;
  return { key: `${f.workspace}/${f.sessionId}`, session: bucket, days, models, providers, calls, unpriced };
}

/**
 * 会话日志文件名 → 格式代际。
 * 官方持久化布局（@deepseek-ai/dsh-session-persistence-jsonl）：
 *   `session.jsonl[.zstd]`（v0）、`session.vN.jsonl[.zstd]`
 * 运行时永远只读写「数值最高的 generation」，而迁移出的旧代际文件按设计
 * **逐字节保留在磁盘上**（"源保持逐字节不变"）。因此同一会话目录里出现
 * v3 + v4、v1 + v4、裸 session.jsonl + v4 都是正常状态，扫描时必须只取最高一代：
 *   - 全都收 → 同一批用量被算两次，金额翻倍
 *   - 写死只认某一代（早先是 v3）→ 升级到 v4 之后新增用量永远看不到
 * @param {string} name 文件名
 * @returns {{gen:number, compressed:boolean}|null} 非会话日志返回 null
 */
function generationOf(name) {
  const m = /^session(?:\.v(\d+))?\.jsonl(\.zstd)?$/.exec(name);
  if (!m) return null;
  return { gen: m[1] ? Number(m[1]) : 0, compressed: Boolean(m[2]) };
}

/**
 * 扫描会话根目录并聚合。
 * 目录层级实测为三层：<sessionsRoot>/<workspace>/<sessionId>/session[.vN].jsonl[.zstd]
 * （兼容工作区目录下直接放文件的形态）
 * @param {string} sessionsRoot 会话根目录
 * @param {{rates?:object, includeOtherProviders?:boolean, billingProviders?:string[], limit?:number, budgetMs?:number, cache?:Map}} [options]
 *        cache 为一个可复用的 Map<file, {mtimeMs,size,signature,contribution}>：调用方跨次保留它，
 *        未变动的日志文件会被直接复用（filesReused 报告命中数），已变动的重算。
 */
export function aggregate(sessionsRoot, { rates = PRICE_TIERS, includeOtherProviders = false, billingProviders = OFFICIAL_PROVIDERS, limit = Infinity, budgetMs = 0, cache = null } = {}) {
  const files = [];
  const listEntries = (p) => {
    try {
      return readdirSync(p, { withFileTypes: true }).map((e) => ({ path: join(p, e.name), name: e.name, dir: e.isDirectory() }));
    } catch {
      return [];
    }
  };
  if (existsSync(sessionsRoot)) {
    for (const ws of listEntries(sessionsRoot)) {
      if (!ws.dir) continue;
      for (const lvl2 of listEntries(ws.path)) {
        // 形态 A：<workspace>/<sessionDir>/<log>
        // 形态 B：<workspace>/<log>（工作区下直接放日志）
        const sessionId = lvl2.dir ? lvl2.name : lvl2.name.split('__')[0];
        const candidates = lvl2.dir ? listEntries(lvl2.path) : [lvl2];
        for (const c of candidates) {
          if (c.dir) continue;
          const generation = generationOf(c.name);
          if (!generation) continue; // session.lock、导出文件等一律不是会话日志
          let st;
          try { st = statSync(c.path); } catch { continue; }
          files.push({
            workspace: ws.name, sessionId, name: c.name, file: c.path,
            mtimeMs: st.mtimeMs, size: st.size, ...generation,
          });
        }
      }
    }
  }
  // 每个会话只保留最高代际；同代际（正常不会出现）先取压缩版，再取更新的那个。
  const newest = new Map();
  for (const f of files) {
    const key = `${f.workspace}/${f.sessionId}`;
    const prev = newest.get(key);
    if (!prev) { newest.set(key, f); continue; }
    const better = f.gen !== prev.gen
      ? f.gen > prev.gen
      : f.compressed !== prev.compressed
        ? f.compressed
        : f.mtimeMs > prev.mtimeMs;
    if (better) newest.set(key, f);
  }
  const all = [...newest.values()].sort((a, b) => b.mtimeMs - a.mtimeMs);
  const kept = all.slice(0, limit === Infinity ? undefined : limit);
  const skipped = all.slice(kept.length);

  const days = new Map();
  const sessions = new Map();
  const models = new Map();
  const providerTotals = new Map();
  let calls = 0, unpriced = 0, unreadable = 0, reused = 0;
  let newestMtime = 0;

  // 缓存的键里必须带「计价口径」签名：费率/口径变了，旧的贡献就不能再用（否则改了设置不生效）。
  const signature = JSON.stringify([rates, includeOtherProviders, billingProviders]);
  const contributionOpts = { rates, includeOtherProviders, billingProviders };

  const merge = (c) => {
    for (const [k, v] of c.days) {
      if (!days.has(k)) days.set(k, blankBucket());
      mergeBucket(days.get(k), v);
    }
    for (const [k, v] of c.models) {
      if (!models.has(k)) models.set(k, blankBucket());
      mergeBucket(models.get(k), v);
    }
    for (const [k, v] of c.providers) {
      const t = providerTotals.get(k) ?? { calls: 0, tokens: 0, cny: 0 };
      t.calls += v.calls; t.tokens += v.tokens; t.cny += v.cny;
      providerTotals.set(k, t);
    }
    calls += c.calls;
    unpriced += c.unpriced;
    sessions.set(c.key, c.session);
  };

  // 时间预算：会话日志可能非常大（几十上百个文件、单个几百 MB），全量解压会把首屏拖到一分钟以上。
  // kept 已按 mtime 倒序（最新优先），所以超预算直接停手，保住"最近/今天"这部分数据。
  const deadline = budgetMs > 0 ? Date.now() + budgetMs : Infinity;
  let scanned = 0;
  let partialScan = false;

  for (const f of kept) {
    if (Date.now() > deadline) { partialScan = true; break; }
    scanned += 1;
    if (f.mtimeMs > newestMtime) newestMtime = f.mtimeMs;

    const cached = cache instanceof Map ? cache.get(f.file) : undefined;
    if (cached && cached.mtimeMs === f.mtimeMs && cached.size === f.size && cached.signature === signature) {
      reused += 1;
      merge(cached.contribution);
      continue;
    }

    let records;
    try {
      records = readSessionRecords(f.file);
    } catch (error) {
      // 读不出来的文件仍然出一个（空的）会话条目，与旧行为一致；但**不写缓存**，下次还会重试
      unreadable += 1;
      merge(contributionOf([], contributionOpts, f));
      continue;
    }
    const contribution = contributionOf(records, contributionOpts, f);
    if (cache instanceof Map) cache.set(f.file, { mtimeMs: f.mtimeMs, size: f.size, signature, contribution });
    merge(contribution);
  }

  return {
    generatedAt: Date.now(),
    sessionsRoot,
    filesScanned: scanned,
    filesReused: reused,
    filesSkippedAsStale: skipped.map((f) => f.sessionId),
    unreadableFiles: unreadable,
    newestSourceMtime: newestMtime || null,
    partialScan,
    calls, unpricedCalls: unpriced,
    days: Object.fromEntries([...days.entries()].map(([k, v]) => [k, packBucket(v)])),
    sessions: Object.fromEntries([...sessions.entries()].map(([k, v]) => {
      const p = packBucket(v);
      return [k, {
        ...p,
        id: v.id, workspace: v.workspace, title: v.title, createdAt: v.createdAt,
        delegationDepth: v.delegationDepth, isSubagent: v.isSubagent,
        parentId: v.parentId, agentLabel: v.agentLabel,
      }];
    })),
    models: Object.fromEntries([...models.entries()].map(([k, v]) => [k, packBucket(v)])),
    providers: Object.fromEntries([...providerTotals.entries()].map(([k, v]) => [k, {
      calls: v.calls, tokens: v.tokens, cny: Number(v.cny.toFixed(6)),
    }])),
  };
}

/** 取某个时间点（默认现在）的北京日期键 */
export const todayKey = (now = Date.now()) => dayKeyOf(now);

/** 把聚合结果裁剪到只看最近 N 天（含今天），用于 7/30 天视图 */
export function sliceDays(summary, days, now = Date.now()) {
  const keys = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * 86400000);
    keys.push(dayKeyOf(d.getTime()));
  }
  return keys.map((k) => ({ day: k, ...(summary.days[k] ?? null) }));
}
