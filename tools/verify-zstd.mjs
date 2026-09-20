/** 自检：多帧 zstd 解码器 vs 全量会话日志 */
import { readSessionRecords, readSessionLog } from '../src/zstd.mjs';
import { readdirSync, statSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';

const dir = 'C:/Users/oli20/.dsh/sessions/--F-DSH--';
const files = [];
for (const d of readdirSync(dir)) {
  const p = join(dir, d);
  if (!statSync(p).isDirectory()) continue;
  for (const f of readdirSync(p)) if (f.endsWith('.zstd')) files.push(join(p, f));
}
console.log('session files:', files.length);

let total = 0, bad = 0, bytes = 0;
const t0 = Date.now();
for (const f of files) {
  const recs = readSessionRecords(f);
  const text = readSessionLog(f);
  const rawLines = text.split('\n').filter((l) => l.trim()).length;
  total += recs.length;
  bytes += statSync(f).size;
  if (rawLines !== recs.length) {
    bad += rawLines - recs.length;
    console.log('  parse gaps:', basename(dirname(f)), rawLines, '->', recs.length);
  }
}
console.log('compressed', (bytes / 1048576).toFixed(1) + 'MB', '| records', total, '| unparsed', bad, '|', (Date.now() - t0) + 'ms');
