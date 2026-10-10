/** 自检：多帧 zstd 解码器 vs 全量会话日志（路径跨平台，无日志时自动跳过） */
import { readSessionRecords, readSessionLog } from '../src/zstd.mjs';
import { statSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { listSessionLogs, sessionsRoot } from './paths.mjs';

const dir = sessionsRoot();
const files = listSessionLogs(dir);
console.log('sessions root:', dir);
console.log('session files:', files.length);
if (files.length === 0) {
  console.log('SKIP: 没有找到会话日志（干净机器 / 尚未跑过会话）。可用 DSH_SESSIONS=<dir> 指定。');
  process.exit(0);
}

let total = 0, bad = 0, bytes = 0;
const t0 = Date.now();
for (const { file: f } of files) {
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
if (total === 0) {
  console.error('FAIL: 日志可读但一条记录都没解出来');
  process.exit(1);
}
