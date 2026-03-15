// api/gemini.ts  — Vercel Serverless Function
// ✅ SECURE: GEMINI_API_KEY lives only on the server. Never sent to browser.
// Handles three actions: 'post' (text), 'scan-receipt' (vision), 'insights'

import type { VercelRequest, VercelResponse } from '@vercel/node';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? '';
const GEMINI_URL     = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
const GEMINI_VIS_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent';

// ─────────────────────────────────────────────────────────────────────────────
// Shared Gemini fetch helper
// ─────────────────────────────────────────────────────────────────────────────
async function callGemini(body: object, timeoutMs = 15000, vision = false): Promise<string> {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured on server');

  const url = `${vision ? GEMINI_VIS_URL : GEMINI_URL}?key=${GEMINI_API_KEY}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      signal:  controller.signal,
      body:    JSON.stringify(body),
    });
  } catch (err: any) {
    clearTimeout(timer);
    if (err?.name === 'AbortError') throw new Error(`Gemini timed out after ${timeoutMs / 1000}s`);
    throw err;
  }
  clearTimeout(timer);

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Gemini ${response.status}: ${errText.slice(0, 200)}`);
  }

  const data = await response.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS — allow requests from the same domain
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, payload } = req.body ?? {};

  try {
    // ── action: 'post' — standard text generation ──────────────────────────
    if (action === 'post') {
      const { body: geminiBody, timeoutMs = 15000 } = payload ?? {};
      if (!geminiBody) return res.status(400).json({ error: 'Missing payload.body' });

      const text = await callGemini(geminiBody, timeoutMs, false);
      return res.status(200).json({ text });
    }

    // ── action: 'scan-receipt' — Gemini Vision (gemini-1.5-pro) ───────────
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
            { text: `You are scanning a receipt for an Indian Khata (ledger) app.
CATEGORIES: Groceries, Food, Transport, Fuel, Rent, Utilities, Shopping, Healthcare, Education, General
Extract: total amount (number only), short description (max 6 words, English), best category, date (YYYY-MM-DD or today: ${today}).
OUTPUT: JSON only, no markdown.
{"amount": 250, "description": "Grocery shopping", "category": "Groceries", "date": "${today}"}` }
          ]
        }],
        generationConfig: { temperature: 0.1, topP: 0.1, topK: 1 }
      };

      const raw = await callGemini(body, 20000, true);
      return res.status(200).json({ raw });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });

  } catch (err: any) {
    console.error('[api/gemini] Error:', err?.message);

    if (err?.message?.includes('GEMINI_API_KEY not configured')) {
      return res.status(500).json({ error: 'Server configuration error: GEMINI_API_KEY missing. Add it to Vercel Environment Variables.' });
    }
    if (err?.message?.includes('429')) {
      return res.status(429).json({ error: 'Gemini rate limit reached. Please wait a moment.' });
    }
    if (err?.message?.includes('timed out')) {
      return res.status(504).json({ error: 'Gemini request timed out. Please try again.' });
    }

    return res.status(500).json({ error: err?.message ?? 'Unknown server error' });
  }
}