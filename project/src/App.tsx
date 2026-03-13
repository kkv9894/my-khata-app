import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { RoleProvider, useRole } from './contexts/RoleContext';
import Auth from './components/Auth';
import Home from './components/Home';
import { LogOut, Loader2 } from 'lucide-react';
import { getBrandName, speakWelcome } from './lib/brand';

// ✅ BLINK FIX: Unregister ALL service workers immediately when this module loads.
// The old SW had skipWaiting() + clients.claim() which forced page reloads on every
// hot-reload cycle, causing the login page blinking loop.
// This runs once, kills any cached SW, and the new inert sw.js takes over cleanly.
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

function AuthenticatedApp({ language, setLanguage }: AuthenticatedAppProps) {
  const { user, signOut } = useAuth();
  const { shopName, isStaff } = useRole();
  const brandName = getBrandName(language);

  return (
    <div className="h-screen flex flex-col bg-navy-900 font-sans overflow-hidden">

      {/* ── Fixed Header — dark glass ─────────────────────────────────────── */}
      <div className="fixed top-0 left-0 right-0 z-[100] border-b border-navy-600 bg-navy-900/90 backdrop-blur-xl px-4 py-3">
        <div className="flex justify-between items-center">

          {/* Left: logo + brand + shop info */}
          <div className="flex items-center gap-3 min-w-0">
            {/* Logo — served from /public/logo.png */}
            <img
              src="/logo.png"
              alt="ZivaKhata"
              className="h-9 w-9 rounded-xl object-cover shrink-0 shadow-cyan-glow"
            />
            <div className="min-w-0">
              {/* Brand name row */}
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan block leading-none mb-0.5">
                {brandName}
              </span>
              {/* Shop name */}
              <span className="font-bold text-sm tracking-tight text-white block leading-tight truncate max-w-[150px]">
                {shopName}
              </span>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-[10px] text-slate-400 font-semibold truncate max-w-[120px]">
                  {user?.user_metadata?.full_name || user?.email?.split('@')[0]}
                </p>
                {isStaff && (
                  <span className="text-[8px] font-black uppercase bg-cyan-muted text-cyan px-1.5 py-0.5 rounded-full tracking-widest border border-cyan-border">
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
              className="bg-navy-800 border border-navy-600 rounded-xl px-3 py-2 text-xs font-black text-slate-300 outline-none cursor-pointer focus:border-cyan"
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
              className="p-2 text-slate-400 hover:text-cyan hover:bg-cyan-muted rounded-lg transition-all"
              title="Sign Out"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </div>

      <Home language={language} />
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
      <div className="min-h-screen bg-navy-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <img src="/logo.png" alt="ZivaKhata" className="w-16 h-16 rounded-2xl shadow-cyan-glow animate-pulse" />
          <Loader2 className="animate-spin text-cyan" size={32} />
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">
            Verifying Session
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-navy-900">
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