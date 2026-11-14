import { authed, deny } from "./_lib.js";

// Name -> coordinates, via Open-Meteo's free geocoding API (no key needed).
export default async function handler(req, res) {
  if (!authed(req)) return deny(res);
  const q = String(req.query.q || "").trim().slice(0, 80);
  if (!q) return res.json({ results: [] });
  try {
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=th&format=json`);
    const j = await r.json();
    res.json({ results: (j.results || []).map((x) => ({ name: x.name, admin1: x.admin1, country: x.country, latitude: x.latitude, longitude: x.longitude })) });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: "geocode failed" });
  }
}
