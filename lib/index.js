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
import { join } from 'node:path';
import { aggregate, PRICE_TIERS, PRICING_SOURCE, PRICING_FETCHED_AT, isPeakHour, dayKeyOf } from '../src/core.mjs';

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
 * 设置 schema（schemastery）
 *   解析不到 schemastery 时退化为「无 schema」，仍用组合配置 + 内置默认值工作，
 *   这样插件在任何组合里都不会因为一个可选依赖而整体加载失败。
 * ------------------------------------------------------------------ */
const DEFAULTS = {
  dailyBudget: 50,
  alertAtPercent: 80,
  // 默认关闭：不开这个开关时插件零出网（隐私优先；需要看余额时在设置里打开）
  showBalance: false,
  apiKeyEnv: 'DEEPSEEK_API_KEY',
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

async function loadConfigSchema() {
  try {
    const { default: z } = await import('@deepseek-ai/schemastery');
    // 注意：schemastery 的标量没有隐式默认值，字段缺省时会被对象丢掉 → 必须逐个 .default()
    const RateTriple = z.object({
      cacheHit: z.number().min(0).default(0.02).description('缓存命中输入单价（元/百万 token）'),
      cacheMiss: z.number().min(0).default(1).description('缓存未命中输入单价'),
      output: z.number().min(0).default(4).description('输出单价'),
    });
    const Rates = z.object({
      'deepseek-flash': RateTriple,
      'deepseek-v4-pro': RateTriple,
    });
    return z.object({
      dailyBudget: z.number().min(0).default(DEFAULTS.dailyBudget).description('每日预算（元），0 表示不限额'),
      alertAtPercent: z.number().min(0).max(100).default(DEFAULTS.alertAtPercent).description('达到预算的百分比时告警'),
      showBalance: z.boolean().default(DEFAULTS.showBalance).description('是否查询并显示账户余额'),
      apiKeyEnv: z.string().default(DEFAULTS.apiKeyEnv).role('credential-ref')
        .description('余额查询用的凭据名（凭据引用名，不是密钥本身）'),
      refreshSeconds: z.number().min(0).default(DEFAULTS.refreshSeconds).description('面板自动刷新间隔（秒），0 为不刷新'),
      officialOnly: z.boolean().default(DEFAULTS.officialOnly).description('只统计 DeepSeek 官方计费的调用'),
      offPeak: Rates.description('空闲时段费率（官方规则：高峰价的一半）'),
      peak: Rates.description('高峰时段费率（北京时间周一至周五 9-12、14-18）'),
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
      value.config = {
        dailyBudget: Number(cfg.dailyBudget) || 0,
        alertAtPercent: Number(cfg.alertAtPercent) || 80,
        showBalance: cfg.showBalance !== false,
        refreshSeconds: Number(cfg.refreshSeconds) || 0,
        officialOnly: cfg.officialOnly !== false,
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
            version: '0.1.0',
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
