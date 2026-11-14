import { authed, deny } from "./_lib.js";

// Proxy to the Anthropic Messages API. The key stays on the server (ANTHROPIC_API_KEY).
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!authed(req)) return deny(res);
  const prompt = String(req.body?.prompt || "").slice(0, 30000);
  if (!prompt) return res.status(400).json({ error: "empty prompt" });
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const j = await r.json();
    if (!r.ok) return res.status(r.status === 429 ? 429 : 502).json({ error: j.error?.message || "upstream error" });
    res.json({ text: (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n") });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: "upstream error" });
  }
}
