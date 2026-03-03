import { useState } from 'react';
import { Mic, TrendingUp, LayoutDashboard, Sparkles, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import useVoiceInput from '../hooks/useVoiceInput';
import { analyzeTransaction } from '../lib/gemini';
import TransactionForm from './TransactionForm';
import TransactionList from './TransactionList';
import Dashboard from './Dashboard';

const translations: any = {
  en: { hold: "Hold to Speak", release: "Release to Save", ai: "AI is thinking...", history: "History", report: "Report", saved: "recorded successfully" },
  hi: { hold: "बोलने के लिए दबाकर रखें", release: "छोड़ें और सहेजें", ai: "AI सोच रहा है...", history: "इतिहास", report: "रिपोर्ट", saved: "सफलतापूर्वक दर्ज किया गया" },
  ta: { hold: "பேச அழுத்திப் பிடிக்கவும்", release: "சேமிக்க விடுவிக்கவும்", ai: "AI யோசிக்கிறது...", history: "வரலாறு", report: "அறிக்கை", saved: "பதிவு செய்யப்பட்டது" },
  te: { hold: "మాట్లాడటానికి నొక్కి పట్టుకోండి", release: "సేవ్ చేయడానికి వదలండి", ai: "AI ఆలోచిస్తోంది...", history: "చరిత్ర", report: "నివేదిక", saved: "విజయవంతంగా సేవ్ చేయబడింది" },
  kn: { hold: "ಮಾತನಾಡಲು ಒತ್ತಿ ಹಿಡಿಯಿರಿ", release: "ಉಳಿಸಲು ಬಿಡಿ", ai: "AI ಯೋಚಿಸುತ್ತಿದೆ...", history: "ಇತಿಹಾಸ", report: "ವರದಿ", saved: "ಯಶಸ್ವಿಯಾಗಿ ಉಳಿಸಲಾಗಿದೆ" },
  ml: { hold: "സംസാരിക്കാൻ അമർത്തിപ്പിടിക്കുക", release: "സേവ് ചെയ്യാൻ വിടുക", ai: "AI ചിന്തിക്കുന്നു...", history: "ചരിത്രം", report: "റിപ്പോർട്ട്", saved: "വിജയകരമായി സേവ് ചെയ്തു" }
};

export default function Home({ language = 'en' }: { language?: string }) {
  const { user } = useAuth();
  const { isListening, transcript, startListening, stopListening } = useVoiceInput();
  
  const [showForm, setShowForm] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'home' | 'transactions' | 'dashboard'>('home');
  const [formData, setFormData] = useState({ amount: '', description: '', type: 'expense' as 'income' | 'expense' });

  const t = translations[language as any] || translations.en;

  // 🔊 VOICE CONFIRMATION LOGIC
  const speakFeedback = (text: string) => {
    if (!window.speechSynthesis) return;
    const utterance = new SpeechSynthesisUtterance(text);
    const langMap: any = { hi: 'hi-IN', en: 'en-IN', ta: 'ta-IN', te: 'te-IN', kn: 'kn-IN', ml: 'ml-IN' };
    utterance.lang = langMap[language as any] || 'en-IN';
    window.speechSynthesis.speak(utterance);
  };

  const handleHoldStart = (e: any) => {
    e.preventDefault();
    if (navigator.vibrate) navigator.vibrate(50); // Initial feedback
    const voiceMap: any = { hi: 'hi-IN', en: 'en-IN', ta: 'ta-IN', te: 'te-IN', kn: 'kn-IN', ml: 'ml-IN' };
    startListening(voiceMap[language as any] || 'en-IN');
  };

  const handleHoldEnd = async () => {
    if (isListening) {
      const finalRecordedText = transcript.trim();
      stopListening();

      if (finalRecordedText.length > 0) {
        setIsAiLoading(true);
        try {
          // 🧠 1. ASK GEMINI TO ANALYZE
          const aiData = await analyzeTransaction(finalRecordedText);
          
          if (aiData && aiData.amount > 0 && user) {
            // 🚀 2. AUTO-SAVE TO DATABASE
            const { error } = await supabase.from('transactions').insert([
              { 
                amount: aiData.amount, 
                description: aiData.description, 
                type: aiData.type,
                user_id: user.id 
              }
            ]);

            if (!error) {
              // 📳 3. SUCCESS VIBRATION (Double Pulse)
              if (navigator.vibrate) navigator.vibrate([100, 50, 100]);

              // 🗣️ 4. VOICE FEEDBACK
              const typeText = aiData.type === 'income' ? (language === 'en' ? 'Income' : 'आय') : (language === 'en' ? 'Expense' : 'खर्च');
              speakFeedback(`${typeText} ${aiData.amount} ${t.saved}`);
              
              // Refresh data in background (silent refresh)
              // No form needed, transaction is done!
            } else {
              throw new Error("Save failed");
            }
          } else {
            // ⚠️ 5. FALLBACK: If AI is confused, open manual form
            setFormData({ 
              amount: aiData?.amount?.toString() || '', 
              description: aiData?.description || finalRecordedText, 
              type: aiData?.type || 'expense'
            });
            setShowForm(true);
          }
        } catch (error) {
          console.error("Auto-Save Error:", error);
          // If auto-save fails, let the user do it manually
          setFormData({ amount: '', description: finalRecordedText, type: 'expense' });
          setShowForm(true);
        }
        setIsAiLoading(false);
      }
    }
  };

  return (
    <div className="flex flex-col select-none touch-none h-[calc(100vh-80px)]">
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'home' ? (
          <div className="h-full flex flex-col items-center justify-center px-6 relative overflow-hidden">
            
            {/* AI LOADING OVERLAY */}
            {isAiLoading && (
              <div className="absolute inset-0 bg-white/90 backdrop-blur-md z-[120] flex flex-col items-center justify-center">
                <div className="relative">
                  <Loader2 className="w-20 h-20 text-black animate-spin" />
                  <Sparkles className="w-8 h-8 text-yellow-500 absolute -top-2 -right-2 animate-bounce" />
                </div>
                <p className="mt-6 font-black text-black animate-pulse uppercase tracking-[0.3em] text-xs">
                  {t.ai}
                </p>
              </div>
            )}

            {/* LIVE VOICE TEXT PREVIEW */}
            <div className={`absolute top-10 left-6 right-6 p-8 rounded-[2rem] border-2 transition-all duration-500 shadow-xl ${
              isListening 
                ? 'bg-black border-black scale-100 opacity-100' 
                : 'bg-white border-gray-100 scale-95 opacity-0 pointer-events-none'
            }`}>
              <p className="text-gray-400 text-[10px] font-black uppercase mb-2 tracking-[0.2em]">Live Transcript</p>
              <p className="text-white text-2xl font-black leading-tight tracking-tight italic">
                "{transcript || "..."}"
              </p>
            </div>

            {/* MAIN MIC BUTTON */}
            <div className="flex flex-col items-center gap-10">
              <div className="relative">
                {isListening && (
                  <div className="absolute inset-0 bg-red-500 rounded-full animate-ping opacity-20"></div>
                )}
                <button
                  onMouseDown={handleHoldStart}
                  onMouseUp={handleHoldEnd}
                  onMouseLeave={handleHoldEnd}
                  onTouchStart={handleHoldStart}
                  onTouchEnd={handleHoldEnd}
                  className={`relative w-72 h-72 rounded-full flex items-center justify-center transition-all duration-300 shadow-[0_20px_60px_rgba(0,0,0,0.15)] z-10 ${
                    isListening ? 'bg-red-600 scale-110 shadow-red-200' : 'bg-black active:scale-90'
                  }`}
                >
                  <Mic size={80} color="white" strokeWidth={2.5} className={isListening ? 'scale-110' : ''} />
                </button>
              </div>

              <div className="text-center space-y-2">
                <p className={`font-black text-sm uppercase tracking-[0.2em] transition-colors duration-300 ${
                  isListening ? 'text-red-600 animate-pulse' : 'text-gray-300'
                }`}>
                  {isListening ? t.release : t.hold}
                </p>
              </div>
            </div>
          </div>
        ) : activeTab === 'transactions' ? (
          <TransactionList language={language as any} />
        ) : (
          <Dashboard language={language as any} />
        )}
      </div>

      <nav className="p-6 pb-10 bg-white border-t flex justify-around items-center shadow-[0_-10px_40px_rgba(0,0,0,0.03)] rounded-t-[2.5rem]">
        <button onClick={() => setActiveTab('home')} className={`transition-all duration-300 p-3 rounded-2xl ${activeTab === 'home' ? 'bg-black text-white shadow-xl scale-110' : 'text-gray-300'}`}>
          <Mic size={24} strokeWidth={activeTab === 'home' ? 3 : 2} />
        </button>
        <button onClick={() => setActiveTab('transactions')} className={`transition-all duration-300 p-3 rounded-2xl ${activeTab === 'transactions' ? 'bg-black text-white shadow-xl scale-110' : 'text-gray-300'}`}>
          <TrendingUp size={24} strokeWidth={activeTab === 'transactions' ? 3 : 2} />
        </button>
        <button onClick={() => setActiveTab('dashboard')} className={`transition-all duration-300 p-3 rounded-2xl ${activeTab === 'dashboard' ? 'bg-black text-white shadow-xl scale-110' : 'text-gray-300'}`}>
          <LayoutDashboard size={24} strokeWidth={activeTab === 'dashboard' ? 3 : 2} />
        </button>
      </nav>

      {showForm && (
        <TransactionForm 
          initialData={formData} 
          language={language} 
          onClose={() => {
            setShowForm(false);
            setFormData({ amount: '', description: '', type: 'expense' });
            window.location.reload(); // Refresh data if they used the manual form
          }} 
        />
      )}
    </div>
  );
}
