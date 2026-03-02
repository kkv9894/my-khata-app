import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Auth from './components/Auth';
import Home from './components/Home';
import { Wallet, LogOut, User } from 'lucide-react';

function AppContent() {
  const { user, loading, signOut } = useAuth();
  
  // Default language is English
  const [language, setLanguage] = useState<'en' | 'hi' | 'ta' | 'te' | 'kn' | 'ml'>(() => {
    const saved = localStorage.getItem('appLanguage');
    return (saved as any) || 'en';
  });

  useEffect(() => {
    localStorage.setItem('appLanguage', language);
  }, [language]);

  // --- 1. HANDLE LOADING STATE ---
  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-black"></div>
          <p className="text-xs font-black uppercase tracking-widest text-gray-400">Verifying Session...</p>
        </div>
      </div>
    );
  }

  // --- 2. SHOW AUTH (LOGIN/SIGNUP) IF NO USER ---
  if (!user) {
    return (
      <div className="min-h-screen bg-white">
        {/* Simple Header for Login Page */}
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

  // --- 3. SHOW MAIN APP (HOME) IF USER IS LOGGED IN ---
  return (
    <div className="min-h-screen bg-white">
      {/* --- BRANDED HEADER --- */}
      <div className="fixed top-0 left-0 right-0 z-[100] bg-white/90 backdrop-blur-md border-b px-4 py-3 flex justify-between items-center">
        
        {/* LOGO SECTION */}
        <div className="flex items-center gap-2">
          <div className="bg-black p-2 rounded-xl shadow-lg">
            <Wallet size={20} color="white" /> 
          </div>
          <span className="font-black text-xl tracking-tighter text-black">My Khata</span>
        </div>

        {/* ACTIONS SECTION */}
        <div className="flex items-center gap-3">
          <select 
            value={language} 
            onChange={(e) => setLanguage(e.target.value as any)}
            className="bg-gray-100 border-none rounded-lg px-2 py-1.5 text-[10px] font-black text-gray-700 outline-none uppercase tracking-wider"
          >
            <option value="en">EN</option>
            <option value="hi">HI</option>
            <option value="ta">TA</option>
            <option value="te">TE</option>
            <option value="kn">KN</option>
            <option value="ml">ML</option>
          </select>

          <button 
            onClick={() => signOut()} 
            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>

      <div className="pt-20">
        <div className="animate-in fade-in duration-700">
          {/* USER PROFILE SECTION */}
          <div className="px-6 py-4 flex items-center gap-3 bg-gray-50 mx-4 rounded-2xl mb-2">
            <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center text-white">
              <User size={20} />
            </div>
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Logged in as</p>
              <h2 className="text-sm font-black text-gray-900">
                {user.user_metadata?.full_name || user.email?.split('@')[0]}
              </h2>
            </div>
          </div>
          
          <Home language={language} />
        </div>
      </div>
    </div>
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
