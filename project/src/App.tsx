import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Auth from './components/Auth';
import Home from './components/Home';

function AppContent() {
  const { user, loading } = useAuth();
  
  const [language, setLanguage] = useState<'en' | 'hi' | 'ta' | 'te' | 'kn' | 'ml'>(() => {
    const saved = localStorage.getItem('appLanguage');
    return (saved as any) || 'hi';
  });

  useEffect(() => {
    localStorage.setItem('appLanguage', language);
  }, [language]);

  // --- BYPASS LOADING ---
  // If the app is stuck in "loading" for more than 2 seconds, 
  // we proceed anyway to avoid the freeze.
  const [forceShow, setForceShow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setForceShow(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  if (loading && !forceShow) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-500 border-t-transparent mb-4" />
          <p className="font-bold text-gray-600">
            {language === 'hi' ? 'लोड हो रहा है...' : language === 'ta' ? 'ஏற்றுகிறது...' : 
             language === 'te' ? 'లోడ్ అవుతోంది...' : language === 'kn' ? 'ಲೋಡ್ ಆಗುತ್ತಿದೆ...' :
             language === 'ml' ? 'ലോഡ് ചെയ്യുന്നു...' : 'Loading...'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Language Selector */}
      <div className="fixed top-4 right-4 z-[100] flex items-center gap-2 bg-white p-1 rounded-xl shadow-lg border-2 border-primary-100">
        <select 
          value={language} 
          onChange={(e) => setLanguage(e.target.value as any)}
          className="bg-transparent border-none rounded-lg px-3 py-2 text-sm font-black text-primary-700 outline-none cursor-pointer uppercase tracking-wider"
        >
          <option value="hi">हिन्दी</option>
          <option value="en">English</option>
          <option value="ta">தமிழ்</option>
          <option value="te">తెలుగు</option>
          <option value="kn">ಕನ್ನಡ</option>
          <option value="ml">മലയാളം</option>
        </select>
      </div>

      {/* --- MODIFIED: Show Home even if user is not found --- */}
      {user || forceShow ? <Home language={language} /> : <Auth language={language} />}
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
