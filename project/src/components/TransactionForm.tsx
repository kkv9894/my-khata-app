import { useState } from 'react';
import { X, Save, Volume2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const formTranslations: any = {
  en: { title: "New Transaction", expense: "Expense", income: "Income", amount: "Amount (₹)", desc: "Description", placeholder: "Details...", save: "Save", msg: "recorded successfully" },
  hi: { title: "नया लेन-देन", expense: "खर्च", income: "आय", amount: "राशि (₹)", desc: "विवरण", placeholder: "विवरण लिखें...", save: "सहेजें", msg: "सफलतापूर्वक दर्ज किया गया" },
  ta: { title: "புதிய பரிவர்த்தனை", expense: "செலவு", income: "வருமானம்", amount: "தொகை (₹)", desc: "விளக்கம்", placeholder: "விவரம்...", save: "சேமி", msg: "பதிவு செய்யப்பட்டது" },
  te: { title: "కొత్త లావాదేవీ", expense: "ఖర్చు", income: "ఆదాయం", amount: "మొత్తం (₹)", desc: "వివరణ", placeholder: "వివరాలు...", save: "సేవ్", msg: "విజయవంతంగా సేవ్ చేయబడింది" },
  kn: { title: "ಹೊಸ ವಹಿವಾಟು", expense: "ಖರ್ಚು", income: "ಆದಾಯ", amount: "ಮೊತ್ತ (₹)", desc: "ವಿವರಣೆ", placeholder: "ವಿವರಗಳು...", save: "ಉಳಿಸಿ", msg: "ಯಶಸ್ವಿಯಾಗಿ ಉಳಿಸಲಾಗಿದೆ" },
  ml: { title: "പുതിയ ഇടപാട്", expense: "ചെലവ്", income: "വരമാനം", amount: "തുക (₹)", desc: "വിവരണം", placeholder: "വിവരങ്ങൾ...", save: "സേവ് ചെയ്യുക", msg: "വിജയകരമായി സേവ് ചെയ്തു" }
};

export default function TransactionForm({ initialData, onClose, language = 'en' }: any) {
  const { user } = useAuth();
  const [amount, setAmount] = useState(initialData.amount || '');
  const [description, setDescription] = useState(initialData.description || '');
  const [type, setType] = useState(initialData.type || 'expense');
  const [isSaving, setIsSaving] = useState(false);

  const t = formTranslations[language] || formTranslations.en;

  // 🔊 VOICE FEEDBACK FUNCTION
  const speakConfirmation = (text: string) => {
    if (!window.speechSynthesis) return;
    const utterance = new SpeechSynthesisUtterance(text);
    const langMap: any = { hi: 'hi-IN', en: 'en-IN', ta: 'ta-IN', te: 'te-IN', kn: 'kn-IN', ml: 'ml-IN' };
    utterance.lang = langMap[language] || 'en-IN';
    window.speechSynthesis.speak(utterance);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return alert("Please login first");

    setIsSaving(true);
    const { error } = await supabase.from('transactions').insert([
      { 
        amount: parseFloat(amount), 
        description: description.trim(), 
        type: type,
        user_id: user.id 
      }
    ]);

    if (error) {
      alert("Database Error: " + error.message);
      setIsSaving(false);
    } else {
      // 🗣️ Speak the confirmation
      const typeLabel = type === 'income' ? t.income : t.expense;
      speakConfirmation(`${typeLabel} ${amount} ${t.msg}`);

      // Brief delay to allow the voice to start before refresh
      setTimeout(() => {
        onClose();
        window.location.reload(); 
      }, 1200);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-[110] p-0 sm:p-4">
      <div className="bg-white rounded-t-[2.5rem] sm:rounded-[2.5rem] w-full max-w-lg overflow-hidden animate-in slide-in-from-bottom duration-300 shadow-2xl">
        
        {/* Header */}
        <div className="p-8 border-b flex justify-between items-center bg-gray-50/50">
          <div>
            <h2 className="text-2xl font-black text-gray-900 tracking-tight">{t.title}</h2>
            <div className="flex items-center gap-1 mt-1 text-primary-500">
              <Volume2 size={14} />
              <span className="text-[10px] font-bold uppercase tracking-widest">Voice Feedback Enabled</span>
            </div>
          </div>
          <button onClick={onClose} className="p-3 bg-gray-100 hover:bg-gray-200 rounded-full transition-all">
            <X className="w-6 h-6 text-gray-600" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          {/* Toggle Button */}
          <div className="flex gap-3 bg-gray-100 p-2 rounded-2xl">
            <button 
              type="button" 
              onClick={() => setType('expense')} 
              className={`flex-1 py-4 rounded-xl font-black transition-all ${type === 'expense' ? 'bg-red-500 text-white shadow-lg' : 'text-gray-400'}`}
            >
              {t.expense}
            </button>
            <button 
              type="button" 
              onClick={() => setType('income')} 
              className={`flex-1 py-4 rounded-xl font-black transition-all ${type === 'income' ? 'bg-green-500 text-white shadow-lg' : 'text-gray-400'}`}
            >
              {t.income}
            </button>
          </div>

          {/* Amount Field */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase ml-2 tracking-widest">{t.amount}</label>
            <input 
              type="number" 
              value={amount} 
              onChange={(e) => setAmount(e.target.value)} 
              className="w-full px-6 py-5 bg-gray-50 border-2 border-transparent focus:border-black rounded-2xl text-4xl font-black outline-none transition-all" 
              placeholder="0" 
              required 
            />
          </div>

          {/* Description Field */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase ml-2 tracking-widest">{t.desc}</label>
            <textarea 
              value={description} 
              onChange={(e) => setDescription(e.target.value)} 
              className="w-full px-6 py-5 bg-gray-50 border-2 border-transparent focus:border-black rounded-2xl min-h-[120px] font-bold outline-none transition-all" 
              placeholder={t.placeholder} 
              required 
            />
          </div>

          {/* Save Button */}
          <button 
            type="submit" 
            disabled={isSaving}
            className={`w-full bg-black text-white font-black py-6 rounded-2xl shadow-2xl active:scale-95 transition-all text-xl flex items-center justify-center gap-3 ${isSaving ? 'opacity-50' : ''}`}
          >
            {isSaving ? "Saving..." : <><Save size={24} /> {t.save}</>}
          </button>
        </form>
      </div>
    </div>
  );
}
