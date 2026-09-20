/**
 * token-meter-panel — DSH Token 用量面板（宿主半侧）
 *
 * 职责：
 *   1. 采集：扫描 $DSH_HOME/sessions 下的会话日志（多帧 zstd，见 src/zstd.mjs），
 *      聚合成「按天 / 按会话 / 按模型」的 token 用量与花费
 *   2. 计价：按 DeepSeek 官方费率（高峰/空闲两档）折算人民币；费率可由用户在设置里改
 *   3. 供数：通过 ctx.webServer 暴露只读路由，供浏览器半侧的面板 fetch
 *   4. 余额：可选，用凭据里的 DeepSeek API key 调官方 /user/balance
 *   5. 设置：注册 token-meter-panel 设置 namespace（费率、预算、告警、余额开关）
 *
 * 浏览器半侧（侧栏面板）在 lib/client.js，按 package.json 的 dsh.client 被组合成 bundle。
 */
import { join, dirname } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { aggregate, PRICE_TIERS, PRICING_SOURCE, PRICING_FETCHED_AT, isPeakHour, dayKeyOf } from '../src/core.mjs';
import { readDeepseekPlatformToken } from '../src/chrome-storage.mjs';

/** 包元数据（health 路由要报真实版本号） */
const PKG = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

/** 稳定插件名 */
export const name = 'token-meter-panel';

/** 依赖的宿主服务。credentials 是可选的，因此不进这个列表（用 ctx.get 探测）。 */
export const inject = ['webServer', 'settings'];

/** 路由前缀 */
const ROUTE_BASE = '/token-meter-panel';

/** 聚合缓存有效期（毫秒）；面板可带 ?refresh=1 强制重算 */
const CACHE_TTL_MS = 5000;
/** 余额缓存有效期 */
const BALANCE_TTL_MS = 60000;
/** 官方余额端点（https://api-docs.deepseek.com/api/get-user-balance/） */
const BALANCE_URL = 'https://api.deepseek.com/user/balance';

/* ------------------------------------------------------------------ *
 * 官方用量：DeepSeek Platform 的 dashboard 私有端点（与平台「用量」页同源）
 *   - 需要网页登录态的 userToken（不是 API Key），按引用名从 DSH 凭据里取
 *   - 给出「按天 + 按小时」的费用、三类 token 与请求数；失败只影响这一个数字
 * ------------------------------------------------------------------ */
const PLATFORM_USAGE_BASE = 'https://platform.deepseek.com/api/v0/usage/by_api_key';
const USAGE_TTL_MS = 300000;
/** 面板按北京时间分日，请求也固定用 +08:00 偏移（接口只接受一个偏移量） */
const TZ_OFFSET_SEC = 8 * 3600;
/** 官方用量窗口（天），用于趋势图 */
const OFFICIAL_DAYS = 30;
/** 官方账单 / 用量页（面板上给出跳转） */
const PLATFORM_BILLING_URL = 'https://platform.deepseek.com/usage';

/** 取某个时刻所在的「北京时间自然日」区间 */
function beijingDayWindow(now = Date.now()) {
  const shifted = now + TZ_OFFSET_SEC * 1000;
  const dayStart = Math.floor(shifted / 86400000) * 86400000 - TZ_OFFSET_SEC * 1000;
  return { start: dayStart, end: dayStart + 86400000 };
}

/** 接口里的数值可能是裸数字、字符串，或 { value: "..." } 包装 */
function scalarValue(v) {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string') return Number(v) || 0;
  if (typeof v === 'object' && 'value' in v) return Number(v.value) || 0;
  return 0;
}

/**
 * 拉取官方用量（最近 OFFICIAL_DAYS 天，含今天与今天的分时）。
 * 认证用网页登录态的 userToken；端点为 Platform 私有接口，官方可能改动。
 */
async function fetchOfficialUsage(token, now = Date.now(), days = OFFICIAL_DAYS) {
  const { start, end } = beijingDayWindow(now);
  const from = start - (days - 1) * 86400000;
  const headers = {
    authorization: `Bearer ${token}`,
    accept: 'application/json',
    'x-client-platform': 'web',
  };
  /** 取一次用量：注意接口的桶粒度跟窗口跨度有关 —— 长窗口给「按天」，当天窗口才给「按小时」 */
  const get = async (kind, winStart, winEnd) => {
    const qs = `?start=${Math.floor(winStart / 1000)}&end=${Math.floor(winEnd / 1000)}&tz=${TZ_OFFSET_SEC}`;
    const res = await fetch(`${PLATFORM_USAGE_BASE}/${kind}${qs}`, { headers, signal: AbortSignal.timeout(15000) });
    if (res.status === 401 || res.status === 403) throw new Error('userToken 无效或已过期');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  };
  // 长窗口：按天（趋势 + 历史）；当天窗口：按小时（今日分时）
  const [amount, cost, amountToday] = await Promise.all([
    get('amount', from, end),
    get('cost', from, end),
    get('amount', start, end),
  ]);
  const code = Number(amount?.code ?? 0);
  if (code !== 0) throw new Error(`接口返回 code ${code}${amount?.msg ? `：${amount.msg}` : ''}`);
  const bizCode = Number(amount?.data?.biz_code ?? 0);
  if (bizCode !== 0) throw new Error(`接口返回 biz_code ${bizCode}`);

  const todayKey = dayKeyOf(now);
  const yesterdayKey = dayKeyOf(now - 86400000);
  const bucketDay = (unixSec) => dayKeyOf(unixSec * 1000);
  const bucketHour = (unixSec) => new Date(unixSec * 1000 + 8 * 3600e3).getUTCHours();
  const blank = () => ({ cny: 0, hit: 0, miss: 0, out: 0, requests: 0, byHour: new Array(24).fill(0) });
  const dayMap = {};
  for (let i = 0; i < days; i++) dayMap[dayKeyOf(now - i * 86400000)] = blank();

  let currency = 'CNY';
  for (const block of cost?.data?.biz_data?.data ?? []) {
    if (block?.currency) currency = block.currency;
    for (const series of block?.series ?? []) {
      for (const bucket of series?.buckets ?? []) {
        const d = dayMap[bucketDay(bucket?.time ?? 0)];
        if (d) d.cny += scalarValue(bucket?.cost);
      }
    }
  }
  for (const series of amount?.data?.biz_data?.series ?? []) {
    for (const bucket of series?.buckets ?? []) {
      const d = dayMap[bucketDay(bucket?.time ?? 0)];
      if (!d) continue;
      let tokens = 0;
      for (const [key, value] of Object.entries(bucket?.usage ?? {})) {
        const v = scalarValue(value);
        switch (String(key).toUpperCase()) {
          case 'PROMPT_CACHE_HIT_TOKEN': d.hit += v; tokens += v; break;
          case 'PROMPT_CACHE_MISS_TOKEN': d.miss += v; tokens += v; break;
          case 'RESPONSE_TOKEN': d.out += v; tokens += v; break;
          case 'REQUEST': d.requests += v; break;
          default: break;
        }
      }
      d.byHour[bucketHour(bucket?.time ?? 0)] += tokens;
    }
  }
  // 今日分时：来自「当天窗口」的那次请求（长窗口的桶是按天的，用来填分时会全落在 0 点）
  const todayRec = dayMap[todayKey];
  if (todayRec) {
    const byHour = new Array(24).fill(0);
    for (const series of amountToday?.data?.biz_data?.series ?? []) {
      for (const bucket of series?.buckets ?? []) {
        if (bucketDay(bucket?.time ?? 0) !== todayKey) continue;
        let tokens = 0;
        for (const [key, value] of Object.entries(bucket?.usage ?? {})) {
          const k = String(key).toUpperCase();
          if (k === 'REQUEST') continue;
          tokens += scalarValue(value);
        }
        byHour[bucketHour(bucket?.time ?? 0)] += tokens;
      }
    }
    todayRec.byHour = byHour;
  }

  const t = dayMap[todayKey] ?? blank();
  const y = dayMap[yesterdayKey] ?? blank();
  return {
    cny: t.cny,
    currency,
    hit: t.hit,
    miss: t.miss,
    out: t.out,
    requests: t.requests,
    byHour: t.byHour,
    yesterdayCny: y.cny,
    yesterdayRequests: y.requests,
    todayKey,
    days: Object.fromEntries(Object.entries(dayMap).map(([k, v]) => [k, {
      cny: Number(v.cny.toFixed(6)), hit: v.hit, miss: v.miss, out: v.out, requests: v.requests,
    }])),
    start,
    end,
  };
}

/* ------------------------------------------------------------------ *
 * 设置 schema（schemastery）
 *   解析不到 schemastery 时退化为「无 schema」，仍用组合配置 + 内置默认值工作，
 *   这样插件在任何组合里都不会因为一个可选依赖而整体加载失败。
 * ------------------------------------------------------------------ */
const DEFAULTS = {
  dailyBudget: 50,
  alertAtPercent: 80,
  // 默认开启余额查询（在设置里关掉即恢复零出网）
  showBalance: true,
  apiKeyEnv: 'DEEPSEEK_API_KEY',
  // 官方用量（Platform 私有端点）需要网页登录态的 userToken
  showOfficial: true,
  platformTokenEnv: 'DEEPSEEK_PLATFORM_TOKEN',
  /** 皮肤：default（跟随 DSH 主题）/ glass（液态玻璃）—— 0.3 预览期默认玻璃 */
  skin: 'glass',
  refreshSeconds: 60,
  officialOnly: true,
  offPeak: {
    'deepseek-flash': { cacheHit: 0.02, cacheMiss: 1, output: 4 },
    'deepseek-v4-pro': { cacheHit: 0.15, cacheMiss: 4.5, output: 13.5 },
  },
  peak: {
    'deepseek-flash': { cacheHit: 0.04, cacheMiss: 2, output: 8 },
    'deepseek-v4-pro': { cacheHit: 0.3, cacheMiss: 9, output: 27 },
  },
};

export async function loadConfigSchema() {
  try {
    const { default: z } = await import('@deepseek-ai/schemastery');
    // 注意：schemastery 的标量没有隐式默认值，字段缺省时会被对象丢掉 → 必须逐个 .default()
    // 更要紧的是：schema 会把缺失的 offPeak/peak 整个补出来，所以**两档的默认值必须各自正确**，
    // 否则高峰时段的费用会被按空闲价（半价）计算（实测踩过：两档都被填成 0.02/1/4）。
    const triple = (hit, miss, out) => z.object({
      cacheHit: z.number().min(0).default(hit).description('缓存命中输入单价（元/百万 token）'),
      cacheMiss: z.number().min(0).default(miss).description('缓存未命中输入单价'),
      output: z.number().min(0).default(out).description('输出单价'),
    });
    const fill = (tier) => z.object({
      'deepseek-flash': triple(tier['deepseek-flash'].cacheHit, tier['deepseek-flash'].cacheMiss, tier['deepseek-flash'].output),
      'deepseek-v4-pro': triple(tier['deepseek-v4-pro'].cacheHit, tier['deepseek-v4-pro'].cacheMiss, tier['deepseek-v4-pro'].output),
    });
    return z.object({
      dailyBudget: z.number().min(0).default(DEFAULTS.dailyBudget).description('每日预算（元），0 表示不限额'),
      alertAtPercent: z.number().min(0).max(100).default(DEFAULTS.alertAtPercent).description('达到预算的百分比时告警'),
      showBalance: z.boolean().default(DEFAULTS.showBalance).description('是否查询并显示账户余额'),
      apiKeyEnv: z.string().default(DEFAULTS.apiKeyEnv).role('credential-ref')
        .description('余额查询用的凭据名（凭据引用名，不是密钥本身）'),
      showOfficial: z.boolean().default(DEFAULTS.showOfficial)
        .description('是否向 DeepSeek Platform 查询官方用量（需要 userToken）'),
      platformTokenEnv: z.string().default(DEFAULTS.platformTokenEnv).role('credential-ref')
        .description('官方用量用的 Platform userToken 凭据名（网页登录态，不是 API Key）'),
      refreshSeconds: z.number().min(0).default(DEFAULTS.refreshSeconds).description('面板自动刷新间隔（秒），0 为不刷新'),
      officialOnly: z.boolean().default(DEFAULTS.officialOnly).description('只统计 DeepSeek 官方计费的调用'),
      skin: z.union([z.const('default'), z.const('glass')]).default(DEFAULTS.skin)
        .description('面板皮肤：default 跟随 DSH 主题；glass 液态玻璃'),
      offPeak: fill(DEFAULTS.offPeak).description('空闲时段费率（官方规则：高峰价的一半）'),
      peak: fill(DEFAULTS.peak).description('高峰时段费率（北京时间周一至周五 9-12、14-18）'),
    });
  } catch (error) {
    return null;
  }
}

let schemaPromise = null;
function configSchema() {
  if (!schemaPromise) schemaPromise = loadConfigSchema();
  return schemaPromise;
}

/** 把解析后的设置摊平成 core.mjs 认识的费率形状 */
function ratesFromSettings(value) {
  const rates = {};
  for (const key of Object.keys(PRICE_TIERS)) {
    const family = key.startsWith('deepseek-v4-pro') ? 'deepseek-v4-pro' : 'deepseek-flash';
    const off = value?.offPeak?.[family];
    const peak = value?.peak?.[family];
    if (!off || !peak) { rates[key] = PRICE_TIERS[key]; continue; }
    rates[key] = {
      label: PRICE_TIERS[key].label,
      cacheHit: { offPeak: Number(off.cacheHit), peak: Number(peak.cacheHit) },
      cacheMiss: { offPeak: Number(off.cacheMiss), peak: Number(peak.cacheMiss) },
      output: { offPeak: Number(off.output), peak: Number(peak.output) },
    };
  }
  return rates;
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(payload));
}

function queryOf(request) {
  try {
    return new URL(request.url ?? '', 'http://localhost').searchParams;
  } catch {
    return new URLSearchParams();
  }
}


/**
 * 插件主体。
 * @param {object} ctx Cordis 上下文
 * @param {object} config 组合配置（cordis.patch.yml 的 config，已过 schema）
 */
export function apply(ctx, config = {}) {
  const logger = typeof ctx.logger === 'function' ? ctx.logger('token-meter-panel') : ctx.logger;
  const home = process.env.DSH_HOME || join(process.env.USERPROFILE || process.env.HOME || '.', '.dsh');
  const sessionsRoot = config.sessionsRoot || join(home, 'sessions');

  // ---- 设置：可选服务。用 ctx.inject 作为优雅降级边界——
  //      服务缺席时回调永不执行，插件仍以组合配置 + 内置默认值工作。
  let scope = null;
  const settings = () => ({
    ...DEFAULTS,
    ...(config && typeof config === 'object' ? config : {}),
    ...(scope?.get?.() ?? {}),
  });
  ctx.inject(['settings'], (sctx) => {
    configSchema().then((Schema) => {
      if (!Schema) return;
      try {
        // watch 在 register 返回的 scope 上，不在 settings 服务上
        scope = sctx.settings.register('token-meter-panel', Schema, { base: config });
        sctx.effect(() => scope.watch(() => {
          cache = { at: 0, value: null, computing: null }; // 改了费率/预算立刻重算
        }), 'token-meter-panel: settings watch');
      } catch (error) {
        logger?.warn?.(`settings namespace unavailable: ${error?.message ?? error}`);
      }
    });
  });

  // ---- 聚合缓存 ----
  let cache = { at: 0, value: null, computing: null };
  function summary({ force = false } = {}) {
    const now = Date.now();
    if (!force && cache.value && now - cache.at < CACHE_TTL_MS) return Promise.resolve(cache.value);
    if (cache.computing) return cache.computing;
    const task = (async () => {
      const cfg = settings();
      const started = Date.now();
      const value = aggregate(sessionsRoot, {
        rates: ratesFromSettings(cfg),
        includeOtherProviders: cfg.officialOnly === false,
      });
      value.elapsedMs = Date.now() - started;
      value.today = dayKeyOf(Date.now());
      value.peakNow = isPeakHour(Date.now());
      value.pricing = { source: PRICING_SOURCE, fetchedAt: PRICING_FETCHED_AT };
      value.sessionsRoot = sessionsRoot;
      value.official = await fetchOfficial();
      // 官方用量可用时，天/时维度直接采用官方数据（与平台用量页同源）；按会话明细仍来自本地日志
      if (value.official?.ok && value.official.days) {
        const o = value.official;
        const officialDays = {};
        for (const [date, d] of Object.entries(o.days)) {
          const inTok = d.hit + d.miss;
          officialDays[date] = {
            miss: d.miss, hit: d.hit, out: d.out, cacheWrite: 0, reasoning: 0,
            calls: d.requests, cny: d.cny, peakCalls: 0, unpricedCalls: 0,
            hitRate: inTok > 0 ? Number(((100 * d.hit) / inTok).toFixed(1)) : null,
            byHour: date === o.todayKey ? o.byHour : new Array(24).fill(0),
          };
        }
        value.days = officialDays;
        value.calls = o.requests;
        value.unpricedCalls = 0;
        value.meterSource = 'official';
      } else {
        value.meterSource = 'local';
      }
      value.billingUrl = PLATFORM_BILLING_URL;
      value.config = {
        dailyBudget: Number(cfg.dailyBudget) || 0,
        alertAtPercent: Number(cfg.alertAtPercent) || 80,
        showBalance: cfg.showBalance !== false,
        showOfficial: cfg.showOfficial !== false,
        platformTokenEnv: cfg.platformTokenEnv || 'DEEPSEEK_PLATFORM_TOKEN',
        refreshSeconds: Number(cfg.refreshSeconds) || 0,
        officialOnly: cfg.officialOnly !== false,
        skin: cfg.skin === 'glass' ? 'glass' : 'default',
        rates: cfg.offPeak ? { offPeak: cfg.offPeak, peak: cfg.peak } : null,
      };
      cache = { at: Date.now(), value, computing: null };
      return value;
    })();
    cache.computing = task.catch((error) => {
      cache.computing = null;
      throw error;
    });
    return cache.computing;
  }

  // ---- 余额（可选：credentials 服务缺席 / 未配置 key 都优雅返回） ----
  let balance = { at: 0, payload: null };
  async function fetchBalance({ force = false } = {}) {
    const cfg = settings();
    if (cfg.showBalance === false) return { supported: false, reason: 'disabled' };
    const now = Date.now();
    if (!force && balance.payload && now - balance.at < BALANCE_TTL_MS) return balance.payload;
    const ref = cfg.apiKeyEnv || 'DEEPSEEK_API_KEY';
    // ctx.get 对未提供的服务返回 undefined，不抛错；provider 可能晚于本插件激活，所以惰性取
    const credentials = ctx.get?.('credentials');
    let key;
    if (credentials?.resolve) {
      try {
        key = (await credentials.resolve(ref))?.value;
      } catch (error) {
        const payload = { supported: true, ok: false, ref, error: `凭据读取失败：${error?.message ?? error}` };
        balance = { at: now, payload };
        return payload;
      }
    } else {
      key = process.env[ref];
    }
    if (!key) {
      const payload = { supported: true, ok: false, ref, error: `未配置凭据 ${ref}` };
      balance = { at: now, payload };
      return payload;
    }
    try {
      const response = await fetch(BALANCE_URL, {
        headers: { authorization: `Bearer ${key}`, accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        const payload = { supported: true, ok: false, ref, error: `官方接口返回 HTTP ${response.status}` };
        balance = { at: now, payload };
        return payload;
      }
      const body = await response.json();
      const payload = { supported: true, ok: true, ref, ...body };
      balance = { at: now, payload };
      return payload;
    } catch (error) {
      const payload = { supported: true, ok: false, ref, error: `请求失败：${error?.message ?? error}` };
      balance = { at: now, payload };
      return payload;
    }
  }

  // ---- 官方用量（Platform 私有端点，需 userToken；失败只影响这一个数字） ----
  let official = { at: 0, payload: null };
  async function fetchOfficial({ force = false } = {}) {
    const cfg = settings();
    if (cfg.showOfficial === false) return { ok: false, reason: 'disabled' };
    const now = Date.now();
    if (!force && official.payload && now - official.at < USAGE_TTL_MS) return official.payload;
    const ref = cfg.platformTokenEnv || 'DEEPSEEK_PLATFORM_TOKEN';
    const credentials = ctx.get?.('credentials');
    let token;
    let autoToken = false;
    if (credentials?.resolve) {
      try {
        token = (await credentials.resolve(ref))?.value;
      } catch (error) {
        const payload = { ok: false, ref, reason: 'credential-error', error: `${error?.message ?? error}` };
        official = { at: now, payload };
        return payload;
      }
    } else {
      token = process.env[ref];
    }
    if (!token) {
      // 零配置：直接读浏览器登录态（Edge/Chrome 的 Local Storage），用户无需复制粘贴
      try {
        token = await readDeepseekPlatformToken();
        if (token) autoToken = true;
      } catch (error) {
        logger?.warn?.(`browser session read failed: ${error?.message ?? error}`);
      }
    }
    if (!token) {
      const payload = { ok: false, ref, reason: 'no-credential' };
      official = { at: now, payload };
      return payload;
    }
    try {
      const result = await fetchOfficialUsage(token, now);
      const payload = {
        ok: true,
        ref,
        auto: autoToken,
        source: 'platform.deepseek.com/api/v0/usage/by_api_key',
        fetchedAt: Date.now(),
        ...result,
      };
      official = { at: now, payload };
      return payload;
    } catch (error) {
      const payload = { ok: false, ref, reason: 'request-failed', error: `${error?.message ?? error}` };
      official = { at: now, payload };
      logger?.warn?.(`official usage unavailable: ${error?.message ?? error}`);
      return payload;
    }
  }

  // ---- 路由准入：webServer 自身不做鉴权，复用 connection 的 Host/Origin 围栏 + 浏览器认证 ----
  const guarded = (handler) => async (request, response) => {
    const connection = ctx.get?.('connection');
    let rejection;
    try {
      rejection = connection?.requestRejection?.(request);
    } catch {
      rejection = undefined;
    }
    if (rejection !== undefined) {
      response.writeHead(rejection);
      response.end();
      return;
    }
    return handler(request, response);
  };

  // ---- 「先做后清」：建立逻辑与清理都挂在同一个 effect 上，注册中途失败也不会泄漏 ----
  ctx.effect(() => {
    const disposers = [
      ctx.webServer.register({
        kind: 'exact',
        path: `${ROUTE_BASE}/summary`,
        handler: guarded(async (request, response) => {
          if (request.method !== 'GET') {
            response.writeHead(405, { allow: 'GET' });
            response.end();
            return;
          }
          try {
            const force = queryOf(request).get('refresh') === '1';
            sendJson(response, 200, { ok: true, data: await summary({ force }) });
          } catch (error) {
            logger?.warn?.(`summary failed: ${error?.stack ?? error}`);
            sendJson(response, 500, { ok: false, error: String(error?.message ?? error) });
          }
        }),
      }),
      ctx.webServer.register({
        kind: 'exact',
        path: `${ROUTE_BASE}/balance`,
        handler: guarded(async (request, response) => {
          if (request.method !== 'GET') {
            response.writeHead(405, { allow: 'GET' });
            response.end();
            return;
          }
          try {
            const force = queryOf(request).get('refresh') === '1';
            sendJson(response, 200, { ok: true, data: await fetchBalance({ force }) });
          } catch (error) {
            sendJson(response, 200, { ok: true, data: { supported: true, ok: false, error: String(error?.message ?? error) } });
          }
        }),
      }),
      // 自检路由：安装后用它可以确认宿主半侧真的活着
      ctx.webServer.register({
        kind: 'exact',
        path: `${ROUTE_BASE}/health`,
        handler: guarded((request, response) => {
          sendJson(response, 200, {
            ok: true,
            plugin: name,
            version: PKG.version,
            sessionsRoot,
            pricing: { source: PRICING_SOURCE, fetchedAt: PRICING_FETCHED_AT },
            supportedRateKeys: Object.keys(PRICE_TIERS),
            settingsReady: scope !== null,
            settingsService: Boolean(ctx.get?.('settings')),
            credentialsService: Boolean(ctx.get?.('credentials')),
          });
        }),
      }),
    ];
    return () => {
      for (const dispose of disposers) {
        try { dispose?.(); } catch { /* 卸载期清理失败不应打断取消流程 */ }
      }
    };
  }, 'token-meter-panel: http routes');

  logger?.info?.(`mounted (sessions=${sessionsRoot})`);
}
