import { sql, init, authed, hash, pkey } from "./_lib.js";

const avg = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
const r1 = (v) => (v === null ? null : Math.round(v * 10) / 10);
const clean = (a, idx) => idx.map((i) => a?.[i]).filter((v) => v !== null && v !== undefined);

// Pull "today so far" for one tracked place from Open-Meteo and upsert it as a daily record.
async function pull(t) {
  const u = new URL("https://api.open-meteo.com/v1/forecast");
  u.search = new URLSearchParams({
    latitude: t.lat, longitude: t.lon, timezone: "auto", forecast_days: "1", current: "temperature_2m",
    hourly: "temperature_2m,relative_humidity_2m,precipitation,soil_temperature_0cm,soil_moisture_0_to_1cm",
  });
  const r = await fetch(u);
  if (!r.ok) throw new Error(`open-meteo ${r.status}`);
  const j = await r.json();
  const now = j.current.time; // local time, e.g. 2026-11-09T14:15
  const idx = j.hourly.time.map((x, i) => (x <= now ? i : -1)).filter((i) => i >= 0);
  const temps = clean(j.hourly.temperature_2m, idx);
  if (!temps.length) throw new Error("no data");
  const d = now.slice(0, 10);
  const id = `${d}_${hash(pkey(t))}`;
  const hi = r1(Math.max(...temps)), lo = r1(Math.min(...temps));
  const hu = r1(avg(clean(j.hourly.relative_humidity_2m, idx)));
  const pr = clean(j.hourly.precipitation, idx);
  const rain = r1(pr.reduce((s, v) => s + v, 0));
  const gt = r1(avg(clean(j.hourly.soil_temperature_0cm, idx)));
  const sm = avg(clean(j.hourly.soil_moisture_0_to_1cm, idx));
  const gm = sm === null ? null : r1(sm * 100); // m3/m3 -> %
  // Only the measured fields are updated; crop/area/notes entered by hand are kept.
  await sql`INSERT INTO logs (id,d,r,hi,lo,hu,gt,gm,c,n,g,p,src)
    VALUES (${id},${d},${rain},${hi},${lo},${hu},${gt},${gm},${t.c},${t.n},${t.g},${t.p},'auto')
    ON CONFLICT (id) DO UPDATE SET r=EXCLUDED.r,hi=EXCLUDED.hi,lo=EXCLUDED.lo,hu=EXCLUDED.hu,gt=EXCLUDED.gt,gm=EXCLUDED.gm,updated_at=now()`;
  await sql`UPDATE tracks SET last_run=now() WHERE id=${t.id}`;
}

const due = (t) => !t.last_run || Date.now() - new Date(t.last_run).getTime() >= t.interval_hours * 3600e3 - 5 * 60e3;

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  const isCron = Boolean(secret) && req.headers.authorization === `Bearer ${secret}`;
  if (!isCron && !authed(req)) return res.status(401).json({ error: "unauthorized" });
  try {
    await init();
    const id = req.query.id ? Number(req.query.id) : null;
    const tracks = id ? await sql`SELECT * FROM tracks WHERE id=${id}` : await sql`SELECT * FROM tracks WHERE enabled`;
    const ran = [];
    for (const t of tracks) {
      if (!id && !due(t)) continue;
      try { await pull(t); ran.push({ id: t.id, ok: true }); }
      catch (e) { ran.push({ id: t.id, ok: false, error: String(e.message || e) }); }
    }
    res.json({ ran });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "server error" });
  }
}
