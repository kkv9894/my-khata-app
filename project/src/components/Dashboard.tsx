import { useState, useEffect } from 'react';
import { PieChart, TrendingUp, TrendingDown, Clock, Calendar, Target, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { supabase } from '../lib/supabase';

const translations: any = {
  en: { title: "Financial Report", balance: "Net Balance", income: "Income", expense: "Expense", savings: "Savings", weekly: "Last 7 Days Spending" },
  hi: { title: "वित्तीय रिपोर्ट", balance: "कुल बैलेंस", income: "कमाई", expense: "खर्चा", savings: "बचत", weekly: "पिछले 7 दिनों का खर्च" },
  ta: { title: "நிதி அறிக்கை", balance: "மொத்த இருப்பு", income: "வருமானம்", expense: "செலவு", savings: "சேமிப்பு", weekly: "கடந்த 7 நாட்கள் செலவு" },
  te: { title: "ఆర్థిక నివేదిక", balance: "మొత్తం బ్యాలెన్స్", income: "ఆదాయం", expense: "ఖర్చు", savings: "పొదుపు", weekly: "గత 7 రోజుల ఖర్చు" },
  kn: { title: "ಹಣಕಾಸು ವರದಿ", balance: "ಒಟ್ಟು ಬಾಕಿ", income: "ಆದಾಯ", expense: "ಖರ್ಚು", savings: "ಉಳಿತాయ", weekly: "ಕಳೆದ 7 ದಿನಗಳ ಖರ್ಚು" },
  ml: { title: "സാമ്പത്തിക റിപ്പോർട്ട്", balance: "ആകെ ബാലൻസ്", income: "വരമാനം", expense: "ചെലവ്", savings: "സമ്പാദ്യം", weekly: "കഴിഞ്ഞ 7 ദിവസത്തെ ചെലവ്" }
};

export default function Dashboard({ language = 'hi' }: any) {
  const [data, setData] = useState<any[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const t = translations[language as any] || translations.hi;

  // Update clock every minute
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const fetchStats = async () => {
      const { data: transactions } = await supabase
        .from('transactions')
        .select('*')
        .order('created_at', { ascending: true });
      if (transactions) setData(transactions);
    };
    fetchStats();
  }, []);

  // Stats Calculations
  const totalIn = data.filter((tr: any) => tr.type === 'income').reduce((s: number, tr: any) => s + tr.amount, 0);
  const totalEx = data.filter((tr: any) => tr.type === 'expense').reduce((s: number, tr: any) => s + tr.amount, 0);
  const balance = totalIn - totalEx;
  const savingsPercent = totalIn > 0 ? Math.max(0, Math.min(100, Math.round(((totalIn - totalEx) / totalIn) * 100))) : 0;

  // Chart Logic: Last 7 Days
  const chartData = [...Array(7)].map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toLocaleDateString();
    const dayTotal = data
      .filter(tr => tr.type === 'expense' && new Date(tr.created_at).toLocaleDateString() === dateStr)
      .reduce((sum, tr) => sum + tr.amount, 0);
    return { day: d.toLocaleDateString(language, { weekday: 'short' }), amount: dayTotal };
  }).reverse();

  const maxVal = Math.max(...chartData.map(d => d.amount), 1);

  return (
    <div className="p-4 space-y-6 pb-24 animate-in fade-in duration-700">
      
      {/* --- UNIQUE HEADER: DATE & TIME --- */}
      <div className="flex justify-between items-center bg-gray-50 p-4 rounded-2xl border-b shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-white p-2 rounded-xl shadow-sm">
            <Calendar className="text-primary-600 w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] font-black text-gray-400 uppercase leading-none mb-1">Today</p>
            <p className="font-bold text-gray-800 text-sm">{currentTime.toLocaleDateString(language, { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </div>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-2 text-primary-600 font-black text-lg">
            <Clock size={18} />
            {currentTime.toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>

      <h2 className="text-2xl font-black flex items-center gap-2 px-1"><PieChart className="text-primary-600" />{t.title}</h2>

      {/* --- PREMIUM BALANCE CARD --- */}
      <div className="bg-black p-8 rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden">
        <div className="relative z-10">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mb-3">{t.balance}</p>
          <p className="text-5xl font-black tracking-tighter mb-6">₹{balance.toLocaleString()}</p>
          
          <div className="space-y-2">
            <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-gray-400">
              <span>{t.savings}</span>
              <span>{savingsPercent}%</span>
            </div>
            <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary-500 transition-all duration-1000 ease-out" 
                style={{ width: `${savingsPercent}%` }}
              />
            </div>
          </div>
        </div>
        <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-primary-600 rounded-full blur-[80px] opacity-30" />
      </div>

      {/* --- INCOME/EXPENSE GRID --- */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white p-5 rounded-3xl border-2 border-gray-50 shadow-sm relative overflow-hidden group">
          <ArrowUpRight className="absolute -right-2 -top-2 w-12 h-12 text-green-500/10 group-hover:scale-110 transition-transform" />
          <p className="text-green-600 font-black text-[10px] uppercase mb-1">{t.income}</p>
          <p className="text-2xl font-black text-gray-900">₹{totalIn.toLocaleString()}</p>
        </div>

        <div className="bg-white p-5 rounded-3xl border-2 border-gray-50 shadow-sm relative overflow-hidden group">
          <ArrowDownRight className="absolute -right-2 -top-2 w-12 h-12 text-red-500/10 group-hover:scale-110 transition-transform" />
          <p className="text-red-600 font-black text-[10px] uppercase mb-1">{t.expense}</p>
          <p className="text-2xl font-black text-gray-900">₹{totalEx.toLocaleString()}</p>
        </div>
      </div>

      {/* --- WEEKLY SPENDING CHART --- */}
      <div className="bg-white p-6 rounded-[2rem] border-2 border-gray-50 shadow-sm">
        <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-6">{t.weekly}</h3>
        <div className="flex items-end justify-between gap-2 h-32 px-1">
          {chartData.map((day, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-3 group">
              <div className="relative w-full flex flex-col justify-end h-full">
                <div 
                  className="w-full bg-gray-100 rounded-t-xl transition-all duration-700 group-hover:bg-primary-500 relative"
                  style={{ height: `${(day.amount / maxVal) * 100}%`, minHeight: '6px' }}
                >
                  {day.amount > 0 && (
                    <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[8px] font-black text-primary-600 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                      ₹{day.amount}
                    </span>
                  )}
                </div>
              </div>
              <span className="text-[10px] font-bold text-gray-400 uppercase">{day.day}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
