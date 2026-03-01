import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Wallet } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const translations: any = {
  en: { bachat: "Savings", kamayi: "Income", kharcha: "Expense", history: "History", all: "All", income: "Income", expense: "Expense", no_trans: "No data" },
  hi: { bachat: "बचत", kamayi: "कमाई", kharcha: "खर्चा", history: "इतिहास", all: "सभी", income: "आय", expense: "खर्च", no_trans: "डेटा नहीं है" },
  ta: { bachat: "சேமிப்பு", kamayi: "வருமானம்", kharcha: "செலவு", history: "வரலாறு", all: "அனைத்தும்", income: "வருமானம்", expense: "செலவு", no_trans: "தகவல் இல்லை" },
  te: { bachat: "పొదుపు", kamayi: "ఆదాయం", kharcha: "ఖర్చు", history: "చరిత్ర", all: "అన్నీ", income: "ఆదాయం", expense: "ఖర్చు", no_trans: "డేటా లేదు" },
  kn: { bachat: "ಉಳಿತಾಯ", kamayi: "ಆದಾಯ", kharcha: "ಖರ್ಚು", history: "ಇತಿಹಾಸ", all: "ಎಲ್ಲಾ", income: "ಆದಾಯ", expense: "ಖರ್ಚು", no_trans: "ಮಾಹಿತಿ ಇಲ್ಲ" },
  ml: { bachat: "സമ്പാദ്യം", kamayi: "വരുമാനം", kharcha: "ചെലവ്", history: "ചരിത്രം", all: "എല്ലാം", income: "വരുമാനം", expense: "ചെലവ്", no_trans: "വിവരങ്ങൾ ഇല്ല" }
};

export default function TransactionList({ language = 'hi' }: { language?: string }) {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<any[]>([]);
  const t = translations[language as any] || translations.hi;

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      const { data } = await supabase.from('transactions').select('*').eq('user_id', user.id).order('transaction_date', { ascending: false });
      setTransactions(data || []);
    };
    load();
  }, [user]);

  const totalIn = transactions.filter(tr => tr.type === 'income').reduce((sum, tr) => sum + tr.amount, 0);
  const totalEx = transactions.filter(tr => tr.type === 'expense').reduce((sum, tr) => sum + tr.amount, 0);

  return (
    <div className="p-4 space-y-6">
      <div className="bg-primary-600 p-6 rounded-3xl text-white shadow-lg">
        <p className="text-xs font-bold uppercase">{t.bachat}</p>
        <h2 className="text-4xl font-black">₹{totalIn - totalEx}</h2>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded-2xl border font-bold"><p className="text-green-600 text-xs">{t.kamayi}</p>₹{totalIn}</div>
        <div className="bg-white p-4 rounded-2xl border font-bold"><p className="text-red-600 text-xs">{t.kharcha}</p>₹{totalEx}</div>
      </div>
      <h2 className="font-bold text-xl">{t.history}</h2>
      <div className="space-y-3">
        {transactions.map(tr => (
          <div key={tr.id} className="bg-white p-4 rounded-xl border flex justify-between items-center shadow-sm">
             <div><p className="font-bold">{tr.description || t.no_trans}</p><p className="text-xs text-gray-400">{tr.transaction_date}</p></div>
             <p className={`font-black ${tr.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>{tr.type === 'income' ? '+' : '-'}₹{tr.amount}</p>
          </div>
        ))}
      </div>
    </div>
  );
}