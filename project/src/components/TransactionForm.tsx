import { useState } from 'react';
import { X, Save } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const formTranslations: any = {
  en: { title: "New Transaction", expense: "Expense", income: "Income", amount: "Amount (₹)", desc: "Description", placeholder: "Details...", save: "Save" },
  hi: { title: "नया लेन-देन", expense: "खर्च", income: "आय", amount: "राशि (₹)", desc: "विवरण", placeholder: "विवरण लिखें...", save: "सहेजें" },
  ta: { title: "புதிய பரிவர்த்தனை", expense: "செலவு", income: "வருமானம்", amount: "தொகை (₹)", desc: "விளக்கம்", placeholder: "விவரம்...", save: "சேமி" },
  te: { title: "కొత్త లావాదేవీ", expense: "ఖర్చు", income: "ఆదాయం", amount: "మొత్తం (₹)", desc: "వివరణ", placeholder: "వివరాలు...", save: "సేవ్" },
  kn: { title: "ಹೊಸ ವಹಿವಾಟು", expense: "ಖರ್ಚು", income: "ಆದಾಯ", amount: "ಮೊತ್ತ (₹)", desc: "ವಿವರಣೆ", placeholder: "ವಿವರಗಳು...", save: "ಉಳಿಸಿ" },
  ml: { title: "പുതിയ ഇടപാട്", expense: "ചെലവ്", income: "വരമാനം", amount: "തുക (₹)", desc: "വിവരണം", placeholder: "വിവരങ്ങൾ...", save: "സേവ് ചെയ്യുക" }
};

export default function TransactionForm({ initialData, onClose, language = 'en' }: any) {
  const { user } = useAuth(); // Get the logged-in user
  const [amount, setAmount] = useState(initialData.amount || '');
  const [description, setDescription] = useState(initialData.description || '');
  const [type, setType] = useState(initialData.type || 'expense');
  
  // Default to English ('en') if language is not passed
  const t = formTranslations[language] || formTranslations.en;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      alert("You must be logged in to save data.");
      return;
    }

    const { error } = await supabase.from('transactions').insert([
      { 
        amount: parseFloat(amount), 
        description: description.trim(), 
        type: type,
        user_id: user.id // IMPORTANT: Links the data to the logged-in person
      }
    ]);

    if (error) {
      console.error("Supabase Error:", error.message);
      alert("Database Error: " + error.message);
    } else {
      onClose();
      window.location.reload(); 
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-[110] p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-lg overflow-hidden animate-in slide-in-from-bottom duration-300">
        <div className="p-6 border-b flex justify-between items-center bg-gray-50/50">
          <h2 className="text-xl font-black text-gray-900 tracking-tight">{t.title}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors"><X className="w-6 h-6 text-gray-400" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="flex gap-3 bg-gray-100 p-1.5 rounded-2xl">
            <button type="button" onClick={() => setType('expense')} className={`flex-1 py-3 rounded-xl font-bold transition-all ${type === 'expense' ? 'bg-red-500 text-white shadow-lg' : 'text-gray-500'}`}>{t.expense}</button>
            <button type="button" onClick={() => setType('income')} className={`flex-1 py-3 rounded-xl font-bold transition-all ${type === 'income' ? 'bg-green-500 text-white shadow-lg' : 'text-gray-500'}`}>{t.income}</button>
          </div>
          <div>
            <label className="block text-xs font-black text-gray-400 uppercase mb-2">{t.amount}</label>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full px-4 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl text-3xl font-black focus:border-primary-500 outline-none" placeholder="0" required />
          </div>
          <div>
            <label className="block text-xs font-black text-gray-400 uppercase mb-2">{t.desc}</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="w-full px-4 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl min-h-[100px]" placeholder={t.placeholder} required />
          </div>
          <button type="submit" className="w-full bg-black text-white font-black py-5 rounded-2xl shadow-xl active:scale-95 transition-all text-xl">
             <Save className="inline w-6 h-6 mr-2" />{t.save}
          </button>
        </form>
      </div>
    </div>
  );
}
