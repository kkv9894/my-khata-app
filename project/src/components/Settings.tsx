import { useEffect, useState, type ReactNode } from 'react'
import {
  Bell,
  BellOff,
  ChevronDown,
  ChevronRight,
  Check,
  Cpu,
  Download,
  Globe,
  HelpCircle,
  Loader2,
  LogOut,
  Save,
  Shield,
  Smartphone,
  Trash2,
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
  { code: 'hi', label: 'Hindi', native: 'हिंदी' },
  { code: 'ta', label: 'Tamil', native: 'தமிழ்' },
  { code: 'te', label: 'Telugu', native: 'తెలుగు' },
  { code: 'kn', label: 'Kannada', native: 'ಕನ್ನಡ' },
  { code: 'ml', label: 'Malayalam', native: 'മലയാളം' },
]

const PRIVACY_POINTS = [
  'Your transactions stay linked to your own account email.',
  'Voice and receipt inputs are processed only to create ledger entries and insights.',
  'We use third-party AI providers through official APIs for speech and language understanding.',
  'We do not sell your personal financial data.',
  'You can export your ledger at any time as CSV from Settings.',
]

interface Props {
  language: Lang
  setLanguage: (language: Lang) => void
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
  accountType,
  onClose,
  onSaved,
}: {
  user: SupabaseUser | null
  accountType: AccountType
  onClose: () => void
  onSaved: () => void
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
      const { error: authError } = await supabase.auth.updateUser({ data: payload })
      if (authError) throw authError
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
    <ModalShell title="Edit Profile" onClose={onClose}>
      <div className="space-y-3">
        <StaticField label="Email" value={user?.email ?? '-'} />
        <InputField label="Your Name" value={name} onChange={setName} placeholder="Enter your name" />
        {accountType === 'business' && (
          <InputField label="Shop or Business Name" value={shop} onChange={setShop} placeholder="Enter shop name" />
        )}
        {err && <p className="rounded-xl bg-red-900/30 px-3 py-2 text-xs font-bold text-red-400">{err}</p>}
        <PrimaryButton onClick={() => void save()} disabled={saving}>
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {saving ? 'Saving...' : 'Save Changes'}
        </PrimaryButton>
      </div>
    </ModalShell>
  )
}

function AppInfoModal({ brandName, onClose }: { brandName: string; onClose: () => void }) {
  const rows = [
    ['App Name', brandName],
    ['Version', '1.0.0'],
    ['Build', '2026.04'],
    ['Platform', 'Progressive Web App (PWA)'],
    ['Database', 'Supabase (PostgreSQL)'],
    ['Voice AI', 'Sarvam AI · Chirp · Gemini'],
    ['Language AI', 'Google Gemini 2.5 Flash'],
  ]

  return (
    <ModalShell title="App Info" onClose={onClose}>
      <div className="space-y-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between rounded-2xl bg-navy-900 px-4 py-3">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</span>
            <span className="max-w-[55%] text-right text-sm font-bold text-white">{value}</span>
          </div>
        ))}
      </div>
    </ModalShell>
  )
}

function HelpModal({ onClose }: { onClose: () => void }) {
  const faqs = [
    ['How do I add a transaction?', 'Tap the mic and speak. Voice is the primary input of the app.'],
    ['Why is install not showing?', 'The app needs a valid manifest, icon files, and service worker support. This build now includes them.'],
    ['Can I switch account type later?', 'No. Account type is chosen during signup and remains fixed for that account.'],
  ]

  return (
    <ModalShell title="Help and Support" onClose={onClose}>
      <div className="space-y-3">
        {faqs.map(([question, answer]) => (
          <div key={question} className="rounded-2xl bg-navy-900 p-4">
            <p className="text-sm font-black text-white">{question}</p>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">{answer}</p>
          </div>
        ))}
      </div>
    </ModalShell>
  )
}

function PolicyModal({ onClose }: { onClose: () => void }) {
  return (
    <ModalShell title="Privacy Policy" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Last updated: 18 April 2026</p>
        {PRIVACY_POINTS.map(point => (
          <div key={point} className="rounded-2xl bg-navy-900 p-4 text-sm leading-relaxed text-slate-300">
            {point}
          </div>
        ))}
      </div>
    </ModalShell>
  )
}

async function exportCSV(userId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('transactions')
      .select('transaction_date, created_at, type, amount, description, category_label')
      .eq('user_id', userId)
      .order('transaction_date', { ascending: false })
      .limit(5000)

    if (error) throw error
    if (!data || data.length === 0) return 'No transactions found to export.'

    const header = 'Date,Time,Type,Amount (INR),Description,Category\n'
    const rows = data
      .map(row => {
        const time = row.created_at
          ? new Date(row.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
          : ''
        return `"${row.transaction_date ?? ''}","${time}","${row.type}","${row.amount}","${String(row.description ?? '').replace(/"/g, '""')}","${row.category_label ?? 'General'}"`
      })
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

  const [modal, setModal] = useState<'profile' | 'info' | 'help' | 'policy' | null>(null)
  const [langOpen, setLangOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [deletingAccount, setDeletingAccount] = useState(false)
  const [notifOn, setNotifOn] = useState(() => localStorage.getItem('khata_notif') !== 'off')

  useEffect(() => {
    localStorage.setItem('khata_notif', notifOn ? 'on' : 'off')
  }, [notifOn])

  const accountType = (user?.user_metadata?.account_type ?? 'personal') as AccountType
  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'
  const currentLang = LANGUAGES.find(item => item.code === language) ?? LANGUAGES[0]

  const handleExport = async () => {
    setExporting(true)
    const error = await exportCSV(user?.id ?? '')
    setExporting(false)
    showToast(error ?? 'Ledger exported')
  }

  const handleDeleteAccount = async () => {
    if (!user) return

    const confirmed = window.confirm(
      'Delete this account permanently? This will remove your profile, ledger, and related data from Supabase.'
    )
    if (!confirmed) return

    setDeletingAccount(true)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session?.access_token) {
        throw new Error('Your session expired. Please log in again and retry.')
      }

      const response = await fetch('/api/delete-account', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      })

      const result = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) {
        throw new Error(result.error || 'Failed to delete account')
      }

      localStorage.removeItem('khata_notif')
      localStorage.removeItem('khata_offline_queue')
      localStorage.removeItem('appLanguage')
      sessionStorage.clear()
      await supabase.auth.signOut()
      window.location.reload()
    } catch (error: unknown) {
      showToast(getErrorMessage(error, 'Failed to delete account'))
      setDeletingAccount(false)
    }
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
      {modal === 'info' && <AppInfoModal brandName={brandName} onClose={() => setModal(null)} />}
      {modal === 'help' && <HelpModal onClose={() => setModal(null)} />}
      {modal === 'policy' && <PolicyModal onClose={() => setModal(null)} />}

      <button
        onClick={() => setModal('profile')}
        className="mx-4 mt-4 rounded-3xl bg-black p-5 text-left text-white shadow-2xl transition-transform active:scale-[0.98]"
      >
        <div className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-white/40">{brandName}</div>
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-navy-800/15 text-2xl font-black">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-black">{displayName}</p>
            <p className="truncate text-[11px] text-white/50">{user?.email}</p>
            <div className="mt-1 flex items-center gap-2">
              <span className="rounded-full bg-navy-800/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-white/60">
                {accountType}
              </span>
            </div>
          </div>
          <ChevronRight size={16} className="shrink-0 text-white/30" />
        </div>
        <div className="mt-3 border-t border-white/10 pt-3">
          {accountType === 'business' ? (
            <>
              <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Shop</p>
              <p className="text-sm font-black text-white/80">{shopName || 'Tap to add a shop name'}</p>
            </>
          ) : (
            <p className="text-[10px] text-white/40">Personal voice-first ledger</p>
          )}
        </div>
      </button>

      <Section label="Preferences">
        <button
          onClick={() => setLangOpen(value => !value)}
          className="flex w-full items-center gap-4 px-4 py-4 transition-colors active:bg-navy-900"
        >
          <Ico bg="bg-blue-50"><Globe size={16} className="text-blue-500" /></Ico>
          <span className="flex-1 text-left text-sm font-bold text-white">Language</span>
          <span className="mr-1 text-xs font-bold text-slate-400">{currentLang.native}</span>
          <ChevronDown size={14} className="text-slate-500" />
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
        <div className="flex w-full items-center gap-4 px-4 py-4">
          <Ico bg="bg-purple-50"><User size={16} className="text-purple-500" /></Ico>
          <div className="flex-1 text-left">
            <p className="text-sm font-bold text-white">Account Type</p>
            <p className="text-[10px] text-slate-400">Chosen during signup and cannot be changed later.</p>
          </div>
          <span className="rounded-full bg-navy-900 px-3 py-1 text-[10px] font-black uppercase text-slate-300">{accountType}</span>
        </div>
      </Section>

      <Section label="Notifications">
        <div className="flex w-full items-center justify-between gap-3 px-4 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <Ico bg={notifOn ? 'bg-orange-50' : 'bg-navy-700'}>
              {notifOn ? <Bell size={16} className="text-orange-500" /> : <BellOff size={16} className="text-slate-400" />}
            </Ico>
            <div className="min-w-0">
              <p className="text-sm font-bold text-white">Push Notifications</p>
              <p className="truncate text-[10px] text-slate-400">{notifOn ? 'Low stock and daily summary on' : 'All notifications off'}</p>
            </div>
          </div>
          <button
            onClick={() => {
              setNotifOn(value => !value)
              showToast(notifOn ? 'Notifications off' : 'Notifications on')
            }}
            className={`relative h-7 w-12 shrink-0 rounded-full px-1 transition-colors duration-200 ${notifOn ? 'bg-cyan' : 'bg-navy-600'}`}
            aria-pressed={notifOn}
          >
            <span
              className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-200 ${notifOn ? 'left-6' : 'left-1'}`}
            />
          </button>
        </div>
      </Section>

      <Section label="Data">
        <button onClick={() => !exporting && void handleExport()} className="flex w-full items-center gap-4 px-4 py-4 transition-colors active:bg-navy-900">
          <Ico bg="bg-green-50">{exporting ? <Loader2 size={16} className="animate-spin text-green-500" /> : <Download size={16} className="text-green-500" />}</Ico>
          <span className="flex-1 text-left text-sm font-bold text-white">{exporting ? 'Exporting...' : 'Download Ledger as CSV'}</span>
          <ChevronRight size={14} className="text-slate-500" />
        </button>
      </Section>

      <Section label="About">
        <RowButton icon={<Smartphone size={16} className="text-slate-400" />} bg="bg-navy-700" label="App Version" onClick={() => setModal('info')} />
        <Div />
        <RowButton icon={<HelpCircle size={16} className="text-blue-500" />} bg="bg-blue-50" label="Help and Support" onClick={() => setModal('help')} />
        <Div />
        <RowButton icon={<Cpu size={16} className="text-indigo-500" />} bg="bg-indigo-50" label="AI and Attributions" onClick={() => setModal('info')} />
        <Div />
        <RowButton icon={<Shield size={16} className="text-green-500" />} bg="bg-green-50" label="Privacy Policy" onClick={() => setModal('policy')} />
      </Section>

      <Section label="Account">
        <RowButton icon={<User size={16} className="text-indigo-500" />} bg="bg-indigo-50" label="Edit Profile" onClick={() => setModal('profile')} />
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
          <Ico bg="bg-red-950">{signingOut ? <Loader2 size={16} className="animate-spin text-red-400" /> : <LogOut size={16} className="text-red-500" />}</Ico>
          <span className="flex-1 text-left text-sm font-black text-red-400">{signingOut ? 'Signing out...' : 'Sign Out'}</span>
        </button>
        <Div />
        <button
          onClick={() => void handleDeleteAccount()}
          disabled={deletingAccount}
          className="flex w-full items-center gap-4 px-4 py-4 transition-colors active:bg-red-950 disabled:opacity-50"
        >
          <Ico bg="bg-red-950">
            {deletingAccount ? <Loader2 size={16} className="animate-spin text-red-400" /> : <Trash2 size={16} className="text-red-500" />}
          </Ico>
          <div className="flex-1 text-left">
            <p className="text-sm font-black text-red-400">{deletingAccount ? 'Deleting account...' : 'Delete Account'}</p>
            <p className="text-[10px] text-slate-400">Permanently removes this account and linked Supabase data.</p>
          </div>
        </button>
      </Section>

      <div className="mt-8 px-4 pb-4 text-center">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">v1.0.0 · Copyright 2026 {brandName}</p>
      </div>
    </div>
  )
}

function ModalShell({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[300] flex items-end justify-center bg-black/50" onClick={event => event.target === event.currentTarget && onClose()}>
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-navy-800 p-6 pb-12 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-black text-white">{title}</h2>
          <button onClick={onClose} className="rounded-full bg-navy-700 p-2 active:bg-navy-600"><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function StaticField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <div className="rounded-2xl bg-navy-700 px-4 py-3 text-sm font-bold text-slate-400">{value}</div>
    </div>
  )
}

function InputField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <input value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} className="w-full rounded-2xl border-2 border-transparent bg-navy-900 px-4 py-3 text-sm font-bold text-white outline-none focus:border-cyan" />
    </div>
  )
}

function PrimaryButton({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan py-4 text-sm font-black text-navy-950 transition-transform active:scale-95 disabled:opacity-60">
      {children}
    </button>
  )
}

function RowButton({ icon, bg, label, onClick }: { icon: ReactNode; bg: string; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-4 px-4 py-4 transition-colors active:bg-navy-900">
      <Ico bg={bg}>{icon}</Ico>
      <span className="flex-1 text-left text-sm font-bold text-white">{label}</span>
      <ChevronRight size={14} className="text-slate-500" />
    </button>
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
