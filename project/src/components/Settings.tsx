import { useEffect, useState, type ReactNode } from 'react'
import {
  Bell,
  BellOff,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Cpu,
  Download,
  Globe,
  HelpCircle,
  Loader2,
  LogOut,
  Save,
  Shield,
  Smartphone,
  User,
  X,
} from 'lucide-react'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useRole } from '../contexts/RoleContext'
import { getBrandName } from '../lib/brand'

type Lang = 'en' | 'hi' | 'ta' | 'te' | 'kn' | 'ml'
type AccountType = 'personal' | 'business'

const LANGUAGES: { code: Lang; label: string; native: string }[] = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'hi', label: 'Hindi', native: 'Hindi' },
  { code: 'ta', label: 'Tamil', native: 'Tamil' },
  { code: 'te', label: 'Telugu', native: 'Telugu' },
  { code: 'kn', label: 'Kannada', native: 'Kannada' },
  { code: 'ml', label: 'Malayalam', native: 'Malayalam' },
]

interface Props {
  language: Lang
  setLanguage: (l: Lang) => void
}

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback

function useToast() {
  const [msg, setMsg] = useState('')
  const show = (message: string) => {
    setMsg(message)
    window.setTimeout(() => setMsg(''), 3000)
  }
  return { msg, show }
}

function ProfileModal({
  user,
  onClose,
  onSaved,
  accountType,
}: {
  user: SupabaseUser | null
  onClose: () => void
  onSaved: () => void
  accountType: AccountType
}) {
  const [name, setName] = useState<string>(user?.user_metadata?.full_name ?? '')
  const [shop, setShop] = useState<string>(user?.user_metadata?.shop_name ?? '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const save = async () => {
    if (!name.trim()) {
      setErr('Name cannot be empty')
      return
    }

    setSaving(true)
    setErr('')

    try {
      const payload = {
        full_name: name.trim(),
        shop_name: accountType === 'business' ? shop.trim() : '',
      }

      const { error: authErr } = await supabase.auth.updateUser({ data: payload })
      if (authErr) throw authErr

      if (user?.id) {
        await supabase.from('profiles').update(payload).eq('id', user.id)
      }

      onSaved()
      onClose()
    } catch (error: unknown) {
      setErr(getErrorMessage(error, 'Save failed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[300] flex items-end justify-center bg-black/50"
      onClick={event => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-lg rounded-t-3xl bg-navy-800 p-6 pb-12 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-black text-white">Edit Profile</h2>
          <button onClick={onClose} className="rounded-full bg-navy-700 p-2 active:bg-navy-600">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
              Email
            </p>
            <div className="rounded-2xl bg-navy-700 px-4 py-3 text-sm font-bold text-slate-400">
              {user?.email ?? '-'}
            </div>
          </div>

          <div>
            <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
              Your Name
            </p>
            <input
              value={name}
              onChange={event => setName(event.target.value)}
              placeholder="Enter your name"
              className="w-full rounded-2xl border-2 border-transparent bg-navy-900 px-4 py-3 text-sm font-bold text-white outline-none focus:border-cyan"
            />
          </div>

          {accountType === 'business' && (
            <div>
              <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
                Shop or Business Name
              </p>
              <input
                value={shop}
                onChange={event => setShop(event.target.value)}
                placeholder="Enter shop name"
                className="w-full rounded-2xl border-2 border-transparent bg-navy-900 px-4 py-3 text-sm font-bold text-white outline-none focus:border-cyan"
              />
            </div>
          )}

          {err && (
            <p className="rounded-xl bg-red-900/30 px-3 py-2 text-xs font-bold text-red-400">{err}</p>
          )}

          <button
            onClick={() => void save()}
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan py-4 text-sm font-black text-navy-950 transition-transform active:scale-95 disabled:opacity-60"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AppVersionModal({ onClose, brandName }: { onClose: () => void; brandName: string }) {
  const rows = [
    ['App Name', brandName],
    ['Version', '1.0.0'],
    ['Build', '2026.03'],
    ['Platform', 'Progressive Web App (PWA)'],
    ['Database', 'Supabase (PostgreSQL)'],
    ['Hosted on', 'Vercel Edge Network'],
    ['Voice AI', 'Sarvam AI · Google STT · ElevenLabs'],
    ['Language AI', 'Google Gemini 1.5 Pro'],
    ['Developer', `Copyright 2026 ${brandName}`],
  ]

  return (
    <div
      className="fixed inset-0 z-[300] flex items-end justify-center bg-black/50"
      onClick={event => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-lg rounded-t-3xl bg-navy-800 p-6 pb-12 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-black text-white">App Info</h2>
          <button onClick={onClose} className="rounded-full bg-navy-700 p-2 active:bg-navy-600">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-2">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between rounded-2xl bg-navy-900 px-4 py-3">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</span>
              <span className="max-w-[55%] text-right text-sm font-bold text-white">{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const FAQ_ITEMS = [
  {
    q: 'How do I add a transaction?',
    a: 'Tap the mic and speak. Say things like "rice 50 bought" or "salary 2000 received". Voice is the main input of the app.',
  },
  {
    q: 'Why is my voice not working?',
    a: 'Allow microphone permission in your browser. On mobile Chrome, open site settings and enable microphone access for this app.',
  },
  {
    q: 'What languages are supported?',
    a: 'English, Hindi, Tamil, Telugu, Kannada, and Malayalam are supported, including mixed speech patterns like Hinglish and Tanglish.',
  },
  {
    q: 'Can personal users use this app?',
    a: 'Yes. Personal mode is for daily income, expense, and savings tracking. Business mode adds shop tools like inventory, staff, and deeper insights.',
  },
  {
    q: 'How do I export my data?',
    a: 'Open Settings and tap "Download Ledger as CSV". Your transaction history downloads as a spreadsheet.',
  },
]

function HelpModal({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState<number | null>(null)

  return (
    <div
      className="fixed inset-0 z-[300] flex items-end justify-center bg-black/50"
      onClick={event => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-navy-800 p-6 pb-12 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-black text-white">Help and Support</h2>
          <button onClick={onClose} className="rounded-full bg-navy-700 p-2 active:bg-navy-600">
            <X size={16} />
          </button>
        </div>

        <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-400">
          Frequently Asked Questions
        </p>

        <div className="space-y-2">
          {FAQ_ITEMS.map((item, index) => (
            <div key={item.q} className="overflow-hidden rounded-2xl border border-navy-600">
              <button
                onClick={() => setOpen(open === index ? null : index)}
                className="flex w-full items-center justify-between px-4 py-3 text-left active:bg-navy-900"
              >
                <span className="pr-3 text-sm font-bold text-white">{item.q}</span>
                {open === index ? (
                  <ChevronUp size={16} className="shrink-0 text-slate-400" />
                ) : (
                  <ChevronDown size={16} className="shrink-0 text-slate-400" />
                )}
              </button>

              {open === index && (
                <div className="border-t border-navy-600 px-4 pb-4 pt-2">
                  <p className="text-sm leading-relaxed text-slate-400">{item.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-2xl bg-black p-4 text-center">
          <p className="mb-1 text-xs text-white/60">Still need help?</p>
          <a href="mailto:support@mykhata.app" className="text-sm font-black text-white">
            support@mykhata.app
          </a>
        </div>
      </div>
    </div>
  )
}

const AI_ITEMS = [
  {
    title: 'Language AI',
    name: 'Google Gemini 1.5 Pro',
    desc: 'Used for voice-to-transaction parsing, assistant answers, receipt scanning, and insights.',
    copy: 'Google AI APIs are used under their published terms.',
  },
  {
    title: 'Voice Recognition',
    name: 'Sarvam AI and Google STT',
    desc: 'Used to turn spoken input into text. Voice is the core interaction layer of the app.',
    copy: 'Voice services are used through official APIs.',
  },
  {
    title: 'Text to Speech',
    name: 'ElevenLabs and Web Speech API',
    desc: 'Used for spoken confirmations and alerts so users can stay hands-free.',
    copy: 'Speech services are used under their respective platform terms.',
  },
  {
    title: 'Database and Auth',
    name: 'Supabase',
    desc: 'Stores transactions, profile data, and account access securely with row-level security.',
    copy: 'Supabase is used under its published terms.',
  },
]

function AiCopyrightModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[300] flex items-end justify-center bg-black/50"
      onClick={event => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-navy-800 p-6 pb-12 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-black text-white">AI and Attributions</h2>
          <button onClick={onClose} className="rounded-full bg-navy-700 p-2 active:bg-navy-600">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          {AI_ITEMS.map(item => (
            <div key={item.title} className="rounded-2xl bg-navy-900 p-4">
              <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
                {item.title}
              </p>
              <p className="text-sm font-black text-white">{item.name}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">{item.desc}</p>
              <p className="mt-2 text-[10px] text-slate-500">{item.copy}</p>
            </div>
          ))}

          <div className="rounded-2xl border border-navy-600 p-4 text-center">
            <p className="text-xs leading-relaxed text-slate-400">
              ZivaKhata is an independent product. Third-party AI services are used through official APIs,
              and user data is not sold.
            </p>
            <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
              Copyright 2026 ZivaKhata
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

async function exportCSV(userId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('transactions')
      .select('transaction_date, type, amount, description, category_label')
      .eq('user_id', userId)
      .order('transaction_date', { ascending: false })
      .limit(5000)

    if (error) throw error
    if (!data || data.length === 0) return 'No transactions found to export.'

    const header = 'Date,Type,Amount (INR),Description,Category\n'
    const rows = data
      .map(row =>
        `"${row.transaction_date ?? ''}","${row.type}","${row.amount}","${String(row.description ?? '').replace(/"/g, '""')}","${row.category_label ?? 'General'}"`
      )
      .join('\n')

    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' })
    const anchor = document.createElement('a')
    anchor.href = URL.createObjectURL(blob)
    anchor.download = `my-khata-${new Date().toISOString().split('T')[0]}.csv`
    anchor.click()

    return null
  } catch (error: unknown) {
    return getErrorMessage(error, 'Export failed')
  }
}

export default function Settings({ language, setLanguage }: Props) {
  const { user, signOut } = useAuth()
  const { shopName } = useRole()
  const { msg: toast, show: showToast } = useToast()
  const brandName = getBrandName(language)

  const [modal, setModal] = useState<'profile' | 'version' | 'help' | 'ai' | null>(null)
  const [langOpen, setLangOpen] = useState(false)
  const [typeOpen, setTypeOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [notifOn, setNotifOn] = useState(() => localStorage.getItem('khata_notif') !== 'off')

  useEffect(() => {
    localStorage.setItem('khata_notif', notifOn ? 'on' : 'off')
  }, [notifOn])

  const accountType = (user?.user_metadata?.account_type ?? 'personal') as AccountType
  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'
  const uid = user?.id ?? ''
  const maskedUid = uid.length > 8 ? `${uid.slice(0, 4)}...${uid.slice(-4)}` : uid
  const currentLang = LANGUAGES.find(item => item.code === language) ?? LANGUAGES[0]

  const handleAccountType = async (type: AccountType) => {
    setTypeOpen(false)
    if (type === accountType) return

    const updates = {
      account_type: type,
      shop_name: type === 'business' ? user?.user_metadata?.shop_name ?? '' : '',
    }

    const { error: authError } = await supabase.auth.updateUser({ data: updates })
    if (authError) {
      showToast('Failed to update account type')
      return
    }

    if (user?.id) {
      await supabase
        .from('profiles')
        .update({
          shop_name: type === 'business' ? user?.user_metadata?.shop_name ?? '' : '',
        })
        .eq('id', user.id)
    }

    showToast(`Switched to ${type === 'business' ? 'Business' : 'Personal'}`)
    window.setTimeout(() => window.location.reload(), 800)
  }

  const handleExport = async () => {
    setExporting(true)
    const error = await exportCSV(user?.id ?? '')
    setExporting(false)
    showToast(error ?? 'Ledger exported')
  }

  return (
    <div className="flex min-h-full flex-col bg-navy-900 pb-32">
      {toast && (
        <div className="pointer-events-none fixed left-4 right-4 top-20 z-[400] rounded-2xl bg-gray-900 px-4 py-3 text-center text-sm font-bold text-white shadow-2xl">
          {toast}
        </div>
      )}

      {modal === 'profile' && (
        <ProfileModal
          user={user}
          accountType={accountType}
          onClose={() => setModal(null)}
          onSaved={() => showToast('Profile saved')}
        />
      )}
      {modal === 'version' && <AppVersionModal onClose={() => setModal(null)} brandName={brandName} />}
      {modal === 'help' && <HelpModal onClose={() => setModal(null)} />}
      {modal === 'ai' && <AiCopyrightModal onClose={() => setModal(null)} />}

      <button
        onClick={() => setModal('profile')}
        className="mx-4 mt-4 rounded-3xl bg-black p-5 text-left text-white shadow-2xl transition-transform active:scale-[0.98]"
      >
        <div className="mb-3 flex items-center gap-1.5">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">{brandName}</span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-navy-800/15 text-2xl font-black">
            {displayName.charAt(0).toUpperCase()}
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-black">{displayName}</p>
            <p className="truncate text-[11px] text-white/50">{user?.email}</p>
            <div className="mt-1 flex items-center gap-2">
              <span className="rounded-full bg-navy-800/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-white/60">
                {accountType === 'business' ? 'Business' : 'Personal'}
              </span>
              <span className="font-mono text-[9px] text-white/30">ID: {maskedUid}</span>
            </div>
          </div>

          <ChevronRight size={16} className="shrink-0 text-white/30" />
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3">
          {accountType === 'business' ? (
            <>
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Shop</p>
                <p className="text-sm font-black text-white/80">{shopName || 'Tap to add a shop name'}</p>
              </div>
              <p className="text-[10px] text-white/30">Tap to edit</p>
            </>
          ) : (
            <p className="w-full text-right text-[10px] text-white/30">
              Personal ledger with voice-first tracking
            </p>
          )}
        </div>
      </button>

      <Section label="Preferences">
        <button
          onClick={() => {
            setLangOpen(value => !value)
            setTypeOpen(false)
          }}
          className="flex w-full items-center gap-4 px-4 py-4 transition-colors active:bg-navy-900"
        >
          <Ico bg="bg-blue-50">
            <Globe size={16} className="text-blue-500" />
          </Ico>
          <span className="flex-1 text-left text-sm font-bold text-white">Language</span>
          <span className="mr-1 text-xs font-bold text-slate-400">{currentLang.native}</span>
          <ChevronRight size={14} className="text-slate-500" />
        </button>

        {langOpen && (
          <div className="border-t border-navy-700 bg-navy-900 px-4 py-2">
            {LANGUAGES.map(item => (
              <button
                key={item.code}
                onClick={() => {
                  setLanguage(item.code)
                  setLangOpen(false)
                  showToast(`Language: ${item.label}`)
                }}
                className="flex w-full items-center justify-between rounded-xl px-3 py-3 active:bg-navy-800"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-black text-white">{item.native}</span>
                  <span className="text-xs text-slate-400">{item.label}</span>
                </div>
                {language === item.code && <Check size={14} className="text-cyan" />}
              </button>
            ))}
          </div>
        )}

        <Div />

        <button
          onClick={() => {
            setTypeOpen(value => !value)
            setLangOpen(false)
          }}
          className="flex w-full items-center gap-4 px-4 py-4 transition-colors active:bg-navy-900"
        >
          <Ico bg="bg-purple-50">
            <Building2 size={16} className="text-purple-500" />
          </Ico>
          <div className="flex-1 text-left">
            <p className="text-sm font-bold text-white">Account Type</p>
            <p className="text-[10px] text-slate-400">
              Personal for everyday finance. Business for shop tools.
            </p>
          </div>
          <span className="mr-1 text-xs font-bold text-slate-400">
            {accountType === 'business' ? 'Business' : 'Personal'}
          </span>
          {typeOpen ? (
            <ChevronUp size={14} className="text-slate-500" />
          ) : (
            <ChevronDown size={14} className="text-slate-500" />
          )}
        </button>

        {typeOpen && (
          <div className="border-t border-navy-700 bg-navy-900 px-4 py-2">
            <button
              onClick={() => void handleAccountType('personal')}
              className={`mb-2 flex w-full items-center justify-between rounded-xl px-3 py-3 text-left active:bg-navy-800 ${
                accountType === 'personal' ? 'bg-navy-800' : ''
              }`}
            >
              <div>
                <p className="text-sm font-black text-white">Personal</p>
                <p className="text-[10px] text-slate-400">Voice ledger for daily income, expense, and savings</p>
              </div>
              {accountType === 'personal' && <Check size={14} className="text-cyan" />}
            </button>

            <button
              onClick={() => void handleAccountType('business')}
              className={`flex w-full items-center justify-between rounded-xl px-3 py-3 text-left active:bg-navy-800 ${
                accountType === 'business' ? 'bg-navy-800' : ''
              }`}
            >
              <div>
                <p className="text-sm font-black text-white">Business</p>
                <p className="text-[10px] text-slate-400">Adds inventory, staff, reports, and business insights</p>
              </div>
              {accountType === 'business' && <Check size={14} className="text-cyan" />}
            </button>
          </div>
        )}
      </Section>

      <Section label="Notifications">
        <div className="flex w-full items-center justify-between gap-3 px-4 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <Ico bg={notifOn ? 'bg-orange-50' : 'bg-navy-700'}>
              {notifOn ? (
                <Bell size={16} className="text-orange-500" />
              ) : (
                <BellOff size={16} className="text-slate-400" />
              )}
            </Ico>

            <div className="min-w-0">
              <p className="text-sm font-bold text-white">Push Notifications</p>
              <p className="truncate text-[10px] text-slate-400">
                {notifOn ? 'Low stock and daily summary on' : 'All notifications off'}
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              setNotifOn(value => !value)
              showToast(notifOn ? 'Notifications off' : 'Notifications on')
            }}
            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200 ${notifOn ? 'bg-cyan' : 'bg-navy-600'}`}
          >
            <span
              className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${notifOn ? 'translate-x-5' : 'translate-x-1'}`}
            />
          </button>
        </div>
      </Section>

      <Section label="Data">
        <button
          onClick={() => !exporting && void handleExport()}
          className="flex w-full items-center gap-4 px-4 py-4 transition-colors active:bg-navy-900"
        >
          <Ico bg="bg-green-50">
            {exporting ? (
              <Loader2 size={16} className="animate-spin text-green-500" />
            ) : (
              <Download size={16} className="text-green-500" />
            )}
          </Ico>
          <span className="flex-1 text-left text-sm font-bold text-white">
            {exporting ? 'Exporting...' : 'Download Ledger as CSV'}
          </span>
          <ChevronRight size={14} className="text-slate-500" />
        </button>
      </Section>

      <Section label="About">
        <button
          onClick={() => setModal('version')}
          className="flex w-full items-center gap-4 px-4 py-4 transition-colors active:bg-navy-900"
        >
          <Ico bg="bg-navy-700">
            <Smartphone size={16} className="text-slate-400" />
          </Ico>
          <span className="flex-1 text-left text-sm font-bold text-white">App Version</span>
          <span className="mr-1 text-xs font-bold text-slate-400">1.0.0</span>
          <ChevronRight size={14} className="text-slate-500" />
        </button>

        <Div />

        <button
          onClick={() => setModal('help')}
          className="flex w-full items-center gap-4 px-4 py-4 transition-colors active:bg-navy-900"
        >
          <Ico bg="bg-blue-50">
            <HelpCircle size={16} className="text-blue-500" />
          </Ico>
          <span className="flex-1 text-left text-sm font-bold text-white">Help and Support</span>
          <ChevronRight size={14} className="text-slate-500" />
        </button>

        <Div />

        <button
          onClick={() => setModal('ai')}
          className="flex w-full items-center gap-4 px-4 py-4 transition-colors active:bg-navy-900"
        >
          <Ico bg="bg-indigo-50">
            <Cpu size={16} className="text-indigo-500" />
          </Ico>
          <span className="flex-1 text-left text-sm font-bold text-white">AI and Attributions</span>
          <ChevronRight size={14} className="text-slate-500" />
        </button>

        <Div />

        <button
          onClick={() => window.open('mailto:support@mykhata.app?subject=Privacy', '_blank')}
          className="flex w-full items-center gap-4 px-4 py-4 transition-colors active:bg-navy-900"
        >
          <Ico bg="bg-green-50">
            <Shield size={16} className="text-green-500" />
          </Ico>
          <span className="flex-1 text-left text-sm font-bold text-white">Privacy Policy</span>
          <ChevronRight size={14} className="text-slate-500" />
        </button>
      </Section>

      <Section label="Account">
        <button
          onClick={() => setModal('profile')}
          className="flex w-full items-center gap-4 px-4 py-4 transition-colors active:bg-navy-900"
        >
          <Ico bg="bg-indigo-50">
            <User size={16} className="text-indigo-500" />
          </Ico>
          <span className="flex-1 text-left text-sm font-bold text-white">Edit Profile</span>
          <ChevronRight size={14} className="text-slate-500" />
        </button>
      </Section>

      <Section label="Session">
        <button
          onClick={() => {
            if (!signingOut) {
              setSigningOut(true)
              void signOut()
            }
          }}
          disabled={signingOut}
          className="flex w-full items-center gap-4 px-4 py-4 transition-colors active:bg-red-950 disabled:opacity-50"
        >
          <Ico bg="bg-red-950">
            {signingOut ? (
              <Loader2 size={16} className="animate-spin text-red-400" />
            ) : (
              <LogOut size={16} className="text-red-500" />
            )}
          </Ico>
          <span className="flex-1 text-left text-sm font-black text-red-400">
            {signingOut ? 'Signing out...' : 'Sign Out'}
          </span>
        </button>
      </Section>

      <div className="mt-8 px-4 pb-4 text-center">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
          v1.0.0 · Copyright 2026 {brandName}
        </p>
        <p className="mt-1 text-[9px] text-navy-600">Voice-first ledger for personal and business users</p>
      </div>
    </div>
  )
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <p className="mx-6 mb-2 mt-6 text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <div className="mx-4 overflow-hidden rounded-3xl border border-navy-600 bg-navy-800 shadow-sm">{children}</div>
    </>
  )
}

function Div() {
  return <div className="mx-4 h-px bg-navy-900" />
}

function Ico({ bg, children }: { bg: string; children: ReactNode }) {
  return <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${bg}`}>{children}</div>
}
