/**
 * DSH 会话日志的解压与读取。
 *
 * 背景（踩坑记录）：
 *   DSH 的 `session.*.jsonl.zstd` 是**追加写入的多帧（concatenated frames）zstd**，
 *   一个文件里有成百上千个独立帧。Node 的 zlib 提供三种入口，前两种都不行：
 *     - zstdDecompressSync(buf)        → 只解第一帧（实测 5.3MB 只出 187 字节）
 *     - createZstdDecompress() 流式    → 出完第一帧后报 "Unknown frame descriptor"
 *   可行办法是**按帧边界切分后逐帧解压**，本模块即此实现（帧头扫描逻辑与
 *   @deepseek-ai/dsh-session-persistence-jsonl 的 scanZstdFrames 同构）。
 *
 * 许可归属：
 *   scanZstdFrames() 改写自 DeepSeek Harness 的
 *   @deepseek-ai/dsh-session-persistence-jsonl（MIT，Copyright (c) 2026 DeepSeek），
 *   上游仓库 https://github.com/deepseek-ai/deepseek-harness 。
 *   按 MIT 要求保留其版权与许可声明，详见仓库根 THIRD-PARTY-NOTICES.md。
 *
 * 只依赖 node: 内置模块。
 */
import { readFileSync } from 'node:fs';
import { zstdDecompressSync } from 'node:zlib';

const ZSTD_MAGIC = 4247762216; // 0xFD2FB528，小端读作 UInt32LE

/**
 * 扫描缓冲区里的完整 zstd 帧边界，不触碰压缩块本身。
 * @param {Buffer} buffer 当前文件内容
 * @param {number} maxFrames 最多返回多少帧（Infinity 表示全部）
 * @returns {{frames: {start:number,end:number}[], tornStart?: number}}
 *          最后一帧不完整时给出它的起始偏移（追加写入中常见，按帧截断即可）。
 */
export function scanZstdFrames(buffer, maxFrames = Number.POSITIVE_INFINITY) {
  const frames = [];
  let offset = 0;
  while (offset < buffer.length) {
    const start = offset;
    if (buffer.length - offset < 4) return { frames, tornStart: start };
    if (buffer.readUInt32LE(offset) !== ZSTD_MAGIC) {
      throw new Error(`corrupt Zstandard session log: invalid frame magic at byte ${offset}`);
    }
    offset += 4;
    if (offset === buffer.length) return { frames, tornStart: start };

    const descriptor = buffer.readUInt8(offset);
    offset += 1;
    if ((descriptor & 24) !== 0) {
      throw new Error(`corrupt Zstandard session log: reserved frame-header bit at byte ${offset - 1}`);
    }
    const contentSizeFlag = descriptor >>> 6;
    const singleSegment = (descriptor & 32) !== 0;
    const checksum = (descriptor & 4) !== 0;
    const dictionaryFlag = descriptor & 3;
    const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag;
    const contentSizeBytes = contentSizeFlag === 0 ? (singleSegment ? 1 : 0) : 1 << contentSizeFlag;
    const remainingHeaderBytes = (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes;
    if (buffer.length - offset < remainingHeaderBytes) return { frames, tornStart: start };
    offset += remainingHeaderBytes;

    for (;;) {
      if (buffer.length - offset < 3) return { frames, tornStart: start };
      const blockHeader = buffer.readUIntLE(offset, 3);
      offset += 3;
      const lastBlock = (blockHeader & 1) !== 0;
      const blockType = (blockHeader >>> 1) & 3;
      const blockSize = blockHeader >>> 3;
      if (blockType === 3) {
        throw new Error(`corrupt Zstandard session log: reserved block type at byte ${offset - 3}`);
      }
      const payloadBytes = blockType === 1 ? 1 : blockSize; // RLE 块只存 1 字节
      if (buffer.length - offset < payloadBytes) return { frames, tornStart: start };
      offset += payloadBytes;
      if (lastBlock) break;
    }
    if (checksum) {
      if (buffer.length - offset < 4) return { frames, tornStart: start };
      offset += 4;
    }
    frames.push({ start, end: offset });
    if (frames.length === maxFrames) return { frames };
  }
  return { frames };
}

/** 逐帧解压一个多帧 zstd 缓冲区，返回拼接后的明文。 */
export function decompressZstdMultiFrame(buffer, { tolerateTornTail = true } = {}) {
  const { frames, tornStart } = scanZstdFrames(buffer);
  if (frames.length === 0) {
    if (tornStart !== undefined) return Buffer.alloc(0); // 只有半个帧，等于空
    throw new Error('empty or header-less Zstandard session log');
  }
  const parts = [];
  for (const { start, end } of frames) {
    try {
      parts.push(zstdDecompressSync(buffer.subarray(start, end)));
    } catch (error) {
      // 帧结构完整但解压失败 = 真损坏，必须报出来，不能静默吞
      throw new Error(`corrupt Zstandard session log: frame at byte ${start} failed validation`, { cause: error });
    }
  }
  if (!tolerateTornTail && tornStart !== undefined) {
    throw new Error(`truncated Zstandard session log: incomplete frame at byte ${tornStart}`);
  }
  return Buffer.concat(parts);
}

/** 读取一个 .jsonl 或 .jsonl.zstd 文件，返回全文（UTF-8 字符串）。 */
export function readSessionLog(filePath) {
  const raw = readFileSync(filePath);
  if (!filePath.endsWith('.zstd')) return raw.toString('utf8');
  return decompressZstdMultiFrame(raw).toString('utf8');
}

/**
 * 逐行解析会话日志，跳过坏行（追加写入的尾巴可能是半条记录）。
 * @returns {Array<object>} 可解析为对象的记录数组
 */
export function readSessionRecords(filePath) {
  const text = readSessionLog(filePath);
  const out = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      out.push(JSON.parse(t));
    } catch {
      /* 半条记录（末帧撕裂）直接跳过 */
    }
  }
  return out;
}
