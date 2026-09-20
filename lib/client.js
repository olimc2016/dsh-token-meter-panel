window.__ModuleLoader__.load({ id: "dsh-token-meter-panel", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.js
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);
var import_react = __toESM(require("react"), 1);
var SLOT_ID = "tokenmeter";
var ROUTE = "/token-meter-panel/summary";
var zh = {
  "nav": "Token \u7528\u91CF",
  "title": "Token \u7528\u91CF",
  "subtitle": "DeepSeek \u5B98\u65B9 API",
  "today": "\u4ECA\u65E5\u6D88\u8D39",
  "peak": "\u9AD8\u5CF0\u65F6\u6BB5\u8BA1\u4EF7",
  "offpeak": "\u7A7A\u95F2\u6863 \xB7 \u534A\u4EF7",
  "vsPrev": "vs \u4E0A\u6B21\u4F7F\u7528",
  "budgetUsed": "\u9884\u7B97",
  "used": "\u5DF2\u7528",
  "remain": "\u5269\u4F59",
  "balance": "\u8D26\u6237\u4F59\u989D",
  "checkBalance": "\u67E5\u8BE2\u4F59\u989D",
  "cacheSaved": "\u7F13\u5B58\u547D\u4E2D\u7701\u4E0B",
  "missInput": "\u672A\u547D\u4E2D\u8F93\u5165",
  "hitInput": "\u7F13\u5B58\u547D\u4E2D\u8F93\u5165",
  "output": "\u8F93\u51FA",
  "hitRate": "\u7F13\u5B58\u547D\u4E2D\u7387",
  "calls": "\u6B21\u8C03\u7528",
  "trend": "\u6BCF\u65E5\u6D88\u8D39\u8D8B\u52BF",
  "byHour": "\u4ECA\u65E5\u5206\u65F6\u7528\u91CF",
  "costSplit": "\u4ECA\u65E5\u6210\u672C\u6784\u6210",
  "noCacheCost": "\u82E5\u6CA1\u6709\u786C\u76D8\u7F13\u5B58\uFF0C\u4ECA\u5929\u9700",
  "sessions": "\u4ECA\u65E5\u6309\u4F1A\u8BDD\u660E\u7EC6",
  "session": "\u4F1A\u8BDD",
  "lastCall": "\u6700\u8FD1\u8C03\u7528",
  "callsShort": "\u8C03\u7528",
  "cost": "\u6D88\u8D39",
  "share": "\u5360\u6BD4",
  "subagent": "\u5B50\u4EE3\u7406",
  "zeroDays": "\u65E0\u8C03\u7528",
  "noData": "\u8FD8\u6CA1\u6709\u7528\u91CF\u8BB0\u5F55",
  "noDataHint": "\u8FD9\u4E2A\u4F1A\u8BDD\u6216\u672C\u673A\u8FD8\u6CA1\u6709\u4EA7\u751F DeepSeek \u5B98\u65B9\u8BA1\u8D39\u7684\u8C03\u7528\u3002",
  "loading": "\u8BFB\u53D6\u7528\u91CF\u2026",
  "failed": "\u8BFB\u53D6\u5931\u8D25",
  "retry": "\u91CD\u8BD5",
  "refresh": "\u5237\u65B0",
  "auto": "\u81EA\u52A8\u5237\u65B0",
  "live": "\u672C\u4F1A\u8BDD\u5B9E\u65F6",
  "liveHint": "\u6765\u81EA\u5B98\u65B9 tokenUsage \u6295\u5F71\uFF0C\u968F\u5BF9\u8BDD\u5373\u65F6\u66F4\u65B0",
  "overBudget": "\u5DF2\u8D85\u9884\u7B97",
  "peakNow": "\u5F53\u524D\u4E3A\u9AD8\u5CF0\u65F6\u6BB5\uFF08\u53CC\u500D\u4EF7\uFF09",
  "offNow": "\u5F53\u524D\u4E3A\u7A7A\u95F2\u65F6\u6BB5\uFF08\u534A\u4EF7\uFF09",
  "range7": "\u8FD1 7 \u5929",
  "range30": "\u8FD1 30 \u5929",
  "source": "\u6570\u636E\u6E90",
  "updated": "\u66F4\u65B0\u4E8E",
  "partial": "\u5F53\u524D\u4F1A\u8BDD\u4ECD\u5728\u5199\u5165\uFF0C\u4ECA\u65E5\u6570\u5B57\u662F\u4E0B\u754C",
  "rateLine": "\u8BA1\u8D39\u53E3\u5F84"
};
var en = {
  "nav": "Token usage",
  "title": "Token usage",
  "subtitle": "DeepSeek official API",
  "today": "Spent today",
  "peak": "peak-hour pricing",
  "offpeak": "off-peak \xB7 half price",
  "vsPrev": "vs last use",
  "budgetUsed": "Budget",
  "used": "used",
  "remain": "left",
  "balance": "Balance",
  "checkBalance": "Check balance",
  "cacheSaved": "Saved by cache hits",
  "missInput": "Uncached input",
  "hitInput": "Cached input",
  "output": "Output",
  "hitRate": "Cache hit rate",
  "calls": "calls",
  "trend": "Daily spend",
  "byHour": "Today by hour",
  "costSplit": "Cost breakdown today",
  "noCacheCost": "Without disk cache today would cost",
  "sessions": "Today by session",
  "session": "Session",
  "lastCall": "Last call",
  "callsShort": "Calls",
  "cost": "Cost",
  "share": "Share",
  "subagent": "subagent",
  "zeroDays": "no calls",
  "noData": "No usage recorded yet",
  "noDataHint": "No DeepSeek-billed calls have been recorded yet.",
  "loading": "Loading usage\u2026",
  "failed": "Failed to load",
  "retry": "Retry",
  "refresh": "Refresh",
  "auto": "Auto refresh",
  "live": "This session",
  "liveHint": "Live from the official tokenUsage projection",
  "overBudget": "over budget",
  "peakNow": "Peak hours now (double price)",
  "offNow": "Off-peak now (half price)",
  "range7": "7 days",
  "range30": "30 days",
  "source": "Source",
  "updated": "Updated",
  "partial": "This session is still appending; today is a lower bound",
  "rateLine": "Pricing"
};
var fmt = (n) => {
  const v = Number(n) || 0;
  if (v >= 1e6) return (v / 1e6).toFixed(v / 1e6 >= 10 ? 1 : 2) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(v / 1e3 >= 10 ? 0 : 1) + "K";
  return String(Math.round(v));
};
var money = (n) => "\xA5" + (Number(n) || 0).toFixed(2);
var pct = (a, b) => b > 0 ? 100 * a / b : 0;
var hhmm = (ms) => {
  if (!ms) return "\u2014";
  const d = new Date(ms + 8 * 36e5);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};
var clock = (ms) => new Date(ms).toTimeString().slice(0, 8);
var C = {
  hit: "#3fb6c8",
  miss: "#4d9bff",
  out: "#8b7bff",
  warn: "var(--dsw-alias-state-warn-primary, #e3b341)",
  error: "var(--dsw-alias-state-error-primary, #f85149)",
  ok: "var(--dsw-alias-state-success-primary, #3fb950)",
  label: "var(--dsw-alias-label-primary, #1f2329)",
  label2: "var(--dsw-alias-label-secondary, #5a6472)",
  label3: "var(--dsw-alias-label-tertiary, #8a94a6)",
  border: "var(--dsw-alias-border-l2, rgba(128,128,128,.25))",
  border1: "var(--dsw-alias-border-l1, rgba(128,128,128,.16))",
  layer1: "var(--dsw-alias-bg-layer-1, rgba(128,128,128,.06))",
  layer2: "var(--dsw-alias-bg-layer-2, rgba(128,128,128,.10))",
  brand: "var(--dsw-alias-brand-primary, #2f7dff)"
};
var card = {
  border: `1px solid ${C.border1}`,
  borderRadius: 12,
  background: C.layer1,
  padding: "12px 13px",
  marginTop: 12
};
var swatch = (color) => ({
  width: 8,
  height: 8,
  borderRadius: 2,
  background: color,
  display: "inline-block",
  flex: "none"
});
function Stat({ label, value, unit, color, extra, t }) {
  return import_react.default.createElement("div", {
    style: { border: `1px solid ${C.border1}`, borderRadius: 12, background: C.layer1, padding: "10px 12px", minWidth: 0 }
  }, [
    import_react.default.createElement("div", {
      key: "k",
      style: { display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: C.label3, whiteSpace: "nowrap" }
    }, [color ? import_react.default.createElement("span", { key: "s", style: swatch(color) }) : null, label]),
    import_react.default.createElement("div", {
      key: "v",
      style: { fontSize: 19, fontWeight: 700, marginTop: 3, color: C.label, fontVariantNumeric: "tabular-nums", overflow: "hidden", textOverflow: "ellipsis" }
    }, [
      value,
      unit ? import_react.default.createElement("span", { key: "u", style: { fontSize: 12, fontWeight: 600, color: C.label3, marginLeft: 1 } }, unit) : null,
      extra ? import_react.default.createElement("span", { key: "e", style: { fontSize: 12, fontWeight: 500, color: C.label3 } }, extra) : null
    ])
  ]);
}
function MeterIcon({ size = 16, active }) {
  return import_react.default.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.3,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style: { opacity: active ? 1 : 0.82 }
  }, [
    import_react.default.createElement("path", { key: "a", d: "M2.2 12.6a6 6 0 1 1 11.6 0" }),
    import_react.default.createElement("path", { key: "b", d: "M8 10.4 10.6 6.6" }),
    import_react.default.createElement("circle", { key: "c", cx: "8", cy: "11.2", r: "1.2", fill: "currentColor", stroke: "none" })
  ]);
}
function useSummary(intervalSec) {
  const [state, setState] = import_react.default.useState({ status: "loading", data: null, error: null, at: 0 });
  const [tick, setTick] = import_react.default.useState(0);
  const first = import_react.default.useRef(true);
  import_react.default.useEffect(() => {
    let alive = true;
    const url = first.current ? `${ROUTE}?refresh=1` : ROUTE;
    first.current = false;
    fetch(url, { cache: "no-store", credentials: "same-origin" }).then(async (response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json();
      if (!body?.ok) throw new Error(body?.error ?? "unknown error");
      if (alive) setState({ status: "ready", data: body.data, error: null, at: Date.now() });
    }).catch((error) => {
      if (alive) setState((prev) => ({ ...prev, status: prev.data ? "ready" : "failed", error: String(error?.message ?? error) }));
    });
    return () => {
      alive = false;
    };
  }, [tick]);
  import_react.default.useEffect(() => {
    const sec = Number(intervalSec) > 0 ? Number(intervalSec) : 0;
    if (!sec) return void 0;
    const timer = setInterval(() => setTick((n) => n + 1), sec * 1e3);
    return () => clearInterval(timer);
  }, [intervalSec]);
  const refresh = import_react.default.useCallback(() => setTick((n) => n + 1), []);
  return { ...state, refresh };
}
function useBalance(enabled, refreshKey) {
  const [state, setState] = import_react.default.useState({ status: "idle", data: null });
  const asked = import_react.default.useRef(false);
  import_react.default.useEffect(() => {
    if (!enabled || asked.current) return void 0;
    asked.current = true;
    let alive = true;
    setState({ status: "loading", data: null });
    fetch("/token-meter-panel/balance", { cache: "no-store", credentials: "same-origin" }).then((r) => r.json()).then((body) => {
      if (alive) setState({ status: "ready", data: body?.data ?? null });
    }).catch(() => {
      if (alive) setState({ status: "failed", data: null });
    });
    return () => {
      alive = false;
    };
  }, [enabled, refreshKey]);
  return state;
}
function useLiveUsage(props) {
  const useProjection = props?.useProjection;
  if (typeof useProjection !== "function") return void 0;
  try {
    const value = useProjection("tokenUsage");
    return value && typeof value === "object" ? value : void 0;
  } catch {
    return void 0;
  }
}
function TokenMeterPanel(props) {
  const { t } = props;
  const [range, setRange] = import_react.default.useState(7);
  const [intervalSec, setIntervalSec] = import_react.default.useState(60);
  const { status, data, error, at, refresh } = useSummary(intervalSec);
  import_react.default.useEffect(() => {
    const sec = data?.config?.refreshSeconds;
    if (typeof sec === "number" && sec > 0 && sec !== intervalSec) setIntervalSec(sec);
  }, [data?.config?.refreshSeconds, intervalSec]);
  const live = useLiveUsage(props);
  const balance = useBalance(Boolean(data?.config?.showBalance), data?.generatedAt);
  if (status === "loading" && !data) {
    return import_react.default.createElement("div", { style: { padding: 28, color: C.label3, fontSize: 13 } }, t("loading"));
  }
  if (status === "failed" && !data) {
    return import_react.default.createElement("div", { style: { padding: 28, color: C.error, fontSize: 13 } }, [
      import_react.default.createElement("div", { key: "a" }, `${t("failed")}\uFF1A${error}`),
      import_react.default.createElement("button", {
        key: "b",
        onClick: refresh,
        style: {
          marginTop: 10,
          padding: "5px 12px",
          borderRadius: 8,
          cursor: "pointer",
          border: `1px solid ${C.border}`,
          background: "transparent",
          color: C.label2,
          fontSize: 12
        }
      }, t("retry"))
    ]);
  }
  const days = data.days ?? {};
  const today = data.today;
  const D = days[today] ?? { miss: 0, hit: 0, out: 0, calls: 0, cny: 0, hitRate: null, byHour: new Array(24).fill(0), peakCalls: 0 };
  const dayKeys = Object.keys(days).sort();
  const prevKey = dayKeys.filter((k) => k < today).pop();
  const prev = prevKey ? days[prevKey] : null;
  const unit = { hit: 0.02, miss: 1, out: 4 };
  const cfgRates = data.config?.rates;
  if (cfgRates?.offPeak?.["deepseek-flash"]) {
    const r = data.peakNow ? cfgRates.peak : cfgRates.offPeak;
    const f = r?.["deepseek-flash"];
    if (f) {
      unit.hit = f.cacheHit;
      unit.miss = f.cacheMiss;
      unit.out = f.output;
    }
  }
  const cHit = D.hit / 1e6 * unit.hit;
  const cMiss = D.miss / 1e6 * unit.miss;
  const cOut = D.out / 1e6 * unit.out;
  const actual = cHit + cMiss + cOut || D.cny || 0;
  const noCache = D.hit / 1e6 * unit.miss + cMiss + cOut;
  const budget = Number(data.config?.dailyBudget) || 0;
  const usedPct = budget > 0 ? pct(D.cny, budget) : 0;
  const alertPct = Number(data.config?.alertAtPercent) || 80;
  const over = budget > 0 && D.cny > budget;
  const warn = budget > 0 && !over && usedPct >= alertPct;
  const delta = prev && prev.cny > 0 ? (D.cny - prev.cny) / prev.cny * 100 : null;
  const window_ = [];
  for (let i = range - 1; i >= 0; i--) {
    const ts = Date.now() - i * 864e5;
    const key = new Date(ts + 8 * 36e5).toISOString().slice(0, 10);
    window_.push({ key, entry: days[key] ?? null });
  }
  const maxTotal = Math.max(...window_.map(({ entry }) => entry ? entry.hit + entry.miss + entry.out : 0), 1);
  const maxHour = Math.max(...D.byHour ?? [0], 1);
  const peakHour = (D.byHour ?? []).indexOf(maxHour);
  const todaySessions = Object.values(data.sessions ?? {}).filter((s) => s.calls > 0 && s.lastTime && new Date(s.lastTime + 8 * 36e5).toISOString().slice(0, 10) === today).sort((a, b) => b.cny - a.cny);
  const maxSess = todaySessions.length ? Math.max(...todaySessions.map((s) => s.cny)) : 1;
  const chip = (active) => ({
    fontSize: 11,
    padding: "3px 9px",
    borderRadius: 999,
    cursor: "pointer",
    userSelect: "none",
    border: `1px solid ${active ? "var(--dsw-alias-brand-primary-foreground, " + C.brand + ")" : C.border}`,
    background: active ? "var(--dsw-alias-interactive-bg-hover, rgba(47,125,255,.12))" : "transparent",
    color: active ? C.label : C.label3
  });
  return import_react.default.createElement("div", {
    style: {
      height: "100%",
      overflow: "auto",
      padding: "16px 18px 40px",
      color: C.label,
      fontFamily: 'var(--dsw-font-family, system-ui, "Microsoft YaHei UI", sans-serif)',
      fontSize: 13,
      boxSizing: "border-box"
    }
  }, [
    /* 头部：标题 + 时段 + 范围 + 刷新 */
    import_react.default.createElement("div", {
      key: "head",
      style: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }
    }, [
      import_react.default.createElement("div", { key: "ti", style: { fontWeight: 700, fontSize: 15 } }, [
        t("title"),
        import_react.default.createElement("span", { key: "s", style: { fontWeight: 500, fontSize: 12, color: C.label3, marginLeft: 6 } }, `\xB7 ${t("subtitle")}`)
      ]),
      import_react.default.createElement("div", { key: "sp", style: { flex: 1 } }),
      import_react.default.createElement("span", {
        key: "tier",
        title: data.peakNow ? t("peakNow") : t("offNow"),
        style: {
          fontSize: 11,
          padding: "3px 9px",
          borderRadius: 999,
          border: `1px solid ${C.border}`,
          color: data.peakNow ? C.warn : C.label2
        }
      }, data.peakNow ? t("peak") : t("offpeak")),
      import_react.default.createElement("div", { key: "r7", style: chip(range === 7), onClick: () => setRange(7) }, t("range7")),
      import_react.default.createElement("div", { key: "r30", style: chip(range === 30), onClick: () => setRange(30) }, t("range30")),
      import_react.default.createElement("div", { key: "rf", style: chip(false), onClick: refresh, title: t("refresh") }, "\u27F3")
    ]),
    /* 主指标 */
    import_react.default.createElement("div", {
      key: "hero",
      style: { display: "grid", gridTemplateColumns: "minmax(260px, 1.2fr) minmax(220px, 1fr)", gap: 12 }
    }, [
      import_react.default.createElement("div", {
        key: "spend",
        style: {
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          padding: "14px 16px",
          background: "var(--dsw-alias-bg-layer-2, rgba(47,125,255,.06))"
        }
      }, [
        import_react.default.createElement("div", { key: "l", style: { fontSize: 12, color: C.label2 } }, `${t("today")} \xB7 ${today}`),
        import_react.default.createElement("div", {
          key: "n",
          style: { fontSize: 34, fontWeight: 750, lineHeight: 1.15, margin: "4px 0 2px", fontVariantNumeric: "tabular-nums" }
        }, [
          import_react.default.createElement("span", { key: "c", style: { fontSize: 16, fontWeight: 600, color: C.label2, marginRight: 2 } }, "\xA5"),
          D.cny.toFixed(2),
          delta !== null ? import_react.default.createElement("span", {
            key: "d",
            style: {
              fontSize: 11,
              fontWeight: 600,
              padding: "2px 7px",
              borderRadius: 999,
              marginLeft: 8,
              color: delta >= 0 ? C.error : C.ok,
              background: "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.12))"
            }
          }, `${delta >= 0 ? "\u2191" : "\u2193"} ${Math.abs(delta).toFixed(0)}% ${t("vsPrev")}`) : null
        ]),
        import_react.default.createElement("div", { key: "f", style: { fontSize: 11.5, color: C.label3, lineHeight: 1.7 } }, [
          `${t("hitInput")} ${fmt(D.hit)} \xD7 \xA5${unit.hit} + ${t("missInput")} ${fmt(D.miss)} \xD7 \xA5${unit.miss} + ${t("output")} ${fmt(D.out)} \xD7 \xA5${unit.out}`,
          import_react.default.createElement("br", { key: "br" }),
          `${t("rateLine")}\uFF1A\xA5/\u767E\u4E07 token\uFF08${data.peakNow ? t("peak") : t("offpeak")}\uFF09`
        ]),
        budget > 0 ? import_react.default.createElement("div", { key: "p", style: { marginTop: 10 } }, [
          import_react.default.createElement("div", {
            key: "track",
            style: { height: 5, borderRadius: 99, background: "var(--dsw-alias-border-l1, rgba(128,128,128,.2))", overflow: "hidden" }
          }, import_react.default.createElement("div", {
            style: {
              height: "100%",
              width: `${Math.min(usedPct, 100).toFixed(1)}%`,
              background: over ? C.error : warn ? C.warn : C.brand
            }
          })),
          import_react.default.createElement("div", {
            key: "txt",
            style: { fontSize: 11, color: over ? C.error : C.label3, marginTop: 6 }
          }, `${t("budgetUsed")} ${money(budget)} \xB7 ${t("used")} ${usedPct.toFixed(1)}% \xB7 ${t("remain")} ${money(Math.max(0, budget - D.cny))}` + (over ? ` \xB7 \u26A0 ${t("overBudget")}` : warn ? ` \xB7 ${usedPct >= alertPct ? "\u26A0" : ""}` : "") + (balance.data?.ok && balance.data.balance_infos?.[0] ? ` \xB7 ${t("balance")} \xA5${balance.data.balance_infos[0].total_balance}` : ""))
        ]) : null
      ]),
      import_react.default.createElement("div", {
        key: "stats",
        style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, alignContent: "start" }
      }, [
        import_react.default.createElement(Stat, { key: "1", t, label: t("missInput"), color: C.miss, value: fmt(D.miss) }),
        import_react.default.createElement(Stat, { key: "2", t, label: t("hitInput"), color: C.hit, value: fmt(D.hit) }),
        import_react.default.createElement(Stat, { key: "3", t, label: t("output"), color: C.out, value: fmt(D.out) }),
        import_react.default.createElement(Stat, {
          key: "4",
          t,
          label: t("hitRate"),
          value: D.hitRate === null || D.hitRate === void 0 ? "\u2014" : `${D.hitRate}`,
          unit: "%",
          extra: ` \xB7 ${D.calls} ${t("calls")}`
        })
      ])
    ]),
    /* 趋势 */
    import_react.default.createElement("div", { key: "trend", style: card }, [
      import_react.default.createElement("div", {
        key: "h",
        style: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", fontSize: 11, color: C.label3 }
      }, [
        import_react.default.createElement("span", { key: "t", style: { fontSize: 12.5, fontWeight: 650, color: C.label2 } }, t("trend")),
        import_react.default.createElement("span", { key: "sp", style: { flex: 1 } }),
        import_react.default.createElement("span", { key: "l1", style: { display: "flex", alignItems: "center", gap: 5 } }, [import_react.default.createElement("i", { key: "i", style: swatch(C.hit) }), t("hitInput")]),
        import_react.default.createElement("span", { key: "l2", style: { display: "flex", alignItems: "center", gap: 5 } }, [import_react.default.createElement("i", { key: "i", style: swatch(C.miss) }), t("missInput")]),
        import_react.default.createElement("span", { key: "l3", style: { display: "flex", alignItems: "center", gap: 5 } }, [import_react.default.createElement("i", { key: "i", style: swatch(C.out) }), t("output")])
      ]),
      import_react.default.createElement("div", {
        key: "bars",
        style: { display: "flex", alignItems: "flex-end", gap: range > 10 ? 3 : 8, height: 108, marginTop: 16 }
      }, window_.map(({ key, entry }, index) => {
        const total = entry ? entry.hit + entry.miss + entry.out : 0;
        const h = total > 0 ? Math.max(4, total / maxTotal * 100) : 2;
        const isToday = key === today;
        const label = `${key}${isToday ? ` \xB7 ${t("today")}` : ""}`;
        const tip = entry ? `${label}
${t("cost")} ${money(entry.cny)} \xB7 ${entry.calls} ${t("calls")}
${t("hitInput")} ${fmt(entry.hit)} \xB7 ${t("missInput")} ${fmt(entry.miss)} \xB7 ${t("output")} ${fmt(entry.out)}` : `${label} \xB7 ${t("zeroDays")}`;
        return import_react.default.createElement("div", {
          key,
          title: tip,
          style: {
            flex: 1,
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            outline: isToday ? `1px dashed ${C.brand}` : "none",
            outlineOffset: 2,
            borderRadius: 6,
            minWidth: 0
          }
        }, [
          total > 0 ? import_react.default.createElement("div", {
            key: "s",
            style: { height: `${h}%`, display: "flex", flexDirection: "column", justifyContent: "flex-end", borderRadius: "5px 5px 3px 3px", overflow: "hidden" }
          }, [
            import_react.default.createElement("div", { key: "h", style: { flex: Math.max(entry.hit, 1), minHeight: 3, background: C.hit } }),
            import_react.default.createElement("div", { key: "m", style: { flex: Math.max(entry.miss, 1), minHeight: 3, background: C.miss } }),
            import_react.default.createElement("div", { key: "o", style: { flex: Math.max(entry.out, 1), minHeight: 3, background: C.out } })
          ]) : import_react.default.createElement("div", {
            key: "z",
            style: { height: "2%", minHeight: 2, background: "var(--dsw-alias-border-l2, rgba(128,128,128,.3))", borderRadius: 3 }
          })
        ]);
      })),
      import_react.default.createElement("div", {
        key: "x",
        style: { display: "flex", gap: range > 10 ? 3 : 8, marginTop: 6 }
      }, window_.map(({ key, entry }) => {
        const total = entry ? entry.hit + entry.miss + entry.out : 0;
        const isToday = key === today;
        return import_react.default.createElement("div", {
          key,
          style: {
            flex: 1,
            textAlign: "center",
            fontSize: 10,
            minWidth: 0,
            overflow: "hidden",
            whiteSpace: "nowrap",
            color: isToday ? C.brand : total > 0 ? C.label3 : "transparent",
            fontWeight: isToday ? 700 : 400
          }
        }, isToday ? t("today") : range > 10 ? key.slice(5) : key.slice(5));
      })),
      /* 分时 */
      import_react.default.createElement("div", { key: "hr", style: { marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border1}` } }, [
        import_react.default.createElement("div", {
          key: "hh",
          style: { display: "flex", alignItems: "center", fontSize: 11.5, color: C.label3, gap: 8 }
        }, [
          import_react.default.createElement("span", { key: "t", style: { fontWeight: 650, color: C.label2 } }, t("byHour")),
          import_react.default.createElement("span", { key: "sp", style: { flex: 1 } }),
          import_react.default.createElement("span", { key: "p" }, `${String(peakHour).padStart(2, "0")}:00 \xB7 ${fmt(maxHour)} tokens \xB7 ${D.calls} ${t("calls")}`)
        ]),
        import_react.default.createElement("div", {
          key: "bars",
          style: { display: "flex", alignItems: "flex-end", gap: 2, height: 42, marginTop: 8 }
        }, Array.from({ length: 24 }, (_, h) => import_react.default.createElement("div", {
          key: h,
          title: `${String(h).padStart(2, "0")}:00 \xB7 ${fmt(D.byHour?.[h] ?? 0)} tokens`,
          style: {
            flex: 1,
            minHeight: 2,
            height: `${Math.max((D.byHour?.[h] ?? 0) / maxHour * 100, 1.5)}%`,
            background: h === peakHour ? "var(--dsw-alias-state-business-primary, #25d0e0)" : C.miss,
            opacity: h === peakHour ? 1 : 0.55,
            borderRadius: "2px 2px 0 0"
          }
        }))),
        import_react.default.createElement("div", {
          key: "ax",
          style: { display: "flex", justifyContent: "space-between", fontSize: 10, color: C.label3, marginTop: 4 }
        }, ["00", "06", "12", "18", "23"].map((s) => import_react.default.createElement("span", { key: s }, s)))
      ])
    ]),
    /* 成本构成 */
    import_react.default.createElement("div", { key: "split", style: card }, [
      import_react.default.createElement("div", {
        key: "h",
        style: { display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: C.label3, flexWrap: "wrap" }
      }, [
        import_react.default.createElement("span", { key: "t", style: { fontSize: 12.5, fontWeight: 650, color: C.label2 } }, t("costSplit")),
        import_react.default.createElement("span", { key: "sp", style: { flex: 1 } }),
        import_react.default.createElement("span", { key: "n" }, `${t("noCacheCost")} ${money(noCache)}`)
      ]),
      import_react.default.createElement(
        "div",
        { key: "rows", style: { display: "flex", flexDirection: "column", gap: 9, marginTop: 10 } },
        [
          [t("hitInput"), C.hit, cHit],
          [t("missInput"), C.miss, cMiss],
          [t("output"), C.out, cOut]
        ].map(([label, color, cost]) => import_react.default.createElement("div", {
          key: label,
          style: { display: "grid", gridTemplateColumns: "104px 1fr 96px", gap: 10, alignItems: "center", fontSize: 12 }
        }, [
          import_react.default.createElement(
            "div",
            { key: "n", style: { display: "flex", alignItems: "center", gap: 6, color: C.label2, whiteSpace: "nowrap" } },
            [import_react.default.createElement("i", { key: "i", style: swatch(color) }), label]
          ),
          import_react.default.createElement("div", {
            key: "tr",
            style: { height: 9, borderRadius: 99, background: "var(--dsw-alias-border-l1, rgba(128,128,128,.18))", overflow: "hidden" }
          }, import_react.default.createElement("div", {
            style: { height: "100%", width: `${pct(cost, actual).toFixed(1)}%`, background: color, borderRadius: 99 }
          })),
          import_react.default.createElement("div", {
            key: "v",
            style: { textAlign: "right", color: C.label2, fontVariantNumeric: "tabular-nums" }
          }, [
            import_react.default.createElement("b", { key: "b", style: { color: C.label } }, money(cost)),
            import_react.default.createElement("span", { key: "p", style: { color: C.label3, marginLeft: 6 } }, `${pct(cost, actual).toFixed(0)}%`)
          ])
        ]))
      ),
      import_react.default.createElement("div", {
        key: "saved",
        style: { marginTop: 10, fontSize: 11.5, color: C.label3 }
      }, `${t("cacheSaved")} ${money(Math.max(0, noCache - actual))}`)
    ]),
    /* 按会话明细 */
    import_react.default.createElement("div", { key: "sessions", style: card }, [
      import_react.default.createElement("div", {
        key: "h",
        style: { display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: C.label3 }
      }, [
        import_react.default.createElement("span", { key: "t", style: { fontSize: 12.5, fontWeight: 650, color: C.label2 } }, t("sessions")),
        import_react.default.createElement("span", { key: "sp", style: { flex: 1 } }),
        import_react.default.createElement("span", { key: "n" }, t("calls"))
      ]),
      todaySessions.length === 0 ? import_react.default.createElement("div", { key: "e", style: { fontSize: 12, color: C.label3, padding: "12px 0" } }, t("noData")) : import_react.default.createElement(
        "div",
        { key: "tb", style: { marginTop: 8, overflowX: "auto" } },
        import_react.default.createElement("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: 12.5 } }, [
          import_react.default.createElement("thead", { key: "th" }, import_react.default.createElement(
            "tr",
            null,
            [t("session"), t("lastCall"), t("hitInput"), t("missInput"), t("output"), t("callsShort"), t("cost")].map((h, i) => import_react.default.createElement("th", {
              key: h,
              style: {
                textAlign: i >= 2 ? "right" : "left",
                fontWeight: 600,
                fontSize: 11,
                color: C.label3,
                padding: "6px 8px",
                borderBottom: `1px solid ${C.border1}`,
                whiteSpace: "nowrap"
              }
            }, h))
          )),
          import_react.default.createElement("tbody", { key: "tb" }, todaySessions.slice(0, 20).map((s) => import_react.default.createElement("tr", { key: s.id }, [
            import_react.default.createElement("td", {
              key: "n",
              style: { padding: "7px 8px", borderBottom: `1px solid ${C.border1}`, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: C.label2 },
              title: s.title ?? s.id
            }, [
              s.isSubagent ? import_react.default.createElement("span", {
                key: "tag",
                style: {
                  fontSize: 10,
                  padding: "1px 5px",
                  borderRadius: 5,
                  marginRight: 6,
                  border: `1px solid ${C.border}`,
                  color: C.label3,
                  whiteSpace: "nowrap"
                }
              }, t("subagent")) : null,
              s.title ?? `(${s.id.slice(0, 12)})`
            ]),
            import_react.default.createElement("td", { key: "t", style: { padding: "7px 8px", color: C.label3, borderBottom: `1px solid ${C.border1}`, whiteSpace: "nowrap" } }, hhmm(s.lastTime)),
            import_react.default.createElement("td", { key: "h", style: { padding: "7px 8px", textAlign: "right", color: C.label2, borderBottom: `1px solid ${C.border1}`, fontVariantNumeric: "tabular-nums" } }, fmt(s.hit)),
            import_react.default.createElement("td", { key: "m", style: { padding: "7px 8px", textAlign: "right", color: C.label2, borderBottom: `1px solid ${C.border1}`, fontVariantNumeric: "tabular-nums" } }, fmt(s.miss)),
            import_react.default.createElement("td", { key: "o", style: { padding: "7px 8px", textAlign: "right", color: C.label2, borderBottom: `1px solid ${C.border1}`, fontVariantNumeric: "tabular-nums" } }, fmt(s.out)),
            import_react.default.createElement("td", { key: "c", style: { padding: "7px 8px", textAlign: "right", color: C.label3, borderBottom: `1px solid ${C.border1}` } }, s.calls),
            import_react.default.createElement("td", {
              key: "cost",
              style: { padding: "7px 8px", textAlign: "right", fontWeight: 650, color: C.label, borderBottom: `1px solid ${C.border1}`, fontVariantNumeric: "tabular-nums" }
            }, money(s.cny))
          ])))
        ])
      )
    ]),
    /* 本会话实时（官方投影叠加） */
    live ? import_react.default.createElement("div", { key: "live", style: card }, [
      import_react.default.createElement("div", { key: "h", style: { display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: C.label3 } }, [
        import_react.default.createElement("span", { key: "t", style: { fontSize: 12.5, fontWeight: 650, color: C.label2 } }, t("live")),
        import_react.default.createElement("span", { key: "h", style: { flex: 1 } }),
        import_react.default.createElement("span", { key: "n" }, t("liveHint"))
      ]),
      import_react.default.createElement("div", {
        key: "g",
        style: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 10, marginTop: 10 }
      }, [
        import_react.default.createElement(Stat, { key: "a", t, label: t("missInput"), color: C.miss, value: fmt(live.uncachedInputTokens) }),
        import_react.default.createElement(Stat, { key: "b", t, label: t("hitInput"), color: C.hit, value: fmt(live.cacheReadTokens) }),
        import_react.default.createElement(Stat, { key: "c", t, label: t("output"), color: C.out, value: fmt(live.outputTokens) })
      ])
    ]) : null,
    /* 页脚：采集状态 */
    import_react.default.createElement("div", {
      key: "foot",
      style: { marginTop: 12, fontSize: 11, color: C.label3, lineHeight: 1.8 }
    }, [
      import_react.default.createElement("div", { key: "a" }, `${t("source")}\uFF1A${data.sessionsRoot} \xB7 ${data.filesScanned} \u4E2A\u4F1A\u8BDD\u6587\u4EF6 \xB7 \u626B\u63CF ${data.elapsedMs}ms`),
      import_react.default.createElement("div", { key: "b" }, `${t("updated")} ${clock(at || data.generatedAt)} \xB7 ${t("partial")}`),
      import_react.default.createElement("div", { key: "c" }, `${t("rateLine")}\uFF1A${data.pricing?.source} \uFF08\u91C7\u96C6\u4E8E ${data.pricing?.fetchedAt}\uFF09`),
      error ? import_react.default.createElement("div", { key: "d", style: { color: C.warn } }, `${t("failed")}\uFF1A${error}`) : null
    ])
  ]);
}
var inject = ["slots", "locale"];
function apply(ctx) {
  ctx.effect(() => ctx.locale.register("token-meter-panel", { zh, en }), "token-meter-panel: dictionaries");
  ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
    name: "sidebar.panellist",
    id: SLOT_ID,
    order: 90,
    label: () => "Token",
    locale: "token-meter-panel"
  }, (props) => import_react.default.createElement(MeterIcon, { size: props?.size ?? 16, active: props?.active })));
  ctx.slots.inject("main", () => ctx.slots.register({
    name: "main",
    key: SLOT_ID,
    locale: "token-meter-panel"
  }, TokenMeterPanel));
}
return module.exports; } });
//# sourceMappingURL=client.js.map
