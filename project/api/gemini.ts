// api/gemini.ts — ZivaKhata Vercel Serverless Function
//
// Handles 3 actions:
//   'post'             — text-only Gemini call
//   'scan-receipt'     — Gemini Vision for receipt images
//   'transcribe-audio' — Gemini 1.5 Flash multimodal audio -> transcript
//
// FIXES:
//   FIX A: Dynamic mimeType from frontend used in inlineData (not hardcoded)
//   FIX B: Exact Google error message returned to frontend (no swallowing)
//   FIX C: Exponential backoff 2s->4s->8s on 429 rate limit errors

import type { VercelRequest, VercelResponse } from '@vercel/node'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? ''
const MODEL    = 'gemini-2.5-flash'
const BASE_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`

// FIX C: Exponential backoff retry wrapper
// Retries only on 429. All other errors thrown immediately.
async function callGeminiWithRetry(
  body: object,
  maxRetries = 3,
  timeoutMs  = 25000
): Promise<any> {
  let lastError: Error = new Error('Unknown error')

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      const waitMs = Math.pow(2, attempt) * 1000  // 2s, 4s, 8s
      console.log(`[Gemini] 429 retry ${attempt}/${maxRetries - 1} — waiting ${waitMs}ms`)
      await new Promise(resolve => setTimeout(resolve, waitMs))
    }

    const controller = new AbortController()
    const timer      = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch(`${BASE_URL}?key=${GEMINI_API_KEY}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        signal:  controller.signal,
        body:    JSON.stringify(body),
      })

      clearTimeout(timer)

      if (response.status === 429) {
        lastError = new Error('429 Rate limit exceeded')
        continue  // retry
      }

      if (!response.ok) {
        // FIX B: Read exact error from Google and throw it
        const errText = await response.text().catch(() => response.statusText)
        console.error(`[Gemini] API error ${response.status}:`, errText)
        throw new Error(`Gemini error ${response.status}: ${errText}`)
      }

      return await response.json()

    } catch (err: any) {
      clearTimeout(timer)

      if (err?.name === 'AbortError') {
        throw new Error('Gemini request timed out')
      }

      // Don't retry non-429 errors
      if (!err?.message?.includes('429')) {
        throw err
      }

      lastError = err
    }
  }

  throw lastError
}

function extractText(data: any): string {
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin',  '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    return res.status(204).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!GEMINI_API_KEY) {
    console.error('[api/gemini] GEMINI_API_KEY is not set in environment variables')
    return res.status(500).json({ error: 'GEMINI_API_KEY not configured on server' })
  }

  const { action, payload } = req.body ?? {}
  console.log(`[api/gemini] action="${action}"`)

  try {

    // ── ACTION: transcribe-audio ────────────────────────────────────────────
    if (action === 'transcribe-audio') {
      const {
        base64Audio,
        mimeType = 'audio/webm',  // FIX A: use mimeType from frontend
        language = 'en',
      } = payload ?? {}

      if (!base64Audio) {
        return res.status(400).json({ error: 'payload.base64Audio is required' })
      }

      console.log(`[transcribe-audio] lang=${language} | mime=${mimeType} | base64Length=${base64Audio.length}`)

      const LANG_NAMES: Record<string, string> = {
        en: 'English (Indian accent)',
        hi: 'Hindi',
        ta: 'Tamil',
        te: 'Telugu',
        kn: 'Kannada',
        ml: 'Malayalam',
      }
      const langName = LANG_NAMES[language] ?? 'English'

      const transcribePrompt = `You are Ziva, a voice transcription engine for ZivaKhata, an Indian shopkeeper ledger app.

The user recorded a voice note in ${langName} or a mix of ${langName} and English.
Code-switching is extremely common in India.

YOUR TASK: Transcribe the audio EXACTLY as spoken.
- Keep original words (do not translate)
- Keep mixed language as-is (e.g. "milk ku 50 rupees" stays as "milk ku 50 rupees")
- Write numbers as digits (e.g. "fifty" -> 50, "five hundred" -> 500)
- CRITICAL: Weight/quantity units must be transcribed accurately:
  "fifty kg" -> "50 kg", "hundred grams" -> "100 g", "five hundred ml" -> "500 ml"
  Never merge a number and unit into a different number (e.g. "50 kg" must NOT become "850g")
- Remove filler sounds (um, uh, ah) but keep all meaningful words
- If audio is silent or completely inaudible, return empty string only

Return ONLY the transcribed text. No explanations, no punctuation changes, no JSON, no markdown.`

      const requestBody = {
        contents: [{
          parts: [
            {
              // FIX A: Use dynamic mimeType sent from frontend
              // Android Chrome -> audio/webm;codecs=opus
              // iOS Safari     -> audio/mp4
              inlineData: {
                data:     base64Audio,
                mimeType: mimeType,
              },
            },
            { text: transcribePrompt },
          ],
        }],
        generationConfig: {
          temperature: 0.0,
          topP:        0.1,
          topK:        1,
        },
      }

      const data = await callGeminiWithRetry(requestBody, 3, 25000)
      const text = extractText(data).trim()

      console.log(`[transcribe-audio] result="${text}"`)
      return res.status(200).json({ text })
    }

    // ── ACTION: post (text-only) ────────────────────────────────────────────
    if (action === 'post') {
      const { body: geminiBody, timeoutMs = 15000 } = payload ?? {}
      if (!geminiBody) {
        return res.status(400).json({ error: 'payload.body is required' })
      }

      const data = await callGeminiWithRetry(geminiBody, 3, timeoutMs)
      const text = extractText(data)

      return res.status(200).json({ text })
    }

    // ── ACTION: scan-receipt ────────────────────────────────────────────────
    if (action === 'scan-receipt') {
      const { base64Image, mimeType = 'image/jpeg' } = payload ?? {}
      if (!base64Image) {
        return res.status(400).json({ error: 'payload.base64Image is required' })
      }

      const receiptPrompt = `You are a receipt scanning AI for ZivaKhata, an Indian shopkeeper app.
Analyze this receipt and extract:
- Total amount paid (number only, no currency symbol)
- Brief description (what was purchased, max 5 words)
- Category: Food | Groceries | Fuel | Transport | Healthcare | Utilities | Shopping | General
- Date in YYYY-MM-DD format, or today's date if not visible

OUTPUT: JSON only, no markdown, no backticks.
{"amount": number, "description": "string", "category": "string", "date": "YYYY-MM-DD"}`

      const requestBody = {
        contents: [{
          parts: [
            { inlineData: { data: base64Image, mimeType } },
            { text: receiptPrompt },
          ],
        }],
        generationConfig: { temperature: 0.1, topP: 0.1, topK: 1 },
      }

      const data = await callGeminiWithRetry(requestBody, 3, 25000)
      const raw  = extractText(data)

      console.log(`[scan-receipt] raw="${raw}"`)
      return res.status(200).json({ raw })
    }

    return res.status(400).json({ error: `Unknown action: "${action}"` })

  } catch (err: any) {
    // FIX B: Return exact error message — never swallow it
    const message = err?.message ?? 'Internal server error'
    console.error(`[api/gemini] action="${action}" FAILED:`, message)

    if (message.includes('429')) {
      return res.status(429).json({ error: 'AI rate limit reached. Please wait a moment and try again.' })
    }
    if (message.includes('timed out')) {
      return res.status(504).json({ error: 'AI request timed out. Please try again.' })
    }

    // FIX B: Send exact Google error back so frontend can log it
    return res.status(500).json({ error: message })
  }
}