import { sql, init, hashPassword, verifyPassword, makeSession, readSession, setCookie, clearCookie } from "./_lib.js";

const LOCK_AFTER = 5, LOCK_MINUTES = 15;

export default async function handler(req, res) {
  try {
    if (req.method === "GET") return res.json({ user: readSession(req)?.u ?? null });
    if (req.method !== "POST") return res.status(405).end();
    const { action, username, password, code } = req.body || {};
    if (action === "logout") { clearCookie(res); return res.json({ ok: true }); }

    const u = String(username || "").trim(), pw = String(password || "");
    if (!/^[A-Za-z0-9_.@-]{3,32}$/.test(u)) return res.status(400).json({ error: "ชื่อผู้ใช้ 3–32 ตัว ใช้ได้เฉพาะ a-z 0-9 _ . @ -" });
    if (pw.length < 8 || pw.length > 200) return res.status(400).json({ error: "รหัสผ่านต้องยาวอย่างน้อย 8 ตัว" });
    await init();
    const key = u.toLowerCase();

    if (action === "register") {
      const [{ n }] = await sql`SELECT count(*)::int AS n FROM users`;
      const invite = process.env.SIGNUP_CODE;
      if (n > 0) {
        if (!invite) return res.status(403).json({ error: "ปิดรับสมัครสมาชิก" });
        if (String(code || "") !== invite) return res.status(403).json({ error: "รหัสเชิญไม่ถูกต้อง" });
      }
      const { salt, hash } = await hashPassword(pw);
      try {
        const [row] = await sql`INSERT INTO users (username,uname_key,salt,pw_hash,role)
          VALUES (${u},${key},${salt},${hash},${n === 0 ? "admin" : "member"}) RETURNING id`;
        setCookie(res, makeSession({ id: row.id, username: u }));
        return res.json({ user: u });
      } catch (e) {
        if (e.code === "23505") return res.status(409).json({ error: "ชื่อผู้ใช้นี้ถูกใช้แล้ว" });
        throw e;
      }
    }

    if (action === "login") {
      const [row] = await sql`SELECT id,username,salt,pw_hash,fail_count,locked_until FROM users WHERE uname_key=${key}`;
      if (!row) { await hashPassword(pw); return res.status(401).json({ error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" }); }
      if (row.locked_until && new Date(row.locked_until) > new Date())
        return res.status(429).json({ error: `ลองผิดหลายครั้ง ถูกล็อกชั่วคราว ลองใหม่ใน ${LOCK_MINUTES} นาที` });
      if (!(await verifyPassword(pw, row.salt, row.pw_hash))) {
        const f = row.fail_count + 1;
        if (f >= LOCK_AFTER) await sql`UPDATE users SET fail_count=0, locked_until=now() + (${LOCK_MINUTES} || ' minutes')::interval WHERE id=${row.id}`;
        else await sql`UPDATE users SET fail_count=${f} WHERE id=${row.id}`;
        return res.status(401).json({ error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });
      }
      await sql`UPDATE users SET fail_count=0, locked_until=NULL WHERE id=${row.id}`;
      setCookie(res, makeSession(row));
      return res.json({ user: row.username });
    }
    res.status(400).json({ error: "bad action" });
  } catch (err) {
    console.error(err);
    const msg = String(err.message || "").includes("SESSION_SECRET") ? "เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า SESSION_SECRET" : "server error";
    res.status(500).json({ error: msg });
  }
}
