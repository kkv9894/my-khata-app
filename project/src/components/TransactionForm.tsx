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
  en: {
    title: 'New Transaction',
    expense: 'Expense',
    income: 'Income',
    amount: 'Amount (INR)',
    desc: 'Description',
    placeholder: 'Details...',
    save: 'Save',
    saving: 'Saving...',
    msg: 'recorded successfully',
  },
  hi: {
    title: 'New Transaction',
    expense: 'Expense',
    income: 'Income',
    amount: 'Amount (INR)',
    desc: 'Description',
    placeholder: 'Details...',
    save: 'Save',
    saving: 'Saving...',
    msg: 'recorded successfully',
  },
  ta: {
    title: 'New Transaction',
    expense: 'Expense',
    income: 'Income',
    amount: 'Amount (INR)',
    desc: 'Description',
    placeholder: 'Details...',
    save: 'Save',
    saving: 'Saving...',
    msg: 'recorded successfully',
  },
  te: {
    title: 'New Transaction',
    expense: 'Expense',
    income: 'Income',
    amount: 'Amount (INR)',
    desc: 'Description',
    placeholder: 'Details...',
    save: 'Save',
    saving: 'Saving...',
    msg: 'recorded successfully',
  },
  kn: {
    title: 'New Transaction',
    expense: 'Expense',
    income: 'Income',
    amount: 'Amount (INR)',
    desc: 'Description',
    placeholder: 'Details...',
    save: 'Save',
    saving: 'Saving...',
    msg: 'recorded successfully',
  },
  ml: {
    title: 'New Transaction',
    expense: 'Expense',
    income: 'Income',
    amount: 'Amount (INR)',
    desc: 'Description',
    placeholder: 'Details...',
    save: 'Save',
    saving: 'Saving...',
    msg: 'recorded successfully',
  },
}

const langMap: Record<SupportedLanguage, string> = {
  en: 'en-IN',
  hi: 'hi-IN',
  ta: 'ta-IN',
  te: 'te-IN',
  kn: 'kn-IN',
  ml: 'ml-IN',
}

export default function TransactionForm({
  initialData,
  onClose,
  language = 'en',
}: TransactionFormProps) {
  const { user } = useAuth()
  const { effectiveUserId } = useRole()

  const [amount, setAmount] = useState(initialData.amount || '')
  const [description, setDescription] = useState(initialData.description || '')
  const [type, setType] = useState<TransactionType>(initialData.type || 'expense')
  const [isSaving, setIsSaving] = useState(false)

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

    if (!user || !effectiveUserId) {
      alert('Please log in first.')
      return
    }

    const parsedAmount = parseFloat(amount)
    const cleanDescription = description.trim()

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      alert('Please enter a valid amount greater than 0.')
      return
    }

    if (!cleanDescription) {
      alert('Please enter a valid description.')
      return
    }

    setIsSaving(true)

    try {
      const createdAt = new Date().toISOString()

      const { error } = await supabase.from('transactions').insert([
        {
          amount: parsedAmount,
          description: cleanDescription,
          type,
          user_id: effectiveUserId,
          voice_transcript: initialData.voice_transcript || null,
          transaction_date: createdAt.split('T')[0],
          created_at: createdAt,
        },
      ])

      if (error) {
        alert(`Database error: ${error.message}`)
        return
      }

      const typeLabel = type === 'income' ? t.income : t.expense
      speakConfirmation(`${typeLabel} ${parsedAmount} ${t.msg}`)
      onClose()
    } catch (error) {
      console.error('Transaction save failed:', error)
      alert('Something went wrong while saving the transaction.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-t-[2.5rem] bg-white shadow-2xl sm:rounded-[2.5rem]">
        <div className="flex items-center justify-between border-b bg-gray-50/50 p-8">
          <div>
            <h2 className="text-2xl font-black tracking-tight text-gray-900">
              {t.title}
            </h2>
            <div className="mt-1 flex items-center gap-1 text-gray-500">
              <Volume2 size={14} />
              <span className="text-[10px] font-bold uppercase tracking-widest">
                Voice feedback enabled
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-gray-100 p-3 transition-all hover:bg-gray-200"
          >
            <X className="h-6 w-6 text-gray-600" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 p-8">
          <div className="flex gap-3 rounded-2xl bg-gray-100 p-2">
            <button
              type="button"
              onClick={() => setType('expense')}
              className={`flex-1 rounded-xl py-4 font-black transition-all ${
                type === 'expense'
                  ? 'bg-red-500 text-white shadow-lg'
                  : 'text-gray-400'
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
                  : 'text-gray-400'
              }`}
            >
              {t.income}
            </button>
          </div>

          <div className="space-y-2">
            <label className="ml-2 text-[10px] font-black uppercase tracking-widest text-gray-400">
              {t.amount}
            </label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="w-full rounded-2xl border-2 border-transparent bg-gray-50 px-6 py-5 text-4xl font-black outline-none transition-all focus:border-black"
              placeholder="0"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="ml-2 text-[10px] font-black uppercase tracking-widest text-gray-400">
              {t.desc}
            </label>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="min-h-[120px] w-full rounded-2xl border-2 border-transparent bg-gray-50 px-6 py-5 font-bold outline-none transition-all focus:border-black"
              placeholder={t.placeholder}
              required
            />
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className={`flex w-full items-center justify-center gap-3 rounded-2xl bg-black py-6 text-xl font-black text-white shadow-2xl transition-all active:scale-95 ${
              isSaving ? 'opacity-50' : ''
            }`}
          >
            {isSaving ? (
              t.saving
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