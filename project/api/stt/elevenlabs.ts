// /api/stt/elevenlabs.ts
// Vercel Serverless Function — proxies ElevenLabs Scribe Speech-to-Text.
//
// Environment variable required in Vercel dashboard:
//   ELEVENLABS_API_KEY = your ElevenLabs API key (no VITE_ prefix)

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { IncomingMessage } from 'http';

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

export const config = {
  api: { bodyParser: false },
};

async function getRawBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!ELEVENLABS_API_KEY) {
    return res.status(503).json({ error: 'ELEVENLABS_NOT_CONFIGURED' });
  }

  try {
    const rawBody = await getRawBody(req);
    const contentType = req.headers['content-type'] ?? '';

    if (!contentType.includes('multipart/form-data')) {
      return res.status(400).json({ error: 'Expected multipart/form-data' });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);

    const upstream = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': contentType,
        'Content-Length': String(rawBody.length),
      },
      body: new Uint8Array(rawBody),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (upstream.status === 429) {
      return res.status(429).json({ error: 'RATE_LIMIT' });
    }
    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => '');
      return res.status(upstream.status).json({ error: `ElevenLabs ${upstream.status}: ${errText.slice(0, 200)}` });
    }

    const data = await upstream.json();
    return res.status(200).json(data);

  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return res.status(504).json({ error: 'ElevenLabs timed out' });
    }
    return res.status(500).json({ error: err?.message ?? 'Unknown error' });
  }
}