// Carbon Dated score service.
// POST /api/score  { date: "YYYY-MM-DD", device: "<random id>", total: 0-1000, standing: true|false,
//                    rounds: [{ v: number|null, ok: 0|1|null }, ...10] }
// GET  /api/stats?date=YYYY-MM-DD  -> { date, players, standing, buckets: [..], rounds: [{ n, median, pctOk }] }
// Scores are anonymous: the device id is a random string the game makes, used only so each device counts once a day.

const ALLOWED_ORIGINS = ['https://playcarbondated.com', 'https://www.playcarbondated.com'];
const BUCKET = 50; // score histogram bucket width

function cors(req) {
  const origin = req.headers.get('Origin') || '';
  const allow = ALLOWED_ORIGINS.includes(origin) || origin.startsWith('http://localhost') ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}
function json(req, body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors(req), ...extra } });
}

let ready = false;
async function ensureSchema(db) {
  if (ready) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS scores (
      date TEXT NOT NULL, device TEXT NOT NULL, total INTEGER NOT NULL, standing INTEGER NOT NULL,
      rounds TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY (date, device))`),
    db.prepare(`CREATE INDEX IF NOT EXISTS scores_date ON scores (date)`),
  ]);
  ready = true;
}

const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

async function postScore(req, env) {
  let b;
  try { b = await req.json(); } catch { return json(req, { error: 'bad json' }, 400); }
  const { date, device, total, standing, rounds } = b || {};
  if (!isDate(date) || typeof device !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(device)) return json(req, { error: 'bad request' }, 400);
  if (!Number.isFinite(total) || total < 0 || total > 1000) return json(req, { error: 'bad total' }, 400);
  if (!Array.isArray(rounds) || rounds.length > 12) return json(req, { error: 'bad rounds' }, 400);
  // Only accept today's or yesterday's dig (UTC, with a day either side for time zones)
  const day = 86400000, d = Date.parse(date + 'T12:00:00Z');
  if (!(Math.abs(d - Date.now()) < 2 * day)) return json(req, { error: 'stale date' }, 400);
  const clean = rounds.map(r => ({
    v: r && Number.isFinite(r.v) ? Math.round(r.v * 10) / 10 : null,
    ok: r && (r.ok === 0 || r.ok === 1) ? r.ok : null,
  }));
  await ensureSchema(env.DB);
  await env.DB.prepare(`INSERT OR IGNORE INTO scores (date, device, total, standing, rounds, created) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(date, device, Math.round(total), standing ? 1 : 0, JSON.stringify(clean), Date.now()).run();
  return getStats(req, env, date);
}

async function getStats(req, env, date) {
  if (!isDate(date)) return json(req, { error: 'bad date' }, 400);
  await ensureSchema(env.DB);
  const { results } = await env.DB.prepare(`SELECT total, standing, rounds FROM scores WHERE date = ?`).bind(date).all();
  const players = results.length;
  const buckets = new Array(Math.ceil(1000 / BUCKET) + 1).fill(0);
  let standing = 0;
  const per = [];
  for (const row of results) {
    buckets[Math.min(buckets.length - 1, Math.floor(row.total / BUCKET))]++;
    if (row.standing) standing++;
    let rs = [];
    try { rs = JSON.parse(row.rounds); } catch {}
    rs.forEach((r, i) => {
      const p = per[i] || (per[i] = { vals: [], ok: 0, okN: 0 });
      if (r.v !== null) p.vals.push(r.v);
      if (r.ok !== null) { p.okN++; p.ok += r.ok; }
    });
  }
  const totals = results.map(r => r.total);
  const rounds = per.map(p => {
    const v = p.vals.sort((a, b) => a - b);
    return {
      n: Math.max(v.length, p.okN),
      median: v.length ? v[Math.floor(v.length / 2)] : null,
      pctOk: p.okN ? Math.round((p.ok / p.okN) * 100) : null,
    };
  });
  return json(req, { date, players, standing: players ? Math.round((standing / players) * 100) : null, bucket: BUCKET, buckets, totals: players <= 2000 ? totals : undefined, rounds },
    200, { 'Cache-Control': 'public, max-age=30' });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors(req) });
    if (url.pathname === '/' || url.pathname === '/api/health') return json(req, { ok: true, db: !!env.DB });
    if (!env.DB) return json(req, { error: 'database not connected yet' }, 503);
    try {
      if (url.pathname === '/api/score' && req.method === 'POST') return await postScore(req, env);
      if (url.pathname === '/api/stats' && req.method === 'GET') return await getStats(req, env, url.searchParams.get('date'));
    } catch (e) {
      return json(req, { error: 'server error' }, 500);
    }
    return json(req, { error: 'not found' }, 404);
  },
};
