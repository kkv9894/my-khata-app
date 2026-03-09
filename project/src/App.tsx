import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { RoleProvider, useRole } from './contexts/RoleContext';
import Auth from './components/Auth';
import Home from './components/Home';
import { Wallet, LogOut, Loader2 } from 'lucide-react';

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

  return (
    <div className="h-screen flex flex-col bg-white font-sans overflow-hidden">

      {/* Fixed Header */}
      <div className="fixed top-0 left-0 right-0 z-[100] bg-white/80 backdrop-blur-xl border-b border-gray-100 px-4 py-3">
        <div className="flex justify-between items-center">

          <div className="flex items-center gap-3 min-w-0">
            <div className="bg-black p-2 rounded-xl shadow-lg shrink-0">
              <Wallet size={18} color="white" />
            </div>
            <div className="min-w-0">
              <span className="font-black text-base tracking-tighter text-black block leading-tight">
                {shopName}
              </span>
              <div className="flex items-center gap-2">
                <p className="text-[10px] text-gray-400 font-semibold truncate max-w-[120px]">
                  {user?.user_metadata?.full_name || user?.email?.split('@')[0]}
                </p>
                {isStaff && (
                  <span className="text-[8px] font-black uppercase bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full tracking-widest">
                    Staff
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as Lang)}
              className="bg-gray-100 border-none rounded-xl px-3 py-2 text-xs font-black text-gray-700 outline-none cursor-pointer"
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
              className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
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
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-black" size={40} />
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400">
            Verifying Session
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-white">
        <div className="p-6 flex items-center gap-2">
          <div className="bg-black p-2 rounded-xl shadow-lg">
            <Wallet size={20} color="white" />
          </div>
          <span className="font-black text-xl tracking-tighter text-black">My Khata</span>
        </div>
        <Auth language={language} />
      </div>
    );
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