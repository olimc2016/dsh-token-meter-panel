/** 自检：摘要聚合 + 计费 + 时区 + 与既有数字对照 */
import { aggregate, costOf, isPeakHour, dayKeyOf, PRICE_TIERS } from '../src/core.mjs';

const ROOT = process.env.DSH_SESSIONS || 'C:/Users/oli20/.dsh/sessions';
const t0 = Date.now();
const data = aggregate(ROOT);
console.log(`files=${data.filesScanned} skippedStale=${data.filesSkippedAsStale.length} unreadable=${data.unreadableFiles} calls=${data.calls} unpriced=${data.unpricedCalls} in ${Date.now() - t0}ms`);
console.log('\n-- per day (Beijing) --');
for (const [day, e] of Object.entries(data.days).sort()) {
  console.log(`${day} calls=${String(e.calls).padStart(4)} miss=${String(e.miss).padStart(9)} hit=${String(e.hit).padStart(11)} out=${String(e.out).padStart(7)} rate=${e.hitRate}% CNY=${e.cny.toFixed(4)} peak=${e.peakCalls}`);
}
const tot = Object.values(data.days).reduce((a, e) => ({
  calls: a.calls + e.calls, miss: a.miss + e.miss, hit: a.hit + e.hit, out: a.out + e.out, cny: a.cny + e.cny,
}), { calls: 0, miss: 0, hit: 0, out: 0, cny: 0 });
console.log(`TOTAL calls=${tot.calls} miss=${tot.miss} hit=${tot.hit} out=${tot.out} CNY=${tot.cny.toFixed(3)}`);
console.log('\n-- providers --');
for (const [p, v] of Object.entries(data.providers)) console.log(`  ${p}: calls=${v.calls} tokens=${v.tokens} CNY=${v.cny.toFixed(3)}`);
console.log('\n-- models --');
for (const [m, v] of Object.entries(data.models)) console.log(`  ${m}: calls=${v.calls} CNY=${v.cny.toFixed(3)} rate=${v.hitRate}%`);

console.log('\n-- pricing tiers self-check --');
const u = { inputTokens: 1e6, cacheReadTokens: 1e6, outputTokens: 1e6 };
const cases = [
  ['2026-09-19T02:00:00Z', 'Sat 10:00 CST (off-peak)'],
  ['2026-09-21T02:00:00Z', 'Mon 10:00 CST (peak)'],
  ['2026-09-21T05:00:00Z', 'Mon 13:00 CST (off-peak, lunch)'],
  ['2026-09-21T07:00:00Z', 'Mon 15:00 CST (peak)'],
  ['2026-09-21T11:00:00Z', 'Mon 19:00 CST (off-peak)'],
];
for (const [iso, label] of cases) {
  const ms = Date.parse(iso);
  const c = costOf(u, 'deepseek-flash', ms);
  console.log(`  ${isPeakHour(ms) ? 'PEAK' : 'off '} ${label} -> CNY ${c.cny.toFixed(2)} (hit ${c.unit.hit} miss ${c.unit.miss} out ${c.unit.out})`);
}
const pro = costOf({ inputTokens: 2e6 }, 'deepseek-v4-pro', Date.parse('2026-09-21T02:00:00Z'));
console.log(`  v4-pro peak 2M miss = ${pro.cny} (expect 18)`);
console.log(`  unknown model -> ${JSON.stringify(costOf(u, 'gpt-99', Date.now()))} (expect null)`);
console.log(`  today key = ${dayKeyOf(Date.now())}`);
