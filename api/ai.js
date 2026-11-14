import { authed, deny } from "./_lib.js";

// One endpoint, three providers. Keys live only in server env vars.
async function post(url, headers, body) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error?.message || "upstream error"), { status: r.status });
  return j;
}

const PROVIDERS = {
  anthropic: {
    key: () => process.env.ANTHROPIC_API_KEY,
    async call(prompt) {
      const j = await post("https://api.anthropic.com/v1/messages",
        { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        { model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5", max_tokens: 1500, messages: [{ role: "user", content: prompt }] });
      return (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
    },
  },
  openai: {
    key: () => process.env.OPENAI_API_KEY,
    async call(prompt) {
      const j = await post("https://api.openai.com/v1/chat/completions",
        { authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        { model: process.env.OPENAI_MODEL || "gpt-4o-mini", max_completion_tokens: 1500, messages: [{ role: "user", content: prompt }] });
      return j.choices?.[0]?.message?.content || "";
    },
  },
  gemini: {
    key: () => process.env.GEMINI_API_KEY,
    async call(prompt) {
      const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
      const j = await post(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        { "x-goog-api-key": process.env.GEMINI_API_KEY },
        { contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 1500 } });
      return (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
    },
  },
};

export default async function handler(req, res) {
  const avail = Object.keys(PROVIDERS).filter((k) => PROVIDERS[k].key());
  const dflt = avail.includes(process.env.AI_PROVIDER) ? process.env.AI_PROVIDER : avail[0] || null;
  if (req.method === "GET") return res.json({ providers: avail, default: dflt });
  if (req.method !== "POST") return res.status(405).end();
  if (!authed(req)) return deny(res); // calling an AI costs money: members only

  const prompt = String(req.body?.prompt || "").slice(0, 30000);
  if (!prompt) return res.status(400).json({ error: "empty prompt" });
  const prov = avail.includes(req.body?.provider) ? req.body.provider : dflt;
  if (!prov) return res.status(503).json({ error: "ยังไม่ได้ตั้งคีย์ AI บนเซิร์ฟเวอร์" });
  try {
    const text = await PROVIDERS[prov].call(prompt);
    if (!text) return res.status(502).json({ error: "AI ไม่ได้ตอบกลับ" });
    res.json({ text, provider: prov });
  } catch (err) {
    console.error(prov, err.status, err.message);
    res.status(err.status === 429 ? 429 : 502).json({ error: err.status === 429 ? "ใช้ถี่เกินไป" : "AI ตอบไม่สำเร็จ" });
  }
}
