/**
 * Chromium 系浏览器（Edge / Chrome / Chromium / Brave / Vivaldi）Local Storage 读取器。
 *
 * 为什么自己写：本项目要求纯 JavaScript、零依赖、无原生模块，而 localStorage 存在 LevelDB
 * 里，Node 生态中能读 LevelDB 的包（classic-level 等）全是原生模块。本模块只用 node: 内置
 * 模块，自己实现三件事：
 *   1) raw Snappy 解压（SSTable 的数据块/索引块用 Snappy 压缩）
 *   2) LevelDB SSTable 读取：footer(48B) → index block → data block，解析前缀压缩键
 *   3) LevelDB WAL(.log) 读取：32KB 分块 + FULL/FIRST/MIDDLE/LAST 拼接 + WriteBatch
 *
 * 磁盘布局（Windows）：%LOCALAPPDATA%\<厂商>\<浏览器>\User Data\<Profile>\Local Storage\leveldb\
 * （Edge 在 Microsoft\Edge，Chrome 在 Google\Chrome，Brave 在 BraveSoftware\Brave-Browser）
 * 目录里是：CURRENT、MANIFEST-*、*.ldb(SSTable)、*.log(WAL)、LOCK、LOG
 *
 * localStorage 键在 LevelDB 里的编码（见 Chromium 的 LocalStorageDatabase）：
 *   _<origin>\x00\x01<key>    例如 _https://platform.deepseek.com\x00\x01userToken
 * 值的前 1 字节是编码前缀：0x00 = UTF-16LE、0x01 = 8bit(Latin-1，ASCII 时等价于 UTF-8)、
 * 0x02 = 新版 Chromium 的 Snappy 压缩值（防御性支持，见 decodeValue）。
 *
 * 关于 CRC32C：SSTable 的块尾与 WAL 记录头都带 CRC，本模块**不校验**——校验和完全不参与
 * 解析，浏览器正在运行、读的又只是副本，校验失败最多让我们少读一个键，不值得为此自带一张
 * CRC32C 表（还要处理 masked crc 位移）。结构性损坏由长度/偏移越界检查兜住，任何单文件、
 * 单块失败一律 try/catch 跳过，绝不把异常抛到顶层。严格只读：不写用户目录，先把 leveldb
 * 目录整体复制到系统临时目录再读（浏览器进程在跑、文件被占用），结束时删除临时副本。
 */
import { readdirSync, readFileSync, copyFileSync, existsSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, homedir, platform } from 'node:os';
import { zstdDecompressSync } from 'node:zlib';

/* ============ 1. varint：LevelDB 的长度/偏移都是 LEB128 小端 varint ============ */
/** 从 buf[pos] 读一个 varint，返回 [值, 下一个位置] */
function readVarint(buf, pos) {
  let result = 0;
  let shift = 0;
  for (;;) {
    if (pos >= buf.length) throw new Error('varint 越界');
    const byte = buf[pos++];
    // 用乘法而不是 <<，避免 32 位以上偏移被位运算截断
    result += (byte & 0x7f) * 2 ** shift;
    if ((byte & 0x80) === 0) return [result, pos];
    shift += 7;
    if (shift > 63) throw new Error('varint 过长');
  }
}

/* ============ 2. raw Snappy 解压（自己实现，不引依赖）============
 * 流 = varint(解压后长度) + 一串元素，tag 低 2 位是类型：
 *   00 literal：长度-1 存 tag>>2；<60 直接用，60~63 表示后跟 1~4 字节小端长度-1
 *   01/10/11 copy：长度 = 01 型 4+((tag>>2)&7)、10/11 型 1+(tag>>2)，偏移为 1/2/4 字节
 *   小端（01 型偏移 = ((tag>>5)<<8)|下一字节）。copy 允许重叠：offset < 已输出长度时
 *   逐字节复制，等价于 RLE。
 */
export function snappyDecompress(input, offset = 0) {
  let pos = offset;
  let expected;
  [expected, pos] = readVarint(input, pos);
  const out = Buffer.allocUnsafe(expected);
  let o = 0;
  while (pos < input.length) {
    const tag = input[pos++];
    const type = tag & 3;
    if (type === 0) {
      let len = tag >>> 2;
      if (len < 60) {
        len += 1;
      } else {
        const extra = len - 59; // tag 60→1 字节、61→2、62→3、63→4
        if (pos + extra > input.length) throw new Error('snappy literal 长度越界');
        len = 1;
        for (let i = 0; i < extra; i++) len += input[pos + i] * 2 ** (8 * i);
        pos += extra;
      }
      if (pos + len > input.length) throw new Error('snappy literal 数据越界');
      input.copy(out, o, pos, pos + len);
      o += len;
      pos += len;
    } else {
      let len;
      let off;
      if (type === 1) {
        len = 4 + ((tag >>> 2) & 7);
        off = ((tag >>> 5) << 8) | input[pos++];
      } else if (type === 2) {
        len = 1 + (tag >>> 2);
        off = input.readUInt16LE(pos);
        pos += 2;
      } else {
        len = 1 + (tag >>> 2);
        off = input.readUInt32LE(pos);
        pos += 4;
      }
      if (off <= 0 || off > o) throw new Error(`snappy 偏移非法：${off} > 已输出 ${o}`);
      for (let i = 0; i < len; i++) out[o] = out[o - off], o++;
    }
    if (o > expected) throw new Error('snappy 输出超长');
  }
  if (o !== expected) throw new Error(`snappy 长度不符：期望 ${expected}，实得 ${o}`);
  return out;
}

/* ============ 3. LevelDB 块：内容 + 5 字节块尾(1 字节压缩类型 + 4 字节 CRC) ============ */
const COMPRESSION_NONE = 0;
const COMPRESSION_SNAPPY = 1;
const COMPRESSION_ZSTD = 2; // 块尾第 1 字节的取值：0 未压缩、1 Snappy、2 Zstd
/** 按块尾标注的压缩类型解压一个块（CRC 忽略，理由见文件头） */
function readBlock(file, fileEnd, handle) {
  const end = handle.offset + handle.size;
  if (handle.offset < 0 || handle.size < 0 || end + 5 > fileEnd) {
    throw new Error(`块越界：offset=${handle.offset} size=${handle.size} 可用 ${fileEnd}`);
  }
  const raw = file.subarray(handle.offset, end);
  const type = file[end];
  if (type === COMPRESSION_NONE) return raw;
  if (type === COMPRESSION_SNAPPY) return snappyDecompress(raw);
  if (type === COMPRESSION_ZSTD) return zstdDecompressSync(raw); // 少数新版 Chromium 会用它
  throw new Error(`未知块压缩类型：${type}`);
}

/**
 * 逐个 yield 块里的条目 { key, value }：条目为前缀压缩的 varint shared / non_shared /
 * value_len；块尾 restart 数组的最后 4 字节是个数（再往前每项 4 字节偏移）。
 */
function* parseBlockEntries(block) {
  let entriesEnd = block.length;
  if (block.length >= 4) {
    const numRestarts = block.readUInt32LE(block.length - 4);
    const guess = block.length - 4 - numRestarts * 4;
    if (numRestarts >= 1 && guess >= 0) entriesEnd = guess;
  }
  let pos = 0;
  let lastKey = Buffer.alloc(0);
  while (pos < entriesEnd) {
    let shared;
    let nonShared;
    let valueLen;
    [shared, pos] = readVarint(block, pos);
    [nonShared, pos] = readVarint(block, pos);
    [valueLen, pos] = readVarint(block, pos);
    if (shared > lastKey.length) throw new Error('块内前缀长度非法');
    if (pos + nonShared + valueLen > entriesEnd) throw new Error('块内条目越界');
    const key = Buffer.concat([lastKey.subarray(0, shared), block.subarray(pos, pos + nonShared)]);
    pos += nonShared;
    const value = block.subarray(pos, pos + valueLen);
    pos += valueLen;
    lastKey = key;
    yield { key, value };
  }
}

/* ============ 4. SSTable（.ldb）：footer 48 字节 = [varint metaindex_handle] [varint
 * index_handle] + 补 0 到第 40 字节 + 8 字节小端 magic 0xdb4775248b80fb57 ============ */
const TABLE_MAGIC_LO = 0x8b80fb57;
const TABLE_MAGIC_HI = 0xdb477524;

/** 遍历一个 .ldb，对每个条目回调 { key(含 8 字节 seq/type 后缀), value, seq } */
function scanSSTable(filePath, onEntry) {
  const file = readFileSync(filePath);
  if (file.length < 48) throw new Error('文件太小，不是 SSTable');
  const footerStart = file.length - 48;
  const footer = file.subarray(footerStart);
  if (footer.readUInt32LE(40) !== TABLE_MAGIC_LO || footer.readUInt32LE(44) !== TABLE_MAGIC_HI) {
    throw new Error('SSTable magic 不符');
  }
  let pos = 0; // metaindex_handle（filter/统计等元数据块）用不到，解出来即丢弃
  let indexHandle;
  let indexSize;
  [, pos] = readVarint(footer, pos);
  [, pos] = readVarint(footer, pos);
  [indexHandle, pos] = readVarint(footer, pos);
  [indexSize, pos] = readVarint(footer, pos);

  // index block 的条目值 = data block 的 BlockHandle（varint offset + varint size）
  const indexBlock = readBlock(file, footerStart, { offset: indexHandle, size: indexSize });
  for (const entry of parseBlockEntries(indexBlock)) {
    let off;
    let size;
    let p = 0;
    [off, p] = readVarint(entry.value, p);
    [size, p] = readVarint(entry.value, p);
    let dataBlock;
    try {
      dataBlock = readBlock(file, footerStart, { offset: off, size });
    } catch {
      continue; // 单个数据块损坏/解压失败：跳过它，不影响其它块
    }
    try {
      for (const item of parseBlockEntries(dataBlock)) {
        // 数据块里的键是 internal key = user key + 8 字节小端 (seq<<8 | type)
        if (item.key.length < 8) continue;
        const seq = Number(item.key.readBigUInt64LE(item.key.length - 8) >> 8n);
        onEntry({ key: item.key.subarray(0, item.key.length - 8), value: item.value, seq });
      }
    } catch {
      continue; // 该数据块条目流损坏：跳过
    }
  }
}

/* ============ 5. WAL（.log）：32KB 一块，记录头 7 字节 = 4 字节 CRC(忽略) + 2 字节长度 +
 * 1 字节类型（1=FULL 2=FIRST 3=MIDDLE 4=LAST，6~9 是 recyclable 变体按同义处理）。拼好的
 * 记录是 WriteBatch：sequence(8) + count(4) + 每条 [type(1) + varint keylen + key (+value)] */
const LOG_BLOCK_SIZE = 32768;
const LOG_TYPES = { 1: 'FULL', 2: 'FIRST', 3: 'MIDDLE', 4: 'LAST' };
const logKind = (type) => LOG_TYPES[type] || LOG_TYPES[type - 5] || null; // 兼容 recyclable 6~9

/** 解析一个 WriteBatch 缓冲区 */
function scanWriteBatch(batch, onEntry) {
  if (batch.length < 12) return;
  const baseSeq = Number(batch.readBigUInt64LE(0));
  const count = batch.readUInt32LE(8);
  let pos = 12;
  for (let i = 0; i < count; i++) {
    if (pos >= batch.length) return;
    const type = batch[pos++];
    let keyLen;
    [keyLen, pos] = readVarint(batch, pos);
    if (pos + keyLen > batch.length) return;
    const key = batch.subarray(pos, pos + keyLen);
    pos += keyLen;
    if (type === 1) {
      let valueLen;
      [valueLen, pos] = readVarint(batch, pos);
      if (pos + valueLen > batch.length) return;
      const value = batch.subarray(pos, pos + valueLen);
      pos += valueLen;
      onEntry({ key, value, seq: baseSeq + i });
    } else if (type === 0) {
      onEntry({ key, value: null, seq: baseSeq + i }); // 删除：值为 null
    } else {
      return; // Chromium 的扩展类型（如 blob 索引），本读取器不认识，停止解析该批
    }
  }
}

/** 遍历一个 .log，对每条 WriteBatch 回调 */
function scanLog(filePath, onEntry) {
  const file = readFileSync(filePath);
  let pos = 0;
  let pending = [];
  while (pos + 7 <= file.length) {
    const blockRemain = LOG_BLOCK_SIZE - (pos % LOG_BLOCK_SIZE);
    if (blockRemain < 7) {
      pos += blockRemain; // 块尾不足一个记录头，跳到下一块
      continue;
    }
    const length = file.readUInt16LE(pos + 4);
    const kind = logKind(file[pos + 6]);
    if (length === 0) {
      pos += blockRemain; // 预分配/块尾填充
      continue;
    }
    if (7 + length > blockRemain) break; // 头部长度跨块：视为损坏，放弃该文件剩余部分
    const data = file.subarray(pos + 7, pos + 7 + length);
    pos += 7 + length;
    if (kind === 'FULL') {
      scanWriteBatch(data, onEntry);
    } else if (kind === 'FIRST') {
      pending = [data];
    } else if (kind === 'MIDDLE') {
      pending.push(data);
    } else if (kind === 'LAST') {
      pending.push(data);
      const whole = Buffer.concat(pending);
      pending = [];
      scanWriteBatch(whole, onEntry);
    } else {
      pending = []; // 未知类型：丢弃半截记录
    }
  }
}

/* ============ 6. 值解码 ============ */
/** 解码 localStorage 的值字节（去掉 1 字节编码前缀） */
function decodeValue(raw) {
  if (!raw || raw.length === 0) return { text: '', encoding: '8bit' };
  const prefix = raw[0];
  const body = raw.subarray(1);
  if (prefix === 0x00) return { text: body.toString('utf16le'), encoding: 'utf16' };
  if (prefix === 0x01) {
    // 8bit：Chromium 按 Latin-1 解释；纯 ASCII 与 UTF-8 等价，真多字节 UTF-8 则按 UTF-8 出结果
    const utf8 = body.toString('utf8');
    if (!utf8.includes('\uFFFD')) return { text: utf8, encoding: '8bit' };
    return { text: body.toString('latin1'), encoding: '8bit' };
  }
  if (prefix === 0x02) {
    try { // 防御性分支：新版 Chromium 的 localStorage 值压缩实验用 0x02 标记 Snappy
      return decodeValue(snappyDecompress(body));
    } catch {
      /* 猜错了就按无前缀明文处理 */
    }
  }
  return { text: raw.toString('utf8'), encoding: '8bit' }; // 没有前缀的裸值
}

/* ============ 7. profile 发现 + 只读复制 ============ */

/** 各浏览器 User Data 根目录（相对系统配置目录） */
const BROWSER_ROOTS = {
  win32: [
    ...['Edge', 'Edge Beta', 'Edge Dev', 'Edge SxS'].map((d) => ['Microsoft', d, 'User Data']),
    ...['Chrome', 'Chrome Beta', 'Chrome Dev', 'Chrome SxS'].map((d) => ['Google', d, 'User Data']),
    ['Chromium', 'User Data'],
    ['BraveSoftware', 'Brave-Browser', 'User Data'],
    ['Vivaldi', 'User Data'],
    ['Yandex', 'YandexBrowser', 'User Data'],
  ],
  darwin: [['Google', 'Chrome'], ['Chromium'], ['BraveSoftware', 'Brave-Browser'], ['Microsoft Edge'], ['Vivaldi']],
  linux: [['google-chrome'], ['chromium'], ['microsoft-edge'], ['BraveSoftware', 'Brave-Browser'], ['vivaldi']],
};

/**
 * 自动发现本机存在的浏览器 User Data 根目录（存在才返回）。可用环境变量
 * CHROMIUM_USER_DATA_DIRS（Windows 分号、类 Unix 冒号分隔）追加自定义路径。
 * @returns {string[]}
 */
export function findStorageRoots() {
  const os = platform();
  const base =
    os === 'win32'
      ? process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local')
      : os === 'darwin'
        ? join(homedir(), 'Library', 'Application Support')
        : process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
  const dirs = (BROWSER_ROOTS[os] || BROWSER_ROOTS.linux).map((parts) => join(base, ...parts));
  const sep = os === 'win32' ? ';' : ':';
  for (const extra of (process.env.CHROMIUM_USER_DATA_DIRS || '').split(sep)) dirs.push(extra.trim());
  return [...new Set(dirs)].filter((p) => {
    try {
      return Boolean(p) && existsSync(p) && statSync(p).isDirectory();
    } catch {
      return false; // 权限/竞态：忽略
    }
  });
}

/** 列出 User Data 根目录下真正带 Local Storage/leveldb 的 profile（Default 优先） */
function listProfiles(root, maxProfiles) {
  const found = [];
  try {
    for (const name of readdirSync(root)) {
      const leveldb = join(root, name, 'Local Storage', 'leveldb');
      if (existsSync(join(leveldb, 'CURRENT'))) found.push({ profile: name, leveldb });
    }
  } catch {
    return [];
  }
  const rank = (n) => (n === 'Default' ? 0 : /^Profile \d+$/.test(n) ? 1 : 2);
  found.sort((a, b) => rank(a.profile) - rank(b.profile) || a.profile.localeCompare(b.profile, 'en', { numeric: true }));
  return found.slice(0, Math.max(0, maxProfiles));
}

/** 把 leveldb 目录整体复制到系统临时目录（浏览器在跑、原文件被占用，不能直接读）。
 * CURRENT 与 MANIFEST-* 必须一起复制，否则 LevelDB 打不开；LOCK 是无用的锁文件，跳过。
 * @returns {string} 临时目录路径（调用方负责删除） */
function copyLevelDbToTemp(leveldbDir) {
  const tmp = mkdtempSync(join(tmpdir(), 'dsh-localstorage-'));
  for (const name of readdirSync(leveldbDir)) {
    if (name === 'LOCK') continue;
    const src = join(leveldbDir, name);
    try {
      if (!statSync(src).isFile()) continue;
      copyFileSync(src, join(tmp, name));
    } catch {
      continue; // 目录项/文件不可读或被占用：跳过，其它文件仍然能读
    }
  }
  return tmp;
}

/* ============ 8. 对外主入口 ============ */
/**
 * 在给定浏览器 profile 集合里查找某个 origin 的 localStorage 键，返回其值。
 * @param {string} options.key localStorage 的键名（如 userToken）
 * @param {string} options.origin 站点 origin（如 https://platform.deepseek.com）
 * @param {string[]} [options.roots] User Data 根目录；缺省自动发现
 * @param {number} [options.maxProfiles] 最多扫多少个 profile（默认 40）
 * @param {number} [options.timeoutMs] 总体限时（默认 20 秒），超时返回 null
 * @returns {Promise<{value: string, profile: string, file: string, encoding: '8bit'|'utf16'}|null>}
 */
export async function readLocalStorageValue({ key, origin, roots, maxProfiles = 40, timeoutMs = 20000 } = {}) {
  if (!key || !origin) return null;
  const deadline = Date.now() + timeoutMs;
  // 目标 user key：origin 与键名都是 ASCII，用 latin1 保证一字符一字节
  const target = Buffer.from(`_${origin}\x00\x01${key}`, 'latin1');
  const searchRoots = Array.isArray(roots) && roots.length > 0 ? roots : findStorageRoots();
  let best = null; // { seq, value(string|null=已删除), profile, file, encoding }

  for (const root of searchRoots) {
    if (Date.now() > deadline) break;
    for (const { profile, leveldb } of listProfiles(root, maxProfiles)) {
      if (Date.now() > deadline) break;
      let tmp = null;
      try {
        tmp = copyLevelDbToTemp(leveldb);
      } catch {
        continue; // 目录不可读
      }
      try {
        for (const name of readdirSync(tmp).filter((f) => f.endsWith('.ldb') || f.endsWith('.log'))) {
          if (Date.now() > deadline) break;
          const collect = ({ key: rawKey, value, seq }) => {
            if (!rawKey.equals(target)) return;
            if (best && seq <= best.seq) return; // 只保留 sequence 最大的那条
            if (value === null) {
              best = { seq, value: null, profile, file: name, encoding: '8bit' }; // 该键已被删除
              return;
            }
            const decoded = decodeValue(value);
            best = { seq, value: decoded.text, profile, file: name, encoding: decoded.encoding };
          };
          try {
            if (name.endsWith('.ldb')) scanSSTable(join(tmp, name), collect);
            else scanLog(join(tmp, name), collect);
          } catch {
            /* 单个文件损坏：跳过，继续扫下一个 */
          }
        }
      } catch {
        continue; // 该 profile 整体读取失败（如目录被删）：跳过，继续下一个
      } finally {
        try {
          rmSync(tmp, { recursive: true, force: true }); // 只读承诺：临时副本用完即删
        } catch {
          /* 删除失败不影响结果 */
        }
      }
    }
  }

  if (!best || best.value === null) return null;
  return { value: best.value, profile: best.profile, file: best.file, encoding: best.encoding };
}

/**
 * 便捷封装：读 DeepSeek 开放平台（platform.deepseek.com）的 userToken。
 * 值形如 {"value":"<token>","__version":"1"}，取出 .value。
 * @returns {Promise<string|null>} token 字符串；未登录/未安装浏览器时返回 null
 */
export async function readDeepseekPlatformToken() {
  const hit = await readLocalStorageValue({ origin: 'https://platform.deepseek.com', key: 'userToken' });
  if (!hit || !hit.value) return null;
  try {
    const value = JSON.parse(hit.value)?.value;
    return typeof value === 'string' && value.length > 0 ? value : null;
  } catch {
    return hit.value.length > 0 ? hit.value : null; // 兜底：值本身就是裸 token
  }
}
