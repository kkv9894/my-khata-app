// src/components/InventoryList.tsx
// Smart Inventory — Supabase-backed stock tracker for Business users.
// Displays real-time inventory. Shopkeeper manages stock entirely via voice.
// ADDITIVE: does not modify any existing component or hook.

import { useEffect, useState, useCallback } from 'react'
import { Package, RefreshCw, TrendingDown, AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { InventoryItem } from '../lib/types'

const LOW_STOCK_THRESHOLD = 5   // items with qty ≤ this are highlighted red

export default function InventoryList() {
  const { user } = useAuth()
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!user?.id) return
    setLoading(true); setError('')
    try {
      const { data, error: err } = await supabase
        .from('inventory')
        .select('*')
        .eq('user_id', user.id)
        .order('item_name', { ascending: true })

      if (err) throw err
      setItems((data ?? []) as InventoryItem[])
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load inventory')
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => { void load() }, [load])

  const lowStockItems  = items.filter(i => i.quantity <= LOW_STOCK_THRESHOLD && i.quantity > 0)
  const outOfStock     = items.filter(i => i.quantity <= 0)
  const inStock        = items.filter(i => i.quantity > LOW_STOCK_THRESHOLD)

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <RefreshCw className="animate-spin text-gray-400" size={28} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 px-4 pb-32 pt-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black tracking-tighter text-gray-900">Smart Inventory</h2>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
            {items.length} items · Voice-controlled
          </p>
        </div>
        <button
          onClick={load}
          className="rounded-xl bg-gray-100 p-2 text-gray-500 active:scale-95"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-2xl bg-red-50 px-4 py-3 text-red-600">
          <AlertTriangle size={16} />
          <span className="text-sm font-bold">{error}</span>
        </div>
      )}

      {/* Voice hint */}
      <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Voice commands</p>
        <div className="space-y-1">
          <p className="text-xs text-gray-600"><span className="font-bold text-green-600">Add:</span> "Added 50 kg sugar"</p>
          <p className="text-xs text-gray-600"><span className="font-bold text-blue-600">Sell:</span> "Sold 2 kg sugar for 100"</p>
          <p className="text-xs text-gray-600"><span className="font-bold text-purple-600">Check:</span> "How much sugar is left?"</p>
        </div>
      </div>

      {/* Out of stock */}
      {outOfStock.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-red-500">Out of Stock</p>
          <div className="space-y-2">
            {outOfStock.map(item => (
              <StockCard key={item.id} item={item} variant="out" />
            ))}
          </div>
        </div>
      )}

      {/* Low stock */}
      {lowStockItems.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-orange-500">Low Stock</p>
          <div className="space-y-2">
            {lowStockItems.map(item => (
              <StockCard key={item.id} item={item} variant="low" />
            ))}
          </div>
        </div>
      )}

      {/* In stock */}
      {inStock.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-gray-400">In Stock</p>
          <div className="space-y-2">
            {inStock.map(item => (
              <StockCard key={item.id} item={item} variant="ok" />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {items.length === 0 && !error && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Package size={40} className="text-gray-200" />
          <p className="font-black text-gray-300">No inventory yet</p>
          <p className="text-xs text-gray-400">Say "Added 50 kg sugar" to get started</p>
        </div>
      )}

    </div>
  )
}

// ── Stock card sub-component ─────────────────────────────────────────────────
function StockCard({ item, variant }: { item: InventoryItem; variant: 'ok' | 'low' | 'out' }) {
  const updatedAt = item.updated_at
    ? new Date(item.updated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    : ''

  const bgColor = variant === 'out' ? 'bg-red-50 border-red-100'
    : variant === 'low' ? 'bg-orange-50 border-orange-100'
    : 'bg-white border-gray-100'

  const qtyColor = variant === 'out' ? 'text-red-600'
    : variant === 'low' ? 'text-orange-600'
    : 'text-gray-900'

  return (
    <div className={`flex items-center justify-between rounded-2xl border px-4 py-3 ${bgColor}`}>
      <div className="flex items-center gap-3">
        <div className={`rounded-xl p-2 ${variant === 'out' ? 'bg-red-100' : variant === 'low' ? 'bg-orange-100' : 'bg-gray-100'}`}>
          {variant === 'out' || variant === 'low'
            ? <TrendingDown size={16} className={variant === 'out' ? 'text-red-500' : 'text-orange-500'} />
            : <Package size={16} className="text-gray-500" />
          }
        </div>
        <div>
          <p className="font-black capitalize text-gray-900">{item.item_name}</p>
          {updatedAt && <p className="text-[10px] text-gray-400">Updated {updatedAt}</p>}
        </div>
      </div>
      <div className="text-right">
        <p className={`text-lg font-black ${qtyColor}`}>
          {item.quantity <= 0 ? 'OUT' : item.quantity}
        </p>
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{item.unit}</p>
      </div>
    </div>
  )
}