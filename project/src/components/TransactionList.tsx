import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Wallet } from 'lucide-react';
import { supabase } from '../lib/supabase';

const translations: any = {
  en: { bachat: "Savings", kamayi: "Income", kharcha: "Expense", history: "History", all: "All", income: "Income", expense: "Expense", no_trans: "No data" },
  hi: { bachat: "बचत", kamayi: "कमाई", kharcha: "खर्चा", history: "इतिहास", all: "सभी", income: "आय", expense: "खर्च", no_trans: "डेटा नहीं है" },
  ta: { bachat: "சேமிப்பு", kamayi: "வருமானம்", kharcha: "செലவு", history: "வரலாறு", all: "அனைத்தும்", income: "வருமானம்", expense: "செலவு", no_trans: "தகவல் இல்லை" },
  te: { bachat: "పొదుపు", kamayi: "ఆదాయం", kharcha: "ఖర్చు", history: "చరిత్ర", ఆల్: "అన్నీ", income: "ఆదాయం", expense: "ఖర్చు", no_trans: "డేటా లేదు" },
  kn: { bachat: "ಉಳಿತಾಯ", kamayi: "ಆದಾಯ", kharcha: "ಖರ್ಚು", history: "ಇತಿಹಾಸ", all: "ಎಲ್ಲಾ", income: "ಆದಾಯ", expense: "ಖರ್ಚು", no_trans: "ಮಾಹಿತಿ ಇಲ್ಲ" },
  ml: { bachat: "സമ്പാദ്യം", kamayi: "വരമാനം", kharcha: "ചെലവ്", history: "ചരിത്രം", all: "എല്ലാം", income: "വരമാനം", expense: "ചെലവ്", no_trans: "വിവരങ്ങൾ ഇല്ല" }
};

export default function TransactionList({ language = 'hi' }: { language?: string }) {
  const [transactions, setTransactions] = useState<any[]>([]);
  const t = translations[language as any] || translations.hi;

  useEffect(() => {
    const load = async () => {
      // We removed the 'if (!user)' check and the '.eq' filter
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .order('created_at', { ascending: false }); // Updated to created_at
      
      if (error) {
        console.error("Error fetching:", error.message);
      } else {
        setTransactions(data || []);
      }
    };
    load();
  }, []); // Run once on load

  const totalIn = transactions.filter(tr => tr.type === 'income').reduce((sum, tr) => sum + tr.amount, 0);
  const totalEx = transactions.filter(tr => tr.type === 'expense').reduce((sum, tr) => sum + tr.amount, 0);

  return (
    <div className="p-4 space-y-6 pb-20">
      <div className="bg-black p-6 rounded-3xl text-white shadow-lg">
        <p className="text-xs font-bold uppercase opacity-60">{t.bachat}</p>
        <h2 className="text-4xl font-black">₹{totalIn - totalEx}</h2>
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded-2xl border-2 border-gray-100 font-bold">
          <p className="text-green-600 text-xs">{t.kamayi}</p>
          <span className="text-xl">₹{totalIn}</span>
        </div>
        <div className="bg-white p-4 rounded-2xl border-2 border-gray-100 font-bold">
          <p className="text-red-600 text-xs">{t.kharcha}</p>
          <span className="text-xl">₹{totalEx}</span>
        </div>
      </div>

      <h2 className="font-black text-xl tracking-tight">{t.history}</h2>
      
      <div className="space-y-3">
        {transactions.length === 0 ? (
          <div className="text-center py-10 text-gray-400 font-bold">
            {t.no_trans}
          </div>
        ) : (
          transactions.map(tr => (
            <div key={tr.id} className="bg-white p-4 rounded-2xl border-2 border-gray-50 flex justify-between items-center shadow-sm">
               <div>
                 <p className="font-black text-gray-800">{tr.description || t.no_trans}</p>
                 <p className="text-[10px] text-gray-400 font-bold uppercase">
                   {new Date(tr.created_at).toLocaleDateString()}
                 </p>
               </div>
               <p className={`font-black text-lg ${tr.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                 {tr.type === 'income' ? '+' : '-'}₹{tr.amount}
               </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
