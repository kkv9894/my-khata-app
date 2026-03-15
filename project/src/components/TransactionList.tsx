// TransactionForm.tsx — ZivaKhata
// FIXES: dark mode colours (white text on white bg), premium navy theme applied

import { useState } from 'react'
import { Save, Volume2, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { SupportedLanguage, TransactionType } from '../lib/types'
import { useAuth } from '../contexts/AuthContext'
import { useRole } from '../contexts/RoleContext'

interface TransactionFormData {
  amount: string
  description: string
  type: TransactionType
  voice_transcript: string
}

interface TransactionFormProps {
  initialData: TransactionFormData
  onClose: () => void
  language?: SupportedLanguage
}

const translations: Record<SupportedLanguage, Record<string, string>> = {
  en: { title: 'New Transaction', expense: 'Expense', income: 'Income', amount: 'AMOUNT (INR)', desc: 'DESCRIPTION', placeholder: 'Details...', save: 'Save', saving: 'Saving...', msg: 'recorded successfully' },
  hi: { title: 'New Transaction', expense: 'Expense', income: 'Income', amount: 'AMOUNT (INR)', desc: 'DESCRIPTION', placeholder: 'Details...', save: 'Save', saving: 'Saving...', msg: 'recorded successfully' },
  ta: { title: 'New Transaction', expense: 'Expense', income: 'Income', amount: 'AMOUNT (INR)', desc: 'DESCRIPTION', placeholder: 'Details...', save: 'Save', saving: 'Saving...', msg: 'recorded successfully' },
  te: { title: 'New Transaction', expense: 'Expense', income: 'Income', amount: 'AMOUNT (INR)', desc: 'DESCRIPTION', placeholder: 'Details...', save: 'Save', saving: 'Saving...', msg: 'recorded successfully' },
  kn: { title: 'New Transaction', expense: 'Expense', income: 'Income', amount: 'AMOUNT (INR)', desc: 'DESCRIPTION', placeholder: 'Details...', save: 'Save', saving: 'Saving...', msg: 'recorded successfully' },
  ml: { title: 'New Transaction', expense: 'Expense', income: 'Income', amount: 'AMOUNT (INR)', desc: 'DESCRIPTION', placeholder: 'Details...', save: 'Save', saving: 'Saving...', msg: 'recorded successfully' },
}

const langMap: Record<SupportedLanguage, string> = {
  en: 'en-IN', hi: 'hi-IN', ta: 'ta-IN', te: 'te-IN', kn: 'kn-IN', ml: 'ml-IN',
}

export default function TransactionForm({
  initialData,
  onClose,
  language = 'en',
}: TransactionFormProps) {
  const { user } = useAuth()
  const { effectiveUserId } = useRole()

  const [amount, setAmount]     = useState(initialData.amount || '')
  const [description, setDescription] = useState(initialData.description || '')
  const [type, setType]         = useState<TransactionType>(initialData.type || 'expense')
  const [isSaving, setIsSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const t = translations[language]

  const speakConfirmation = (text: string) => {
    if (!window.speechSynthesis) return
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = langMap[language]
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMsg(null)

    if (!user || !effectiveUserId) {
      setErrorMsg('Please log in first.')
      return
    }

    const parsedAmount    = parseFloat(amount)
    const cleanDescription = description.trim()

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setErrorMsg('Please enter a valid amount greater than 0.')
      return
    }
    if (!cleanDescription) {
      setErrorMsg('Please enter a description.')
      return
    }

    setIsSaving(true)

    try {
      const createdAt = new Date().toISOString()

      const { error } = await supabase.from('transactions').insert([{
        amount:           parsedAmount,
        description:      cleanDescription,
        type,
        user_id:          effectiveUserId,
        voice_transcript: initialData.voice_transcript || null,
        transaction_date: createdAt.split('T')[0],
        created_at:       createdAt,
      }])

      if (error) {
        // Show inline error — no browser alert()
        setErrorMsg(`Save failed: ${error.message}`)
        console.error('[TransactionForm] Supabase error:', error)
        return
      }

      speakConfirmation(`${type === 'income' ? t.income : t.expense} ${parsedAmount} ${t.msg}`)
      onClose()
    } catch (err) {
      console.error('[TransactionForm] Unexpected error:', err)
      setErrorMsg('Something went wrong. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    // ── Backdrop ────────────────────────────────────────────────────────────
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4">

      {/* ── Modal card — navy dark theme ─────────────────────────────────── */}
      <div className="w-full max-w-lg overflow-hidden rounded-t-[2.5rem] shadow-2xl sm:rounded-[2.5rem]"
           style={{ background: 'linear-gradient(145deg, #0f1f3d 0%, #0a1628 100%)', border: '1px solid rgba(0,229,255,0.15)' }}>

        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between p-8"
             style={{ borderBottom: '1px solid rgba(0,229,255,0.1)' }}>
          <div>
            <h2 className="text-2xl font-black tracking-tight text-white">
              {t.title}
            </h2>
            <div className="mt-1 flex items-center gap-1" style={{ color: '#00e5ff' }}>
              <Volume2 size={14} />
              <span className="text-[10px] font-bold uppercase tracking-widest">
                Voice feedback enabled
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-3 transition-all hover:bg-white/10"
            style={{ background: 'rgba(255,255,255,0.08)' }}
          >
            <X className="h-6 w-6 text-white" />
          </button>
        </div>

        {/* ── Form ─────────────────────────────────────────────────────── */}
        <form onSubmit={handleSubmit} className="space-y-6 p-8">

          {/* Expense / Income toggle */}
          <div className="flex gap-3 rounded-2xl p-2"
               style={{ background: 'rgba(255,255,255,0.06)' }}>
            <button
              type="button"
              onClick={() => setType('expense')}
              className={`flex-1 rounded-xl py-4 font-black transition-all ${
                type === 'expense'
                  ? 'bg-red-500 text-white shadow-lg'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {t.expense}
            </button>
            <button
              type="button"
              onClick={() => setType('income')}
              className={`flex-1 rounded-xl py-4 font-black transition-all ${
                type === 'income'
                  ? 'bg-green-500 text-white shadow-lg'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {t.income}
            </button>
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <label className="ml-2 text-[10px] font-black uppercase tracking-widest"
                   style={{ color: '#00e5ff' }}>
              {t.amount}
            </label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-2xl px-6 py-5 text-4xl font-black outline-none transition-all"
              style={{
                background: 'rgba(255,255,255,0.07)',
                border: '2px solid rgba(0,229,255,0.2)',
                color: '#ffffff',
              }}
              placeholder="0"
              required
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <label className="ml-2 text-[10px] font-black uppercase tracking-widest"
                   style={{ color: '#00e5ff' }}>
              {t.desc}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[120px] w-full rounded-2xl px-6 py-5 font-bold outline-none transition-all resize-none"
              style={{
                background: 'rgba(255,255,255,0.07)',
                border: '2px solid rgba(0,229,255,0.2)',
                color: '#ffffff',
              }}
              placeholder={t.placeholder}
              required
            />
          </div>

          {/* Inline error — replaces browser alert() */}
          {errorMsg && (
            <div className="rounded-xl px-4 py-3 text-sm font-bold"
                 style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', color: '#fca5a5' }}>
              ⚠️ {errorMsg}
            </div>
          )}

          {/* Save button */}
          <button
            type="submit"
            disabled={isSaving}
            className={`flex w-full items-center justify-center gap-3 rounded-2xl py-6 text-xl font-black shadow-2xl transition-all active:scale-95 ${
              isSaving ? 'opacity-50 cursor-not-allowed' : ''
            }`}
            style={{
              background: isSaving
                ? 'rgba(0,229,255,0.3)'
                : 'linear-gradient(135deg, #00e5ff 0%, #0066ff 100%)',
              color: '#0a1628',
            }}
          >
            {isSaving ? (
              <span className="text-white">{t.saving}</span>
            ) : (
              <>
                <Save size={24} />
                {t.save}
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}