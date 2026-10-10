/**
 * 回归测试：会话日志代际去重 + 计费 provider 口径。
 *
 * 这两条都曾经在真机上出过错：
 *   - 代际：官方持久化会把迁移出的旧文件**逐字节保留**在磁盘上，同一会话目录里
 *     v1 + v4、裸 session.jsonl + v4 都是正常状态。旧实现只特判了 v3，
 *     于是「v1 + v4」这种组合把同一批用量算了两遍（金额翻倍），
 *     而「v3 + v4」又把 v4 丢掉（升级后新增用量永远看不到）。
 *   - provider：桌面端账号登录走的 provider id 是 deepseek-account，旧实现只认
 *     deepseek-official，导致账号用户的面板恒为 0。
 *
 * 本测试是**自造数据**的：不依赖本机任何会话日志，任何机器上都能跑。
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { zstdCompressSync } from 'node:zlib';
import { aggregate } from '../src/core.mjs';

const OFF_PEAK = Date.parse('2026-09-19T02:00:00Z'); // 周六 10:00 北京时间 → 空闲档
const USAGE = { inputTokens: 1e6, cacheReadTokens: 1e6, outputTokens: 1e6, cacheWriteTokens: 0 };
const roots = [];

let failures = 0;
function check(label, actual, expected) {
  const ok = typeof expected === 'number' && typeof actual === 'number'
    ? Math.abs(actual - expected) < 1e-6
    : actual === expected;
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}: ${actual}${ok ? '' : ` (expect ${expected})`}`);
  if (!ok) failures += 1;
}

/** 一条带 usage 的 assistant/message（provider / model 可换） */
function record(provider, model) {
  return {
    type: 'assistant/message',
    time: OFF_PEAK,
    data: { usage: USAGE, message: { source: { provider, model } } },
  };
}

/** 组装成 DSH 那样的「多帧 zstd」文件：每条记录一个独立帧 */
function writeLog(file, records) {
  writeFileSync(file, Buffer.concat(records.map((r) => zstdCompressSync(Buffer.from(`${JSON.stringify(r)}\n`)))));
}
function writeRawLog(file, records) {
  writeFileSync(file, records.map((r) => `${JSON.stringify(r)}\n`).join(''));
}

/** 每个用例一个独立根目录，互不干扰 */
function fixture(ws, sid, files) {
  const root = mkdtempSync(join(tmpdir(), 'tm-generations-'));
  roots.push(root);
  const dir = join(root, ws, sid);
  mkdirSync(dir, { recursive: true });
  for (const [name, records, raw] of files) {
    (raw ? writeRawLog : writeLog)(join(dir, name), records);
  }
  return { root, dir };
}
const bucket = (data) => Object.values(data.days).reduce((a, d) => ({
  calls: a.calls + d.calls, hit: a.hit + d.hit, miss: a.miss + d.miss, out: a.out + d.out, cny: a.cny + d.cny,
}), { calls: 0, hit: 0, miss: 0, out: 0, cny: 0 });

try {
  console.log('-- 1) 单文件基线（顺带校验费率：空闲档 1e6 miss + 1e6 hit + 1e6 out = 5.02 元）');
  {
    const { root } = fixture('--ws-a--', 's-base', [['session.v4.jsonl.zstd', [record('deepseek-official', 'deepseek-flash')]]]);
    const data = aggregate(root);
    const b = bucket(data);
    check('calls', b.calls, 1);
    check('cny', Number(b.cny.toFixed(2)), 5.02);
  }

  console.log('-- 2) v3 + v4：必须只取 v4（v3 是过期快照，取 v3 就会丢新用量）');
  {
    const { root } = fixture('--ws-b--', 's-v3v4', [
      ['session.v3.jsonl.zstd', [record('deepseek-official', 'deepseek-flash')]],
      ['session.v4.jsonl.zstd', [record('deepseek-official', 'deepseek-flash'), record('deepseek-official', 'deepseek-flash')]],
    ]);
    const data = aggregate(root);
    check('filesScanned', data.filesScanned, 1);
    check('calls（v4 的 2，而不是 v3 的 1 或相加的 3）', data.calls, 2);
  }

  console.log('-- 3) v1 + v4：绝不能相加（旧实现这里翻倍）');
  {
    const { root } = fixture('--ws-c--', 's-v1v4', [
      ['session.v1.jsonl.zstd', [record('deepseek-official', 'deepseek-flash')]],
      ['session.v4.jsonl.zstd', [record('deepseek-official', 'deepseek-flash')]],
    ]);
    const data = aggregate(root);
    check('filesScanned', data.filesScanned, 1);
    check('calls', data.calls, 1);
  }

  console.log('-- 4) 裸 session.jsonl + v4：同样只算一次');
  {
    const { root } = fixture('--ws-d--', 's-rawv4', [
      ['session.jsonl', [record('deepseek-official', 'deepseek-flash')], true],
      ['session.v4.jsonl.zstd', [record('deepseek-official', 'deepseek-flash')]],
    ]);
    const data = aggregate(root);
    check('filesScanned', data.filesScanned, 1);
    check('calls', data.calls, 1);
  }

  console.log('-- 5) 非会话日志（session.lock / notes.jsonl）必须被忽略');
  {
    const { root, dir } = fixture('--ws-e--', 's-noise', []);
    writeFileSync(join(dir, 'session.lock'), '{"pid":1}');
    writeFileSync(join(dir, 'notes.jsonl'), `${JSON.stringify(record('deepseek-official', 'deepseek-flash'))}\n`);
    const data = aggregate(root);
    check('filesScanned', data.filesScanned, 0);
    check('calls', data.calls, 0);
  }

  console.log('-- 6) provider 口径：桌面端账号路由必须计价，第三方只记 token');
  {
    const { root } = fixture('--ws-f--', 's-providers', [['session.v4.jsonl.zstd', [
      record('deepseek-account', 'deepseek-flash'), // 桌面端账号登录
      record('deepseek-official', 'deepseek-flash'), // API Key 路由
      record('openrouter', 'deepseek-flash'), // 第三方中转
    ]]]);
    const data = aggregate(root);
    const provider = (name) => data.providers[name] ?? { calls: 0, cny: 0, tokens: 0 };
    check('deepseek-account calls', provider('deepseek-account').calls, 1);
    check('deepseek-account 已计价', Number(provider('deepseek-account').cny.toFixed(2)), 5.02);
    check('deepseek-official 已计价', Number(provider('deepseek-official').cny.toFixed(2)), 5.02);
    check('openrouter 默认被过滤', provider('openrouter').calls, 0);

    const all = aggregate(root, { includeOtherProviders: true });
    check('includeOtherProviders 后 openrouter calls', all.providers.openrouter.calls, 1);
    check('openrouter 不计价', all.providers.openrouter.cny, 0);
    check('openrouter 仍记 token', all.providers.openrouter.tokens, 3e6);
  }

  console.log('-- 7) 未知模型：只记 token、不猜价（unpricedCalls 计数）');
  {
    const { root } = fixture('--ws-g--', 's-unknown', [['session.v4.jsonl.zstd', [record('deepseek-official', 'gpt-99')]]]);
    const data = aggregate(root);
    check('calls', data.calls, 1);
    check('unpricedCalls', data.unpricedCalls, 1);
    check('cny', bucket(data).cny, 0);
  }
} finally {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
}

console.log(failures === 0 ? '\n✅ verify-generations: 全部通过' : `\n❌ verify-generations: ${failures} 项失败`);
process.exit(failures === 0 ? 0 : 1);
