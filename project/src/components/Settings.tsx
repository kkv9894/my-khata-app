// src/components/Settings.tsx
// All settings features: profile edit, notifications toggle, CSV export,
// AI copyright, app version, help & support, language, account type, sign out.
// Uses onPointerDown everywhere for reliable mobile taps.

import { useState, useEffect } from 'react'
import {
  ChevronRight, X, Save, Loader2, Check,
  User, Globe, Building2, LogOut, Download,
  Bell, BellOff, Smartphone, HelpCircle,
  Shield, Cpu, ChevronDown, ChevronUp,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useRole } from '../contexts/RoleContext'
import { getBrandName } from '../lib/brand'

type Lang = 'en' | 'hi' | 'ta' | 'te' | 'kn' | 'ml'

const LANGUAGES: { code: Lang; label: string; native: string }[] = [
  { code: 'en', label: 'English',   native: 'English'  },
  { code: 'hi', label: 'Hindi',     native: 'हिंदी'      },
  { code: 'ta', label: 'Tamil',     native: 'தமிழ்'      },
  { code: 'te', label: 'Telugu',    native: 'తెలుగు'     },
  { code: 'kn', label: 'Kannada',   native: 'ಕನ್ನಡ'      },
  { code: 'ml', label: 'Malayalam', native: 'മലയാളം'    },
]

interface Props {
  language:    Lang
  setLanguage: (l: Lang) => void
}

// ─── Toast hook ───────────────────────────────────────────────────────────────
function useToast() {
  const [msg, setMsg] = useState('')
  const show = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3000) }
  return { msg, show }
}

// ─── Profile Edit Modal ───────────────────────────────────────────────────────
function ProfileModal({ user, onClose, onSaved }: {
  user: any; onClose: () => void; onSaved: () => void
}) {
  const [name,   setName]   = useState<string>(user?.user_metadata?.full_name ?? '')
  const [shop,   setShop]   = useState<string>(user?.user_metadata?.shop_name ?? '')
  const [saving, setSaving] = useState(false)
  const [err,    setErr]    = useState('')

  const save = async () => {
    if (!name.trim()) { setErr('Name cannot be empty'); return }
    setSaving(true); setErr('')
    try {
      const { error: authErr } = await supabase.auth.updateUser({
        data: { full_name: name.trim(), shop_name: shop.trim() },
      })
      if (authErr) throw authErr
      await supabase.from('profiles')
        .update({ full_name: name.trim(), shop_name: shop.trim() })
        .eq('id', user.id)
      onSaved(); onClose()
    } catch (e: any) {
      setErr(e?.message ?? 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-end justify-center bg-black/50"
         onPointerDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-lg rounded-t-3xl bg-navy-800 p-6 pb-12 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-black">Edit Profile</h2>
          <button onPointerDown={onClose} className="rounded-full bg-navy-700 p-2 active:bg-gray-200">
            <X size={16} />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Email (cannot be changed)</p>
            <div className="rounded-2xl bg-navy-700 px-4 py-3 text-sm font-bold text-slate-400">{user?.email ?? '—'}</div>
          </div>
          <div>
            <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Your Name</p>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Enter your name"
              className="w-full rounded-2xl border-2 border-transparent bg-navy-900 px-4 py-3 text-sm font-bold text-white outline-none focus:border-black" />
          </div>
          <div>
            <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Shop / Business Name</p>
            <input value={shop} onChange={e => setShop(e.target.value)} placeholder="Enter shop name"
              className="w-full rounded-2xl border-2 border-transparent bg-navy-900 px-4 py-3 text-sm font-bold text-white outline-none focus:border-black" />
          </div>
          {err && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-500">{err}</p>}
          <button onPointerDown={() => void save()} disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-black py-4 text-sm font-black text-white active:scale-95 transition-transform disabled:opacity-60">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── App Version Modal ────────────────────────────────────────────────────────
function AppVersionModal({ onClose, brandName }: { onClose: () => void; brandName: string }) {
  const rows = [
    ['App Name',     brandName],
    ['Version',      '1.0.0'],
    ['Build',        '2026.03'],
    ['Platform',     'Progressive Web App (PWA)'],
    ['Database',     'Supabase (PostgreSQL)'],
    ['Hosted on',    'Vercel Edge Network'],
    ['Voice AI',     'Sarvam AI · Google STT · ElevenLabs'],
    ['Language AI',  'Google Gemini 1.5 Pro'],
    ['Developer',    `© 2026 ${brandName}`],
  ]
  return (
    <div className="fixed inset-0 z-[300] flex items-end justify-center bg-black/50"
         onPointerDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-lg rounded-t-3xl bg-navy-800 p-6 pb-12 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-black">App Info</h2>
          <button onPointerDown={onClose} className="rounded-full bg-navy-700 p-2 active:bg-gray-200"><X size={16} /></button>
        </div>
        <div className="space-y-2">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between rounded-2xl bg-navy-900 px-4 py-3">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</span>
              <span className="text-sm font-bold text-white text-right max-w-[55%]">{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Help & Support Modal ─────────────────────────────────────────────────────
const FAQ_ITEMS = [
  { q: 'How do I add a transaction?',      a: 'Hold the mic button and speak. Say "rice 50 bought" or "customer paid 200". The AI saves it automatically.' },
  { q: 'Why is my voice not working?',     a: 'Allow microphone permission in your browser. On mobile Chrome: Settings → Site Settings → Microphone → Allow.' },
  { q: 'What languages are supported?',   a: 'English, Hindi, Tamil, Telugu, Kannada, Malayalam. Mixed dialects like Tanglish and Hinglish also work.' },
  { q: 'How does Inventory work?',         a: 'Say "Added 50 kg sugar" to increase stock. Say "Sold 2 kg sugar for 100" to decrease. Ask "How much sugar is left?" to check.' },
  { q: 'How do I export my data?',         a: 'Settings → Export Ledger to CSV. Your full transaction history downloads as a spreadsheet.' },
  { q: 'What is Udhaar (credit)?',         a: 'Track money owed by customers. Go to the Udhaar tab, add a customer, and record how much they owe.' },
  { q: 'Is my data secure?',              a: 'Yes. All data is stored in Supabase with Row Level Security — only you can see your transactions. We never sell your data.' },
]

function HelpModal({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState<number | null>(null)
  return (
    <div className="fixed inset-0 z-[300] flex items-end justify-center bg-black/50"
         onPointerDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-lg rounded-t-3xl bg-navy-800 p-6 pb-12 shadow-2xl max-h-[85vh] overflow-y-auto">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-black">Help & Support</h2>
          <button onPointerDown={onClose} className="rounded-full bg-navy-700 p-2 active:bg-gray-200"><X size={16} /></button>
        </div>
        <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Frequently Asked Questions</p>
        <div className="space-y-2">
          {FAQ_ITEMS.map((item, i) => (
            <div key={i} className="rounded-2xl border border-navy-600 overflow-hidden">
              <button onPointerDown={() => setOpen(open === i ? null : i)}
                className="flex w-full items-center justify-between px-4 py-3 text-left active:bg-navy-900">
                <span className="text-sm font-bold text-white pr-3">{item.q}</span>
                {open === i ? <ChevronUp size={16} className="text-slate-400 shrink-0" /> : <ChevronDown size={16} className="text-slate-400 shrink-0" />}
              </button>
              {open === i && (
                <div className="px-4 pb-4 pt-1 border-t border-gray-50">
                  <p className="text-sm text-slate-400 leading-relaxed">{item.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="mt-6 rounded-2xl bg-black p-4 text-center">
          <p className="text-xs text-white/60 mb-1">Still need help?</p>
          <a href="mailto:support@mykhata.app" className="text-sm font-black text-white">support@mykhata.app</a>
        </div>
      </div>
    </div>
  )
}

// ─── AI Copyright Modal ───────────────────────────────────────────────────────
const AI_ITEMS = [
  {
    title: 'Language AI',
    name:  'Google Gemini 1.5 Pro',
    desc:  'Powers voice-to-transaction parsing, Smart Clerk queries, receipt scanning, and business insights.',
    copy:  '© Google LLC. Used under Google AI API Terms of Service.',
  },
  {
    title: 'Voice Recognition (Primary)',
    name:  'Sarvam AI',
    desc:  'Indian-language Speech-to-Text. Optimised for Hindi, Tamil, Telugu, Kannada, Malayalam and mixed dialects like Tanglish and Hinglish.',
    copy:  '© Sarvam AI. Used under Sarvam API Terms of Service.',
  },
  {
    title: 'Voice Recognition (Fallback)',
    name:  'Google Cloud Speech-to-Text (Chirp)',
    desc:  'Fallback STT provider for broad language and accent coverage.',
    copy:  '© Google LLC. Used under Google Cloud Terms of Service.',
  },
  {
    title: 'Text-to-Speech (Soundbox)',
    name:  'ElevenLabs · Web Speech API',
    desc:  'Speaks transaction confirmations and low-stock alerts aloud.',
    copy:  '© ElevenLabs Inc. Used under ElevenLabs API Terms of Service.',
  },
  {
    title: 'Database & Auth',
    name:  'Supabase',
    desc:  'All transaction data, inventory, and user profiles are stored in Supabase (PostgreSQL). Row Level Security ensures only you can access your data.',
    copy:  '© Supabase Inc. Used under Supabase Terms of Service.',
  },
]

function AiCopyrightModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[300] flex items-end justify-center bg-black/50"
         onPointerDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-lg rounded-t-3xl bg-navy-800 p-6 pb-12 shadow-2xl max-h-[85vh] overflow-y-auto">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-black">AI & Attributions</h2>
          <button onPointerDown={onClose} className="rounded-full bg-navy-700 p-2 active:bg-gray-200"><X size={16} /></button>
        </div>
        <div className="space-y-3">
          {AI_ITEMS.map(item => (
            <div key={item.title} className="rounded-2xl bg-navy-900 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{item.title}</p>
              <p className="text-sm font-black text-white">{item.name}</p>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">{item.desc}</p>
              <p className="text-[10px] text-slate-400 mt-2">{item.copy}</p>
            </div>
          ))}
          <div className="rounded-2xl border border-gray-200 p-4 text-center">
            <p className="text-xs text-slate-400 leading-relaxed">
              ZivaKhata is an independent product. All third-party AI services are used via official APIs under their respective terms. User data is never sold or shared.
            </p>
            <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
              © 2026 ZivaKhata · All rights reserved
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── CSV Export ───────────────────────────────────────────────────────────────
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
    const header = 'Date,Type,Amount (₹),Description,Category\n'
    const rows   = data.map(r =>
      `"${r.transaction_date ?? ''}","${r.type}","${r.amount}","${String(r.description ?? '').replace(/"/g, '""')}","${r.category_label ?? 'General'}"`
    ).join('\n')
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' })
    const a    = document.createElement('a')
    a.href     = URL.createObjectURL(blob)
    a.download = `my-khata-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    return null
  } catch (e: any) { return e?.message ?? 'Export failed' }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Settings({ language, setLanguage }: Props) {
  const { user, signOut } = useAuth()
  const { shopName }      = useRole()
  const { msg: toast, show: showToast } = useToast()

  // ── Derived brand name — updates live when language changes ──────────────────
  const brandName = getBrandName(language)

  const [modal,      setModal]      = useState<'profile' | 'version' | 'help' | 'ai' | null>(null)
  const [langOpen,   setLangOpen]   = useState(false)
  const [typeOpen,   setTypeOpen]   = useState(false)
  const [exporting,  setExporting]  = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [notifOn,    setNotifOn]    = useState(() => localStorage.getItem('khata_notif') !== 'off')

  useEffect(() => { localStorage.setItem('khata_notif', notifOn ? 'on' : 'off') }, [notifOn])

  const accountType = (user?.user_metadata?.account_type ?? 'business') as 'personal' | 'business'
  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'
  const uid         = user?.id ?? ''
  const maskedUid   = uid.length > 8 ? `${uid.slice(0, 4)}...${uid.slice(-4)}` : uid
  const currentLang = LANGUAGES.find(l => l.code === language) ?? LANGUAGES[0]

  const handleAccountType = async (type: 'personal' | 'business') => {
    setTypeOpen(false)
    if (type === accountType) return
    const { error } = await supabase.auth.updateUser({ data: { account_type: type } })
    if (error) { showToast('Failed to update'); return }
    showToast(`Switched to ${type === 'business' ? 'Business 🏪' : 'Personal 👤'}`)
    setTimeout(() => window.location.reload(), 1000)
  }

  const handleExport = async () => {
    setExporting(true)
    const err = await exportCSV(user?.id ?? '')
    setExporting(false)
    showToast(err ?? '✅ Ledger exported!')
  }

  return (
    <div className="flex flex-col pb-32 bg-navy-900 min-h-full">

      {/* Toast */}
      {toast && (
        <div className="fixed top-20 left-4 right-4 z-[400] rounded-2xl bg-gray-900 px-4 py-3 text-center text-sm font-bold text-white shadow-2xl pointer-events-none">
          {toast}
        </div>
      )}

      {/* Modals */}
      {modal === 'profile' && <ProfileModal user={user} onClose={() => setModal(null)} onSaved={() => showToast('✅ Profile saved!')} />}
      {modal === 'version' && <AppVersionModal onClose={() => setModal(null)} brandName={brandName} />}
      {modal === 'help'    && <HelpModal onClose={() => setModal(null)} />}
      {modal === 'ai'      && <AiCopyrightModal onClose={() => setModal(null)} />}

      {/* ── Profile card ───────────────────────────── */}
      <button
        onPointerDown={() => setModal('profile')}
        className="mx-4 mt-4 rounded-3xl bg-black p-5 text-white shadow-2xl active:scale-[0.98] transition-transform text-left"
      >
        {/* Brand badge inside card */}
        <div className="mb-3 flex items-center gap-1.5">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">✨ {brandName}</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-navy-800/15 text-2xl font-black shrink-0">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-black">{displayName}</p>
            <p className="truncate text-[11px] text-white/50">{user?.email}</p>
            <div className="mt-1 flex items-center gap-2">
              <span className="rounded-full bg-navy-800/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-white/60">
                {accountType === 'business' ? '🏪 Business' : '👤 Personal'}
              </span>
              <span className="text-[9px] text-white/30 font-mono">ID: {maskedUid}</span>
            </div>
          </div>
          <ChevronRight size={16} className="text-white/30 shrink-0" />
        </div>
        <div className="mt-3 border-t border-white/10 pt-3 flex items-center justify-between">
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Shop</p>
            <p className="text-sm font-black text-white/80">{shopName}</p>
          </div>
          <p className="text-[10px] text-white/30">Tap to edit →</p>
        </div>
      </button>

      {/* ── Preferences ────────────────────────────── */}
      <Section label="Preferences">
        <button onPointerDown={() => { setLangOpen(v => !v); setTypeOpen(false) }}
          className="flex w-full items-center gap-4 px-4 py-4 active:bg-navy-900 transition-colors">
          <Ico bg="bg-blue-50"><Globe size={16} className="text-blue-500" /></Ico>
          <span className="flex-1 text-left text-sm font-bold text-white">Language</span>
          <span className="text-xs font-bold text-slate-400 mr-1">{currentLang.native}</span>
          <ChevronRight size={14} className="text-slate-500" />
        </button>
        {langOpen && (
          <div className="border-t border-gray-50 bg-navy-900 px-4 py-2">
            {LANGUAGES.map(l => (
              <button key={l.code} onPointerDown={() => { setLanguage(l.code); setLangOpen(false); showToast(`Language: ${l.label}`) }}
                className="flex w-full items-center justify-between rounded-xl px-3 py-3 active:bg-navy-800">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-black text-white">{l.native}</span>
                  <span className="text-xs text-slate-400">{l.label}</span>
                </div>
                {language === l.code && <Check size={14} className="text-black" />}
              </button>
            ))}
          </div>
        )}
        <Div />
        <button onPointerDown={() => { setTypeOpen(v => !v); setLangOpen(false) }}
          className="flex w-full items-center gap-4 px-4 py-4 active:bg-navy-900 transition-colors">
          <Ico bg="bg-purple-50"><Building2 size={16} className="text-purple-500" /></Ico>
          <span className="flex-1 text-left text-sm font-bold text-white">Account Type</span>
          <span className="text-xs font-bold text-slate-400 mr-1">{accountType === 'business' ? 'Business' : 'Personal'}</span>
          <ChevronRight size={14} className="text-slate-500" />
        </button>
        {typeOpen && (
          <div className="border-t border-gray-50 bg-navy-900 px-4 py-2">
            <p className="mb-1 px-3 text-[9px] font-black uppercase tracking-widest text-orange-400">⚠ Changing this reloads the app</p>
            {(['business', 'personal'] as const).map(type => (
              <button key={type} onPointerDown={() => void handleAccountType(type)}
                className="flex w-full items-center justify-between rounded-xl px-3 py-3 active:bg-navy-800">
                <div className="flex items-center gap-3">
                  <span className="text-lg">{type === 'business' ? '🏪' : '👤'}</span>
                  <div className="text-left">
                    <p className="text-sm font-black text-white capitalize">{type}</p>
                    <p className="text-[10px] text-slate-400">{type === 'business' ? 'Inventory + Staff + Insights' : 'Personal expense tracking'}</p>
                  </div>
                </div>
                {accountType === type && <Check size={14} className="text-black" />}
              </button>
            ))}
          </div>
        )}
      </Section>

      {/* ── Notifications ──────────────────────────── */}
      <Section label="Notifications">
        <div className="flex items-center gap-4 px-4 py-4">
          <Ico bg={notifOn ? 'bg-orange-50' : 'bg-navy-700'}>
            {notifOn ? <Bell size={16} className="text-orange-500" /> : <BellOff size={16} className="text-slate-400" />}
          </Ico>
          <div className="flex-1">
            <p className="text-sm font-bold text-white">Push Notifications</p>
            <p className="text-[10px] text-slate-400">{notifOn ? 'Low stock & daily summary on' : 'All notifications off'}</p>
          </div>
          <button
            onPointerDown={() => { setNotifOn(v => !v); showToast(notifOn ? '🔕 Notifications off' : '🔔 Notifications on') }}
            className={`relative h-7 w-12 rounded-full transition-colors ${notifOn ? 'bg-black' : 'bg-gray-200'}`}
          >
            <span className={`absolute top-1 h-5 w-5 rounded-full bg-navy-800 shadow transition-transform ${notifOn ? 'translate-x-5' : 'translate-x-1'}`} />
          </button>
        </div>
      </Section>

      {/* ── Data ───────────────────────────────────── */}
      <Section label="Data">
        <button onPointerDown={() => !exporting && void handleExport()}
          className="flex w-full items-center gap-4 px-4 py-4 active:bg-navy-900 transition-colors">
          <Ico bg="bg-green-50">
            {exporting ? <Loader2 size={16} className="animate-spin text-green-500" /> : <Download size={16} className="text-green-500" />}
          </Ico>
          <span className="flex-1 text-left text-sm font-bold text-white">{exporting ? 'Exporting...' : 'Export Ledger to CSV'}</span>
          <ChevronRight size={14} className="text-slate-500" />
        </button>
      </Section>

      {/* ── About ──────────────────────────────────── */}
      <Section label="About">
        <button onPointerDown={() => setModal('version')}
          className="flex w-full items-center gap-4 px-4 py-4 active:bg-navy-900 transition-colors">
          <Ico bg="bg-navy-700"><Smartphone size={16} className="text-slate-400" /></Ico>
          <span className="flex-1 text-left text-sm font-bold text-white">App Version</span>
          <span className="text-xs font-bold text-slate-400 mr-1">1.0.0</span>
          <ChevronRight size={14} className="text-slate-500" />
        </button>
        <Div />
        <button onPointerDown={() => setModal('help')}
          className="flex w-full items-center gap-4 px-4 py-4 active:bg-navy-900 transition-colors">
          <Ico bg="bg-blue-50"><HelpCircle size={16} className="text-blue-500" /></Ico>
          <span className="flex-1 text-left text-sm font-bold text-white">Help & Support</span>
          <ChevronRight size={14} className="text-slate-500" />
        </button>
        <Div />
        <button onPointerDown={() => setModal('ai')}
          className="flex w-full items-center gap-4 px-4 py-4 active:bg-navy-900 transition-colors">
          <Ico bg="bg-indigo-50"><Cpu size={16} className="text-indigo-500" /></Ico>
          <span className="flex-1 text-left text-sm font-bold text-white">AI & Copyright</span>
          <ChevronRight size={14} className="text-slate-500" />
        </button>
        <Div />
        <button onPointerDown={() => window.open('mailto:support@mykhata.app?subject=Privacy', '_blank')}
          className="flex w-full items-center gap-4 px-4 py-4 active:bg-navy-900 transition-colors">
          <Ico bg="bg-green-50"><Shield size={16} className="text-green-500" /></Ico>
          <span className="flex-1 text-left text-sm font-bold text-white">Privacy Policy</span>
          <ChevronRight size={14} className="text-slate-500" />
        </button>
      </Section>

      {/* ── Account ────────────────────────────────── */}
      <Section label="Account">
        <button onPointerDown={() => setModal('profile')}
          className="flex w-full items-center gap-4 px-4 py-4 active:bg-navy-900 transition-colors">
          <Ico bg="bg-indigo-50"><User size={16} className="text-indigo-500" /></Ico>
          <span className="flex-1 text-left text-sm font-bold text-white">Edit Profile</span>
          <ChevronRight size={14} className="text-slate-500" />
        </button>
      </Section>

      {/* ── Danger Zone ────────────────────────────── */}
      <Section label="Danger Zone">
        <button
          onPointerDown={() => { if (!signingOut) { setSigningOut(true); void signOut() } }}
          disabled={signingOut}
          className="flex w-full items-center gap-4 px-4 py-4 active:bg-red-50 transition-colors disabled:opacity-50"
        >
          <Ico bg="bg-red-50">
            {signingOut ? <Loader2 size={16} className="animate-spin text-red-400" /> : <LogOut size={16} className="text-red-500" />}
          </Ico>
          <span className="flex-1 text-left text-sm font-black text-red-500">
            {signingOut ? 'Signing out...' : 'Sign Out'}
          </span>
        </button>
      </Section>

      {/* ── Footer ─────────────────────────────────── */}
      <div className="mt-8 px-4 pb-4 text-center">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
          Version 1.0.0 · © 2026 {brandName}
        </p>
        <p className="mt-1 text-[9px] text-navy-600">All rights reserved · Powered by Ziva AI</p>
      </div>
    </div>
  )
}

// ─── Layout helpers ───────────────────────────────────────────────────────────
function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <p className="mx-6 mb-2 mt-6 text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <div className="mx-4 overflow-hidden rounded-3xl bg-navy-800 shadow-sm border border-navy-600">{children}</div>
    </>
  )
}
function Div() { return <div className="h-px bg-navy-900 mx-4" /> }
function Ico({ bg, children }: { bg: string; children: React.ReactNode }) {
  return <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${bg}`}>{children}</div>
}