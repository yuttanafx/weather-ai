import { sql, init, authed, deny, num } from "./_lib.js";

export default async function handler(req, res) {
  if (!authed(req)) return deny(res);
  try {
    await init();
    if (req.method === "GET") {
      const rows = await sql`SELECT id,d,r,hi,lo,hu,gt,gm,c,n,g,p,cp,ag,ir,ef FROM logs ORDER BY d LIMIT 50000`;
      return res.json({ rows });
    }
    if (req.method === "POST") {
      const e = req.body || {};
      const s = (v) => String(v ?? "").slice(0, 120);
      if (!/^[\w.:@+~-]{1,200}$/.test(e.id || "") || !/^\d{4}-\d{2}-\d{2}$/.test(e.d || "") || num(e.hi) === null || num(e.lo) === null)
        return res.status(400).json({ error: "bad record" });
      await sql`INSERT INTO logs (id,d,r,hi,lo,hu,gt,gm,c,n,g,p,cp,ag,ir,ef,src)
        VALUES (${e.id},${e.d},${num(e.r) ?? 0},${num(e.hi)},${num(e.lo)},${num(e.hu)},${num(e.gt)},${num(e.gm)},
                ${s(e.c)},${s(e.n)},${s(e.g)},${s(e.p)},${s(e.cp)},${num(e.ag) ?? 0},${num(e.ir) ?? 0},${s(e.ef)},'manual')
        ON CONFLICT (id) DO UPDATE SET r=EXCLUDED.r,hi=EXCLUDED.hi,lo=EXCLUDED.lo,hu=EXCLUDED.hu,gt=EXCLUDED.gt,gm=EXCLUDED.gm,
          c=EXCLUDED.c,n=EXCLUDED.n,g=EXCLUDED.g,p=EXCLUDED.p,cp=EXCLUDED.cp,ag=EXCLUDED.ag,ir=EXCLUDED.ir,ef=EXCLUDED.ef,
          src='manual',updated_at=now()`;
      return res.json({ ok: true });
    }
    if (req.method === "DELETE") {
      await sql`DELETE FROM logs WHERE id=${String(req.query.id || "")}`;
      return res.json({ ok: true });
    }
    res.status(405).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "server error" });
  }
}
