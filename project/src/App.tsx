import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { RoleProvider, useRole } from './contexts/RoleContext';
import Auth from './components/Auth';
import Home from './components/Home';
import { LogOut, Loader2 } from 'lucide-react';
import { getBrandName, speakWelcome } from './lib/brand';

// ✅ BLINK FIX: Unregister ALL service workers immediately when this module loads.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    registrations.forEach(reg => {
      reg.unregister();
      console.log('🧹 Unregistered old service worker:', reg.scope);
    });
  });
}

type Lang = 'en' | 'hi' | 'ta' | 'te' | 'kn' | 'ml';

interface AuthenticatedAppProps {
  language: Lang;
  setLanguage: (l: Lang) => void;
}

// ── Inline SVG Logo — no external file, always renders correctly ──────────────
function ZivaLogo({ size = 36 }: { size?: number }) {
  return (
    <div
      style={{
        width:        size,
        height:       size,
        background:   '#1C1C1C',
        border:       '1px solid #333333',
        borderRadius: size * 0.28,
        display:      'flex',
        alignItems:   'center',
        justifyContent: 'center',
        flexShrink:   0,
      }}
    >
      <svg viewBox="0 0 120 120" width={size * 0.65} height={size * 0.65} xmlns="http://www.w3.org/2000/svg">
        {/* Flame */}
        <path
          d="M60 10 C60 10 38 38 44 62 C48 76 60 84 60 84 C60 84 74 74 74 54 C74 38 60 22 60 10Z"
          fill="white" opacity="0.9"
        />
        <path
          d="M60 36 C60 36 52 52 55 64 C57 70 60 74 60 74 C60 74 66 68 66 56 C66 48 60 42 60 36Z"
          fill="#111111"
        />
        {/* Open book */}
        <path
          d="M18 72 Q40 62 60 78 Q80 62 102 72 L102 106 Q80 96 60 112 Q40 96 18 106Z"
          fill="none" stroke="white" strokeWidth="6"
          strokeLinejoin="round" strokeLinecap="round" opacity="0.9"
        />
        {/* Book lines */}
        <path d="M28 82 Q44 74 60 84" fill="none" stroke="white"
              strokeWidth="3" strokeLinecap="round" opacity="0.45"/>
        <path d="M92 82 Q76 74 60 84" fill="none" stroke="white"
              strokeWidth="3" strokeLinecap="round" opacity="0.45"/>
      </svg>
    </div>
  )
}

function AuthenticatedApp({ language, setLanguage }: AuthenticatedAppProps) {
  const { user, signOut } = useAuth();
  const { shopName, isStaff } = useRole();
  const brandName = getBrandName(language);

  return (
    <div className="h-screen flex flex-col bg-navy-900 font-sans overflow-hidden">

      {/* ── Fixed Header ─────────────────────────────────────────────────── */}
      <div
        className="fixed top-0 left-0 right-0 z-[100] px-4 py-3 backdrop-blur-xl"
        style={{
          background:   'rgba(17,17,17,0.95)',
          borderBottom: '1px solid #333333',
        }}
      >
        <div className="flex justify-between items-center">

          {/* Left: logo + brand + shop info */}
          <div className="flex items-center gap-3 min-w-0">
            <ZivaLogo size={36} />
            <div className="min-w-0">
              <span
                className="text-[10px] font-black uppercase tracking-[0.18em] block leading-none mb-0.5"
                style={{ color: 'rgba(255,255,255,0.40)' }}
              >
                {brandName}
              </span>
              <span className="font-bold text-sm tracking-tight text-white block leading-tight truncate max-w-[150px]">
                {shopName}
              </span>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-[10px] font-semibold truncate max-w-[120px]"
                   style={{ color: '#666666' }}>
                  {user?.user_metadata?.full_name || user?.email?.split('@')[0]}
                </p>
                {isStaff && (
                  <span
                    className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full tracking-widest"
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      color:      'rgba(255,255,255,0.5)',
                      border:     '1px solid rgba(255,255,255,0.12)',
                    }}
                  >
                    Staff
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right: language picker + sign out */}
          <div className="flex items-center gap-2 shrink-0">
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as Lang)}
              className="rounded-xl px-3 py-2 text-xs font-black text-slate-300 outline-none cursor-pointer"
              style={{
                background: '#1C1C1C',
                border:     '1px solid #333333',
              }}
            >
              <option value="en">English</option>
              <option value="hi">हिंदी</option>
              <option value="ta">தமிழ்</option>
              <option value="te">తెలుగు</option>
              <option value="kn">ಕನ್ನಡ</option>
              <option value="ml">മലയാളം</option>
            </select>
            <button
              onClick={() => signOut()}
              className="p-2 rounded-lg transition-all"
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
  );
}

function AppContent() {
  const { user, loading } = useAuth();

  const [language, setLanguage] = useState<Lang>(() => {
    return (localStorage.getItem('appLanguage') as Lang) || 'en';
  });

  useEffect(() => {
    localStorage.setItem('appLanguage', language);
  }, [language]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center"
           style={{ background: '#111111' }}>
        <div className="flex flex-col items-center gap-4">
          <ZivaLogo size={64} />
          <Loader2 className="animate-spin" size={28} style={{ color: '#555555' } as any} />
          <p className="text-[10px] font-black uppercase tracking-[0.3em]"
             style={{ color: '#555555' }}>
            Verifying Session
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen" style={{ background: '#111111' }}>
        <Auth language={language} />
      </div>
    );
  }

  // Speak welcome once per session after login
  if (typeof window !== 'undefined') {
    const key = `ziva_welcomed_${language}`
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, '1')
      setTimeout(() => speakWelcome(language as any), 800)
    }
  }

  return (
    <RoleProvider>
      <AuthenticatedApp language={language} setLanguage={setLanguage} />
    </RoleProvider>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;