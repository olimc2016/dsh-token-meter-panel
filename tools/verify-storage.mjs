/**
 * 自检：Chromium Local Storage 读取器（src/chrome-storage.mjs）
 *
 * 1) 合成测试：手工构造一个最小 LevelDB 目录（CURRENT + MANIFEST + Snappy 压缩块的
 *    .ldb + 带 WriteBatch 的 .log），写入 _https://example.com\x00\x01demo → {"value":"hello"}，
 *    断言能取到 hello。不依赖真实浏览器，必须稳定通过。
 * 2) 真实测试：调用 readDeepseekPlatformToken()，读到就按「前6位****后4位 + 长度」打码打印；
 *    读不到只提示，**仍然以 0 退出**（真实环境不一定具备，不能因此让 npm test 失败）。
 *
 * 运行：node tools/verify-storage.mjs
 */
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { snappyDecompress, readLocalStorageValue, readDeepseekPlatformToken } from '../src/chrome-storage.mjs';

let failures = 0;
function check(label, ok, detail = '') {
  if (ok) console.log(`  ✓ ${label}${detail ? ' ' + detail : ''}`);
  else {
    failures++;
    console.log(`  ✗ ${label}${detail ? ' ' + detail : ''}`);
  }
}

/* ------------------------------------------------------------------ *
 * 小工具：varint / Snappy 压缩（测试用极简压缩器，只求产出合法 raw snappy 流）
 * ------------------------------------------------------------------ */
function varint(n) {
  const out = [];
  let v = n;
  do {
    let b = v & 0x7f;
    v = Math.floor(v / 128);
    if (v > 0) b |= 0x80;
    out.push(b);
  } while (v > 0);
  return Buffer.from(out);
}

function emitLiteral(buf, start, end) {
  const len = end - start;
  const body = buf.subarray(start, end);
  if (len <= 60) return Buffer.concat([Buffer.from([(len - 1) << 2]), body]);
  let n = len - 1;
  const bytes = [];
  while (n > 0) {
    bytes.push(n & 0xff);
    n = Math.floor(n / 256);
  }
  return Buffer.concat([Buffer.from([(59 + bytes.length) << 2, ...bytes]), body]);
}

/** 在最近 1KB 里找最长匹配（模仿 snappy 的 copy 输出） */
function findMatch(buf, pos) {
  const limit = Math.max(0, pos - 1024);
  let bestOff = 0;
  let bestLen = 0;
  for (let cand = limit; cand < pos; cand++) {
    let len = 0;
    while (len < 64 && pos + len < buf.length && buf[cand + len] === buf[pos + len]) len++;
    if (len > bestLen) {
      bestLen = len;
      bestOff = pos - cand;
    }
  }
  return bestLen >= 4 ? { off: bestOff, len: bestLen } : null;
}

/** 极简 snappy 压缩（literal + copy1/copy2），仅用于构造测试数据 */
function snappyCompress(input) {
  const parts = [varint(input.length)];
  let litStart = 0;
  let pos = 0;
  while (pos < input.length) {
    const m = findMatch(input, pos);
    if (!m) {
      pos++;
      continue;
    }
    if (litStart < pos) parts.push(emitLiteral(input, litStart, pos));
    if (m.off < 2048 && m.len >= 4 && m.len <= 11) {
      parts.push(Buffer.from([((m.off >> 8) << 5) | ((m.len - 4) << 2) | 1, m.off & 0xff]));
    } else {
      const tag = Buffer.from([((m.len - 1) << 2) | 2, 0, 0]);
      tag.writeUInt16LE(m.off, 1);
      parts.push(tag);
    }
    pos += m.len;
    litStart = pos;
  }
  if (litStart < input.length) parts.push(emitLiteral(input, litStart, input.length));
  return Buffer.concat(parts);
}

/* ------------------------------------------------------------------ *
 * 小工具：构造 LevelDB 的 .ldb / .log
 * ------------------------------------------------------------------ */
const TABLE_MAGIC_LO = 0x8b80fb57;
const TABLE_MAGIC_HI = 0xdb477524;

/** 数据块/索引块的条目区 + restart 数组（1 个 restart，偏移 0） */
function buildBlock(entries) {
  const parts = [];
  let prev = Buffer.alloc(0);
  for (const { key, value } of entries) {
    let shared = 0;
    const max = Math.min(prev.length, key.length);
    while (shared < max && prev[shared] === key[shared]) shared++; // 前缀压缩
    parts.push(varint(shared), varint(key.length - shared), varint(value.length), key.subarray(shared), value);
    prev = key;
  }
  const numRestarts = Buffer.alloc(4);
  numRestarts.writeUInt32LE(1);
  const restartOffset = Buffer.alloc(4);
  return Buffer.concat([...parts, numRestarts, restartOffset]);
}

/** 块内容 + 5 字节块尾（压缩类型 + 4 字节 CRC，CRC 故意留 0：读取器不校验） */
function withTrailer(content, compressed) {
  const trailer = Buffer.alloc(5);
  trailer[0] = compressed ? 1 : 0;
  return Buffer.concat([content, trailer]);
}

function internalKey(userKey, seq) {
  const trailer = Buffer.alloc(8);
  trailer.writeBigUInt64LE((BigInt(seq) << 8n) | 1n); // type 1 = value
  return Buffer.concat([userKey, trailer]);
}

/** 组装一个只含 1 个数据块的 .ldb */
function buildLdb(entries, useSnappy) {
  const dataBlock = buildBlock(entries); // entries 的 key 已是 internal key
  const dataStored = useSnappy ? snappyCompress(dataBlock) : dataBlock;
  const dataTrailer = withTrailer(dataStored, useSnappy);
  const lastKey = entries[entries.length - 1].key;
  const indexValue = Buffer.concat([varint(0), varint(dataStored.length)]); // BlockHandle(offset=0,size)
  const indexBlock = buildBlock([{ key: lastKey, value: indexValue }]);
  const indexStored = useSnappy ? snappyCompress(indexBlock) : indexBlock;
  const indexTrailer = withTrailer(indexStored, useSnappy);
  const indexOff = dataTrailer.length;

  const head = Buffer.alloc(40); // metaindex_handle 留空（读取器不需要 filter/统计块）
  Buffer.concat([varint(0), varint(0), varint(indexOff), varint(indexStored.length)]).copy(head);
  const magic = Buffer.alloc(8);
  magic.writeUInt32LE(TABLE_MAGIC_LO, 0);
  magic.writeUInt32LE(TABLE_MAGIC_HI, 4);
  return Buffer.concat([dataTrailer, indexTrailer, head, magic]);
}

/** WriteBatch：sequence(8) + count(4) + [type(1)+varint keylen+key(+varint vallen+value)] */
function buildWriteBatch(seq, ops) {
  const seqBuf = Buffer.alloc(8);
  seqBuf.writeBigUInt64LE(BigInt(seq));
  const countBuf = Buffer.alloc(4);
  countBuf.writeUInt32LE(ops.length);
  const parts = [];
  for (const op of ops) {
    if (op.value === null) parts.push(Buffer.from([0]), varint(op.key.length), op.key); // 删除
    else parts.push(Buffer.from([1]), varint(op.key.length), op.key, varint(op.value.length), op.value);
  }
  return Buffer.concat([seqBuf, countBuf, ...parts]);
}

/** 一条 FULL 类型的 WAL 记录：头 7 字节 = CRC(4) + 长度(2) + 类型(1) */
function buildLog(batches) {
  const out = [];
  for (const batch of batches) {
    const header = Buffer.alloc(7);
    header.writeUInt16LE(batch.length, 4);
    header[6] = 1; // FULL
    out.push(header, batch);
  }
  return Buffer.concat(out);
}

/* ------------------------------------------------------------------ *
 * 测试 1：Snappy 解压器单测（手工拼 tag）
 * ------------------------------------------------------------------ */
console.log('=== 1. Snappy 解压器单测 ===');
{
  const expected = Buffer.from('abcdefabcdefGHIJabcdefabcdefGHIJJJJJ' + 'L'.repeat(100), 'latin1');
  const stream = Buffer.concat([
    varint(expected.length),
    Buffer.from([((6 - 1) << 2)]), Buffer.from('abcdef'), // literal 'abcdef'
    Buffer.from([((6 - 1) << 2) | 2, 6, 0]), // copy2(offset=6, len=6)
    Buffer.from([((4 - 1) << 2)]), Buffer.from('GHIJ'), // literal 'GHIJ'
    Buffer.from([((16 - 1) << 2) | 2, 16, 0]), // copy2(offset=16, len=16)
    Buffer.from([((4 - 4) << 2) | 1, 1]), // copy1(offset=1, len=4) → 'JJJJ'
    Buffer.from([(59 + 1) << 2, 99]), Buffer.from('L'.repeat(100)), // 长 literal（扩展长度：tag 60 表示后跟 1 字节长度-1）
  ]);
  const got = snappyDecompress(stream);
  check('literal/copy1/copy2/长 literal 混合流', got.equals(expected), `(${expected.length} 字节)`);

  let threw = false;
  try {
    snappyDecompress(Buffer.from([5, ((3 - 1) << 2) | 2, 99, 0])); // copy2 偏移 99 超出已输出长度
  } catch {
    threw = true;
  }
  check('损坏流（copy 偏移越界）正确抛错', threw);
}

/* ------------------------------------------------------------------ *
 * 测试 2：合成 LevelDB 目录（不依赖真实浏览器）
 * ------------------------------------------------------------------ */
console.log('=== 2. 合成 LevelDB 目录 ===');
const store = mkdtempSync(join(tmpdir(), 'dsh-verify-storage-'));
try {
  const dataRoot = join(store, 'User Data');
  const ldbDir = join(dataRoot, 'Default', 'Local Storage', 'leveldb');
  const ldb2Dir = join(dataRoot, 'Profile 1', 'Local Storage', 'leveldb');
  mkdirSync(ldbDir, { recursive: true });
  mkdirSync(ldb2Dir, { recursive: true });

  const ukey = (key) => Buffer.from(`_https://example.com\x00\x01${key}`, 'latin1');
  const val = (text) => Buffer.from(`\x01${text}`, 'latin1'); // 0x01 = 8bit
  const valUtf16 = (text) => Buffer.concat([Buffer.from([0]), Buffer.from(text, 'utf16le')]);

  // .ldb（索引块与数据块都 Snappy 压缩，键做前缀压缩）
  const ldb1 = buildLdb(
    [
      { key: internalKey(ukey('demo'), 10), value: val('{"value":"hello"}') },
      { key: internalKey(ukey('demo2'), 11), value: val('{"value":"hello2"}') },
      { key: internalKey(ukey('over'), 12), value: val('old') },
      { key: internalKey(ukey('gone'), 13), value: val('x') },
      { key: internalKey(ukey('unicode'), 14), value: valUtf16('中文值') },
      { key: internalKey(Buffer.from('_https://other.example\x00\x01demo', 'latin1'), 15), value: val('nope') },
    ],
    true,
  );
  writeFileSync(join(ldbDir, '000003.ldb'), ldb1);

  // .ldb（未压缩块，验证 COMPRESSION_NONE 分支）
  writeFileSync(
    join(ldbDir, '000004.ldb'),
    buildLdb([{ key: internalKey(ukey('plain'), 20), value: val('plain-value') }], false),
  );

  // .log（WAL）：同名键用更大的 sequence 覆盖，另一条是删除
  writeFileSync(
    join(ldbDir, '000005.log'),
    buildLog([
      buildWriteBatch(100, [{ key: ukey('over'), value: val('new') }]),
      buildWriteBatch(101, [{ key: ukey('gone'), value: null }]),
      buildWriteBatch(102, [{ key: ukey('fromlog'), value: val('wal') }]),
    ]),
  );
  writeFileSync(join(ldbDir, 'CURRENT'), 'MANIFEST-000001\n');
  writeFileSync(join(ldbDir, 'MANIFEST-000001'), Buffer.from([0, 1, 2, 3, 4, 5])); // 读取器不解析它，但复制时必须带上

  // 第二个 profile：验证多 profile 遍历
  writeFileSync(join(ldb2Dir, 'CURRENT'), 'MANIFEST-000001\n');
  writeFileSync(join(ldb2Dir, 'MANIFEST-000001'), Buffer.from([0, 1, 2, 3]));
  writeFileSync(
    join(ldb2Dir, '000007.ldb'),
    buildLdb([{ key: internalKey(ukey('prof'), 30), value: val('from-profile-2') }], true),
  );

  const roots = [dataRoot];
  const read = (key, origin = 'https://example.com') => readLocalStorageValue({ key, origin, roots });
  const leftovers = () => readdirSync(tmpdir()).filter((n) => n.startsWith('dsh-localstorage-'));
  const leftoverBefore = leftovers().length;
  const demo = await read('demo');
  // 读取器返回的是解码后的原始值（localStorage 里存的就是 JSON 串），再解析出 .value
  const demoValue = demo ? JSON.parse(demo.value)?.value : null;
  check('demo 取到 {"value":"hello"} → hello（Snappy 压缩的 .ldb）', demoValue === 'hello', `file=${demo?.file} encoding=${demo?.encoding}`);
  check('返回值带 profile/file/encoding', demo?.profile === 'Default' && demo?.encoding === '8bit');
  check('demo2 取到 hello2（前缀压缩键）', JSON.parse((await read('demo2'))?.value)?.value === 'hello2');
  check('plain 取到 plain-value（未压缩块）', (await read('plain'))?.value === 'plain-value');
  const uni = await read('unicode');
  check('unicode 按 UTF-16LE 解码', uni?.value === '中文值' && uni?.encoding === 'utf16', `encoding=${uni?.encoding}`);
  check('over 取到 new（WAL 的 sequence 更大，覆盖 .ldb）', (await read('over'))?.value === 'new');
  check('gone 返回 null（WAL 里已删除）', (await read('gone')) === null);
  check('fromlog 取到 wal（WAL WriteBatch）', (await read('fromlog'))?.value === 'wal');
  check('origin 不匹配时不会串键', (await read('demo', 'https://other.example'))?.value === 'nope');
  check('键不存在返回 null', (await read('nope-not-exist')) === null);
  const prof = await read('prof');
  check('能扫到第二个 profile', prof?.value === 'from-profile-2' && prof?.profile === 'Profile 1', `profile=${prof?.profile}`);
  check('严格只读：临时副本目录已清理', leftovers().length === leftoverBefore, `残留 ${leftovers().length - leftoverBefore} 个`);
} catch (error) {
  failures++;
  console.log('  ✗ 合成测试抛异常：', error.message);
} finally {
  rmSync(store, { recursive: true, force: true });
}

/* ------------------------------------------------------------------ *
 * 测试 3：真实浏览器（读不到不算失败）
 * ------------------------------------------------------------------ */
console.log('=== 3. 真实浏览器（Edge/Chrome）===');
try {
  const t0 = Date.now();
  const token = await readDeepseekPlatformToken();
  const ms = Date.now() - t0;
  if (token) {
    console.log(`  ✓ 命中 userToken：${token.slice(0, 6)}****${token.slice(-4)}（长度 ${token.length}，用时 ${ms}ms）`);
  } else {
    console.log(`  - 未找到（可能未登录 platform.deepseek.com / 未装 Edge/Chrome / 已退出登录）；用时 ${ms}ms`);
  }
} catch (error) {
  console.log('  - 真实测试异常（不影响结果）：', error.message);
}

console.log(failures === 0 ? '\n✅ verify-storage: 全部通过' : `\n❌ verify-storage: ${failures} 项失败`);
process.exit(failures === 0 ? 0 : 1);
