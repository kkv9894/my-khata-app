import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Auth from './components/Auth';
import Home from './components/Home';
import { Wallet } from 'lucide-react'; // Using a Wallet icon as a placeholder logo

function AppContent() {
  const { user, loading } = useAuth();
  
  // 1. DEFAULT LANGUAGE SET TO ENGLISH ('en')
  const [language, setLanguage] = useState<'en' | 'hi' | 'ta' | 'te' | 'kn' | 'ml'>(() => {
    const saved = localStorage.getItem('appLanguage');
    return (saved as any) || 'en'; 
  });

  useEffect(() => {
    localStorage.setItem('appLanguage', language);
  }, [language]);

  // Loading Screen
  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* --- HEADER WITH LOGO & LANGUAGE --- */}
      <div className="fixed top-0 left-0 right-0 z-[100] bg-white/80 backdrop-blur-md border-b px-4 py-3 flex justify-between items-center">
        {/* LOGO SECTION */}
        <div className="flex items-center gap-2">
          <div className="bg-primary-600 p-2 rounded-xl shadow-lg shadow-primary-200">
            <Wallet size={20} color="white" /> 
          </div>
          <span className="font-black text-xl tracking-tighter text-gray-900">My Khata</span>
        </div>

        {/* LANGUAGE SELECTOR */}
        <select 
          value={language} 
          onChange={(e) => setLanguage(e.target.value as any)}
          className="bg-gray-50 border-2 border-gray-100 rounded-xl px-3 py-2 text-xs font-black text-gray-700 outline-none cursor-pointer uppercase tracking-wider"
        >
          <option value="en">English</option>
          <option value="hi">हिन्दी</option>
          <option value="ta">தமிழ்</option>
          <option value="te">తెలుగు</option>
          <option value="kn">ಕನ್ನಡ</option>
          <option value="ml">മലയാളം</option>
        </select>
      </div>

      <div className="pt-20">
        {/* --- LOGIN LOGIC --- 
            If user exists, show Home. Otherwise, show Auth (Login) 
        */}
        {user ? (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Displaying User Name if available, else "User" */}
            <div className="px-6 pt-4">
              <p className="text-gray-400 text-[10px] font-black uppercase tracking-[0.2em]">Welcome back,</p>
              <h2 className="text-2xl font-black text-gray-900">
                {user.user_metadata?.full_name || user.email?.split('@')[0] || "User"}
              </h2>
            </div>
            <Home language={language} />
          </div>
        ) : (
          <Auth language={language} />
        )}
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
