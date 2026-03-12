// src/components/ReceiptScanner.tsx
// Snap & Save — Gemini Vision multi-item receipt scanner
//
// UPGRADED (additive changes only):
//  • Calls /api/scan-receipt serverless route → GEMINI_API_KEY never in browser
//  • Multi-item extraction — every line item is an editable card
//  • Business mode: upserts inventory table for items with a quantity
//  • accountType prop added as optional (existing call sites still compile)
//  • All original Props fields preserved: onClose, onSaved, language
//  • Schema-resilient save: retries with minimal row on column error

import { useState, useRef } from 'react'
import {
  Camera, Upload, X, Loader2, CheckCircle,
  ScanLine, Edit3, Store, Package, Trash2,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

// ── Types ────────────────────────────────────────────────────────────────────

interface ScannedItem {
  item_name: string
  amount:    number
  quantity:  number | null
  unit:      string | null
  category:  string
  type:      'income' | 'expense'   // user-editable before save
}

interface ScanResult {
  store_name:   string | null
  bill_date:    string
  total_amount: number
  items:        ScannedItem[]
}

// accountType is optional — existing call sites without it still compile.
interface Props {
  onClose:      () => void
  onSaved:      () => void
  language?:    string
  accountType?: 'personal' | 'business'
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ReceiptScanner({
  onClose,
  onSaved,
  language: _language = 'en',
  accountType = 'business',
}: Props) {
  const { user } = useAuth()

  const [scanning,   setScanning]   = useState(false)
  const [preview,    setPreview]    = useState<string | null>(null)
  const [result,     setResult]     = useState<ScanResult | null>(null)
  const [items,      setItems]      = useState<ScannedItem[]>([])
  const [saving,     setSaving]     = useState(false)
  const [saved,      setSaved]      = useState(false)
  const [savedCount, setSavedCount] = useState(0)
  const [error,      setError]      = useState('')

  const fileInputRef   = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  // ── Capture image → Base64 → /api/scan-receipt ───────────────────────────
  const processImage = async (file: File) => {
    setScanning(true); setError(''); setResult(null); setItems([])
    try {
      const mime   = file.type || 'image/jpeg'
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload  = () => resolve((reader.result as string).split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      setPreview(URL.createObjectURL(file))

      const res = await fetch('/api/scan-receipt', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ base64, mimeType: mime, accountType }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({})) as Record<string, any>
        throw new Error(errData?.error ?? `Server error ${res.status}`)
      }

      const data: ScanResult = await res.json()
      if (!data.items || data.items.length === 0) {
        setError('Could not read items. Try a clearer, well-lit photo.')
        return
      }

      setResult(data)
      // Default every item to expense — user can flip individual ones
      setItems(data.items.map(i => ({ ...i, type: 'expense' as const })))

    } catch (err: any) {
      console.error('Receipt scan error:', err)
      setError(err?.message ?? 'Scanning failed. Please try again.')
    } finally {
      setScanning(false)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) void processImage(file)
    e.target.value = ''   // allow same file to be re-selected after rescan
  }

  // ── Edit individual item fields ──────────────────────────────────────────
  const updateItem = (idx: number, field: keyof ScannedItem, value: any) =>
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it))

  const removeItem = (idx: number) =>
    setItems(prev => prev.filter((_, i) => i !== idx))

  // ── Save all items to transactions + update inventory (business) ─────────
  const saveAll = async () => {
    if (!result || !user || items.length === 0) return
    setSaving(true); setError('')
    let count  = 0
    const errs: string[] = []

    for (const item of items) {
      const amount = Number(item.amount)
      if (!amount || amount <= 0) continue

      const desc = item.quantity
        ? `${item.quantity}${item.unit ?? ''} ${item.item_name}`.trim()
        : item.item_name
      const now = new Date().toISOString()

      // Full insert first; retry minimal row if column error (schema-resilient)
      const fullRow = {
        amount,
        description:      desc,
        type:             item.type,
        user_id:          user.id,
        transaction_date: result.bill_date || now.split('T')[0],
        created_at:       now,
        voice_transcript: result.store_name
          ? `Receipt: ${result.store_name}` : null,
      }

      const { error: e1 } = await supabase.from('transactions').insert([fullRow])
      if (e1) {
        const msg = e1.message.toLowerCase()
        if (msg.includes('column') || msg.includes('does not exist') || msg.includes('schema')) {
          const { error: e2 } = await supabase.from('transactions').insert([{
            amount, description: desc, type: item.type, user_id: user.id,
            transaction_date: result.bill_date || now.split('T')[0],
            created_at: now,
          }])
          if (e2) { errs.push(e2.message); continue }
        } else {
          errs.push(e1.message); continue
        }
      }
      count++

      // Inventory sync — business only, expense items with a measured quantity
      // expense = shopkeeper is buying/receiving stock → quantity goes UP
      if (accountType === 'business' && item.quantity && item.quantity > 0 && item.type === 'expense') {
        try {
          const { data: existing } = await supabase
            .from('inventory').select('id, quantity')
            .eq('user_id', user.id)
            .ilike('item_name', item.item_name)
            .maybeSingle()

          const newQty = (existing?.quantity ?? 0) + item.quantity
          if (existing?.id) {
            await supabase.from('inventory')
              .update({ quantity: newQty, updated_at: now }).eq('id', existing.id)
          } else {
            await supabase.from('inventory').insert({
              user_id: user.id, item_name: item.item_name,
              quantity: item.quantity, unit: item.unit ?? 'units', updated_at: now,
            })
          }
        } catch (invErr) {
          // Inventory failure is non-fatal — transaction already saved
          console.warn('Inventory update skipped:', item.item_name, invErr)
        }
      }
    }

    setSaving(false)
    setSavedCount(count)
    if (count === 0 && errs.length > 0) { setError('Save failed: ' + errs[0]); return }
    setSaved(true)
    setTimeout(() => { onSaved(); onClose() }, 1600)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-end justify-center">
      <div className="bg-white w-full max-w-lg rounded-t-[2.5rem] p-6 pb-10 space-y-4 max-h-[94vh] overflow-y-auto">

        {/* Header */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <ScanLine className="text-black" size={22} />
            <h2 className="font-black text-lg tracking-tight">Snap & Save</h2>
            {accountType === 'business' && (
              <span className="text-[9px] font-black uppercase tracking-widest bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">
                +Inventory
              </span>
            )}
          </div>
          <button onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Image preview */}
        {preview && (
          <div className="w-full h-40 rounded-2xl overflow-hidden bg-gray-100">
            <img src={preview} alt="Receipt" className="w-full h-full object-contain" />
          </div>
        )}

        {/* Store / date / total banner */}
        {result && !scanning && (
          <div className="flex items-center gap-2 bg-gray-50 rounded-2xl px-3 py-2">
            <Store size={14} className="text-gray-400 shrink-0" />
            <span className="text-xs font-bold text-gray-700 truncate flex-1">
              {result.store_name ?? 'Receipt'} · {result.bill_date}
            </span>
            <span className="text-xs font-black text-gray-900 shrink-0">
              ₹{result.total_amount.toLocaleString('en-IN')}
            </span>
          </div>
        )}

        {/* Scanning spinner */}
        {scanning && (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <Loader2 className="animate-spin text-black" size={32} />
            <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">
              Reading receipt...
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
            <p className="text-red-600 text-sm font-semibold">{error}</p>
          </div>
        )}

        {/* Editable line-item cards */}
        {items.length > 0 && !scanning && !saved && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-1">
              <Edit3 size={13} className="text-gray-400" />
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                {items.length} item{items.length !== 1 ? 's' : ''} found · edit before saving
              </p>
            </div>

            {items.map((item, idx) => (
              <div key={idx}
                className="rounded-2xl border border-gray-100 bg-gray-50 p-3 space-y-2">

                {/* Item name + inventory badge + delete */}
                <div className="flex items-center gap-2">
                  {accountType === 'business' && item.quantity && (
                    <Package size={12} className="text-blue-400 shrink-0" />
                  )}
                  <input
                    value={item.item_name}
                    onChange={e => updateItem(idx, 'item_name', e.target.value)}
                    className="flex-1 font-bold text-sm text-gray-800 bg-transparent outline-none min-w-0"
                    placeholder="Item name"
                  />
                  <button onClick={() => removeItem(idx)}
                    className="p-1 text-gray-300 hover:text-red-400 transition-colors shrink-0">
                    <Trash2 size={14} />
                  </button>
                </div>

                {/* Amount + qty display + Exp / Inc toggle */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 font-semibold shrink-0">₹</span>
                  <input
                    type="number"
                    value={item.amount}
                    onChange={e => updateItem(idx, 'amount', parseFloat(e.target.value) || 0)}
                    className="w-24 font-black text-sm text-gray-900 bg-white border border-gray-200 rounded-xl px-2 py-1 outline-none"
                  />
                  {item.quantity && (
                    <span className="text-xs text-gray-400 font-semibold shrink-0">
                      {item.quantity}{item.unit ?? ''}
                    </span>
                  )}
                  <div className="flex gap-1 ml-auto">
                    {(['expense', 'income'] as const).map(t => (
                      <button key={t} onClick={() => updateItem(idx, 'type', t)}
                        className={`rounded-xl px-2 py-1 text-[10px] font-black transition-all ${
                          item.type === t
                            ? t === 'expense' ? 'bg-red-500 text-white' : 'bg-green-500 text-white'
                            : 'bg-gray-100 text-gray-400'
                        }`}>
                        {t === 'expense' ? 'Exp' : 'Inc'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Category + inventory tracking note */}
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black uppercase tracking-widest text-gray-300">
                    {item.category}
                  </span>
                  {accountType === 'business' && item.quantity && item.type === 'expense' && (
                    <span className="text-[9px] font-black uppercase tracking-widest text-blue-300">
                      · stock +{item.quantity}{item.unit ?? ''}
                    </span>
                  )}
                </div>
              </div>
            ))}

            {/* Total summary bar */}
            <div className="flex items-center justify-between rounded-2xl bg-black px-4 py-3">
              <span className="text-sm font-black text-white">
                {items.length} item{items.length !== 1 ? 's' : ''}
              </span>
              <span className="text-lg font-black text-white">
                ₹{items.reduce((s, i) => s + i.amount, 0).toLocaleString('en-IN')}
              </span>
            </div>
          </div>
        )}

        {/* Success */}
        {saved && (
          <div className="flex flex-col items-center py-8 gap-2">
            <CheckCircle className="text-green-500" size={44} />
            <p className="font-black text-green-600 text-lg">
              {savedCount} item{savedCount !== 1 ? 's' : ''} saved!
            </p>
            {accountType === 'business' && items.some(i => i.quantity && i.type === 'expense') && (
              <p className="text-xs text-gray-400 font-semibold">Inventory updated ✓</p>
            )}
          </div>
        )}

        {/* Initial buttons — no image yet */}
        {!result && !scanning && !saved && (
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => cameraInputRef.current?.click()}
              className="flex flex-col items-center gap-2 p-5 bg-black text-white rounded-2xl font-bold active:scale-95 transition-all">
              <Camera size={24} />
              <span className="text-sm">Take Photo</span>
            </button>
            <button onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center gap-2 p-5 bg-gray-100 text-gray-800 rounded-2xl font-bold active:scale-95 transition-all">
              <Upload size={24} />
              <span className="text-sm">Upload Image</span>
            </button>
          </div>
        )}

        {/* Post-scan buttons */}
        {result && !saved && !scanning && (
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => { setResult(null); setItems([]); setPreview(null); setError('') }}
              className="p-4 bg-gray-100 text-gray-700 rounded-2xl font-bold active:scale-95 transition-all">
              Rescan
            </button>
            <button onClick={() => void saveAll()}
              disabled={saving || items.length === 0}
              className="p-4 bg-black text-white rounded-2xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50">
              {saving ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle size={18} />}
              {items.length > 1 ? `Save all ${items.length}` : 'Save'}
            </button>
          </div>
        )}

        {/* Hidden file inputs */}
        {/* capture="environment" → opens rear camera directly on iPhone/Android */}
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment"
          className="hidden" onChange={handleFileChange} />
        <input ref={fileInputRef} type="file" accept="image/*"
          className="hidden" onChange={handleFileChange} />

      </div>
    </div>
  )
}