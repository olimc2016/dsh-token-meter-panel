/**
 * 官方用量对账：从 Edge 的 Local Storage 取 platform.deepseek.com 的 userToken（不打印值），
 * 调官方用量接口，取「今日（北京时间）」的费用与 token，并与本地日志估算对比。
 *
 * 用法：node tools/official-usage.mjs
 */
import { readdirSync, readFileSync, existsSync, mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ClassicLevel } from 'classic-level';
import { readSessionRecords } from '../src/zstd.mjs';
import { usageOf, dayKeyOf, isPeakHour, PRICE_TIERS } from '../src/core.mjs';

const EDGE = join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'User Data', 'Default', 'Local Storage', 'leveldb');
const TZ = 8 * 3600;
const mask = (s) => `${s.slice(0, 6)}…${s.slice(-4)}(len ${s.length})`;

/* ---------- 1) 取 userToken ---------- */
async function readPlatformToken() {
  if (!existsSync(EDGE)) throw new Error('找不到 Edge 的 Local Storage 目录');
  const tmp = mkdtempSync(join(tmpdir(), 'ldb-'));
  // 必须整目录复制：CURRENT / MANIFEST-* 缺一不可（只拷 .ldb/.log 会打不开）
  for (const f of readdirSync(EDGE)) {
    try { copyFileSync(join(EDGE, f), join(tmp, f)); } catch { /* 被占用的跳过 */ }
  }
  const db = new ClassicLevel(tmp, { createIfMissing: false, keyEncoding: 'binary', valueEncoding: 'binary' });
  let token = null;
  for await (const [k, v] of db.iterator()) {
    if (token) continue; // 不要提前 break：abstract-level 迭代器中途关闭会报错
    const key = Buffer.from(k).toString('latin1');
    if (!key.startsWith('_https://platform.deepseek.com\x00\x01userToken')) continue;
    const raw = Buffer.from(v).toString('latin1').replace(/^\x01/, '');
    try {
      const parsed = JSON.parse(raw);
      token = parsed?.value ?? parsed?.val ?? (typeof parsed === 'string' ? parsed : null);
    } catch { token = raw; }
  }
  await db.close();
  rmSync(tmp, { recursive: true, force: true });
  return token;
}

/* ---------- 2) 查官方 ---------- */
async function officialToday(token) {
  const now = Date.now();
  const dayStart = Math.floor((now + TZ * 1000) / 86400000) * 86400000 - TZ * 1000;
  const qs = `?start=${Math.floor(dayStart / 1000)}&end=${Math.floor((dayStart + 86400000) / 1000)}&tz=${TZ}`;
  const headers = { authorization: `Bearer ${token}`, accept: 'application/json', 'x-client-platform': 'web' };
  const get = async (kind) => {
    const res = await fetch(`https://platform.deepseek.com/api/v0/usage/by_api_key/${kind}${qs}`, { headers, signal: AbortSignal.timeout(20000) });
    const body = await res.json().catch(() => null);
    if (!res.ok || (body?.code && body.code !== 0)) throw new Error(`HTTP ${res.status} code=${body?.code} msg=${body?.msg ?? ''}`);
    return body;
  };
  const [amount, cost] = await Promise.all([get('amount'), get('cost')]);
  const scalar = (x) => (x && typeof x === 'object' ? Number(x.value) || 0 : Number(x) || 0);
  const out = { cost: 0, currency: 'CNY', hit: 0, miss: 0, out: 0, req: 0, perModel: new Map() };
  for (const block of cost?.data?.biz_data?.data ?? []) {
    out.currency = block?.currency ?? out.currency;
    for (const s of block?.series ?? []) {
      let c = 0;
      for (const b of s?.buckets ?? []) c += scalar(b?.cost);
      out.cost += c;
      out.perModel.set(s?.model ?? '?', (out.perModel.get(s?.model ?? '?') ?? 0) + c);
    }
  }
  for (const s of amount?.data?.biz_data?.series ?? []) {
    for (const b of s?.buckets ?? []) {
      for (const [k, v] of Object.entries(b?.usage ?? {})) {
        const x = scalar(v);
        if (k === 'PROMPT_CACHE_HIT_TOKEN') out.hit += x;
        else if (k === 'PROMPT_CACHE_MISS_TOKEN') out.miss += x;
        else if (k === 'RESPONSE_TOKEN') out.out += x;
        else if (k === 'REQUEST') out.req += x;
      }
    }
  }
  return out;
}

/* ---------- 3) 本地（同一时间窗、按官方价） ---------- */
function localToday() {
  const root = join(process.env.USERPROFILE, '.dsh', 'sessions');
  const today = dayKeyOf(Date.now());
  const rates = PRICE_TIERS['deepseek-flash'];
  const acc = { hit: 0, miss: 0, out: 0, req: 0, cost: 0 };
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!e.name.startsWith('session')) continue;
      if (e.name.endsWith('.jsonl') && !e.name.includes('.v3.')) {
        try { readFileSync(p.replace(/\.jsonl$/, '.v3.jsonl')); continue; } catch { /* keep v0 */ }
      }
      for (const r of readSessionRecords(p)) {
        const got = usageOf(r);
        if (!got?.usage) continue;
        const ts = got.time ?? r.time;
        if (!ts || dayKeyOf(ts) !== today) continue;
        const u = got.usage;
        const tier = isPeakHour(ts) ? 'peak' : 'offPeak';
        acc.hit += u.cacheReadTokens || 0;
        acc.miss += u.inputTokens || 0;
        acc.out += u.outputTokens || 0;
        acc.req += 1;
        acc.cost += ((u.cacheReadTokens || 0) / 1e6) * rates.cacheHit[tier]
          + ((u.inputTokens || 0) / 1e6) * rates.cacheMiss[tier]
          + ((u.outputTokens || 0) / 1e6) * rates.output[tier];
      }
    }
  };
  walk(root);
  return acc;
}

/* ---------- 主流程 ---------- */
const token = await readPlatformToken();
if (!token) { console.log('❌ 没取到 userToken（先在 Edge 里登录 platform.deepseek.com）'); process.exit(1); }
console.log(`userToken: ${mask(token)}\n`);

const [off, loc] = [await officialToday(token), localToday()];
const M = (n) => (n / 1e6).toFixed(3);
console.log('              官方(Platform)      本地(日志)        差异');
console.log(`命中输入      ${M(off.hit).padStart(10)}M ${M(loc.hit).padStart(15)}M ${M(loc.hit - off.hit).padStart(12)}M`);
console.log(`未命中输入    ${M(off.miss).padStart(10)}M ${M(loc.miss).padStart(15)}M ${M(loc.miss - off.miss).padStart(12)}M`);
console.log(`输出          ${M(off.out).padStart(10)}M ${M(loc.out).padStart(15)}M ${M(loc.out - off.out).padStart(12)}M`);
console.log(`请求数        ${String(off.req).padStart(11)} ${String(loc.req).padStart(16)} ${String(loc.req - off.req).padStart(13)}`);
console.log(`\n官方费用      ${off.currency} ${off.cost.toFixed(4)}`);
console.log(`本地试算      CNY ${loc.cost.toFixed(4)}（按官方价、按小时判峰谷）`);
console.log(`差额          CNY ${(loc.cost - off.cost).toFixed(4)}`);
console.log('\n官方按模型：');
for (const [m, c] of off.perModel) console.log(`  ${m}: ${off.currency} ${c.toFixed(4)}`);
