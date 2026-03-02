import { useState, useEffect } from 'react';
import { PieChart, TrendingUp, TrendingDown, Calendar } from 'lucide-react';
import { supabase } from '../lib/supabase';

const translations: any = {
  en: { title: "Financial Report", balance: "Net Balance", income: "Total Income", expense: "Total Expense", savings: "Savings Rate" },
  hi: { title: "वित्तीय रिपोर्ट", balance: "कुल बैलेंस", income: "कुल कमाई", expense: "कुल खर्चा", savings: "बचत दर" },
  ta: { title: "நிதி அறிக்கை", balance: "மொத்த இருப்பு", income: "மொத்த வருமானம்", expense: "மொத்த செலவு", savings: "சேமிப்பு விகிதம்" },
  te: { title: "ఆర్థిక నివేదిక", balance: "మొత్తం బ్యాలెన్స్", income: "మొత్తం ఆదాయం", expense: "మొత్తం ఖర్చు", savings: "పొదుపు రేటు" },
  kn: { title: "ಹಣಕาสು ವರದಿ", balance: "ಒಟ್ಟು ಬಾಕಿ", income: "ಒಟ್ಟು ಆದಾಯ", expense: "ಒಟ್ಟು ಖರ್ಚು", savings: "ಉಳಿತಾಯ ದರ" },
  ml: { title: "സാമ്പത്തിക റിപ്പോർട്ട്", balance: "ആകെ ബാലൻസ്", income: "ആകെ വരുമാനം", expense: "ആകെ ചെലവ്", savings: "സമ്പാദ്യ നിരക്ക്" }
};

export default function Dashboard({ language = 'hi' }: any) {
  const [data, setData] = useState<any[]>([]);
  const t = translations[language as any] || translations.hi;

  useEffect(() => {
    const fetchStats = async () => {
      const { data: transactions } = await supabase
        .from('transactions')
        .select('*');
      if (transactions) setData(transactions);
    };
    fetchStats();
  }, []);

  const totalIn = data.filter((tr: any) => tr.type === 'income').reduce((s: number, tr: any) => s + tr.amount, 0);
  const totalEx = data.filter((tr: any) => tr.type === 'expense').reduce((s: number, tr: any) => s + tr.amount, 0);

  return (
    <div className="p-4 space-y-6">
      <h2 className="text-2xl font-black flex items-center gap-2"><PieChart className="text-primary-600" />{t.title}</h2>
      
      <div className="bg-white p-6 rounded-3xl border-2 border-primary-100 shadow-sm text-center">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">{t.balance}</p>
        <p className="text-4xl font-black text-primary-600">₹{totalIn - totalEx}</p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div className="bg-green-50 p-5 rounded-2xl border border-green-100 flex justify-between items-center">
          <div>
            <p className="text-green-600 font-bold text-xs uppercase tracking-wider">{t.income}</p>
            <p className="text-2xl font-black">₹{totalIn}</p>
          </div>
          <TrendingUp className="text-green-200 w-10 h-10" />
        </div>

        <div className="bg-red-50 p-5 rounded-2xl border border-red-100 flex justify-between items-center">
          <div>
            <p className="text-red-600 font-bold text-xs uppercase tracking-wider">{t.expense}</p>
            <p className="text-2xl font-black">₹{totalEx}</p>
          </div>
          <TrendingDown className="text-red-200 w-10 h-10" />
        </div>
      </div>
    </div>
  );
}
