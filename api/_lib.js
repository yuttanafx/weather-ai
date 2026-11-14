import crypto from "node:crypto";
import { promisify } from "node:util";
import { neon } from "@neondatabase/serverless";

const scrypt = promisify(crypto.scrypt);

export const sql = neon(process.env.DATABASE_URL);

let ready;
export function init() {
  return (ready ??= (async () => {
    await sql`CREATE TABLE IF NOT EXISTS logs (
      id text PRIMARY KEY, d text NOT NULL,
      r real DEFAULT 0, hi real, lo real, hu real, gt real, gm real,
      c text DEFAULT '', n text DEFAULT '', g text DEFAULT '', p text DEFAULT '',
      cp text DEFAULT '', ag real DEFAULT 0, ir real DEFAULT 0, ef text DEFAULT '',
      src text DEFAULT 'manual', updated_at timestamptz DEFAULT now())`;
    await sql`CREATE INDEX IF NOT EXISTS logs_d ON logs (d)`;
    await sql`CREATE TABLE IF NOT EXISTS tracks (
      id serial PRIMARY KEY, label text,
      c text DEFAULT '', n text DEFAULT '', g text DEFAULT '', p text DEFAULT '',
      lat double precision, lon double precision,
      interval_hours int DEFAULT 6, enabled boolean DEFAULT true, last_run timestamptz)`;
    await sql`CREATE TABLE IF NOT EXISTS users (
      id serial PRIMARY KEY, username text NOT NULL, uname_key text UNIQUE NOT NULL,
      salt text NOT NULL, pw_hash text NOT NULL, role text DEFAULT 'member',
      fail_count int DEFAULT 0, locked_until timestamptz, created_at timestamptz DEFAULT now())`;
  })());
}

// ---- passwords (scrypt) ----
export async function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  return { salt, hash: (await scrypt(pw, salt, 64)).toString("hex") };
}
export async function verifyPassword(pw, salt, hash) {
  const h = await scrypt(pw, salt, 64);
  const b = Buffer.from(hash, "hex");
  return b.length === h.length && crypto.timingSafeEqual(h, b);
}

// ---- sessions: signed cookie, 30 days ----
const COOKIE = "wl_session";
const secret = () => {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("SESSION_SECRET missing");
  return s;
};
const sign = (p) => crypto.createHmac("sha256", secret()).update(p).digest("base64url");
export function makeSession(user) {
  const p = Buffer.from(JSON.stringify({ u: user.username, id: user.id, exp: Date.now() + 30 * 864e5 })).toString("base64url");
  return `${p}.${sign(p)}`;
}
export function readSession(req) {
  try {
    const raw = (req.headers.cookie || "").split(";").map((x) => x.trim()).find((x) => x.startsWith(COOKIE + "="));
    if (!raw) return null;
    const [p, sig] = raw.slice(COOKIE.length + 1).split(".");
    const a = Buffer.from(sig || ""), b = Buffer.from(sign(p || ""));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const d = JSON.parse(Buffer.from(p, "base64url").toString());
    return d.exp > Date.now() ? d : null;
  } catch { return null; }
}
export const setCookie = (res, v) => res.setHeader("Set-Cookie", `${COOKIE}=${v}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${30 * 86400}`);
export const clearCookie = (res) => res.setHeader("Set-Cookie", `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`);

// Every API except the cron job needs a logged-in member (session cookie).
export const authed = (req) => readSession(req);
export const deny = (res) => res.status(401).json({ error: "unauthorized" });

// Same id scheme as the front-end: <date>_<hash of country|region|province>
export const pkey = (e) => `${e.n || ""}|${e.g || ""}|${e.p || ""}`;
export function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
export const num = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
