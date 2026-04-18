// FILE: api/gemini.ts

import type { VercelRequest, VercelResponse } from '@vercel/node'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? ''
const MODEL = 'gemini-2.5-flash'
const BASE_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`

async function callGeminiWithRetry(
  body: object,
  maxRetries = 3,
  timeoutMs = 25000
): Promise<any> {
  let lastError: Error = new Error('Unknown error')

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      const waitMs = Math.pow(2, attempt) * 1000
      console.log(`[Gemini] 429 retry ${attempt}/${maxRetries - 1} — waiting ${waitMs}ms`)
      await new Promise(resolve => setTimeout(resolve, waitMs))
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch(`${BASE_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify(body),
      })

      clearTimeout(timer)

      if (response.status === 429) {
        lastError = new Error('429 Rate limit exceeded')
        continue
      }

      if (!response.ok) {
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

      if (!err?.message?.includes('429')) {
        throw err
      }

      lastError = err
    }
  }

  throw lastError
}

function extractText(data: any): string {
  const parts = data?.candidates?.[0]?.content?.parts
  if (!Array.isArray(parts)) return ''
  return parts
    .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
    .join(' ')
    .trim()
}

function normalizeAudioMimeType(mimeType: string): string {
  const mt = String(mimeType || '').toLowerCase()

  if (mt.includes('webm')) return 'audio/webm'
  if (mt.includes('mp4') || mt.includes('m4a')) return 'audio/mp4'
  if (mt.includes('mpeg') || mt.includes('mp3')) return 'audio/mpeg'
  if (mt.includes('wav')) return 'audio/wav'
  if (mt.includes('ogg')) return 'audio/ogg'

  return 'audio/webm'
}

function cleanTranscriptText(text: string): string {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function isPromptEcho(text: string): boolean {
  const t = cleanTranscriptText(text).toLowerCase()

  if (!t) return false

  return (
    t.startsWith('sorry') ||
    t.startsWith('you are ziva') ||
    t.startsWith('transcribe this audio') ||
    t.startsWith('the user recorded') ||
    t.startsWith('your task') ||
    t.includes('voice transcription engine for zivakhata') ||
    t.includes('return only the transcribed text') ||
    t.includes('return only the transcript text')
  )
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
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
    if (action === 'transcribe-audio') {
      const {
        base64Audio,
        mimeType = 'audio/webm',
        language = 'en',
      } = payload ?? {}

      if (!base64Audio) {
        return res.status(400).json({ error: 'payload.base64Audio is required' })
      }

      console.log(
        `[transcribe-audio] lang=${language} | mime=${mimeType} | base64Length=${base64Audio.length}`
      )

      const LANG_NAMES: Record<string, string> = {
        en: 'English',
        hi: 'Hindi',
        ta: 'Tamil',
        te: 'Telugu',
        kn: 'Kannada',
        ml: 'Malayalam',
      }

      const langName = LANG_NAMES[language] ?? 'English'
      const safeMimeType = normalizeAudioMimeType(mimeType)

      const transcribePrompt = language === 'en'
        ? `Transcribe this audio exactly as spoken.

The speaker is primarily speaking English.
Do not transliterate English words into Indian languages.
Do not guess Hindi, Tamil, Telugu, Kannada, or Malayalam words if the audio is English.
Write numbers as digits.
Keep units exactly: kg, g, ml, l, packet, packets, piece, pieces.
Do not explain anything.
Do not translate anything.
If speech is unclear or silent, return empty string.

Return only the transcript text.`
        : `Transcribe this audio exactly as spoken.

Language may be ${langName} mixed with English.
Keep code-mixed words exactly as spoken.
Write numbers as digits.
Keep units exactly: kg, g, ml, l, packet, packets, piece, pieces.
Do not explain anything.
Do not translate anything.
If speech is unclear or silent, return empty string.

Return only the transcript text.`

      const requestBody = {
        contents: [
          {
            parts: [
              { text: transcribePrompt },
              {
                inlineData: {
                  data: base64Audio,
                  mimeType: safeMimeType,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.0,
          topP: 0.1,
          topK: 1,
        },
      }

      const data = await callGeminiWithRetry(requestBody, 3, 25000)
      const rawText = extractText(data)
      const text = cleanTranscriptText(rawText)

      if (isPromptEcho(text)) {
        console.warn('[transcribe-audio] prompt echo detected:', text)
        return res.status(200).json({ text: '' })
      }

      console.log(`[transcribe-audio] result="${text}"`)
      return res.status(200).json({ text })
    }

    if (action === 'post') {
      const { body: geminiBody, timeoutMs = 15000 } = payload ?? {}

      if (!geminiBody) {
        return res.status(400).json({ error: 'payload.body is required' })
      }

      const data = await callGeminiWithRetry(geminiBody, 3, timeoutMs)
      const text = extractText(data)

      return res.status(200).json({ text })
    }

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
        contents: [
          {
            parts: [
              { inlineData: { data: base64Image, mimeType } },
              { text: receiptPrompt },
            ],
          },
        ],
        generationConfig: { temperature: 0.1, topP: 0.1, topK: 1 },
      }

      const data = await callGeminiWithRetry(requestBody, 3, 25000)
      const raw = extractText(data)

      console.log(`[scan-receipt] raw="${raw}"`)
      return res.status(200).json({ raw })
    }

    return res.status(400).json({ error: `Unknown action: "${action}"` })
  } catch (err: any) {
    const message = err?.message ?? 'Internal server error'
    console.error(`[api/gemini] action="${action}" FAILED:`, message)

    if (message.includes('429')) {
      return res.status(429).json({ error: 'AI rate limit reached. Please wait a moment and try again.' })
    }

    if (message.includes('timed out')) {
      return res.status(504).json({ error: 'AI request timed out. Please try again.' })
    }

    return res.status(500).json({ error: message })
  }
}
