import { useEffect, useMemo, useState } from 'react';
import { FileDown, Loader2, MessageCircle, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { SupportedLanguage, TransactionRecord } from '../lib/types';
import { useRole } from '../contexts/RoleContext';

export default function Reports({ language = 'en' }: { language?: SupportedLanguage }) {
  void language;
  const { effectiveUserId } = useRole();
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  useEffect(() => {
    const loadTransactions = async () => {
      if (!effectiveUserId) {
        setTransactions([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      const [year, month] = selectedMonth.split('-');
      const startDate = `${year}-${month}-01`;
      const endDate = new Date(Number(year), Number(month), 0).toISOString().split('T')[0];

      const { data } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', effectiveUserId)
        .gte('transaction_date', startDate)
        .lte('transaction_date', endDate)
        .order('transaction_date', { ascending: false });

      setTransactions((data || []) as TransactionRecord[]);
      setLoading(false);
    };

    void loadTransactions();
  }, [effectiveUserId, selectedMonth]);

  const totalIncome = transactions.filter((transaction) => transaction.type === 'income').reduce((sum, transaction) => sum + transaction.amount, 0);
  const totalExpense = transactions.filter((transaction) => transaction.type === 'expense').reduce((sum, transaction) => sum + transaction.amount, 0);
  const balance = totalIncome - totalExpense;

  const topCategories = useMemo(() => {
    const totals = transactions
      .filter((transaction) => transaction.type === 'expense')
      .reduce<Record<string, number>>((accumulator, transaction) => {
        const category = transaction.category_label || 'Other';
        accumulator[category] = (accumulator[category] || 0) + transaction.amount;
        return accumulator;
      }, {});

    return Object.entries(totals).sort((left, right) => right[1] - left[1]).slice(0, 5);
  }, [transactions]);

  const months = Array.from({ length: 12 }, (_, index) => {
    const date = new Date();
    date.setMonth(date.getMonth() - index);
    return {
      val: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      label: date.toLocaleString('default', { month: 'long', year: 'numeric' }),
    };
  });

  const downloadCSV = () => {
    setDownloading(true);
    const headers = ['Date', 'Description', 'Category', 'Type', 'Amount'];
    const rows = transactions.map((transaction) => [
      transaction.transaction_date || '',
      `"${transaction.description || ''}"`,
      transaction.category_label || 'Other',
      transaction.type,
      transaction.amount,
    ]);
    const csv = [headers, ...rows].map((row) => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `khata-report-${selectedMonth}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setDownloading(false);
  };

  const downloadPDF = () => {
    setDownloading(true);
    const [year, month] = selectedMonth.split('-');
    const monthName = new Date(Number(year), Number(month) - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
    const rows = transactions.map((transaction) => `
      <tr>
        <td>${transaction.transaction_date || ''}</td>
        <td>${transaction.description || '-'}</td>
        <td>${transaction.category_label || 'Other'}</td>
        <td style="color:${transaction.type === 'income' ? 'green' : 'red'}">${transaction.type}</td>
        <td style="text-align:right;font-weight:bold;color:${transaction.type === 'income' ? 'green' : 'red'}">${transaction.type === 'income' ? '+' : '-'}₹${transaction.amount}</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>My Khata Report - ${monthName}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 30px; color: #111; }
          h1 { font-size: 24px; margin-bottom: 4px; }
          .subtitle { color: #888; font-size: 13px; margin-bottom: 24px; }
          .summary { display: flex; gap: 16px; margin-bottom: 24px; }
          .card { flex: 1; padding: 16px; border-radius: 12px; }
          .card.green { background: #f0fdf4; }
          .card.red { background: #fef2f2; }
          .card.blue { background: #f0f9ff; }
          .card-label { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 1px; }
          .card-amount { font-size: 22px; font-weight: bold; margin-top: 4px; }
          table { width: 100%; border-collapse: collapse; font-size: 13px; }
          th { background: #f9f9f9; padding: 10px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #666; }
          td { padding: 10px; border-bottom: 1px solid #f0f0f0; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <h1>My Khata</h1>
        <p class="subtitle">Transaction Report - ${monthName}</p>
        <div class="summary">
          <div class="card green"><div class="card-label">Total Income</div><div class="card-amount" style="color:green">₹${totalIncome.toLocaleString('hi-IN')}</div></div>
          <div class="card red"><div class="card-label">Total Expense</div><div class="card-amount" style="color:red">₹${totalExpense.toLocaleString('hi-IN')}</div></div>
          <div class="card blue"><div class="card-label">Balance</div><div class="card-amount" style="color:${balance >= 0 ? 'green' : 'red'}">₹${balance.toLocaleString('hi-IN')}</div></div>
        </div>
        <table>
          <thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Type</th><th>Amount</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </body>
      </html>`;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      window.setTimeout(() => {
        printWindow.print();
        setDownloading(false);
      }, 500);
    } else {
      setDownloading(false);
    }
  };

  const shareWhatsApp = () => {
    const [year, month] = selectedMonth.split('-');
    const monthName = new Date(Number(year), Number(month) - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
    const topCategoryText = topCategories.length > 0
      ? `\n\nTop Expenses:\n${topCategories.map(([category, amount]) => `- ${category}: ₹${amount}`).join('\n')}`
      : '';

    const message = `My Khata Report - ${monthName}\n\nTotal Income: ₹${totalIncome.toLocaleString('hi-IN')}\nTotal Expense: ₹${totalExpense.toLocaleString('hi-IN')}\nBalance: ₹${balance.toLocaleString('hi-IN')}${topCategoryText}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
  };

  return (
    <div className="space-y-5 p-4 pb-32">
      <div className="rounded-2xl border border-navy-600 bg-navy-800 p-4 shadow-card-dark">
        <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Select Month</p>
        <select value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} className="w-full rounded-xl bg-navy-900 px-4 py-3 font-bold text-white outline-none">
          {months.map((month) => <option key={month.val} value={month.val}>{month.label}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-slate-500" size={30} /></div>
      ) : (
        <>
          <div className="rounded-[2.5rem] bg-navy-800 border border-cyan/30 p-6 text-white shadow-cyan-glow">
            <p className="mb-1 text-[10px] font-black uppercase tracking-[0.2em] opacity-50">Balance</p>
            <h2 className={`text-4xl font-black tracking-tighter ${balance < 0 ? 'text-red-400' : 'text-white'}`}>₹{balance.toLocaleString('hi-IN')}</h2>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-[2rem] border border-navy-600 bg-navy-800 p-5 shadow-card-dark">
              <div className="mb-2 flex items-center gap-2"><TrendingUp size={14} className="text-green-600" /><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Income</p></div>
              <span className="text-xl font-black text-green-600">₹{totalIncome.toLocaleString('hi-IN')}</span>
            </div>
            <div className="rounded-[2rem] border border-navy-600 bg-navy-800 p-5 shadow-card-dark">
              <div className="mb-2 flex items-center gap-2"><TrendingDown size={14} className="text-red-600" /><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Expense</p></div>
              <span className="text-xl font-black text-red-600">₹{totalExpense.toLocaleString('hi-IN')}</span>
            </div>
          </div>

          {topCategories.length > 0 && (
            <div className="rounded-2xl border border-navy-600 bg-navy-800 p-5 shadow-card-dark">
              <p className="mb-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Top Expense Categories</p>
              <div className="space-y-3">
                {topCategories.map(([category, amount]) => {
                  const percent = totalExpense > 0 ? Math.round((amount / totalExpense) * 100) : 0;
                  return (
                    <div key={category}>
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-sm font-bold text-slate-300">{category}</span>
                        <span className="text-sm font-black text-white">₹{amount.toLocaleString('hi-IN')} <span className="font-normal text-slate-400">({percent}%)</span></span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-navy-700"><div className="h-full rounded-full bg-cyan" style={{ width: `${percent}%` }} /></div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <p className="px-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Export and Share</p>
            <button onClick={downloadPDF} disabled={downloading || transactions.length === 0} className="flex w-full items-center justify-center gap-3 rounded-2xl bg-black p-4 font-bold text-white disabled:opacity-40"><FileDown size={20} />Download PDF Report</button>
            <button onClick={downloadCSV} disabled={downloading || transactions.length === 0} className="flex w-full items-center justify-center gap-3 rounded-2xl bg-gray-100 p-4 font-bold text-white disabled:opacity-40"><FileDown size={20} />Download CSV</button>
            <button onClick={shareWhatsApp} disabled={transactions.length === 0} className="flex w-full items-center justify-center gap-3 rounded-2xl bg-[#25D366] p-4 font-bold text-white disabled:opacity-40"><MessageCircle size={20} />Share Summary on WhatsApp</button>
          </div>

          {transactions.length === 0 && (
            <div className="py-8 text-center text-slate-400"><Wallet size={40} className="mx-auto mb-3 opacity-30" /><p className="text-sm font-bold">No transactions this month</p></div>
          )}
        </>
      )}
    </div>
  );
}