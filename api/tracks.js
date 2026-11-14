import { sql, init, authed, deny, num } from "./_lib.js";

export default async function handler(req, res) {
  if (req.method !== "GET" && !authed(req)) return deny(res);
  try {
    await init();
    if (req.method === "GET") {
      const rows = await sql`SELECT id,label,c,n,g,p,lat,lon,interval_hours,enabled,last_run FROM tracks ORDER BY id`;
      return res.json({ rows });
    }
    if (req.method === "POST") {
      const t = req.body || {};
      const s = (v) => String(v ?? "").slice(0, 120);
      const lat = num(t.lat), lon = num(t.lon), h = Math.round(num(t.interval_hours) ?? 6);
      if (lat === null || lon === null || lat < -90 || lat > 90 || lon < -180 || lon > 180 || h < 1 || h > 168)
        return res.status(400).json({ error: "bad track" });
      await sql`INSERT INTO tracks (label,c,n,g,p,lat,lon,interval_hours) VALUES (${s(t.label)},${s(t.c)},${s(t.n)},${s(t.g)},${s(t.p)},${lat},${lon},${h})`;
      return res.json({ ok: true });
    }
    if (req.method === "DELETE") {
      await sql`DELETE FROM tracks WHERE id=${Number(req.query.id)}`;
      return res.json({ ok: true });
    }
    res.status(405).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "server error" });
  }
}
