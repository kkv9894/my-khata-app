import { useState } from 'react';
import { Mic, TrendingUp, LogOut, LayoutDashboard, Sparkles, Loader2, User } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import useVoiceInput from '../hooks/useVoiceInput';
import { analyzeTransaction } from '../lib/gemini';
import TransactionForm from './TransactionForm';
import TransactionList from './TransactionList';
import Dashboard from './Dashboard';

const translations: any = {
  en: { appName: "My Khata", hold: "Hold to Speak", release: "Release to Save", ai: "AI is thinking...", history: "History", report: "Report" },
  hi: { appName: "मेरा खाता", hold: "बोलने के लिए दबाकर रखें", release: "छोड़ें और सहेजें", ai: "AI सोच रहा है...", history: "इतिहास", report: "रिपोर्ट" },
  ta: { appName: "என் கணக்கு", hold: "பேச அழுத்திப் பிடிக்கவும்", release: "சேமிக்க விடுவிக்கவும்", ai: "AI யோசிக்கிறது...", history: "வரலாறு", report: "அறிக்கை" },
  te: { appName: "నా ఖాతా", hold: "మాట్లాడటానికి నొక్కి పట్టుకోండి", release: "సేవ్ చేయడానికి వదలండి", ai: "AI ఆలోచిస్తోంది...", history: "చరిత్ర", report: "నివేదిక" },
  kn: { appName: "ನನ್ನ ಖಾತೆ", hold: "ಮಾತನಾಡಲು ಒತ್ತಿ ಹಿಡಿಯಿರಿ", release: "ಉಳಿಸಲು ಬಿಡಿ", ai: "AI ಯೋಚಿಸುತ್ತಿದೆ...", history: "history", report: "ವರದಿ" },
  ml: { appName: "എന്റെ ഖാത്ത", hold: "സംസാരിക്കാൻ അമർത്തിപ്പിടിക്കുക", release: "സേവ് ചെയ്യാൻ വിടുക", ai: "AI ചിന്തിക്കുന്നു...", history: "ചരിത്രം", report: "റിപ്പോർട്ട്" }
};

export default function Home({ language = 'hi' }: { language?: string }) {
  const { user, signOut } = useAuth(); // Added user here
  const { isListening, transcript, startListening, stopListening } = useVoiceInput();
  
  const [showForm, setShowForm] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'home' | 'transactions' | 'dashboard'>('home');
  const [formData, setFormData] = useState({ amount: '', description: '', type: 'expense' as 'income' | 'expense' });

  const t = translations[language as any] || translations.hi;

  const handleHoldStart = (e: any) => {
    e.preventDefault();
    if (navigator.vibrate) navigator.vibrate(50);
    const voiceMap: any = { hi: 'hi-IN', en: 'en-IN', ta: 'ta-IN', te: 'te-IN', kn: 'kn-IN', ml: 'ml-IN' };
    startListening(voiceMap[language as any] || 'hi-IN');
  };

  const handleHoldEnd = async () => {
    if (isListening) {
      const finalRecordedText = transcript.trim();
      stopListening();

      if (finalRecordedText.length > 0) {
        setIsAiLoading(true);
        const aiData = await analyzeTransaction(finalRecordedText);
        
        if (aiData) {
          setFormData({ 
            amount: aiData.amount.toString(), 
            description: aiData.description, 
            type: aiData.type 
          });
        } else {
          setFormData({ amount: '', description: finalRecordedText, type: 'expense' });
        }
        
        setIsAiLoading(false);
        setShowForm(true);
      }
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col select-none touch-none">
      <header className="p-5 flex justify-between items-center bg-white border-b">
        <div className="flex items-center gap-2">
           <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
             <User size={16} className="text-primary-600" />
           </div>
           <h1 className="font-black text-xl tracking-tighter">{t.appName}</h1>
        </div>
        {/* Only show logout if a real user is actually logged in */}
        {user && (
          <button onClick={() => signOut()} className="text-gray-300 hover:text-red-500 transition-colors">
            <LogOut size={20} />
          </button>
        )}
      </header>

      {activeTab === 'home' ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6 relative">
          {isAiLoading && (
            <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-[120] flex flex-col items-center justify-center">
              <div className="relative">
                <Loader2 className="w-16 h-16 text-primary-600 animate-spin" />
                <Sparkles className="w-6 h-6 text-yellow-500 absolute -top-2 -right-2 animate-bounce" />
              </div>
              <p className="mt-4 font-black text-primary-600 animate-pulse uppercase tracking-widest">{t.ai}</p>
            </div>
          )}

          <div className={`absolute top-10 left-6 right-6 p-6 rounded-3xl transition-all border-2 ${
            isListening ? 'bg-blue-50 border-blue-100 opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'
          }`}>
            <p className="text-blue-400 text-[10px] font-black uppercase mb-1 tracking-widest">Listening...</p>
            <p className="text-blue-900 text-xl font-bold leading-tight">{transcript || "..."}</p>
          </div>

          <div className="flex flex-col items-center gap-6">
            <button
              onMouseDown={handleHoldStart}
              onMouseUp={handleHoldEnd}
              onMouseLeave={handleHoldEnd}
              onTouchStart={handleHoldStart}
              onTouchEnd={handleHoldEnd}
              className={`relative w-64 h-64 rounded-full flex items-center justify-center transition-all duration-200 shadow-2xl z-10 ${
                isListening ? 'bg-red-500 scale-110' : 'bg-black active:scale-95'
              }`}
            >
              <Mic size={64} color="white" className={isListening ? 'animate-pulse' : ''} />
            </button>
            <p className={`font-black text-sm uppercase tracking-widest ${isListening ? 'text-red-500' : 'text-gray-400'}`}>
              {isListening ? t.release : t.hold}
            </p>
          </div>
        </div>
      ) : activeTab === 'transactions' ? (
        <TransactionList language={language as any} />
      ) : (
        <Dashboard language={language as any} />
      )}

      <nav className="p-5 bg-white border-t flex justify-around shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
        <button onClick={() => setActiveTab('home')} className={activeTab === 'home' ? 'text-primary-600 scale-110' : 'text-gray-300'}><Mic size={24} /></button>
        <button onClick={() => setActiveTab('transactions')} className={activeTab === 'transactions' ? 'text-primary-600 scale-110' : 'text-gray-300'}><TrendingUp size={24} /></button>
        <button onClick={() => setActiveTab('dashboard')} className={activeTab === 'dashboard' ? 'text-primary-600 scale-110' : 'text-gray-300'}><LayoutDashboard size={24} /></button>
      </nav>

      {showForm && <TransactionForm initialData={formData} language={language} onClose={() => setShowForm(false)} />}
    </div>
  );
}
