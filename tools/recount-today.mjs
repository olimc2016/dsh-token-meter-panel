/**
 * 核对脚本：从原始会话日志里重新统计「今天」的用量，并 dump 一条原始 usage 用于对照字段名。
 * 用途：验证插件聚合口径是否漏算/多算（与面板显示对照）。
 */
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { readSessionRecords } from '../src/zstd.mjs';
import { usageOf, dayKeyOf } from '../src/core.mjs';

const root = process.env.DSH_HOME
  ? join(process.env.DSH_HOME, 'sessions')
  : join(process.env.USERPROFILE, '.dsh', 'sessions');
const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);

let files = 0, recs = 0, calls = 0;
let miss = 0, hit = 0, out = 0, cacheWrite = 0;
const bySource = new Map();
let sample = null;

function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (!e.name.startsWith('session')) continue;
    // v0 与 v3 并存时只认 v3（与插件同一规则）
    if (e.name.endsWith('.jsonl') && !e.name.includes('.v3.')) {
      try { statSync(p.replace(/\.jsonl$/, '.v3.jsonl')); continue; } catch { /* 没有 v3，保留 v0 */ }
    }
    files++;
    for (const r of readSessionRecords(p)) {
      recs++;
      const got = usageOf(r);
      if (!got?.usage) continue;
      const ts = got.time ?? r.time;
      if (!ts || dayKeyOf(ts) !== today) continue;
      const u = got.usage;
      calls++;
      miss += u.inputTokens || 0;
      hit += u.cacheReadTokens || 0;
      out += u.outputTokens || 0;
      cacheWrite += u.cacheWriteTokens || 0;
      const key = r.type === 'assistant/message' ? 'assistant/message' : `${r.type}(stream)`;
      bySource.set(key, (bySource.get(key) ?? 0) + 1);
      if (!sample) sample = { type: r.type, usage: u, source: got.source };
    }
  }
}
walk(root);

console.log(`=== 今天 ${today} 独立重算 ===`);
console.log(`扫描文件 ${files}，记录 ${recs}`);
console.log(`调用 ${calls}`);
console.log(`未命中输入 ${(miss / 1e6).toFixed(3)}M  缓存命中输入 ${(hit / 1e6).toFixed(3)}M  输出 ${(out / 1e6).toFixed(3)}M  缓存写入 ${cacheWrite}`);
console.log('来源分布:', [...bySource].map(([k, v]) => `${k}=${v}`).join('  '));
console.log('\n=== 一条原始 usage（用于核对字段名）===');
console.log(JSON.stringify(sample, null, 2));
