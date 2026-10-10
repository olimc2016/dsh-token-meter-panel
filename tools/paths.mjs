/**
 * 自检脚本共用的路径解析：**不许再出现某个人的机器路径**。
 *
 * 解析优先级：
 *   1. 显式环境变量 DSH_SESSIONS（完整会话根目录）
 *   2. DSH_HOME/sessions（DSH 自己的 home 变量，桌面端/CLI 都会设）
 *   3. ~/.dsh/sessions（默认安装位置）
 *   4. 平台默认的 DSH Desktop 位置兜底
 */
import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync, readdirSync, statSync } from 'node:fs';

/** DSH home 目录（含 sessions/、profiles/） */
export function dshHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh');
}

/** 会话日志根目录 */
export function sessionsRoot() {
  return process.env.DSH_SESSIONS || join(dshHome(), 'sessions');
}

/** 会话日志文件名（与 src/core.mjs 的 generationOf 同构） */
export function isSessionLog(name) {
  return /^session(?:\.v\d+)?\.jsonl(\.zstd)?$/.test(name);
}

/**
 * 列出会话根目录下的所有会话日志（递归两层：<workspace>/<sessionId>/<log>）。
 * 根目录不存在时返回空数组——干净机器上跑自检应当跳过，而不是崩掉。
 * @param {string} [root]
 * @returns {Array<{file:string, size:number, mtimeMs:number}>}
 */
export function listSessionLogs(root = sessionsRoot()) {
  const out = [];
  if (!existsSync(root)) return out;
  const walk = (dir, depth) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (depth < 2) walk(p, depth + 1);
        continue;
      }
      if (!isSessionLog(e.name)) continue;
      try {
        const st = statSync(p);
        out.push({ file: p, size: st.size, mtimeMs: st.mtimeMs });
      } catch {
        /* 读不到就跳过 */
      }
    }
  };
  walk(root, 0);
  return out.sort((a, b) => b.mtimeMs - a.mtimeMs);
}
