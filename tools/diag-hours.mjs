/**
 * 诊断：今天按小时累计费用，看看哪个时间点截断 ≈ 官方显示的 ¥7。
 * 用于判断「平台用量数据是否有延迟/按小时聚合」。
 */
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { readSessionRecords } from '../src/zstd.mjs';
import { usageOf, dayKeyOf, hourOf, isPeakHour, PRICE_TIERS } from '../src/core.mjs';

const root = join(process.env.USERPROFILE, '.dsh', 'sessions');
const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const rates = PRICE_TIERS['deepseek-flash'];
const byHour = new Map();

function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (!e.name.startsWith('session')) continue;
    if (e.name.endsWith('.jsonl') && !e.name.includes('.v3.')) {
      try { statSync(p.replace(/\.jsonl$/, '.v3.jsonl')); continue; } catch {}
    }
    for (const r of readSessionRecords(p)) {
      const got = usageOf(r);
      if (!got?.usage) continue;
      const ts = got.time ?? r.time;
      if (!ts || dayKeyOf(ts) !== today) continue;
      const u = got.usage;
      const tier = isPeakHour(ts) ? 'peak' : 'offPeak';
      const cost =
        ((u.cacheReadTokens || 0) / 1e6) * rates.cacheHit[tier] +
        ((u.inputTokens || 0) / 1e6) * rates.cacheMiss[tier] +
        ((u.outputTokens || 0) / 1e6) * rates.output[tier];
      const h = hourOf(ts);
      const cur = byHour.get(h) ?? { cost: 0, calls: 0, peak: 0 };
      cur.cost += cost; cur.calls++; if (tier === 'peak') cur.peak++;
      byHour.set(h, cur);
    }
  }
}
walk(root);

const hours = [...byHour.keys()].sort((a, b) => a - b);
const total = hours.reduce((a, h) => a + byHour.get(h).cost, 0);
const nowH = hourOf(Date.now());
console.log(`今天 ${today}（现在北京时间 ${nowH} 点）`);
console.log('小时  调用   其中高峰   费用      累计');
let acc = 0;
for (const h of hours) {
  const v = byHour.get(h);
  acc += v.cost;
  console.log(`${String(h).padStart(3)}:00  ${String(v.calls).padStart(4)}   ${String(v.peak).padStart(6)}   ¥${v.cost.toFixed(2).padStart(5)}   ¥${acc.toFixed(2)}`);
}
console.log(`\n合计 ¥${total.toFixed(2)}`);
// 找出「累计 ≈ 7」的截断点
let run = 0;
for (const h of hours) {
  run += byHour.get(h).cost;
  if (run >= 7) { console.log(`累计到 ${h}:59 时 ≈ ¥${run.toFixed(2)}（若官方是 ¥7，说明它只统计到 ${h} 点前后）`); break; }
}
