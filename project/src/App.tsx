import { useEffect, useState } from 'react'
import { Loader2, LogOut } from 'lucide-react'
import Auth from './components/Auth'
import Home from './components/Home'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { RoleProvider, useRole } from './contexts/RoleContext'
import { getBrandName, speakWelcome } from './lib/brand'

type Lang = 'en' | 'hi' | 'ta' | 'te' | 'kn' | 'ml'

interface AuthenticatedAppProps {
  language: Lang
  setLanguage: (language: Lang) => void
}

function ZivaLogo({ size = 36 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        background: '#1C1C1C',
        border: '1px solid #333333',
        borderRadius: size * 0.28,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <svg viewBox="0 0 120 120" width={size * 0.65} height={size * 0.65} xmlns="http://www.w3.org/2000/svg">
        <path
          d="M60 10 C60 10 38 38 44 62 C48 76 60 84 60 84 C60 84 74 74 74 54 C74 38 60 22 60 10Z"
          fill="white"
          opacity="0.9"
        />
        <path
          d="M60 36 C60 36 52 52 55 64 C57 70 60 74 60 74 C60 74 66 68 66 56 C66 48 60 42 60 36Z"
          fill="#111111"
        />
        <path
          d="M18 72 Q40 62 60 78 Q80 62 102 72 L102 106 Q80 96 60 112 Q40 96 18 106Z"
          fill="none"
          stroke="white"
          strokeWidth="6"
          strokeLinejoin="round"
          strokeLinecap="round"
          opacity="0.9"
        />
        <path
          d="M28 82 Q44 74 60 84"
          fill="none"
          stroke="white"
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.45"
        />
        <path
          d="M92 82 Q76 74 60 84"
          fill="none"
          stroke="white"
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.45"
        />
      </svg>
    </div>
  )
}

function AuthenticatedApp({ language, setLanguage }: AuthenticatedAppProps) {
  const { user, signOut } = useAuth()
  const { isStaff, shopName } = useRole()
  const brandName = getBrandName(language)

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-navy-900 font-sans">
      <div
        className="fixed left-0 right-0 top-0 z-[100] px-4 py-3 backdrop-blur-xl"
        style={{
          background: 'rgba(17,17,17,0.95)',
          borderBottom: '1px solid #333333',
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <ZivaLogo size={36} />
            <div className="min-w-0">
              <span
                className="mb-0.5 block text-[10px] font-black uppercase leading-none tracking-[0.18em]"
                style={{ color: 'rgba(255,255,255,0.40)' }}
              >
                {brandName}
              </span>
              <span className="block max-w-[150px] truncate text-sm font-bold leading-tight tracking-tight text-white">
                {shopName}
              </span>
              <div className="mt-0.5 flex items-center gap-2">
                <p className="max-w-[120px] truncate text-[10px] font-semibold" style={{ color: '#666666' }}>
                  {user?.user_metadata?.full_name || user?.email?.split('@')[0]}
                </p>
                {isStaff && (
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest"
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      color: 'rgba(255,255,255,0.5)',
                      border: '1px solid rgba(255,255,255,0.12)',
                    }}
                  >
                    Staff
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <select
              value={language}
              onChange={event => setLanguage(event.target.value as Lang)}
              className="cursor-pointer rounded-xl px-3 py-2 text-xs font-black text-slate-300 outline-none"
              style={{
                background: '#1C1C1C',
                border: '1px solid #333333',
              }}
            >
              <option value="en">English</option>
              <option value="hi">Hindi</option>
              <option value="ta">Tamil</option>
              <option value="te">Telugu</option>
              <option value="kn">Kannada</option>
              <option value="ml">Malayalam</option>
            </select>
            <button
              onClick={() => void signOut()}
              className="rounded-lg p-2 transition-all"
              style={{ color: '#555555' }}
              title="Sign Out"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </div>

      <Home language={language} setLanguage={setLanguage} />
    </div>
  )
}

function AppContent() {
  const { loading, user } = useAuth()
  const [language, setLanguage] = useState<Lang>(() => (localStorage.getItem('appLanguage') as Lang) || 'en')

  useEffect(() => {
    localStorage.setItem('appLanguage', language)
  }, [language])

  useEffect(() => {
    if (!user || typeof window === 'undefined') return

    const key = `ziva_welcomed_${language}`
    if (sessionStorage.getItem(key)) return

    sessionStorage.setItem(key, '1')
    const timer = window.setTimeout(() => speakWelcome(language), 800)
    return () => window.clearTimeout(timer)
  }, [language, user])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: '#111111' }}>
        <div className="flex flex-col items-center gap-4">
          <ZivaLogo size={64} />
          <Loader2 className="animate-spin" size={28} style={{ color: '#555555' }} />
          <p className="text-[10px] font-black uppercase tracking-[0.3em]" style={{ color: '#555555' }}>
            Verifying Session
          </p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen" style={{ background: '#111111' }}>
        <Auth language={language} />
      </div>
    )
  }

  return (
    <RoleProvider>
      <AuthenticatedApp language={language} setLanguage={setLanguage} />
    </RoleProvider>
  )
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}

export default App
