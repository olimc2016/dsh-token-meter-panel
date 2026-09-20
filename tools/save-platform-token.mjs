/**
 * 把 platform.deepseek.com 的 userToken 写入 DSH 凭据文件（refs.DEEPSEEK_PLATFORM_TOKEN）。
 * - 不打印 token
 * - 已存在则覆盖；写入前备份原文件
 */
import { readdirSync, readFileSync, writeFileSync, copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ClassicLevel } from 'classic-level';

const EDGE = join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'User Data', 'Default', 'Local Storage', 'leveldb');
const CRED = join(process.env.USERPROFILE, '.dsh', '.credentials.yaml');
const REF = 'DEEPSEEK_PLATFORM_TOKEN';

/* 1) 取 token */
async function readToken() {
  const tmp = mkdtempSync(join(tmpdir(), 'ldb-'));
  for (const f of readdirSync(EDGE)) { try { copyFileSync(join(EDGE, f), join(tmp, f)); } catch {} }
  const db = new ClassicLevel(tmp, { createIfMissing: false, keyEncoding: 'binary', valueEncoding: 'binary' });
  let t = null;
  for await (const [k, v] of db.iterator()) {
    if (t) continue;
    if (!Buffer.from(k).toString('latin1').startsWith('_https://platform.deepseek.com\x00\x01userToken')) continue;
    const raw = Buffer.from(v).toString('latin1').replace(/^\x01/, '');
    try { t = JSON.parse(raw)?.value ?? raw; } catch { t = raw; }
  }
  await db.close(); rmSync(tmp, { recursive: true, force: true });
  return t;
}

const token = await readToken();
if (!token) { console.log('❌ 未取到 userToken'); process.exit(1); }
console.log(`取到 userToken：${token.slice(0, 6)}****${token.slice(-4)}（长度 ${token.length}）`);

/* 2) 写进凭据文件 */
if (!existsSync(CRED)) { console.log(`❌ 凭据文件不存在：${CRED}`); process.exit(1); }
const backup = `${CRED}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
copyFileSync(CRED, backup);
console.log(`已备份：${backup}`);

const text = readFileSync(CRED, 'utf8');
const lines = text.split(/\r?\n/);
const out = [];
let inRefs = false;
let wrote = false;
for (const line of lines) {
  if (/^refs:\s*$/.test(line)) { inRefs = true; out.push(line); continue; }
  if (inRefs && /^\S/.test(line)) {
    // refs 段结束：如果还没写，先补进去
    if (!wrote) { out.push(`  ${REF}: ${token}`); wrote = true; }
    inRefs = false;
  }
  if (inRefs && new RegExp(`^\\s+${REF}\\s*:`).test(line)) {
    out.push(`  ${REF}: ${token}`);
    wrote = true;
    continue;
  }
  out.push(line);
}
if (inRefs && !wrote) { out.push(`  ${REF}: ${token}`); wrote = true; }
writeFileSync(CRED, out.join('\n'), 'utf8');
console.log(wrote ? `✅ 已写入 refs.${REF}` : '⚠️ 没找到 refs 段，未写入');

/* 3) 校验（只显示键名与打码值） */
const after = readFileSync(CRED, 'utf8');
for (const line of after.split(/\r?\n/)) {
  const m = line.match(/^\s+([A-Z0-9_]+):\s*(\S+)\s*$/);
  if (m) console.log(`  ${m[1]}: ${m[2].slice(0, 4)}****${m[2].slice(-2)}`);
}
