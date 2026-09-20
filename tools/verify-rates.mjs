/**
 * 回归测试：设置 schema 补出来的默认费率，必须与 core.mjs 里的官方费率一致。
 *
 * 背景（真实踩过的坑）：schemastery 会把缺失的 offPeak / peak **整个补出来**，
 * 若两档共用同一个带默认值的 schema，高峰档就会被填成空闲价（0.02/1/4），
 * 于是高峰时段的费用被按半价计算 —— 这是本插件的核心数字，必须守住。
 */
import { PRICE_TIERS } from '../src/core.mjs';
import { loadConfigSchema } from '../lib/index.js';

const Schema = await loadConfigSchema();
if (!Schema) {
  console.error('FAIL: 设置 schema 加载失败（先跑 npm run setup 建 junction）');
  process.exit(1);
}

const base = Schema({});
const models = ['deepseek-flash', 'deepseek-v4-pro'];
const fields = ['cacheHit', 'cacheMiss', 'output'];
let bad = 0;

for (const [tierKey, field] of [['offPeak', 'offPeak'], ['peak', 'peak']]) {
  for (const m of models) {
    const got = base?.[tierKey]?.[m];
    const want = PRICE_TIERS[m];
    if (!got) { console.log(`FAIL 缺少 ${tierKey}.${m}`); bad++; continue; }
    for (const f of fields) {
      const expect = want[f][field];
      if (Number(got[f]) !== Number(expect)) {
        console.log(`FAIL ${tierKey}.${m}.${f}: 期望 ${expect}，实际 ${got[f]}`);
        bad++;
      }
    }
  }
}

// 关键性质：高峰价必须与空闲价不同——这正是本次踩的坑
for (const m of models) {
  if (JSON.stringify(base?.peak?.[m]) === JSON.stringify(base?.offPeak?.[m])) {
    console.log(`FAIL 高峰费率 == 空闲费率（${m}）：高峰时段会被按半价计算`);
    bad++;
  }
}

console.log(bad === 0 ? 'RATES OK（高峰/空闲两档费率与官方价一致）' : `RATES 失败项: ${bad}`);
process.exit(bad === 0 ? 0 : 1);
