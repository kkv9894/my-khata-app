// api/gemini.ts — ZivaKhata Vercel Serverless Function
//
// Handles 3 actions:
//   'post'              — text-only Gemini call (analyzeTransaction, detectVoiceIntent, askFinancialAI)
//   'scan-receipt'      — Gemini Vision for receipt images
//   'transcribe-audio'  — NEW: Gemini 1.5 Flash multimodal audio → transcript
//
// SAFETY NET: All Gemini calls use exponential backoff (2s → 4s → 8s) on 429.
// Frontend user sees "Processing…" spinner — retries are invisible to them.

import type { VercelRequest, VercelResponse } from '@vercel/node'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? ''
const MODEL          = 'gemini-1.5-flash'
const BASE_URL       = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`

// ── Exponential backoff retry wrapper ────────────────────────────────────────
// Retries on 429 (rate limit) with 2s → 4s → 8s delays.
// Any other error is thrown immediately.
async function callGeminiWithRetry(
  body: object,
  maxRetries = 3,
  timeoutMs  = 25000
): Promise<any> {
  let lastError: Error = new Error('Unknown error')

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // Wait before retry (not before first attempt)
    if (attempt > 0) {
      const waitMs = Math.pow(2, attempt) * 1000   // 2s, 4s, 8s
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

      // 429 → retry
      if (response.status === 429) {
        lastError = new Error('429 Rate limit exceeded')
        continue
      }

      // Any other non-OK → throw immediately (don't retry 400, 403, 500 etc.)
      if (!response.ok) {
        const errText = await response.text().catch(() => response.statusText)
        throw new Error(`Gemini API error ${response.status}: ${errText}`)
      }

      return await response.json()

    } catch (err: any) {
      clearTimeout(timer)

      // AbortError = timeout — don't retry
      if (err?.name === 'AbortError') {
        throw new Error('Gemini request timed out')
      }

      // Re-throw non-429 errors immediately
      if (!err?.message?.includes('429')) {
        throw err
      }

      lastError = err
    }
  }

  // All retries exhausted
  throw lastError
}

// ── Extract text from Gemini response ────────────────────────────────────────
function extractText(data: any): string {
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin',  '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    return res.status(204).end()
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!GEMINI_API_KEY)       return res.status(500).json({ error: 'GEMINI_API_KEY not configured' })

  const { action, payload } = req.body ?? {}

  try {

    // ── ACTION: transcribe-audio ──────────────────────────────────────────────
    // NEW: Receives Base64 audio from frontend, sends to Gemini 1.5 Flash multimodal
    if (action === 'transcribe-audio') {
      const { base64Audio, mimeType = 'audio/webm', language = 'en' } = payload ?? {}

      if (!base64Audio) return res.status(400).json({ error: 'base64Audio is required' })

      const LANG_NAMES: Record<string, string> = {
        en: 'English (Indian accent)',
        hi: 'Hindi',
        ta: 'Tamil',
        te: 'Telugu',
        kn: 'Kannada',
        ml: 'Malayalam',
      }
      const langName = LANG_NAMES[language] ?? 'English'

      // System instruction for audio transcription
      // Reuses the same Indian code-switching awareness as analyzeTransaction
      const transcribePrompt = `You are Ziva, a voice transcription engine for ZivaKhata — an Indian shopkeeper ledger app.

The user has recorded a voice note in ${langName} or a mix of ${langName} and English (code-switching is very common in India).

YOUR TASK: Transcribe the audio EXACTLY as spoken. 
- Keep the original words (do not translate)
- Keep mixed language as-is (e.g. "milk ku 50 rupees" should stay as "milk ku 50 rupees")
- If you hear a number, write it as a digit (e.g. "fifty" → 50)
- Remove filler sounds (um, uh, ah) but keep all meaningful words
- If audio is silent or inaudible, return empty string only

Return ONLY the transcribed text. No explanations, no punctuation correction, no JSON.`

      const requestBody = {
        contents: [{
          parts: [
            // Audio part — Gemini 1.5 Flash multimodal
            {
              inlineData: {
                data:     base64Audio,
                mimeType: mimeType,
              },
            },
            // Text instruction part
            { text: transcribePrompt },
          ],
        }],
        generationConfig: {
          temperature: 0.0,   // deterministic — we want exact transcription
          topP:        0.1,
          topK:        1,
        },
      }

      const data = await callGeminiWithRetry(requestBody, 3, 25000)
      const text = extractText(data).trim()

      console.log(`✅ [transcribe-audio] lang=${language} | result="${text}"`)
      return res.status(200).json({ text })
    }

    // ── ACTION: post (text-only — analyzeTransaction, detectVoiceIntent, etc.) ──
    if (action === 'post') {
      const { body: geminiBody, timeoutMs = 15000 } = payload ?? {}
      if (!geminiBody) return res.status(400).json({ error: 'payload.body is required' })

      const data = await callGeminiWithRetry(geminiBody, 3, timeoutMs)
      const text = extractText(data)

      return res.status(200).json({ text })
    }

    // ── ACTION: scan-receipt (Gemini Vision) ──────────────────────────────────
    if (action === 'scan-receipt') {
      const { base64Image, mimeType = 'image/jpeg' } = payload ?? {}
      if (!base64Image) return res.status(400).json({ error: 'base64Image is required' })

      const receiptPrompt = `You are a receipt scanning AI for ZivaKhata, an Indian shopkeeper app.
Analyze this receipt image and extract:
- Total amount paid (number only, no currency symbol)
- Brief description (what was purchased, max 5 words)
- Category: Food | Groceries | Fuel | Transport | Healthcare | Utilities | Shopping | General
- Date (YYYY-MM-DD format, or today if not visible)

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

      console.log(`✅ [scan-receipt] raw="${raw}"`)
      return res.status(200).json({ raw })
    }

    return res.status(400).json({ error: `Unknown action: ${action}` })

  } catch (err: any) {
    console.error(`[api/gemini] action=${action} error:`, err?.message)

    if (err?.message?.includes('429')) {
      return res.status(429).json({ error: 'AI rate limit reached. Please try again in a moment.' })
    }
    if (err?.message?.includes('timed out')) {
      return res.status(504).json({ error: 'AI request timed out. Please try again.' })
    }

    return res.status(500).json({ error: err?.message ?? 'Internal server error' })
  }
}