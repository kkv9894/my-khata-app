// /api/stt/chirp.ts
// Vercel Serverless Function — proxies Google Cloud Chirp 2 Speech-to-Text.
//
// Environment variables required in Vercel dashboard:
//   GOOGLE_STT_KEY    = your Google Cloud API key (no VITE_ prefix)
//   GOOGLE_PROJECT_ID = your Google Cloud project ID (no VITE_ prefix)

import type { VercelRequest, VercelResponse } from '@vercel/node';

const GOOGLE_STT_KEY    = process.env.GOOGLE_STT_KEY;
const GOOGLE_PROJECT_ID = process.env.GOOGLE_PROJECT_ID;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!GOOGLE_STT_KEY || !GOOGLE_PROJECT_ID) {
    // Chirp is optional — return a clear skip signal instead of 500
    return res.status(503).json({ error: 'CHIRP_NOT_CONFIGURED' });
  }

  const { base64, languageCodes } = req.body ?? {};
  if (!base64) {
    return res.status(400).json({ error: 'Missing base64 audio' });
  }

  const url = `https://speech.googleapis.com/v2/projects/${GOOGLE_PROJECT_ID}/locations/global/recognizers/_:recognize?key=${GOOGLE_STT_KEY}`;

  const body = {
    config: {
      autoDecodingConfig: {},
      languageCodes: languageCodes ?? ['en-IN', 'hi-IN', 'ta-IN', 'te-IN', 'kn-IN', 'ml-IN'],
      model: 'chirp_2',
      features: { enableWordConfidence: true, enableAutomaticPunctuation: false },
    },
    content: base64,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);

  try {
    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify(body),
    });
    clearTimeout(timer);

    if (upstream.status === 429) {
      return res.status(429).json({ error: 'RATE_LIMIT' });
    }
    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => '');
      return res.status(upstream.status).json({ error: `Chirp ${upstream.status}: ${errText.slice(0, 200)}` });
    }

    const data = await upstream.json();
    return res.status(200).json(data);

  } catch (err: any) {
    clearTimeout(timer);
    if (err?.name === 'AbortError') {
      return res.status(504).json({ error: 'Chirp timed out' });
    }
    return res.status(500).json({ error: err?.message ?? 'Unknown error' });
  }
}