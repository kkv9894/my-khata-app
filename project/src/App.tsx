import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Auth from './components/Auth';
import Home from './components/Home';

function AppContent() {
  // We keep user and loading for context, but we will ignore them to bypass login
  const { user, loading } = useAuth();
  
  const [language, setLanguage] = useState<'en' | 'hi' | 'ta' | 'te' | 'kn' | 'ml'>(() => {
    const saved = localStorage.getItem('appLanguage');
    return (saved as any) || 'hi';
  });

  // Fixed the setItem typo from your previous code
  useEffect(() => {
    localStorage.setItem('appLanguage', language);
  }, [language]);

  // --- FORCE HOME SCREEN ---
  // This bypasses the loading screen and the login screen completely
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

      {/* We are now forcing Home to show regardless of 'user' or 'loading'.
          This stops the "blink" back to the login page.
      */}
      <Home language={language} />
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
