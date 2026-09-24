import React from 'react';

/**
 * token-meter-panel 浏览器半侧：DSH 侧栏入口 + 中栏独立面板。
 *
 * 数据来源（两者结合，按用户确认的口径）：
 *   1. 全量日志聚合：GET /token-meter-panel/summary （宿主半侧扫描 ~/.dsh/sessions 得到
 *      今日 / 7天 / 30天 / 按会话明细，这是「按天历史」唯一的来源）
 *   2. 当前会话实时用量：useProjection('tokenUsage') （官方 token 计量投影，
 *      数值随会话事件流自动更新，用来在面板底部显示「本会话实时」小块）
 *
 * 样式：只用 DSH 自己的 --dsw-* 主题变量，因此在深浅色主题下都跟界面一致。
 */

const SLOT_ID = 'tokenmeter';
const ROUTE = '/token-meter-panel/summary';

/* ------------------------------------------------------------------ *
 * 文案
 * ------------------------------------------------------------------ */
const zh = {
  'nav': 'Token 用量',
  'title': 'Token 用量',
  'subtitle': 'DeepSeek 官方 API',
  'today': '今日消费',
  'peak': '高峰时段计价',
  'offpeak': '空闲档 · 半价',
  'vsPrev': 'vs 上次使用',
  'budgetUsed': '预算',
  'used': '已用',
  'remain': '剩余',
  'balance': '账户余额',
  'checkBalance': '查询余额',
  'peakHourLabel': '峰值',
  'peakShort': '高峰',
  'offShort': '空闲',
  'currentTier': '当前时段',
  'officialLabel': '官方',
  'localShort': '本地日志',
  'yesterdayLabel': '昨天',
  'historyTitle': '历史（官方查询）',
  'autoSession': '浏览器登录态',
  'notConnected': '未连接',
  'officialLoading': '正在获取官方数据…',
  'firstLoad': '首次加载，请稍等',
  'firstLoadHint': '（要读浏览器登录态并扫描本机会话日志，通常几秒）',
  'sumLabel': '合计',
  'fromOfficial': '官方',
  'tierFromLocal': '峰/谷按本机日志分档',
  'byCurrentTier': '按当前时段单价',
  'licenseLabel': '开源协议',
  'updateAvailable': '有新版本',
  'updateAuto': '后台自动更新中（重启 DSH 生效）',
  'updateRunning': '正在后台更新…',
  'updateApplied': '已后台更新完成，重启 DSH 生效',
  'updateFailed': '后台更新失败（缺 pnpm？）',
  'copyCmd': '复制更新命令',
  'copied': '已复制 ✓',
  'viewRelease': '发布说明',
  'connectOfficial': '连接官方',
  'connectHint': '首次会打开官方网页，未登录请先在页面里登录，回来即自动生效',
  'localEstimate': '本地推算',
  'diffLabel': '差',
  'officialOff': '官方用量已关闭',
  'officialNoToken': '未配置 Platform userToken',
  'billingLink': '官方账单页',
  'tierTitle': '峰谷价',
  'peakWindow': '高峰：周一至周五 9:00-12:00、14:00-18:00（北京时间）',
  'rangeCustom': '自定义',
  'unitPrices': '计费单价（元/百万 token）',
  'warnLine': '告警线',
  'rateDetail': '计费明细',
  'vsPrevOn': '较',
  'notEnabled': '未开启',
  'balanceFailed': '查询失败',
  'fewDays': '更早没有记录',
  'showAllSessions': '查看全部',
  'collapseSessions': '收起',
  'missInput': '未命中输入',
  'hitInput': '缓存命中输入',
  'output': '输出',
  'hitRate': '缓存命中率',
  'calls': '次调用',
  'trend': '每日消费趋势',
  'byHour': '今日分时用量',
  'costSplit': '今日成本构成',
  'sessions': '今日按会话明细',
  'session': '会话',
  'lastCall': '最近调用',
  'callsShort': '调用',
  'cost': '消费',
  'share': '占比',
  'subagent': '子代理',
  'zeroDays': '无调用',
  'noData': '还没有用量记录',
  'noDataHint': '这个会话或本机还没有产生 DeepSeek 官方计费的调用。',
  'loading': '读取用量…',
  'failed': '读取失败',
  'retry': '重试',
  'refresh': '刷新',
  'auto': '自动刷新',
  'live': '本会话实时',
  'liveHint': '来自官方 tokenUsage 投影，随对话即时更新',
  'overBudget': '已超预算',
  'peakNow': '当前为高峰时段（双倍价）',
  'offNow': '当前为空闲时段（半价）',
  'range7': '近 7 天',
  'range30': '近 30 天',
  'source': '数据源',
  'updated': '更新于',
  'partial': '当前会话仍在写入，今日数字是下界',
  'rateLine': '计费口径',
};

const en = {
  'nav': 'Token usage',
  'title': 'Token usage',
  'subtitle': 'DeepSeek official API',
  'today': 'Spent today',
  'peak': 'peak-hour pricing',
  'offpeak': 'off-peak · half price',
  'vsPrev': 'vs last use',
  'budgetUsed': 'Budget',
  'used': 'used',
  'remain': 'left',
  'balance': 'Balance',
  'checkBalance': 'Check balance',
  'peakHourLabel': 'peak',
  'peakShort': 'Peak',
  'offShort': 'Off-peak',
  'currentTier': 'Current period',
  'officialLabel': 'Official',
  'localShort': 'local log',
  'yesterdayLabel': 'yesterday',
  'historyTitle': 'History (official query)',
  'autoSession': 'browser session',
  'notConnected': 'not connected',
  'officialLoading': 'fetching official data…',
  'firstLoad': 'First load, please wait',
  'firstLoadHint': '(reading browser session and scanning local session logs — usually a few seconds)',
  'sumLabel': 'Total',
  'fromOfficial': 'official',
  'tierFromLocal': 'peak/off-peak split from local logs',
  'byCurrentTier': 'at the current tier price',
  'licenseLabel': 'license',
  'updateAvailable': 'update available',
  'updateAuto': 'auto-updating in background (restart DSH)',
  'updateRunning': 'updating in background…',
  'updateApplied': 'updated in background — restart DSH',
  'updateFailed': 'background update failed (pnpm missing?)',
  'copyCmd': 'copy update command',
  'copied': 'copied ✓',
  'viewRelease': 'release notes',
  'connectOfficial': 'Connect',
  'connectHint': 'opens the official page; sign in there first, then come back',
  'localEstimate': 'local estimate',
  'diffLabel': 'diff',
  'officialOff': 'Official usage is off',
  'officialNoToken': 'Platform userToken not configured',
  'billingLink': 'Official billing page',
  'tierTitle': 'Peak / off-peak rates',
  'peakWindow': 'Peak: Mon-Fri 09:00-12:00, 14:00-18:00 (Beijing time)',
  'rangeCustom': 'Custom',
  'unitPrices': 'Unit prices (CNY per million tokens)',
  'notEnabled': 'off',
  'balanceFailed': 'lookup failed',
  'warnLine': 'Alert line',
  'rateDetail': 'Rate detail',
  'vsPrevOn': 'vs',
  'fewDays': 'no earlier records',
  'showAllSessions': 'Show all',
  'collapseSessions': 'Collapse',
  'missInput': 'Uncached input',
  'hitInput': 'Cached input',
  'output': 'Output',
  'hitRate': 'Cache hit rate',
  'calls': 'calls',
  'trend': 'Daily spend',
  'byHour': 'Today by hour',
  'costSplit': 'Cost breakdown today',
  'sessions': 'Today by session',
  'session': 'Session',
  'lastCall': 'Last call',
  'callsShort': 'Calls',
  'cost': 'Cost',
  'share': 'Share',
  'subagent': 'subagent',
  'zeroDays': 'no calls',
  'noData': 'No usage recorded yet',
  'noDataHint': 'No DeepSeek-billed calls have been recorded yet.',
  'loading': 'Loading usage…',
  'failed': 'Failed to load',
  'retry': 'Retry',
  'refresh': 'Refresh',
  'auto': 'Auto refresh',
  'live': 'This session',
  'liveHint': 'Live from the official tokenUsage projection',
  'overBudget': 'over budget',
  'peakNow': 'Peak hours now (double price)',
  'offNow': 'Off-peak now (half price)',
  'range7': '7 days',
  'range30': '30 days',
  'source': 'Source',
  'updated': 'Updated',
  'partial': 'This session is still appending; today is a lower bound',
  'rateLine': 'Pricing',
};

/* ------------------------------------------------------------------ *
 * 小组件
 * ------------------------------------------------------------------ */
const fmt = (n) => {
  const v = Number(n) || 0;
  if (v >= 1e6) return (v / 1e6).toFixed(v / 1e6 >= 10 ? 1 : 2) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(v / 1e3 >= 10 ? 0 : 1) + 'K';
  return String(Math.round(v));
};
/** 一律用 M（百万）为单位，便于把「按 M × 单价」的算式对齐看懂 */
const fmtM = (n) => {
  const v = Number(n) || 0;
  if (v >= 1e7) return (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return (v / 1e6).toFixed(3) + 'M';
  return (v / 1e6).toFixed(4) + 'M';
};
const money = (n) => '¥' + (Number(n) || 0).toFixed(2);
const pct = (a, b) => (b > 0 ? (100 * a) / b : 0);
const hhmm = (ms) => {
  if (!ms) return '—';
  const d = new Date(ms + 8 * 3600e3);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};
const clock = (ms) => new Date(ms).toTimeString().slice(0, 8);

const C = {
  // 三色（方案 B：青绿 / 琥珀 / 靛蓝）—— 色相 165°/35°/245°，两两间隔 ≥80°，
  // 图例 9px 小色块并排也能一眼分开；绿=命中省钱、琥珀=未命中花钱，语义直觉一致。
  // 浅色主题对应值（#0D9488 / #B45309 / #4F46E5）待接入主题检测后切换。
  hit: '#2DD4BF',
  miss: '#F59E0B',
  out: '#818CF8',
  warn: 'var(--dsw-alias-state-warn-primary, #e3b341)',
  error: 'var(--dsw-alias-state-error-primary, #f85149)',
  ok: 'var(--dsw-alias-state-success-primary, #3fb950)',
  label: 'var(--dsw-alias-label-primary, #1f2329)',
  label2: 'var(--dsw-alias-label-secondary, #5a6472)',
  label3: 'var(--dsw-alias-label-tertiary, #8a94a6)',
  border: 'var(--dsw-alias-border-l2, rgba(128,128,128,.25))',
  border1: 'var(--dsw-alias-border-l1, rgba(128,128,128,.16))',
  layer1: 'var(--dsw-alias-bg-layer-1, rgba(128,128,128,.06))',
  layer2: 'var(--dsw-alias-bg-layer-2, rgba(128,128,128,.10))',
  brand: 'var(--dsw-alias-brand-primary, #2f7dff)',
};
const card = {
  border: `1px solid ${C.border1}`,
  borderRadius: 12,
  background: C.layer1,
  padding: '12px 13px',
  marginTop: 12,
};

/* ------------------------------------------------------------------ *
 * 皮肤（0.3）：皮肤 = 一组「表面 token」，几何字面量写死，颜色一律基于 --dsw-*
 *   变换（color-mix），所以深浅主题都跟着走；文字与语义色（命中/未命中/输出）
 *   不参与皮肤化，保证任何皮肤下金额都足够清晰、三色仍可区分。
 * ------------------------------------------------------------------ */
const GLASS_BLUR = 'blur(22px) saturate(170%)';
const SKINS = {
  default: {
    card: { ...card },
    hero: {
      border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px 16px',
      background: 'var(--dsw-alias-bg-layer-2, rgba(47,125,255,.06))',
    },
    panel: { border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px 16px', background: C.layer1 },
    stat: { border: `1px solid ${C.border1}`, borderRadius: 12, background: C.layer1 },
  },
  glass: {
    card: {
      border: '1px solid color-mix(in srgb, var(--dsw-alias-label-primary) 13%, transparent)',
      borderRadius: 16,
      padding: '12px 13px',
      marginTop: 12,
      background: 'color-mix(in srgb, var(--dsw-alias-bg-layer-1) 50%, transparent)',
      backdropFilter: GLASS_BLUR,
      WebkitBackdropFilter: GLASS_BLUR,
      boxShadow: '0 10px 32px rgba(0,0,0,.22), inset 0 1px 0 color-mix(in srgb, #fff 20%, transparent)',
    },
    hero: {
      border: '1px solid color-mix(in srgb, var(--dsw-alias-label-primary) 15%, transparent)',
      borderRadius: 18,
      padding: '14px 16px',
      background: 'linear-gradient(150deg, color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, transparent), transparent 62%), color-mix(in srgb, var(--dsw-alias-bg-layer-1) 52%, transparent)',
      backdropFilter: GLASS_BLUR,
      WebkitBackdropFilter: GLASS_BLUR,
      boxShadow: '0 14px 40px rgba(0,0,0,.24), inset 0 1px 0 color-mix(in srgb, #fff 24%, transparent)',
    },
    panel: {
      border: '1px solid color-mix(in srgb, var(--dsw-alias-label-primary) 13%, transparent)',
      borderRadius: 16,
      padding: '14px 16px',
      background: 'color-mix(in srgb, var(--dsw-alias-bg-layer-1) 50%, transparent)',
      backdropFilter: GLASS_BLUR,
      WebkitBackdropFilter: GLASS_BLUR,
      boxShadow: '0 10px 32px rgba(0,0,0,.22), inset 0 1px 0 color-mix(in srgb, #fff 20%, transparent)',
    },
    stat: {
      border: '1px solid color-mix(in srgb, var(--dsw-alias-label-primary) 11%, transparent)',
      borderRadius: 14,
      background: 'color-mix(in srgb, var(--dsw-alias-bg-layer-1) 58%, transparent)',
      boxShadow: 'inset 0 1px 0 color-mix(in srgb, #fff 16%, transparent)',
    },
  },
};
const skinOf = (name) => SKINS[name] ?? SKINS.default;

/* 首屏转圈用的 keyframes（只注入一次） */
if (typeof document !== 'undefined' && !document.getElementById('dsh-tm-style')) {
  const el = document.createElement('style');
  el.id = 'dsh-tm-style';
  el.textContent = '@keyframes dsh-tm-spin{to{transform:rotate(360deg)}}';
  document.head.appendChild(el);
}
const swatch = (color) => ({
  width: 8, height: 8, borderRadius: 2, background: color, display: 'inline-block', flex: 'none',
});

function Stat({ label, value, unit, color, extra, t, surface }) {
  return React.createElement('div', {
    style: { ...(surface ?? { border: `1px solid ${C.border1}`, borderRadius: 12, background: C.layer1 }), padding: '10px 12px', minWidth: 0 },
  }, [
    React.createElement('div', {
      key: 'k',
      style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.label3, whiteSpace: 'nowrap' },
    }, [color ? React.createElement('span', { key: 's', style: swatch(color) }) : null, label]),
    React.createElement('div', {
      key: 'v',
      style: { fontSize: 19, fontWeight: 700, marginTop: 3, color: C.label, fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis' },
    }, [
      value,
      unit ? React.createElement('span', { key: 'u', style: { fontSize: 12, fontWeight: 600, color: C.label3, marginLeft: 1 } }, unit) : null,
      extra ? React.createElement('span', { key: 'e', style: { fontSize: 12, fontWeight: 500, color: C.label3 } }, extra) : null,
    ]),
  ]);
}

/** 侧栏入口图标：仪表盘 + 硬币（自绘，不依赖 primitives） */
function MeterIcon({ size = 16, active }) {
  return React.createElement('svg', {
    width: size, height: size, viewBox: '0 0 16 16', fill: 'none',
    stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round',
    style: { opacity: active ? 1 : 0.82 },
  }, [
    React.createElement('path', { key: 'a', d: 'M2.2 12.6a6 6 0 1 1 11.6 0' }),
    React.createElement('path', { key: 'b', d: 'M8 10.4 10.6 6.6' }),
    React.createElement('circle', { key: 'c', cx: '8', cy: '11.2', r: '1.2', fill: 'currentColor', stroke: 'none' }),
  ]);
}

/* ------------------------------------------------------------------ *
 * 数据获取
 * ------------------------------------------------------------------ */
/**
 * 模块级缓存：面板被切走再切回来时，React 组件会重新挂载 —— 有上次结果就直接渲染，
 * 后台再刷新（stale-while-revalidate）。这就是「点击即用」，不再每次都转圈读秒。
 */
let lastSummary = null;

function useSummary(intervalSec) {
  const [state, setState] = React.useState(() => (lastSummary
    ? { status: 'ready', data: lastSummary.data, error: null, at: lastSummary.at }
    : { status: 'loading', data: null, error: null, at: 0 }));
  const [tick, setTick] = React.useState(0);
  const first = React.useRef(true);

  React.useEffect(() => {
    let alive = true;
    // 首次强制重算（刷新缓存），之后走宿主的 5s TTL 缓存
    const url = first.current ? `${ROUTE}?refresh=1` : ROUTE;
    first.current = false;
    fetch(url, { cache: 'no-store', credentials: 'same-origin' })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = await response.json();
        if (!body?.ok) throw new Error(body?.error ?? 'unknown error');
        const at = Date.now();
        lastSummary = { data: body.data, at };
        if (alive) setState({ status: 'ready', data: body.data, error: null, at });
      })
      .catch((error) => {
        // 已有数据时只标记错误，不清空面板
        if (alive) setState((prev) => ({ ...prev, status: prev.data ? 'ready' : 'failed', error: String(error?.message ?? error) }));
      });
    return () => { alive = false; };
  }, [tick]);

  React.useEffect(() => {
    const sec = Number(intervalSec) > 0 ? Number(intervalSec) : 0;
    if (!sec) return undefined;
    const timer = setInterval(() => setTick((n) => n + 1), sec * 1000);
    return () => clearInterval(timer);
  }, [intervalSec]);

  const refresh = React.useCallback(() => setTick((n) => n + 1), []);
  return { ...state, refresh };
}

function useBalance(enabled, refreshKey) {
  const [state, setState] = React.useState({ status: 'idle', data: null });
  const asked = React.useRef(false);
  React.useEffect(() => {
    if (!enabled || asked.current) return undefined;
    asked.current = true;
    let alive = true;
    setState({ status: 'loading', data: null });
    fetch('/token-meter-panel/balance', { cache: 'no-store', credentials: 'same-origin' })
      .then((r) => r.json())
      .then((body) => { if (alive) setState({ status: 'ready', data: body?.data ?? null }); })
      .catch(() => { if (alive) setState({ status: 'failed', data: null }); });
    return () => { alive = false; };
  }, [enabled, refreshKey]);
  return state;
}

/**
 * 当前会话的实时用量。
 * 面板注册在 root scope，而 useProjection 由 session scope 提供，因此这里要探测：
 * 拿得到就显示「本会话实时」卡片，拿不到（或投影尚未就绪）就整块不渲染。
 * 探测结果在一个组件实例内恒定，hook 调用次数稳定。
 */
function useLiveUsage(props) {
  const useProjection = props?.useProjection;
  if (typeof useProjection !== 'function') return undefined;
  try {
    const value = useProjection('tokenUsage');
    return value && typeof value === 'object' ? value : undefined;
  } catch {
    return undefined;
  }
}

/* ------------------------------------------------------------------ *
 * 面板主体
 * ------------------------------------------------------------------ */
function TokenMeterPanel(props) {
  const { t } = props;
  const [range, setRange] = React.useState(7);
  // 宿主建议的刷新间隔（来自设置 refreshSeconds），拿到后接管轮询
  const [intervalSec, setIntervalSec] = React.useState(60);
  const { status, data, error, at, refresh } = useSummary(intervalSec);
  // 官方数据是后台补齐的：首屏等它时快速重试几次（1.2s 一次，最多 8 次），
  // 这样既不阻塞首屏，也不会让用户干等到下一个 60s 轮询
  const officialLoading = data?.official?.reason === 'loading';
  const [officialTries, setOfficialTries] = React.useState(0);
  React.useEffect(() => {
    if (!officialLoading) { if (officialTries) setOfficialTries(0); return undefined; }
    if (officialTries >= 25) return undefined;
    const id = setTimeout(() => { setOfficialTries((n) => n + 1); refresh(); }, 1500);
    return () => clearTimeout(id);
  }, [officialLoading, officialTries, refresh]);

  React.useEffect(() => {
    const sec = data?.config?.refreshSeconds;
    if (typeof sec === 'number' && sec > 0 && sec !== intervalSec) setIntervalSec(sec);
  }, [data?.config?.refreshSeconds, intervalSec]);

  // 当前会话实时用量（官方 tokenUsage 投影；面板在 root scope，取不到时为 undefined）
  const live = useLiveUsage(props);
  const balance = useBalance(Boolean(data?.config?.showBalance), data?.generatedAt);

  // 0.2：计费明细可折叠（默认收起，主区只留两个大数）；会话明细默认只列 5 行
  const [showRates, setShowRates] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [showAllSessions, setShowAllSessions] = React.useState(false);
  // 自定义时间区间（null = 用近 7 / 30 天）
  const [custom, setCustom] = React.useState(null);
  // 首次加载读秒：让用户知道在动、不是在卡（官方数据要读浏览器登录态 + 扫会话日志）
  const [waitSec, setWaitSec] = React.useState(0);
  React.useEffect(() => {
    if (status !== 'loading' || data) return undefined;
    const id = setInterval(() => setWaitSec((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [status, data]);

  if (status === 'loading' && !data) {
    return React.createElement('div', {
      style: {
        padding: 28, color: C.label3, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8,
      },
    }, [
      React.createElement('span', {
        key: 'sp',
        style: {
          width: 12, height: 12, borderRadius: '50%', display: 'inline-block',
          border: `2px solid ${C.border}`, borderTopColor: C.brand,
          animation: 'dsh-tm-spin .8s linear infinite',
        },
      }),
      React.createElement('span', { key: 't' }, `${t('firstLoad')} ${waitSec}s`),
      React.createElement('span', { key: 'h', style: { fontSize: 11, color: C.label3 } }, t('firstLoadHint')),
    ]);
  }
  if (status === 'failed' && !data) {
    return React.createElement('div', { style: { padding: 28, color: C.error, fontSize: 13 } }, [
      React.createElement('div', { key: 'a' }, `${t('failed')}：${error}`),
      React.createElement('button', {
        key: 'b',
        onClick: refresh,
        style: {
          marginTop: 10, padding: '5px 12px', borderRadius: 8, cursor: 'pointer',
          border: `1px solid ${C.border}`, background: 'transparent', color: C.label2, fontSize: 12,
        },
      }, t('retry')),
    ]);
  }

  const days = data.days ?? {};
  const today = data.today;
  const S = skinOf(data.config?.skin);
  const glassOn = data.config?.skin === 'glass';
  const D = days[today] ?? { miss: 0, hit: 0, out: 0, calls: 0, cny: 0, hitRate: null, byHour: new Array(24).fill(0), peakCalls: 0 };
  const dayKeys = Object.keys(days).sort();
  const prevKey = dayKeys.filter((k) => k < today).pop();
  const prev = prevKey ? days[prevKey] : null;

  // 费率（用于成本构成与"无缓存对照"）
  const unit = { hit: 0.02, miss: 1, out: 4 };
  const cfgRates = data.config?.rates;
  if (cfgRates?.offPeak?.['deepseek-flash']) {
    const r = data.peakNow ? cfgRates.peak : cfgRates.offPeak;
    const f = r?.['deepseek-flash'];
    if (f) { unit.hit = f.cacheHit; unit.miss = f.cacheMiss; unit.out = f.output; }
  }
  const cHit = (D.hit / 1e6) * unit.hit;
  const cMiss = (D.miss / 1e6) * unit.miss;
  const cOut = (D.out / 1e6) * unit.out;
  const actual = cHit + cMiss + cOut || D.cny || 0;

  // 历史（官方查询数据）：最近 14 天，直接取自官方用量接口，不做任何本地推算
  const historyDays = Object.keys(days).sort().reverse().slice(0, 14)
    .map((k) => ({ date: k, ...(days[k] ?? {}) }))
    .filter((d) => (d.cny ?? 0) > 0 || (d.calls ?? 0) > 0);

  const budget = Number(data.config?.dailyBudget) || 0;
  const usedPct = budget > 0 ? pct(D.cny, budget) : 0;
  const alertPct = Number(data.config?.alertAtPercent) || 80;
  const over = budget > 0 && D.cny > budget;
  const warn = budget > 0 && !over && usedPct >= alertPct;
  const delta = prev && prev.cny > 0 ? ((D.cny - prev.cny) / prev.cny) * 100 : null;

  // 头部左上角：更新时间 + 账户余额（余额查询默认关闭，关着时明确写「未开启」而不是留空）
  const balInfo = balance.data?.ok ? balance.data.balance_infos?.[0] : null;
  const balText = data.config?.showBalance
    ? (balInfo ? `¥${balInfo.total_balance}` : t('balanceFailed'))
    : t('notEnabled');

  // 主数字口径：宿主已按官方用量接口给出天/时数据（meterSource === 'official'）
  const official = data.official;
  const officialOk = Boolean(official?.ok);
  const meterOfficial = data.meterSource === 'official';
  const shown = D.cny;
  const officialBase = meterOfficial && Number(official?.yesterdayCny) > 0 ? Number(official.yesterdayCny) : null;
  const localBase = prev && prev.cny > 0 ? prev.cny : null;
  const base = meterOfficial ? officialBase : localBase;
  const shownDelta = base ? ((shown - base) / base) * 100 : null;
  const deltaLabel = meterOfficial ? t('yesterdayLabel') : (prevKey ? prevKey.slice(5) : '');

  // 趋势窗口：默认近 7 / 30 天；选了自定义区间就按起止日期画
  const window_ = [];
  if (custom && custom.from && custom.to && custom.from <= custom.to) {
    const fromMs = Date.parse(`${custom.from}T00:00:00Z`);
    const toMs = Date.parse(`${custom.to}T00:00:00Z`);
    for (let ms = fromMs; ms <= toMs && window_.length < 180; ms += 86400000) {
      const key = new Date(ms + 8 * 3600e3).toISOString().slice(0, 10);
      window_.push({ key, entry: days[key] ?? null });
    }
  } else {
    for (let i = range - 1; i >= 0; i--) {
      const ts = Date.now() - i * 86400000;
      const key = new Date(ts + 8 * 3600e3).toISOString().slice(0, 10);
      window_.push({ key, entry: days[key] ?? null });
    }
  }
  const maxTotal = Math.max(...window_.map(({ entry }) => (entry ? entry.hit + entry.miss + entry.out : 0)), 1);
  // 有数据的天数：少于 3 天时给一句提示，避免趋势图看起来像坏了
  const dataDays = window_.filter(({ entry }) => entry && entry.hit + entry.miss + entry.out > 0).length;
  // 数据很少时把窗口裁到「第一天有数据 → 今天」，别留一大片空白
  const firstDataIdx = window_.findIndex(({ entry }) => entry && entry.hit + entry.miss + entry.out > 0);
  const trend_ = dataDays > 0 && dataDays < 3 && firstDataIdx > 0 ? window_.slice(firstDataIdx) : window_;
  const maxHour = Math.max(...(D.byHour ?? [0]), 1);
  const peakHour = (D.byHour ?? []).indexOf(maxHour);

  // 今日会话
  const todaySessions = Object.values(data.sessions ?? {})
    .filter((s) => s.calls > 0 && s.lastTime && new Date(s.lastTime + 8 * 3600e3).toISOString().slice(0, 10) === today)
    .sort((a, b) => b.cny - a.cny);
  const maxSess = todaySessions.length ? Math.max(...todaySessions.map((s) => s.cny)) : 1;

  const chip = (active) => ({
    fontSize: 11, padding: '3px 9px', borderRadius: 999, cursor: 'pointer', userSelect: 'none',
    border: `1px solid ${active ? 'var(--dsw-alias-brand-primary-foreground, ' + C.brand + ')' : C.border}`,
    background: active ? 'var(--dsw-alias-interactive-bg-hover, rgba(47,125,255,.12))' : 'transparent',
    color: active ? C.label : C.label3,
  });
  const dateInput = {
    fontSize: 10.5, padding: '1px 4px', borderRadius: 6, border: `1px solid ${C.border}`,
    background: 'transparent', color: C.label2, fontFamily: 'inherit', colorScheme: 'light dark',
    width: 118, flex: 'none',
  };
  // 峰谷价表：把设置里生效的两个档位按模型列出来
  const rateModels = cfgRates ? Object.keys(cfgRates.offPeak ?? {}) : [];
  const priceRow = (label, rateSet) => React.createElement('div', {
    key: label,
    style: { display: 'grid', gridTemplateColumns: '30px minmax(0, 1fr)', gap: 6, fontSize: 11, color: C.label2, marginTop: 2 },
  }, [
    React.createElement('span', { key: 'l', style: { color: C.label3 } }, label),
    React.createElement('div', { key: 'v', style: { display: 'flex', flexDirection: 'column' } },
      rateModels.map((m) => React.createElement('span', {
        key: m,
        style: { fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },
      }, `${m.replace('deepseek-', '')} ¥${rateSet?.[m]?.cacheHit} / ¥${rateSet?.[m]?.cacheMiss} / ¥${rateSet?.[m]?.output}`))),
  ]);
  const priceTable = null;

  return React.createElement('div', {
    style: {
      height: '100%', overflow: 'auto', padding: '16px 18px 40px', position: 'relative',
      color: C.label, fontFamily: 'var(--dsw-font-family, system-ui, "Microsoft YaHei UI", sans-serif)',
      fontSize: 13, boxSizing: 'border-box',
    },
  }, [
    /* 液态玻璃：DSH 背景是纯色，backdrop-filter 没东西可折射 → 自己铺一层极光底色，
       玻璃卡片浮在它上面，模糊才有内容，这才是"液态"的来源 */
    glassOn
      ? React.createElement('div', {
        key: 'aurora',
        'aria-hidden': 'true',
        style: {
          position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden',
          background: [
            'color-mix(in srgb, var(--dsw-alias-bg-layer-1) 16%, transparent)',
            'radial-gradient(50% 32% at 14% 0%, color-mix(in srgb, var(--dsw-alias-brand-primary, #2f7dff) 55%, transparent), transparent 66%)',
            'radial-gradient(38% 28% at 98% 6%, rgba(150,96,255,.42), transparent 70%)',
            'radial-gradient(44% 30% at 78% 100%, rgba(0,196,178,.34), transparent 72%)',
            'radial-gradient(32% 24% at 22% 92%, rgba(255,120,190,.22), transparent 72%)',
          ].join(','),
          filter: 'blur(40px) saturate(140%)',
          transform: 'translateZ(0)',
        },
      })
      : null,
    React.createElement('div', { key: 'body', style: { position: 'relative', zIndex: 1 } }, [
    /* 头部：标题 + 时段 + 范围 + 刷新 */
    React.createElement('div', {
      key: 'head',
      style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 },
    }, [
      React.createElement('div', { key: 'ti', style: { minWidth: 0 } }, [
        React.createElement('div', { key: 'l1', style: { fontWeight: 700, fontSize: 15 } }, [
          t('title'),
          React.createElement('span', { key: 's', style: { fontWeight: 500, fontSize: 12, color: C.label3, marginLeft: 6 } }, `· ${t('subtitle')}`),
        ]),
      ]),
      React.createElement('div', { key: 'sp', style: { flex: 1 } }),
    ]),

    /* 主指标 */
    React.createElement('div', {
      key: 'hero',
      style: { display: 'grid', gridTemplateColumns: 'minmax(250px, 1.05fr) minmax(300px, 1.15fr) minmax(230px, 0.9fr)', gap: 12 },
    }, [
      React.createElement('div', {
        key: 'spend',
        style: S.hero,
      }, [
        React.createElement('div', { key: 'l', style: { fontSize: 12, color: C.label2 } }, `${t('today')} · ${today}`),
        React.createElement('div', {
          key: 'n',
          style: { fontSize: 34, fontWeight: 750, lineHeight: 1.15, margin: '6px 0 2px', fontVariantNumeric: 'tabular-nums' },
        }, [
          React.createElement('span', { key: 'c', style: { fontSize: 16, fontWeight: 600, color: C.label2, marginRight: 2 } }, '¥'),
          shown.toFixed(2),
          React.createElement('span', {
            key: 'src',
            style: {
              fontSize: 10.5, fontWeight: 600, padding: '2px 7px', borderRadius: 999, marginLeft: 8,
              border: `1px solid ${C.border}`, color: officialOk ? C.brand : C.label3, verticalAlign: 'middle',
            },
          }, meterOfficial ? t('officialLabel') : t('localShort')),
          shownDelta !== null
            ? React.createElement('span', {
              key: 'd',
              style: {
                fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 999, marginLeft: 6,
                color: shownDelta >= 0 ? C.error : C.ok,
                background: 'var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.12))',
              },
            }, `${t('vsPrevOn')} ${deltaLabel} ${shownDelta >= 0 ? '+' : '−'}${Math.abs(shownDelta).toFixed(0)}%`)
            : null,
        ]),
        /* 顺序按阅读习惯：先看到金额，再看更新时间和余额 */
        React.createElement('div', {
          key: 'meta',
          style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 11, color: C.label3, marginTop: 2, fontVariantNumeric: 'tabular-nums' },
        }, [
          React.createElement('span', { key: 'mt' }, `${t('updated')} ${clock(at || data.generatedAt)} · ${t('balance')} ${balText}`),
          React.createElement('div', {
            key: 'rf',
            onClick: refresh,
            title: `${t('refresh')} · ${t('updated')} ${clock(at || data.generatedAt)}`,
            style: {
              display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600,
              padding: '2px 9px', borderRadius: 999, cursor: 'pointer', userSelect: 'none',
              border: `1px solid ${C.brand}`, color: C.brand,
              background: 'var(--dsw-alias-interactive-bg-hover, rgba(47,125,255,.10))',
              opacity: status === 'loading' ? 0.55 : 1, whiteSpace: 'nowrap',
            },
          }, [
            React.createElement('span', { key: 'i', style: { fontSize: 12, lineHeight: 1 } }, '⟳'),
            t('refresh'),
          ]),
        ]),
        React.createElement('div', { key: 'f', style: { fontSize: 11.5, color: C.label3, lineHeight: 1.7 } }, [
          (() => {
            const off = data.official;
            const diff = off?.ok ? Math.abs(Number(off.cny) - actual) : null;
            return React.createElement('div', {
              key: 'official',
              style: { fontSize: 11, color: C.label3, marginBottom: 2, fontVariantNumeric: 'tabular-nums' },
            }, off?.ok
              ? [
                React.createElement('span', { key: 'src' }, `来源 platform.deepseek.com/api/v0/usage`),
                off.auto ? React.createElement('span', { key: 'au', style: { marginLeft: 6, color: C.ok } }, `· ${t('autoSession')}`) : null,
                React.createElement('span', { key: 'd', style: { marginLeft: 8 } }, `${t('calls')} ${off.requests ?? '—'}`),
              ]
              : [
                React.createElement('span', { key: 'why' }, `${t('officialLabel')}：${off?.reason === 'loading' ? t('officialLoading')
                  : off?.reason === 'disabled' ? t('officialOff')
                    : off?.reason === 'no-credential' ? t('notConnected')
                      : (off?.error ?? t('balanceFailed'))} `),
                off?.reason === 'loading' ? null : React.createElement('span', {
                  key: 'go',
                  onClick: () => {
                    try { window.open(data.billingUrl || 'https://platform.deepseek.com/usage', '_blank', 'noopener'); } catch { /* 打不开就算了 */ }
                    refresh();
                  },
                  style: { cursor: 'pointer', color: C.brand, userSelect: 'none' },
                }, t('connectOfficial')),
                React.createElement('span', { key: 'hint', style: { marginLeft: 6, fontSize: 10.5 } }, t('connectHint')),
              ]);
          })(),
          (() => React.createElement('div', {
            key: 'bs',
            style: { fontSize: 11, color: C.label3, marginBottom: 2 },
          }, React.createElement('a', {
            key: 'link',
            href: data.billingUrl || 'https://platform.deepseek.com/usage',
            target: '_blank',
            rel: 'noreferrer',
            style: { color: C.brand, textDecoration: 'none', whiteSpace: 'nowrap' },
          }, `${t('billingLink')} ↗`)))(),
          React.createElement('span', {
            key: 'tier',
            style: { color: C.label3 },
          }, `${t('rateLine')}：${data.peakNow ? t('peak') : t('offpeak')}`),
        ]),
        budget > 0
          ? React.createElement('div', { key: 'p', style: { marginTop: 10 } }, [
            React.createElement('div', { key: 'tw', style: { position: 'relative' } }, [
              React.createElement('div', {
                key: 'track',
                style: { height: 8, borderRadius: 99, background: 'var(--dsw-alias-border-l1, rgba(128,128,128,.2))', overflow: 'hidden' },
              }, React.createElement('div', {
                style: {
                  height: '100%', width: `${Math.min(usedPct, 100).toFixed(1)}%`,
                  background: over ? C.error : warn ? C.warn : C.brand,
                  transition: 'width .3s ease',
                },
              })),
              React.createElement('div', {
                key: 'tick',
                title: `${t('warnLine')} ${alertPct}%`,
                style: {
                  position: 'absolute', left: `${Math.min(alertPct, 100)}%`, top: -3, width: 2, height: 14,
                  background: C.warn, opacity: 0.7, borderRadius: 2,
                },
              }),
            ]),
            React.createElement('div', {
              key: 'txt',
              style: { fontSize: 11, color: over ? C.error : C.label3, marginTop: 6 },
            }, `${t('budgetUsed')} ${money(budget)} · ${t('used')} ${usedPct.toFixed(1)}% · ${t('remain')} ${money(Math.max(0, budget - D.cny))}` +
              (over ? ` · ⚠ ${t('overBudget')}` : warn ? ` · ${usedPct >= alertPct ? '⚠' : ''}` : '')),
          ])
          : null,
      ]),
      React.createElement('div', {
        key: 'stats',
        style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignContent: 'start' },
      }, [
        React.createElement(Stat, { key: '1', t, surface: S.stat, label: t('hitInput'), color: C.hit, value: fmt(D.hit) }),
        React.createElement(Stat, {
          key: '2', t, surface: S.stat, label: t('hitRate'),
          value: D.hitRate === null || D.hitRate === undefined ? '—' : `${D.hitRate}`,
          unit: '%',
          extra: ` · ${D.calls} ${t('calls')}`,
        }),
        React.createElement(Stat, { key: '3', t, surface: S.stat, label: t('missInput'), color: C.miss, value: fmt(D.miss) }),
        React.createElement(Stat, { key: '4', t, surface: S.stat, label: t('output'), color: C.out, value: fmt(D.out) }),
        /* 金额公式：峰/谷分开算，再汇总（合计以官方金额为准） */
        React.createElement('div', {
          key: 'formula',
          style: {
            gridColumn: '1 / -1', fontSize: 11.5, color: C.label3, lineHeight: 1.8,
            borderTop: `1px solid ${C.border1}`, paddingTop: 8, marginTop: 2,
          },
        }, (() => {
          const tier = D.tier;
          // 费率字段名是 cacheHit / cacheMiss / output（不是 hit/miss/out）
          const unitOf = (rateSet) => ({
            hit: rateSet?.cacheHit ?? unit.hit,
            miss: rateSet?.cacheMiss ?? unit.miss,
            out: rateSet?.output ?? unit.out,
          });
          const row = (label, tk, prices, cny) => React.createElement('div', {
            key: label,
            style: { display: 'flex', gap: 6, flexWrap: 'wrap' },
          }, [
            React.createElement('span', { key: 'l', style: { color: C.label2, fontWeight: 600, minWidth: 26 } }, label),
            React.createElement('span', { key: 'm', style: { color: C.label, fontWeight: 650 } }, money(cny)),
            React.createElement('span', { key: 'eq' }, '='),
            React.createElement('span', { key: 'h' }, `${t('hitInput')} ${fmtM(tk?.hit ?? 0)} × ¥${prices.hit}`),
            React.createElement('span', { key: 'p1' }, '+'),
            React.createElement('span', { key: 'm2' }, `${t('missInput')} ${fmtM(tk?.miss ?? 0)} × ¥${prices.miss}`),
            React.createElement('span', { key: 'p2' }, '+'),
            React.createElement('span', { key: 'o' }, `${t('output')} ${fmtM(tk?.out ?? 0)} × ¥${prices.out}`),
          ]);
          if (!tier || ((tier.peak?.calls ?? 0) === 0 && (tier.offPeak?.calls ?? 0) === 0)) {
            // 没有分档数据（例如当天没有本地日志）时退回单行展示，并标明按当前时段单价
            return [
              React.createElement('div', { key: 'one', style: { display: 'flex', gap: 6, flexWrap: 'wrap' } }, [
                React.createElement('span', { key: 'n', style: { color: C.label, fontWeight: 650 } }, money(D.cny)),
                React.createElement('span', { key: 'eq' }, '='),
                React.createElement('span', { key: 'h' }, `${t('hitInput')} ${fmtM(D.hit)} × ¥${unit.hit}`),
                React.createElement('span', { key: 'p1' }, '+'),
                React.createElement('span', { key: 'p2' }, `${t('missInput')} ${fmtM(D.miss)} × ¥${unit.miss}`),
                React.createElement('span', { key: 'p3' }, '+'),
                React.createElement('span', { key: 'o' }, `${t('output')} ${fmtM(D.out)} × ¥${unit.out}`),
                React.createElement('span', { key: 'note', style: { fontSize: 10.5 } }, `（${t('byCurrentTier')}）`),
              ]),
            ];
          }
          return [
            row(t('peak'), tier.peak, unitOf(cfgRates?.peak?.['deepseek-flash']), tier.peak?.cny ?? 0),
            row(t('offpeak'), tier.offPeak, unitOf(cfgRates?.offPeak?.['deepseek-flash']), tier.offPeak?.cny ?? 0),
            React.createElement('div', { key: 'sum', style: { display: 'flex', gap: 6, marginTop: 2 } }, [
              React.createElement('span', { key: 'l', style: { color: C.label2, fontWeight: 600, minWidth: 26 } }, t('sumLabel')),
              React.createElement('span', { key: 'v', style: { color: C.label, fontWeight: 700 } }, money(D.cny)),
              React.createElement('span', { key: 'note', style: { fontSize: 10.5 } }, `（${t('fromOfficial')}；${t('tierFromLocal')}）`),
            ]),
          ];
        })()),
      ]),
      /* 第三栏：峰谷时段与峰谷价 */
      React.createElement('div', {
        key: 'rates',
        style: { ...S.panel, fontSize: 11, color: C.label3, lineHeight: 1.7 },
      }, [
        React.createElement('div', { key: 'h', style: { fontSize: 12, fontWeight: 650, color: C.label2 } }, t('tierTitle')),
        React.createElement('div', { key: 'tier', style: { marginTop: 4 } }, [
          React.createElement('span', { key: 'l', style: { color: C.label2, fontWeight: 600 } }, `${t('currentTier')}：`),
          React.createElement('span', { key: 'v', style: { color: data.peakNow ? C.warn : C.label2 } },
            data.peakNow ? t('peak') : t('offpeak')),
        ]),
        React.createElement('div', { key: 'w', style: { fontSize: 10.5, lineHeight: 1.6 } }, t('peakWindow')),
        React.createElement('div', { key: 'cap', style: { fontSize: 10.5, marginTop: 8 } },
          `${t('unitPrices')}（${t('hitInput')} / ${t('missInput')} / ${t('output')}）`),
        priceRow(t('peakShort'), cfgRates?.peak),
        priceRow(t('offShort'), cfgRates?.offPeak),
      ]),
    ]),

    /* 趋势 */
    React.createElement('div', { key: 'trend', style: S.card }, [
      React.createElement('div', {
        key: 'h',
        style: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 11, color: C.label3 },
      }, [
        React.createElement('span', { key: 't', style: { fontSize: 12.5, fontWeight: 650, color: C.label2 } }, t('trend')),
        React.createElement('div', {
          key: 'r7',
          style: chip(!custom && range === 7),
          onClick: () => { setCustom(null); setRange(7); },
        }, t('range7')),
        React.createElement('div', {
          key: 'r30',
          style: chip(!custom && range === 30),
          onClick: () => { setCustom(null); setRange(30); },
        }, t('range30')),
        React.createElement('div', {
          key: 'rc',
          style: chip(Boolean(custom)),
          onClick: () => setCustom((c) => c || {
            from: new Date(Date.now() - 13 * 86400000 + 8 * 3600e3).toISOString().slice(0, 10),
            to: new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10),
          }),
        }, t('rangeCustom')),
        custom
          ? React.createElement('span', { key: 'cd', style: { display: 'flex', alignItems: 'center', gap: 4 } }, [
            React.createElement('input', {
              key: 'f', type: 'date', value: custom.from,
              onChange: (e) => setCustom((c) => ({ ...c, from: e.target.value })),
              style: dateInput,
            }),
            React.createElement('span', { key: 'arrow', style: { color: C.label3 } }, '→'),
            React.createElement('input', {
              key: 'to', type: 'date', value: custom.to,
              onChange: (e) => setCustom((c) => ({ ...c, to: e.target.value })),
              style: dateInput,
            }),
          ])
          : null,
        dataDays < 3
          ? React.createElement('span', {
            key: 'hint',
            style: {
              fontSize: 10.5, color: C.label3, border: `1px solid ${C.border}`, borderRadius: 999,
              padding: '1px 8px', whiteSpace: 'nowrap',
            },
          }, t('fewDays'))
          : null,
        React.createElement('span', { key: 'sp', style: { flex: 1 } }),
        React.createElement('span', { key: 'l1', style: { display: 'flex', alignItems: 'center', gap: 5 } }, [React.createElement('i', { key: 'i', style: swatch(C.hit) }), t('hitInput')]),
        React.createElement('span', { key: 'l2', style: { display: 'flex', alignItems: 'center', gap: 5 } }, [React.createElement('i', { key: 'i', style: swatch(C.miss) }), t('missInput')]),
        React.createElement('span', { key: 'l3', style: { display: 'flex', alignItems: 'center', gap: 5 } }, [React.createElement('i', { key: 'i', style: swatch(C.out) }), t('output')]),
      ]),
      React.createElement('div', {
        key: 'bars',
        style: {
          position: 'relative', display: 'flex', alignItems: 'flex-end', gap: range > 10 ? 3 : 8,
          height: 108, marginTop: 16, justifyContent: trend_.length <= 4 ? 'center' : 'flex-start',
        },
      }, [
        ...trend_.map(({ key, entry }, index) => {
        const total = entry ? entry.hit + entry.miss + entry.out : 0;
        const h = total > 0 ? Math.max(4, (total / maxTotal) * 100) : 2;
        const isToday = key === today;
        const label = `${key}${isToday ? ` · ${t('today')}` : ''}`;
        const tip = entry
          ? `${label}\n${t('cost')} ${money(entry.cny)} · ${entry.calls} ${t('calls')}\n${t('hitInput')} ${fmt(entry.hit)} · ${t('missInput')} ${fmt(entry.miss)} · ${t('output')} ${fmt(entry.out)}`
          : `${label} · ${t('zeroDays')}`;
        return React.createElement('div', {
          key,
          title: tip,
          style: {
            flex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
            outline: isToday ? `1px dashed ${C.brand}` : 'none', outlineOffset: 2, borderRadius: 6, minWidth: 0,
            maxWidth: trend_.length <= 4 ? 78 : 'none', position: 'relative',
          },
        }, [
          total > 0
            ? React.createElement('div', {
              key: 'val',
              style: {
                position: 'absolute', left: 0, right: 0, bottom: `calc(${h}% + 5px)`, textAlign: 'center',
                fontSize: trend_.length <= 7 ? 10.5 : 9.5, fontWeight: 600, color: isToday ? C.brand : C.label2,
                fontVariantNumeric: 'tabular-nums', pointerEvents: 'none', whiteSpace: 'nowrap',
                overflow: 'visible',
              },
            }, entry.cny > 0
              ? (trend_.length <= 7 ? money(entry.cny) : `¥${Math.round(entry.cny)}`)
              : '')
            : null,
          total > 0
            ? React.createElement('div', {
              key: 's',
              style: { height: `${h}%`, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', borderRadius: '5px 5px 3px 3px', overflow: 'hidden' },
            }, [
              // 自上而下：输出 → 未命中 → 命中（命中在最底部，并在色带里标出命中率）
              React.createElement('div', { key: 'o', style: { flex: Math.max(entry.out, 1), minHeight: 3, background: C.out } }),
              React.createElement('div', { key: 'm', style: { flex: Math.max(entry.miss, 1), minHeight: 3, background: C.miss } }),
              React.createElement('div', {
                key: 'h',
                style: {
                  flex: Math.max(entry.hit, 1), minHeight: 3, background: C.hit,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 9.5, fontWeight: 700, color: '#04070d', fontVariantNumeric: 'tabular-nums',
                },
              }, h >= 34 && entry.hitRate != null && entry.hitRate > 0 ? `${entry.hitRate}%` : null),
            ])
            : React.createElement('div', {
              key: 'z',
              style: { height: '2%', minHeight: 2, background: 'var(--dsw-alias-border-l2, rgba(128,128,128,.3))', borderRadius: 3 },
            }),
        ]);
      }), ]),
      React.createElement('div', {
        key: 'x',
        style: {
          display: 'flex', gap: range > 10 ? 3 : 8, marginTop: 6, paddingTop: 4, borderTop: `1px solid ${C.border1}`,
          justifyContent: trend_.length <= 4 ? 'center' : 'flex-start',
        },
      }, trend_.length > 31
        ? [React.createElement('div', {
          key: 'range',
          style: { flex: 1, textAlign: 'center', fontSize: 10, color: C.label3, fontVariantNumeric: 'tabular-nums' },
        }, `${trend_[0].key.slice(5)} → ${trend_[trend_.length - 1].key.slice(5)}`)]
        : trend_.map(({ key, entry }) => {
          const total = entry ? entry.hit + entry.miss + entry.out : 0;
          const isToday = key === today;
          return React.createElement('div', {
            key,
            style: {
              flex: 1, textAlign: 'center', fontSize: 10, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap',
              color: isToday ? C.brand : C.label3,
              opacity: total > 0 ? 1 : 0.4,
              fontWeight: isToday ? 700 : 400,
              maxWidth: trend_.length <= 4 ? 78 : 'none',
            },
          }, isToday ? t('today') : key.slice(5));
        })),

      /* 分时 */
      React.createElement('div', { key: 'hr', style: { marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border1}` } }, [
        React.createElement('div', {
          key: 'hh',
          style: { display: 'flex', alignItems: 'center', fontSize: 11.5, color: C.label3, gap: 8 },
        }, [
          React.createElement('span', { key: 't', style: { fontWeight: 650, color: C.label2 } }, t('byHour')),
          React.createElement('span', { key: 'sp', style: { flex: 1 } }),
          React.createElement('span', { key: 'p' }, `${String(peakHour).padStart(2, '0')}:00 · ${t('peakHourLabel')} ${fmt(maxHour)} tokens`),
        ]),
        React.createElement('div', {
          key: 'bars',
          style: { position: 'relative', display: 'flex', alignItems: 'flex-end', gap: 2, height: 42, marginTop: 8 },
        }, [
          ...[50, 100].map((p) => React.createElement('div', {
            key: `grid${p}`,
            style: {
              position: 'absolute', left: 0, right: 0, bottom: `${p}%`,
              borderTop: `1px dashed ${C.border1}`, pointerEvents: 'none',
            },
          })),
          ...Array.from({ length: 24 }, (_, h) => React.createElement('div', {
            key: h,
            title: `${String(h).padStart(2, '0')}:00 · ${fmt(D.byHour?.[h] ?? 0)} tokens`,
            style: {
              position: 'relative', zIndex: 1,
              flex: 1, minHeight: 2,
              height: `${Math.max(((D.byHour?.[h] ?? 0) / maxHour) * 100, 1.5)}%`,
              background: h === peakHour ? 'var(--dsw-alias-state-business-primary, #25d0e0)' : C.miss,
              opacity: h === peakHour ? 1 : 0.55,
              borderRadius: '2px 2px 0 0',
            },
          })),
        ]),
        React.createElement('div', {
          key: 'ax',
          style: { display: 'flex', justifyContent: 'space-between', fontSize: 10, color: C.label3, marginTop: 4 },
        }, ['00', '06', '12', '18', '23'].map((s) => React.createElement('span', { key: s }, s))),
      ]),
    ]),

    /* 历史（官方查询） */
    meterOfficial && historyDays.length
      ? React.createElement('div', { key: 'hist', style: S.card }, [
        React.createElement('div', {
          key: 'h',
          style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: C.label3 },
        }, [
          React.createElement('span', { key: 't', style: { fontSize: 12.5, fontWeight: 650, color: C.label2 } }, t('historyTitle')),
          React.createElement('span', { key: 's' }, `platform.deepseek.com/api/v0/usage · ${historyDays.length} 天`),
        ]),
        React.createElement('table', { key: 'tb', style: { width: '100%', borderCollapse: 'collapse', fontSize: 12.5, marginTop: 8 } }, [
          React.createElement('thead', { key: 'th' }, React.createElement('tr', null,
            [t('today').slice(0, 0) + '日期', t('cost'), t('hitInput'), t('missInput'), t('output'), t('callsShort')]
              .map((h, i) => React.createElement('th', {
                key: h,
                style: {
                  textAlign: i >= 1 ? 'right' : 'left', fontWeight: 600, fontSize: 11, color: C.label3,
                  padding: '6px 8px', borderBottom: `1px solid ${C.border1}`, whiteSpace: 'nowrap',
                },
              }, h)))),
          React.createElement('tbody', { key: 'tb' }, historyDays.map((d) => React.createElement('tr', { key: d.date }, [
            React.createElement('td', {
              key: 'd',
              style: {
                padding: '6px 8px', color: d.date === today ? C.brand : C.label2,
                fontWeight: d.date === today ? 700 : 400, borderBottom: `1px solid ${C.border1}`, whiteSpace: 'nowrap',
              },
            }, d.date),
            React.createElement('td', { key: 'c', style: { padding: '6px 8px', textAlign: 'right', fontWeight: 650, color: C.label, borderBottom: `1px solid ${C.border1}`, fontVariantNumeric: 'tabular-nums' } }, money(d.cny)),
            React.createElement('td', { key: 'h', style: { padding: '6px 8px', textAlign: 'right', color: C.label2, borderBottom: `1px solid ${C.border1}`, fontVariantNumeric: 'tabular-nums' } }, fmt(d.hit)),
            React.createElement('td', { key: 'm', style: { padding: '6px 8px', textAlign: 'right', color: C.label2, borderBottom: `1px solid ${C.border1}`, fontVariantNumeric: 'tabular-nums' } }, fmt(d.miss)),
            React.createElement('td', { key: 'o', style: { padding: '6px 8px', textAlign: 'right', color: C.label2, borderBottom: `1px solid ${C.border1}`, fontVariantNumeric: 'tabular-nums' } }, fmt(d.out)),
            React.createElement('td', { key: 'n', style: { padding: '6px 8px', textAlign: 'right', color: C.label3, borderBottom: `1px solid ${C.border1}` } }, d.calls ?? 0),
          ]))),
        ]),
      ])
      : null,

    /* 成本构成 */
    React.createElement('div', { key: 'split', style: S.card }, [
      React.createElement('div', {
        key: 'h',
        style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: C.label3, flexWrap: 'wrap' },
      }, [
        React.createElement('span', { key: 't', style: { fontSize: 12.5, fontWeight: 650, color: C.label2 } }, t('costSplit')),
        React.createElement('span', { key: 'sp', style: { flex: 1 } }),
      ]),
      React.createElement('div', { key: 'rows', style: { display: 'flex', flexDirection: 'column', gap: 9, marginTop: 10 } },
        [
          [t('hitInput'), C.hit, cHit],
          [t('missInput'), C.miss, cMiss],
          [t('output'), C.out, cOut],
        ].map(([label, color, cost]) => React.createElement('div', {
          key: label,
          style: { display: 'grid', gridTemplateColumns: '104px 1fr 96px', gap: 10, alignItems: 'center', fontSize: 12 },
        }, [
          React.createElement('div', { key: 'n', style: { display: 'flex', alignItems: 'center', gap: 6, color: C.label2, whiteSpace: 'nowrap' } },
            [React.createElement('i', { key: 'i', style: swatch(color) }), label]),
          React.createElement('div', {
            key: 'tr',
            style: { height: 9, borderRadius: 99, background: 'var(--dsw-alias-border-l1, rgba(128,128,128,.18))', overflow: 'hidden' },
          }, React.createElement('div', {
            style: { height: '100%', width: `${pct(cost, actual).toFixed(1)}%`, background: color, borderRadius: 99 },
          })),
          React.createElement('div', {
            key: 'v',
            style: { textAlign: 'right', color: C.label2, fontVariantNumeric: 'tabular-nums' },
          }, [
            React.createElement('b', { key: 'b', style: { color: C.label } }, money(cost)),
            React.createElement('span', { key: 'p', style: { color: C.label3, marginLeft: 6 } }, `${pct(cost, actual).toFixed(0)}%`),
          ]),
        ]))),
    ]),

    /* 按会话明细 */
    React.createElement('div', { key: 'sessions', style: S.card }, [
      React.createElement('div', {
        key: 'h',
        style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: C.label3 },
      }, [
        React.createElement('span', { key: 't', style: { fontSize: 12.5, fontWeight: 650, color: C.label2 } }, t('sessions')),
        React.createElement('span', { key: 'sp', style: { flex: 1 } }),
        React.createElement('span', { key: 'n' }, `${D.calls} ${t('calls')}`),
      ]),
      todaySessions.length === 0
        ? React.createElement('div', { key: 'e', style: { fontSize: 12, color: C.label3, padding: '12px 0' } }, t('noData'))
        : React.createElement('div', { key: 'tb', style: { marginTop: 8, overflowX: 'auto' } },
          React.createElement('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 12.5 } }, [
            React.createElement('thead', { key: 'th' }, React.createElement('tr', null,
              [t('session'), t('lastCall'), t('hitInput'), t('missInput'), t('output'), t('callsShort'), t('cost')]
                .map((h, i) => React.createElement('th', {
                  key: h,
                  style: {
                    textAlign: i >= 2 ? 'right' : 'left', fontWeight: 600, fontSize: 11, color: C.label3,
                    padding: '6px 8px', borderBottom: `1px solid ${C.border1}`, whiteSpace: 'nowrap',
                  },
                }, h)))),
            React.createElement('tbody', { key: 'tb' }, todaySessions.slice(0, showAllSessions ? todaySessions.length : 5).map((s) => React.createElement('tr', { key: s.id }, [
              React.createElement('td', {
                key: 'n',
                style: { padding: '7px 8px', borderBottom: `1px solid ${C.border1}`, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: C.label2 },
                title: s.title ?? s.id,
              }, [
                s.isSubagent
                  ? React.createElement('span', {
                    key: 'tag',
                    style: {
                      fontSize: 10, padding: '1px 5px', borderRadius: 5, marginRight: 6,
                      border: `1px solid ${C.border}`, color: C.label3, whiteSpace: 'nowrap',
                    },
                  }, t('subagent'))
                  : null,
                s.title ?? `(${s.id.slice(0, 12)})`,
              ]),
              React.createElement('td', { key: 't', style: { padding: '7px 8px', color: C.label3, borderBottom: `1px solid ${C.border1}`, whiteSpace: 'nowrap' } }, hhmm(s.lastTime)),
              React.createElement('td', { key: 'h', style: { padding: '7px 8px', textAlign: 'right', color: C.label2, borderBottom: `1px solid ${C.border1}`, fontVariantNumeric: 'tabular-nums' } }, fmt(s.hit)),
              React.createElement('td', { key: 'm', style: { padding: '7px 8px', textAlign: 'right', color: C.label2, borderBottom: `1px solid ${C.border1}`, fontVariantNumeric: 'tabular-nums' } }, fmt(s.miss)),
              React.createElement('td', { key: 'o', style: { padding: '7px 8px', textAlign: 'right', color: C.label2, borderBottom: `1px solid ${C.border1}`, fontVariantNumeric: 'tabular-nums' } }, fmt(s.out)),
              React.createElement('td', { key: 'c', style: { padding: '7px 8px', textAlign: 'right', color: C.label3, borderBottom: `1px solid ${C.border1}` } }, s.calls),
              React.createElement('td', {
                key: 'cost',
                style: { padding: '7px 8px', textAlign: 'right', fontWeight: 650, color: C.label, borderBottom: `1px solid ${C.border1}`, fontVariantNumeric: 'tabular-nums' },
              }, money(s.cny)),
            ]))),
            todaySessions.length > 5
              ? React.createElement('tfoot', { key: 'tf' }, React.createElement('tr', null,
                React.createElement('td', {
                  colSpan: 7,
                  onClick: () => setShowAllSessions((v) => !v),
                  style: { padding: '7px 8px', fontSize: 11.5, color: C.brand, cursor: 'pointer', userSelect: 'none' },
                }, showAllSessions ? t('collapseSessions') : `${t('showAllSessions')} (${todaySessions.length})`)))
              : null,
          ])),
    ]),

    /* 本会话实时（官方投影叠加） */
    live
      ? React.createElement('div', { key: 'live', style: S.card }, [
        React.createElement('div', { key: 'h', style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: C.label3 } }, [
          React.createElement('span', { key: 't', style: { fontSize: 12.5, fontWeight: 650, color: C.label2 } }, t('live')),
          React.createElement('span', { key: 'h', style: { flex: 1 } }),
          React.createElement('span', { key: 'n' }, t('liveHint')),
        ]),
        React.createElement('div', {
          key: 'g',
          style: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 10, marginTop: 10 },
        }, [
          React.createElement(Stat, { key: 'a', t, label: t('missInput'), color: C.miss, value: fmt(live.uncachedInputTokens) }),
          React.createElement(Stat, { key: 'b', t, label: t('hitInput'), color: C.hit, value: fmt(live.cacheReadTokens) }),
          React.createElement(Stat, { key: 'c', t, label: t('output'), color: C.out, value: fmt(live.outputTokens) }),
        ]),
      ])
      : null,

    /* 页脚：采集状态 */
    React.createElement('div', {
      key: 'foot',
      style: { marginTop: 12, fontSize: 11, color: C.label3, lineHeight: 1.8 },
    }, [
      React.createElement('div', { key: 'a' }, `${t('source')}：${data.sessionsRoot} · ${data.filesScanned} 个会话文件 · 扫描 ${data.elapsedMs}ms`),
      React.createElement('div', { key: 'b' }, `${t('updated')} ${clock(at || data.generatedAt)} · ${t('partial')}`),
      React.createElement('div', { key: 'c' }, `${t('rateLine')}：${data.pricing?.source} （采集于 ${data.pricing?.fetchedAt}）`),
      /* 版本号 + 开源协议 + 更新提示 */
      React.createElement('div', {
        key: 'ver',
        style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 2 },
      }, [
        React.createElement('span', { key: 'n' }, `${data.plugin?.name ?? 'dsh-token-meter-panel'} v${data.plugin?.version ?? '?'}`),
        React.createElement('span', { key: 's1' }, '·'),
        React.createElement('a', {
          key: 'lic',
          href: `${data.plugin?.repo ?? 'https://github.com/olimc2016/dsh-token-meter-panel'}/blob/main/LICENSE`,
          target: '_blank',
          rel: 'noreferrer',
          style: { color: C.label3, textDecoration: 'underline' },
        }, `${data.plugin?.license ?? 'MIT'} ${t('licenseLabel')}`),
        data.plugin?.update?.hasUpdate
          ? React.createElement('span', { key: 'up', style: { display: 'flex', alignItems: 'center', gap: 6, marginLeft: 4 } }, [
            React.createElement('span', {
              key: 'b',
              style: { color: C.warn, fontWeight: 600, padding: '1px 7px', borderRadius: 999, border: `1px solid ${C.warn}` },
            }, `${t('updateAvailable')} v${data.plugin.update.latest}`),
            React.createElement('span', { key: 'st', style: { color: data.plugin.update.error ? C.error : C.label3 } },
              data.plugin.update.applied ? t('updateApplied')
                : data.plugin.update.running ? t('updateRunning')
                  : data.plugin.update.error ? t('updateFailed')
                    : t('updateAuto')),
            React.createElement('span', {
              key: 'cp',
              onClick: async () => {
                try {
                  await navigator.clipboard.writeText(data.plugin.update.command);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1800);
                } catch { /* 剪贴板不可用就算了 */ }
              },
              style: { cursor: 'pointer', color: C.brand, userSelect: 'none' },
            }, copied ? t('copied') : t('copyCmd')),
            React.createElement('a', {
              key: 'd',
              href: data.plugin.update.url,
              target: '_blank',
              rel: 'noreferrer',
              style: { color: C.brand, textDecoration: 'none' },
            }, `${t('viewRelease')} ↗`),
          ])
          : null,
      ]),
      error ? React.createElement('div', { key: 'd', style: { color: C.warn } }, `${t('failed')}：${error}`) : null,
    ]),
    ]),
  ]);
}


/* ------------------------------------------------------------------ *
 * 插件体
 * ------------------------------------------------------------------ */
export const inject = ['slots', 'locale'];

export function apply(ctx) {
  ctx.effect(() => ctx.locale.register('token-meter-panel', { zh, en }), 'token-meter-panel: dictionaries');

  // 侧栏入口（id 必须与 main 面板的 key 同名，sidebar 用 id 去选中面板）
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: SLOT_ID,
    order: 90,
    label: () => 'Token',
    locale: 'token-meter-panel',
  }, (props) => React.createElement(MeterIcon, { size: props?.size ?? 16, active: props?.active })));

  // 中栏独立面板
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: SLOT_ID,
    locale: 'token-meter-panel',
  }, TokenMeterPanel));
}
