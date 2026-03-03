import { useState } from 'react';
import { Mic, TrendingUp, LayoutDashboard, Sparkles, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import useVoiceInput from '../hooks/useVoiceInput';
import { analyzeTransaction } from '../lib/gemini';
import TransactionForm from './TransactionForm';
import TransactionList from './TransactionList';
import Dashboard from './Dashboard';

const translations: any = {
  en: { hold: "Hold to Speak", release: "Release to Save", ai: "AI is thinking...", history: "History", report: "Report" },
  hi: { hold: "बोलने के लिए दबाकर रखें", release: "छोड़ें और सहेजें", ai: "AI सोच रहा है...", history: "इतिहास", report: "रिपोर्ट" },
  ta: { hold: "பேச அழுத்திப் பிடிக்கவும்", release: "சேமிக்க விடுவிக்கவும்", ai: "AI யோசிக்கிறது...", history: "வரலாறு", report: "அறிக்கை" },
  te: { hold: "మాట్లాడటానికి నొక్కి పట్టుకోండి", release: "సేవ్ చేయడానికి వదలండి", ai: "AI ఆలోచిస్తోంది...", history: "చరిత్ర", report: "నివేదిక" },
  kn: { hold: "ಮಾತನಾಡಲು ಒತ್ತಿ ಹಿಡಿಯಿರಿ", release: "ಉಳಿಸಲು ಬಿಡಿ", ai: "AI ಯೋಚಿಸುತ್ತಿದೆ...", history: "ಇತಿಹಾಸ", report: "ವರದಿ" },
  ml: { hold: "സംസാരിക്കാൻ അമർത്തിപ്പിടിക്കുക", release: "സേവ് ചെയ്യാൻ വിടുക", ai: "AI ചിന്തിക്കുന്നു...", history: "ചരിത്രം", report: "റിപ്പോർട്ട്" }
};

export default function Home({ language = 'en' }: { language?: string }) {
  const { isListening, transcript, startListening, stopListening } = useVoiceInput();
  
  const [showForm, setShowForm] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'home' | 'transactions' | 'dashboard'>('home');
  const [formData, setFormData] = useState({ amount: '', description: '', type: 'expense' as 'income' | 'expense' });

  const t = translations[language as any] || translations.en;

  const handleHoldStart = (e: any) => {
    e.preventDefault();
    if (navigator.vibrate) navigator.vibrate(50);
    // Map languages to high-accuracy voice recognition codes
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
          // 🧠 SEND TO GEMINI AI
          const aiData = await analyzeTransaction(finalRecordedText);
          
          if (aiData && (aiData.amount > 0 || aiData.description)) {
            // ✅ AI SUCCESSFULLY PARSED THE VOICE DATA
            setFormData({ 
              amount: aiData.amount > 0 ? aiData.amount.toString() : '', 
              description: aiData.description || finalRecordedText, 
              type: aiData.type || 'expense'
            });
          } else {
            // ⚠️ AI FAILED: Put raw text in description
            setFormData({ 
              amount: '', 
              description: finalRecordedText, 
              type: 'expense' 
            });
          }
        } catch (error) {
          console.error("AI Analysis Failed:", error);
          setFormData({ amount: '', description: finalRecordedText, type: 'expense' });
        }
        
        setIsAiLoading(false);
        setShowForm(true);
      }
    }
  };

  return (
    <div className="flex flex-col select-none touch-none h-[calc(100vh-80px)]">
      
      {/* --- CONTENT AREA --- */}
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
                    isListening ? 'bg-red-600 scale-110' : 'bg-black active:scale-90'
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

      {/* --- BOTTOM NAVIGATION --- */}
      <nav className="p-6 pb-10 bg-white border-t flex justify-around items-center shadow-[0_-10px_40px_rgba(0,0,0,0.03)] rounded-t-[2.5rem]">
        <button 
          onClick={() => setActiveTab('home')} 
          className={`transition-all duration-300 p-3 rounded-2xl ${activeTab === 'home' ? 'bg-black text-white shadow-xl scale-110' : 'text-gray-300 hover:text-gray-500'}`}
        >
          <Mic size={24} strokeWidth={activeTab === 'home' ? 3 : 2} />
        </button>
        
        <button 
          onClick={() => setActiveTab('transactions')} 
          className={`transition-all duration-300 p-3 rounded-2xl ${activeTab === 'transactions' ? 'bg-black text-white shadow-xl scale-110' : 'text-gray-300 hover:text-gray-500'}`}
        >
          <TrendingUp size={24} strokeWidth={activeTab === 'transactions' ? 3 : 2} />
        </button>
        
        <button 
          onClick={() => setActiveTab('dashboard')} 
          className={`transition-all duration-300 p-3 rounded-2xl ${activeTab === 'dashboard' ? 'bg-black text-white shadow-xl scale-110' : 'text-gray-300 hover:text-gray-500'}`}
        >
          <LayoutDashboard size={24} strokeWidth={activeTab === 'dashboard' ? 3 : 2} />
        </button>
      </nav>

      {/* AUTO-POPPING TRANSACTION FORM */}
      {showForm && (
        <TransactionForm 
          initialData={formData} 
          language={language} 
          onClose={() => {
            setShowForm(false);
            setFormData({ amount: '', description: '', type: 'expense' });
          }} 
        />
      )}
    </div>
  );
}
