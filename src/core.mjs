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
export const BILLING_PROVIDER = 'deepseek-official';
const FALLBACK_RATE = 'deepseek-flash';

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
  } else {
    bucket.unpricedCalls += 1;
  }
  bucket.byHour[hourOf(ms)] += (usage.inputTokens || 0) + (usage.cacheReadTokens || 0) + (usage.outputTokens || 0);
  if (model) bucket.models.set(model, (bucket.models.get(model) || 0) + 1);
}

function packBucket(b) {
  const totalIn = b.hit + b.miss;
  return {
    miss: b.miss, hit: b.hit, out: b.out, cacheWrite: b.cacheWrite, reasoning: b.reasoning,
    calls: b.calls, cny: Number(b.cny.toFixed(6)), peakCalls: b.peakCalls, unpricedCalls: b.unpricedCalls,
    firstTime: b.firstTime, lastTime: b.lastTime,
    hitRate: totalIn > 0 ? Number(((100 * b.hit) / totalIn).toFixed(1)) : null,
    byHour: b.byHour,
    models: Object.fromEntries(b.models),
  };
}

/**
 * 扫描会话根目录并聚合。
 * 目录层级实测为三层：<sessionsRoot>/<workspace>/<sessionId>/session[.v3].jsonl.zstd
 * （兼容工作区目录下直接放文件的形态）
 * @param {string} sessionsRoot 会话根目录
 * @param {{rates?:object, includeOtherProviders?:boolean, limit?:number}} [options]
 */
export function aggregate(sessionsRoot, { rates = PRICE_TIERS, includeOtherProviders = false, limit = Infinity } = {}) {
  const files = [];
  const listEntries = (p) => {
    try {
      return readdirSync(p, { withFileTypes: true }).map((e) => ({ path: join(p, e.name), name: e.name, dir: e.isDirectory() }));
    } catch {
      return [];
    }
  };
  const isLog = (n) => n.endsWith('.jsonl') || n.endsWith('.jsonl.zstd');
  if (existsSync(sessionsRoot)) {
    for (const ws of listEntries(sessionsRoot)) {
      if (!ws.dir) continue;
      for (const lvl2 of listEntries(ws.path)) {
        // 形态 A：<workspace>/<sessionDir>/<log>
        // 形态 B：<workspace>/<log>（工作区下直接放日志）
        const sessionId = lvl2.dir ? lvl2.name : lvl2.name.split('__')[0];
        const candidates = lvl2.dir ? listEntries(lvl2.path) : [lvl2];
        for (const c of candidates) {
          if (c.dir || !isLog(c.name)) continue;
          let st;
          try { st = statSync(c.path); } catch { continue; }
          files.push({
            workspace: ws.name, sessionId, name: c.name, file: c.path,
            mtimeMs: st.mtimeMs, size: st.size,
          });
        }
      }
    }
  }
  // 同一会话 v3 与旧版并存时只认 v3，否则用量翻倍
  const v3Ids = new Set(
    files.filter((f) => f.name.includes('session.v3.jsonl')).map((f) => `${f.workspace}/${f.sessionId}`),
  );
  const all = files.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const kept = all
    .filter((f) => f.name.includes('session.v3.jsonl') || !v3Ids.has(`${f.workspace}/${f.sessionId}`))
    .slice(0, limit === Infinity ? undefined : limit);
  const skipped = all.filter((f) => !kept.includes(f));

  const days = new Map();
  const sessions = new Map();
  const models = new Map();
  const providerTotals = new Map();
  let calls = 0, unpriced = 0, unreadable = 0;
  let newestMtime = 0;

  for (const f of kept) {
    let records;
    try {
      records = readSessionRecords(f.file);
    } catch (error) {
      unreadable += 1;
      records = [];
    }
    if (f.mtimeMs > newestMtime) newestMtime = f.mtimeMs;

    const sBucket = blankBucket();
    sBucket.id = f.sessionId;
    sBucket.workspace = f.workspace;
    sBucket.title = null;
    sBucket.createdAt = null;
    sBucket.delegationDepth = 0;
    sBucket.parentId = null;
    sBucket.agentLabel = null;

    for (const rec of records) {
      if (rec.type === 'session') {
        sBucket.createdAt = rec.createdAt ?? rec.time ?? null;
        sBucket.delegationDepth = rec.delegationDepth ?? 0;
        sBucket.parentId = rec.parentSession ?? null;
        continue;
      }
      if (rec.type === 'subagent/descriptor') {
        sBucket.agentLabel = rec.data?.label ?? rec.data?.description ?? sBucket.agentLabel;
        continue;
      }
      if (rec.type === 'session/title' && rec.data?.title) {
        sBucket.title = rec.data.title;
        continue;
      }
      const got = usageOf(rec);
      if (!got) continue;
      const provider = got.source?.provider ?? 'unknown';
      const model = got.source?.model ?? 'unknown';
      const billed = provider === BILLING_PROVIDER;
      if (!billed && !includeOtherProviders) continue;

      calls += 1;
      const cost = billed ? costOf(got.usage, model, got.time, rates) : null;
      if (billed && !cost) unpriced += 1;
      const tk = (got.usage.inputTokens || 0) + (got.usage.cacheReadTokens || 0) + (got.usage.outputTokens || 0);

      const dk = dayKeyOf(got.time);
      if (!days.has(dk)) days.set(dk, blankBucket());
      const day = days.get(dk);
      accumulate(day, got.usage, model, got.time, cost);
      accumulate(sBucket, got.usage, model, got.time, cost);

      const mk = `${provider} | ${model}`;
      if (!models.has(mk)) models.set(mk, blankBucket());
      accumulate(models.get(mk), got.usage, model, got.time, cost);

      const pk = provider;
      if (!providerTotals.has(pk)) providerTotals.set(pk, { calls: 0, tokens: 0, cny: 0 });
      const pt = providerTotals.get(pk);
      pt.calls += 1; pt.tokens += tk; pt.cny += cost ? cost.cny : 0;
    }

    sBucket.isSubagent = sBucket.delegationDepth > 0;
    sessions.set(f.sessionId, sBucket);
  }

  return {
    generatedAt: Date.now(),
    sessionsRoot,
    filesScanned: kept.length,
    filesSkippedAsStale: skipped.map((f) => f.sessionId),
    unreadableFiles: unreadable,
    newestSourceMtime: newestMtime || null,
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
  const end = new Date(Date.now() ? now : now);
  const keys = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * 86400000);
    keys.push(dayKeyOf(d.getTime()));
  }
  return keys.map((k) => ({ day: k, ...(summary.days[k] ?? null) }));
}
