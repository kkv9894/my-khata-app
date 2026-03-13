import { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Calendar, Clock, PieChart, Activity } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { SupportedLanguage, TransactionRecord } from '../lib/types';
import { useRole } from '../contexts/RoleContext';

const translations: Record<SupportedLanguage, Record<string, string>> = {
  en: { title: 'Financial Report', balance: 'Net Balance', income: 'Income', expense: 'Expense', savings: 'Savings', weekly: 'Last 7 Days Spending', overview: 'Top Expense Categories' },
  hi: { title: 'Financial Report', balance: 'Net Balance', income: 'Income', expense: 'Expense', savings: 'Savings', weekly: 'Last 7 Days Spending', overview: 'Top Expense Categories' },
  ta: { title: 'Financial Report', balance: 'Net Balance', income: 'Income', expense: 'Expense', savings: 'Savings', weekly: 'Last 7 Days Spending', overview: 'Top Expense Categories' },
  te: { title: 'Financial Report', balance: 'Net Balance', income: 'Income', expense: 'Expense', savings: 'Savings', weekly: 'Last 7 Days Spending', overview: 'Top Expense Categories' },
  kn: { title: 'Financial Report', balance: 'Net Balance', income: 'Income', expense: 'Expense', savings: 'Savings', weekly: 'Last 7 Days Spending', overview: 'Top Expense Categories' },
  ml: { title: 'Financial Report', balance: 'Net Balance', income: 'Income', expense: 'Expense', savings: 'Savings', weekly: 'Last 7 Days Spending', overview: 'Top Expense Categories' },
};

export default function Dashboard({ language = 'en' }: { language?: SupportedLanguage }) {
  const { effectiveUserId } = useRole();
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const t = translations[language];

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const loadStats = async () => {
      if (!effectiveUserId) {
        setTransactions([]);
        return;
      }

      const { data } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', effectiveUserId)
        .order('created_at', { ascending: true });

      setTransactions((data || []) as TransactionRecord[]);
    };

    void loadStats();
  }, [effectiveUserId]);

  const totalIn = transactions.filter((transaction) => transaction.type === 'income').reduce((sum, transaction) => sum + transaction.amount, 0);
  const totalEx = transactions.filter((transaction) => transaction.type === 'expense').reduce((sum, transaction) => sum + transaction.amount, 0);
  const balance = totalIn - totalEx;
  const savingsPercent = totalIn > 0 ? Math.max(0, Math.min(100, Math.round(((totalIn - totalEx) / totalIn) * 100))) : 0;

  const chartData = useMemo(() => {
    return [...Array(7)].map((_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - index);
      const dateKey = date.toISOString().split('T')[0];
      const dayTotal = transactions
        .filter((transaction) => transaction.type === 'expense' && transaction.transaction_date === dateKey)
        .reduce((sum, transaction) => sum + transaction.amount, 0);
      return {
        day: date.toLocaleDateString(language, { weekday: 'short' }),
        amount: dayTotal,
      };
    }).reverse();
  }, [language, transactions]);

  const maxVal = Math.max(...chartData.map((entry) => entry.amount), 1);

  // 🌟 NEW ENHANCEMENT: Calculate Top 5 Categories from AI data
  const categoryTotals = useMemo(() => {
    const expenses = transactions.filter(tx => tx.type === 'expense');
    const totals = expenses.reduce((acc, tx) => {
      const cat = tx.category_label || 'General';
      acc[cat] = (acc[cat] || 0) + tx.amount;
      return acc;
    }, {} as Record<string, number>);
    
    // Sort highest to lowest and grab the top 5
    return Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [transactions]);

  return (
    <div className="space-y-6 p-4 pb-32 animate-in fade-in duration-300">
      <div className="flex items-center justify-between rounded-2xl border border-navy-600 bg-navy-800 p-4 shadow-card-dark">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-navy-700 p-2"><Calendar className="h-5 w-5 text-slate-300" /></div>
          <div>
            <p className="mb-1 text-[10px] font-black uppercase leading-none text-slate-400">Today</p>
            <p className="text-sm font-bold text-white">{currentTime.toLocaleDateString(language, { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </div>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-2 text-lg font-black text-slate-300">
            <Clock size={18} />
            {currentTime.toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>

      <h2 className="flex items-center gap-2 px-1 text-2xl font-black"><PieChart className="text-slate-300" />{t.title}</h2>

      <div className="relative overflow-hidden rounded-[2.5rem] bg-navy-800 border border-cyan/30 p-8 text-white shadow-cyan-glow">
        <div className="absolute right-[-20px] top-[-10px] opacity-10">
          <Activity size={120} />
        </div>
        <div className="relative z-10">
          <p className="mb-3 text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">{t.balance}</p>
          <p className="mb-6 text-5xl font-black tracking-tighter">₹{balance.toLocaleString('en-IN')}</p>
          <div className="space-y-2">
            <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-400">
              <span>{t.savings}</span>
              <span>{savingsPercent}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-white transition-all duration-1000 ease-out" style={{ width: `${savingsPercent}%` }} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="group relative overflow-hidden rounded-3xl border-2 border-navy-600 bg-navy-800 p-5 shadow-card-dark">
          <ArrowUpRight className="absolute -right-2 -top-2 h-12 w-12 text-green-500/10 transition-transform group-hover:scale-110" />
          <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-green-600">{t.income}</p>
          <p className="text-2xl font-black text-white">₹{totalIn.toLocaleString('en-IN')}</p>
        </div>
        <div className="group relative overflow-hidden rounded-3xl border-2 border-navy-600 bg-navy-800 p-5 shadow-card-dark">
          <ArrowDownRight className="absolute -right-2 -top-2 h-12 w-12 text-red-500/10 transition-transform group-hover:scale-110" />
          <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-red-600">{t.expense}</p>
          <p className="text-2xl font-black text-white">₹{totalEx.toLocaleString('en-IN')}</p>
        </div>
      </div>

      <div className="rounded-[2rem] border-2 border-navy-600 bg-navy-800 p-6 shadow-card-dark">
        <h3 className="mb-6 text-[10px] font-black uppercase tracking-widest text-slate-400">{t.weekly}</h3>
        <div className="flex h-32 items-end justify-between gap-2 px-1">
          {chartData.map((entry) => (
            <div key={entry.day} className="group flex flex-1 flex-col items-center gap-3">
              <div className="relative flex h-full w-full flex-col justify-end">
                <div className="relative w-full rounded-t-xl bg-navy-700 transition-all duration-700 group-hover:bg-cyan" style={{ height: `${(entry.amount / maxVal) * 100}%`, minHeight: '6px' }}>
                  {entry.amount > 0 && <span className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-[8px] font-black text-cyan opacity-0 transition-opacity group-hover:opacity-100">₹{entry.amount}</span>}
                </div>
              </div>
              <span className="text-[10px] font-bold uppercase text-slate-400">{entry.day}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 🌟 NEW ENHANCEMENT UI: AI Category Breakdown */}
      {categoryTotals.length > 0 && (
        <div className="rounded-[2rem] border-2 border-navy-600 bg-navy-800 p-6 shadow-card-dark mt-4">
          <h3 className="mb-5 text-[10px] font-black uppercase tracking-widest text-slate-400">{t.overview}</h3>
          <div className="space-y-4">
            {categoryTotals.map(([category, amount]) => {
              const percentage = totalEx > 0 ? Math.round((amount / totalEx) * 100) : 0;
              return (
                <div key={category} className="space-y-1">
                  <div className="flex justify-between text-sm font-bold text-slate-300">
                    <span>{category}</span>
                    <span>₹{amount.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                    <div 
                      className="bg-black h-2.5 rounded-full transition-all duration-1000 ease-out" 
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}