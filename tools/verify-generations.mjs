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
  console.log('-- 8) 增量缓存：文件没变就走复用，变了只重算那一个，费率变了全部失效');
  {
    const a = record('deepseek-official', 'deepseek-flash');
    // 两个会话：东一个 2 条记录，另一个 3 条 → 首次共 5 次调用
    const { root } = fixture('--ws-h--', 's-cache', [['session.v4.jsonl.zstd', [a, a]]]);
    const dir2 = join(root, '--ws-h2--', 's-cache2');
    mkdirSync(dir2, { recursive: true });
    writeLog(join(dir2, 'session.v4.jsonl.zstd'), [a, a, a]);

    const cache = new Map();
    const first = aggregate(root, { cache });
    check('首次扫描全部真读（filesReused=0）', first.filesReused, 0);
    check('首次 calls', first.calls, 5);

    const second = aggregate(root, { cache });
    check('文件未变 → 全部复用', second.filesReused, second.filesScanned);
    check('复用后 calls 一致', second.calls, first.calls);
    check('复用后 cny 一致', bucket(second).cny, bucket(first).cny);
    check('复用后 sessions 数一致', Object.keys(second.sessions).length, Object.keys(first.sessions).length);
    check('复用后 byHour 一致', JSON.stringify(Object.values(second.days).map((d) => d.byHour)), JSON.stringify(Object.values(first.days).map((d) => d.byHour)));

    // 只动一个文件：只有它需要重算
    writeLog(join(dir2, 'session.v4.jsonl.zstd'), [a, a, a, a]);
    const third = aggregate(root, { cache });
    check('只重算变动的那个文件', third.filesReused, third.filesScanned - 1);
    check('变动后的 calls', third.calls, 6);

    // 计价口径变了：缓存必须整体失效（否则改了设置不生效）
    const rates = { 'deepseek-flash': { label: 'x', cacheHit: { offPeak: 0.04, peak: 0.08 }, cacheMiss: { offPeak: 2, peak: 4 }, output: { offPeak: 8, peak: 16 } } };
    const fourth = aggregate(root, { cache, rates });
    check('费率变化 → 不复用任何缓存', fourth.filesReused, 0);
    check('费率翻倍后 cny 翻倍', Number(bucket(fourth).cny.toFixed(4)), Number((bucket(third).cny * 2).toFixed(4)));
  }
} finally {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
}

console.log(failures === 0 ? '\n✅ verify-generations: 全部通过' : `\n❌ verify-generations: ${failures} 项失败`);
process.exit(failures === 0 ? 0 : 1);
