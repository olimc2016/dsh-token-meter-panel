/** 验证：峰/谷分档是否真的算出来了（直接跑 core.mjs 的聚合） */
import { aggregate, dayKeyOf } from '../src/core.mjs';

const a = aggregate(`${process.env.USERPROFILE}\\.dsh\\sessions`);
const today = dayKeyOf(Date.now());
const d = a.days[today];
if (!d) { console.log('今天没有数据'); process.exit(0); }
const t = d.tier;
console.log('今日合计: 命中', (d.hit / 1e6).toFixed(2) + 'M', '未命中', (d.miss / 1e6).toFixed(3) + 'M', '输出', (d.out / 1e6).toFixed(3) + 'M', '¥' + d.cny.toFixed(4), '调用', d.calls);
for (const [k, label] of [['peak', '峰时'], ['offPeak', '谷时']]) {
  const x = t?.[k];
  if (!x) { console.log(label, '无'); continue; }
  console.log(`${label}: 命中 ${(x.hit / 1e6).toFixed(2)}M 未命中 ${(x.miss / 1e6).toFixed(3)}M 输出 ${(x.out / 1e6).toFixed(3)}M → ¥${x.cny.toFixed(4)}（调用 ${x.calls}）`);
}
if (t) {
  const sumHit = t.peak.hit + t.offPeak.hit;
  const sumMiss = t.peak.miss + t.offPeak.miss;
  const sumOut = t.peak.out + t.offPeak.out;
  const sumCny = t.peak.cny + t.offPeak.cny;
  console.log('\n两档相加 vs 合计:',
    '命中', sumHit === d.hit, '| 未命中', sumMiss === d.miss, '| 输出', sumOut === d.out,
    '| 金额差', Math.abs(sumCny - d.cny).toFixed(6));
}
