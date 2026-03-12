// api/scan-receipt.ts
// Vercel Serverless Function — Gemini 1.5 Pro Vision receipt scanner
//
// SECURE: GEMINI_API_KEY is a server-side env var — never in the browser bundle.
// Uses gemini-1.5-pro (multimodal) which can read images — 2.0-flash cannot.
// Extracts every individual line item, not just the total.
// Returns JSON array matching the shape the frontend expects.
//
// Required Vercel env var (set in dashboard, no VITE_ prefix):
//   GEMINI_API_KEY

import type { VercelRequest, VercelResponse } from '@vercel/node'

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // ── CORS ─────────────────────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.error('scan-receipt: GEMINI_API_KEY not configured')
    return res.status(503).json({ error: 'GEMINI_API_KEY not configured on server' })
  }

  const { base64, mimeType, accountType } = req.body as {
    base64:       string
    mimeType:     string
    accountType?: 'personal' | 'business'
  }

  if (!base64 || !mimeType) {
    return res.status(400).json({ error: 'base64 and mimeType are required' })
  }

  const today      = new Date().toISOString().split('T')[0]
  const isBusiness = accountType === 'business'

  const prompt = `You are scanning a receipt or bill photo for "My Khata", an Indian ${
    isBusiness ? 'shop/business' : 'personal finance'
  } ledger app used by small shopkeepers.

TASK: Extract EVERY individual line item visible on this receipt.

For EACH item return:
- item_name: short name, max 4 words, keep original language (Tamil/Hindi/English all OK)
- amount: the RUPEE PRICE as a plain number — NEVER the weight or count number
- quantity: numeric quantity if printed (e.g. 2 for "2 kg"), null if not shown
- unit: one of kg/g/ml/l/pieces/packets/dozen — null if not shown
- category: best fit from [${
    isBusiness
      ? 'Groceries,Supplies,Food,Fuel,Transport,Utilities,Maintenance,General'
      : 'Groceries,Food,Transport,Fuel,Rent,Bills,Shopping,Healthcare,Entertainment,General'
  }]

Also return at the top level:
- store_name: shop name if readable, else null
- bill_date: date on receipt as YYYY-MM-DD, or today (${today}) if not visible
- total_amount: grand total printed on receipt as a plain number

CRITICAL RULES:
1. amount = rupee price ONLY. Never the weight.
   "2 kg Sugar 90" → item_name=Sugar, amount=90, quantity=2, unit=kg
   "Rice 5kg 320/-" → item_name=Rice, amount=320, quantity=5, unit=kg
2. One object per line item in the "items" array — do NOT merge lines.
3. If only a total is visible, return one item using store_name as item_name.
4. All items default to expense type (shopkeeper bought or customer purchase).

OUTPUT: Pure JSON only — no markdown, no backticks, no extra text.
{
  "store_name": "string or null",
  "bill_date": "YYYY-MM-DD",
  "total_amount": number,
  "items": [
    { "item_name": "string", "amount": number, "quantity": number|null, "unit": "string|null", "category": "string" }
  ]
}`

  try {
    const upstream = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: mimeType, data: base64 } },
            { text: prompt },
          ],
        }],
        generationConfig: { temperature: 0.1, topP: 0.1, topK: 1 },
      }),
    })

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => '')
      console.error('Gemini Vision error:', upstream.status, errText.slice(0, 300))
      return res.status(502).json({ error: `Gemini ${upstream.status}` })
    }

    const data = await upstream.json()
    const raw  = (data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '') as string

    // Strip accidental markdown fences and extract the JSON object
    const s = raw.indexOf('{')
    const e = raw.lastIndexOf('}') + 1
    if (s === -1 || e === 0) {
      return res.status(422).json({ error: 'Could not parse receipt — try a clearer photo' })
    }

    const parsed = JSON.parse(raw.substring(s, e).trim())

    // Clean and validate each item
    const rawItems: any[] = Array.isArray(parsed.items) ? parsed.items : []
    const items = rawItems
      .filter((i: any) => Number(i.amount) > 0)
      .map((i: any) => ({
        item_name: String(i.item_name || 'Item').trim(),
        amount:    Number(i.amount),
        quantity:  i.quantity != null ? Number(i.quantity) : null,
        unit:      i.unit ? String(i.unit).toLowerCase().trim() : null,
        category:  String(i.category || 'General'),
      }))

    // Fallback: if no items extracted but total exists, make one entry
    if (items.length === 0 && Number(parsed.total_amount) > 0) {
      items.push({
        item_name: String(parsed.store_name || 'Receipt total').trim(),
        amount:    Number(parsed.total_amount),
        quantity:  null,
        unit:      null,
        category:  'General',
      })
    }

    return res.status(200).json({
      store_name:   parsed.store_name ? String(parsed.store_name) : null,
      bill_date:    String(parsed.bill_date || today),
      total_amount: Number(parsed.total_amount) || 0,
      items,
    })

  } catch (err: any) {
    console.error('scan-receipt error:', err)
    return res.status(500).json({ error: err?.message ?? 'Internal server error' })
  }
}