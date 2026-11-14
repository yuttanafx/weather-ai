import { neon } from "@neondatabase/serverless";

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
  })());
}

// Every API except the cron job needs the shared password (header x-app-password).
export function authed(req) {
  const pw = process.env.APP_PASSWORD;
  return Boolean(pw) && req.headers["x-app-password"] === pw;
}
export const deny = (res) => res.status(401).json({ error: "unauthorized" });

// Same id scheme as the front-end: <date>_<hash of country|region|province>
export const pkey = (e) => `${e.n || ""}|${e.g || ""}|${e.p || ""}`;
export function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
export const num = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
