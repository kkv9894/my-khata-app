// /api/gemini.ts
// Vercel Serverless Function — proxies ALL Gemini API calls.
// API key stays server-side only. Never exposed to the browser.
//
// Frontend calls:  POST /api/gemini
// Body shape:      { action, payload }
// Actions:         "post" | "scan-receipt"
//
// Environment variable required in Vercel dashboard:
//   GEMINI_API_KEY = your Google AI Studio key (no VITE_ prefix)

import type { VercelRequest, VercelResponse } from '@vercel/node';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not configured on server' });
  }

  const { action, payload } = req.body ?? {};

  if (action === 'post') {
    const { body, timeoutMs = 15000 } = payload ?? {};
    if (!body) return res.status(400).json({ error: 'Missing body in payload' });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const upstream = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify(body),
      });
      clearTimeout(timer);

      if (upstream.status === 429) {
        return res.status(429).json({ error: 'Gemini rate limit — try again shortly' });
      }
      if (!upstream.ok) {
        const errText = await upstream.text().catch(() => '');
        return res.status(upstream.status).json({ error: `Gemini ${upstream.status}: ${errText.slice(0, 200)}` });
      }

      const data = await upstream.json();
      const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      return res.status(200).json({ text });

    } catch (err: any) {
      clearTimeout(timer);
      if (err?.name === 'AbortError') {
        return res.status(504).json({ error: `Gemini timed out after ${timeoutMs / 1000}s` });
      }
      return res.status(500).json({ error: err?.message ?? 'Unknown error' });
    }
  }

  if (action === 'scan-receipt') {
    const { base64Image, mimeType } = payload ?? {};
    if (!base64Image || !mimeType) {
      return res.status(400).json({ error: 'Missing base64Image or mimeType' });
    }

    const today = new Date().toISOString().split('T')[0];
    const body = {
      contents: [{
        parts: [
          { inline_data: { mime_type: mimeType, data: base64Image } },
          {
            text:
              `You are scanning a receipt for an Indian Khata (ledger) app.\n` +
              `CATEGORIES: Groceries, Food, Transport, Fuel, Rent, Utilities, Shopping, Healthcare, Education, General\n` +
              `Extract: total amount (number only), short description (max 6 words, English), best category, date (YYYY-MM-DD or today: ${today}).\n` +
              `OUTPUT: JSON only, no markdown.\n` +
              `{"amount": 250, "description": "Grocery shopping", "category": "Groceries", "date": "${today}"}`,
          },
        ],
      }],
      generationConfig: { temperature: 0.1, topP: 0.1, topK: 1 },
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);

    try {
      const upstream = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify(body),
      });
      clearTimeout(timer);

      if (!upstream.ok) {
        return res.status(upstream.status).json({ error: `Gemini Vision ${upstream.status}` });
      }

      const data = await upstream.json();
      const raw: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      return res.status(200).json({ raw });

    } catch (err: any) {
      clearTimeout(timer);
      if (err?.name === 'AbortError') {
        return res.status(504).json({ error: 'Receipt scan timed out' });
      }
      return res.status(500).json({ error: err?.message ?? 'Unknown error' });
    }
  }

  return res.status(400).json({ error: `Unknown action: "${action}"` });
}