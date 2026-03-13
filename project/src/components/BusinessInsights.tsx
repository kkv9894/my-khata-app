// src/components/BusinessInsights.tsx
// ✅ FEATURE 4: AI Business Insights — Your pocket CFO

import { useState, useEffect } from 'react';
import { Sparkles, TrendingUp, TrendingDown, Loader2, RefreshCw, Brain, AlertTriangle, CheckCircle2, Lightbulb } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

interface Insight {
  type: 'positive' | 'warning' | 'tip' | 'info';
  title: string;
  detail: string;
}

interface InsightData {
  summary: string;
  insights: Insight[];
  top_expense_category: string;
  week_vs_last_week: string;
  advice: string;
}

const getInsightIcon = (type: Insight['type']) => {
  switch (type) {
    case 'positive': return <CheckCircle2 size={16} className="text-green-500 shrink-0 mt-0.5" />;
    case 'warning':  return <AlertTriangle size={16} className="text-yellow-500 shrink-0 mt-0.5" />;
    case 'tip':      return <Lightbulb size={16} className="text-blue-500 shrink-0 mt-0.5" />;
    default:         return <Brain size={16} className="text-purple-500 shrink-0 mt-0.5" />;
  }
};

const getInsightBg = (type: Insight['type']) => {
  switch (type) {
    case 'positive': return 'bg-green-50 border-green-100';
    case 'warning':  return 'bg-yellow-50 border-yellow-100';
    case 'tip':      return 'bg-blue-50 border-blue-100';
    default:         return 'bg-purple-50 border-purple-100';
  }
};

export default function BusinessInsights() {
  const { user } = useAuth();
  const [insights, setInsights] = useState<InsightData | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);
  const [weeklyStats, setWeeklyStats] = useState({
    income: 0, expense: 0, txCount: 0,
    prevIncome: 0, prevExpense: 0
  });

  useEffect(() => {
    loadWeeklyStats();
  }, []);

  const loadWeeklyStats = async () => {
    if (!user) return;

    const now = new Date();
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - 7);
    const prevWeekStart = new Date(now); prevWeekStart.setDate(now.getDate() - 14);

    const { data: thisWeek } = await supabase
      .from('transactions')
      .select('type, amount, description, category_id, transaction_date')
      .eq('user_id', user.id)
      .gte('transaction_date', weekStart.toISOString().split('T')[0]);

    const { data: prevWeek } = await supabase
      .from('transactions')
      .select('type, amount')
      .eq('user_id', user.id)
      .gte('transaction_date', prevWeekStart.toISOString().split('T')[0])
      .lt('transaction_date', weekStart.toISOString().split('T')[0]);

    const income = (thisWeek || []).filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = (thisWeek || []).filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const prevIncome = (prevWeek || []).filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const prevExpense = (prevWeek || []).filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

    setWeeklyStats({ income, expense, txCount: (thisWeek || []).length, prevIncome, prevExpense });
  };

  const generateInsights = async () => {
    if (!user || !GEMINI_API_KEY) return;
    setLoading(true);

    try {
      // Get last 30 days of transactions
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: transactions } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .gte('transaction_date', thirtyDaysAgo.toISOString().split('T')[0])
        .order('transaction_date', { ascending: false });

      if (!transactions || transactions.length === 0) {
        setInsights({
          summary: "Not enough data yet. Add more transactions to get AI insights!",
          insights: [{
            type: 'tip',
            title: 'Start recording',
            detail: 'Use voice input to record your daily transactions. The AI will analyze patterns once you have at least 7 days of data.'
          }],
          top_expense_category: 'N/A',
          week_vs_last_week: 'No data',
          advice: 'Add transactions to unlock AI insights.'
        });
        setLoading(false);
        return;
      }

      const txSummary = transactions.map(t =>
        `${t.transaction_date}: ${t.type} ₹${t.amount} - ${t.description} [${t.category_id || 'General'}]`
      ).join('\n');

      const prompt = `You are a financial analyst and business consultant for a small Indian business owner using "My Khata" app.

Analyze these last 30 days of transactions:
${txSummary}

This week: Income ₹${weeklyStats.income}, Expenses ₹${weeklyStats.expense}
Last week: Income ₹${weeklyStats.prevIncome}, Expenses ₹${weeklyStats.prevExpense}

Generate a business intelligence report. Be specific, actionable, and friendly. Use Indian context (₹, festivals, seasons, etc.)

OUTPUT ONLY this exact JSON (no markdown, no backticks):
{
  "summary": "2-sentence overview of their financial health",
  "insights": [
    {"type": "positive", "title": "Short title", "detail": "Specific observation with numbers"},
    {"type": "warning", "title": "Short title", "detail": "Specific concern with numbers"},
    {"type": "tip", "title": "Short title", "detail": "Actionable advice specific to their spending"},
    {"type": "info", "title": "Short title", "detail": "Interesting pattern or trend"}
  ],
  "top_expense_category": "Category name",
  "week_vs_last_week": "X% higher/lower than last week",
  "advice": "One specific, actionable piece of business advice in 1-2 sentences"
}`;

      // ✅ FIX: AbortController prevents infinite hang on slow connections
      const controller = new AbortController();
      const abortTimer = setTimeout(() => controller.abort(), 15000);
      let response: Response;
      try {
        response = await fetch(`${API_URL}?key=${GEMINI_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.3, topP: 0.8, topK: 10 }
          })
        });
      } catch (fetchErr: any) {
        clearTimeout(abortTimer);
        if (fetchErr?.name === 'AbortError') throw new Error('Insights request timed out after 15s');
        throw fetchErr;
      }
      clearTimeout(abortTimer);

      if (!response.ok) throw new Error(`Gemini error: ${response.status}`);
      const data = await response.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const start = rawText.indexOf('{');
      const end = rawText.lastIndexOf('}') + 1;
      const parsed: InsightData = JSON.parse(rawText.substring(start, end));

      setInsights(parsed);
      setLastGenerated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } catch (err: any) {
      console.error('Insights error:', err);
      const msg = err?.message ?? 'Unknown error';
      const friendly = msg.includes('429') ? 'AI is busy. Please try again in a moment.'
        : msg.includes('timed out') ? 'Request timed out. Please try again.'
        : msg.includes('API key') || msg.includes('Missing') ? 'AI key issue — check VITE_GEMINI_API_KEY in .env'
        : "Couldn't generate insights right now. Please try again.";
      setInsights({
        summary: friendly,
        insights: [],
        top_expense_category: 'Unknown',
        week_vs_last_week: 'Unknown',
        advice: 'Please try again in a moment.'
      });
    }
    setLoading(false);
  };

  const incomeChange = weeklyStats.prevIncome > 0
    ? Math.round(((weeklyStats.income - weeklyStats.prevIncome) / weeklyStats.prevIncome) * 100)
    : 0;
  const expenseChange = weeklyStats.prevExpense > 0
    ? Math.round(((weeklyStats.expense - weeklyStats.prevExpense) / weeklyStats.prevExpense) * 100)
    : 0;

  return (
    <div className="p-4 space-y-5 pb-32">

      {/* Header Card */}
      <div className="bg-navy-800 border border-cyan/30 p-6 rounded-[2.5rem] text-white shadow-cyan-glow">
        <div className="flex items-center gap-2 mb-3">
          <Brain size={20} className="opacity-70" />
          <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-50">AI Business Insights</p>
        </div>
        <h2 className="text-2xl font-black tracking-tight leading-tight">Your Pocket CFO</h2>
        <p className="text-[11px] opacity-50 mt-1">Powered by Gemini AI · Analyzes last 30 days</p>
      </div>

      {/* This Week Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-navy-700 p-4 rounded-[1.5rem] border border-navy-600 shadow-card-dark">
          <div className="flex items-center gap-1 mb-2">
            <TrendingUp size={13} className="text-green-500" />
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">This Week Income</p>
          </div>
          <p className="font-black text-lg text-green-600">₹{weeklyStats.income.toLocaleString('hi-IN')}</p>
          {incomeChange !== 0 && (
            <p className={`text-[10px] font-bold mt-1 ${incomeChange > 0 ? 'text-green-500' : 'text-red-500'}`}>
              {incomeChange > 0 ? '↑' : '↓'} {Math.abs(incomeChange)}% vs last week
            </p>
          )}
        </div>
        <div className="bg-navy-700 p-4 rounded-[1.5rem] border border-navy-600 shadow-card-dark">
          <div className="flex items-center gap-1 mb-2">
            <TrendingDown size={13} className="text-red-500" />
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">This Week Expense</p>
          </div>
          <p className="font-black text-lg text-red-600">₹{weeklyStats.expense.toLocaleString('hi-IN')}</p>
          {expenseChange !== 0 && (
            <p className={`text-[10px] font-bold mt-1 ${expenseChange < 0 ? 'text-green-500' : 'text-red-500'}`}>
              {expenseChange > 0 ? '↑' : '↓'} {Math.abs(expenseChange)}% vs last week
            </p>
          )}
        </div>
      </div>

      {/* Generate Button */}
      <button
        onClick={generateInsights}
        disabled={loading}
        className="w-full flex items-center justify-center gap-3 p-5 bg-cyan text-navy-950 rounded-2xl font-bold disabled:opacity-50 shadow-cyan-glow"
      >
        {loading ? (
          <>
            <Loader2 size={20} className="animate-spin" />
            Analyzing your business...
          </>
        ) : (
          <>
            <Sparkles size={20} />
            {insights ? 'Regenerate Insights' : 'Generate AI Insights'}
          </>
        )}
      </button>

      {lastGenerated && !loading && (
        <p className="text-center text-[10px] text-slate-400 font-bold uppercase tracking-widest -mt-2">
          Last generated at {lastGenerated}
        </p>
      )}

      {/* Insights Output */}
      {insights && !loading && (
        <div className="space-y-4">

          {/* Summary */}
          <div className="bg-navy-700 border border-navy-600 text-white p-5 rounded-2xl">
            <p className="text-[10px] font-black uppercase tracking-widest opacity-50 mb-2">Overall Summary</p>
            <p className="text-sm leading-relaxed font-medium">{insights.summary}</p>
          </div>

          {/* Individual Insights */}
          {insights.insights.map((insight, i) => (
            <div key={i} className={`p-4 rounded-2xl border ${getInsightBg(insight.type)}`}>
              <div className="flex items-start gap-2">
                {getInsightIcon(insight.type)}
                <div>
                  <p className="font-black text-white text-sm">{insight.title}</p>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">{insight.detail}</p>
                </div>
              </div>
            </div>
          ))}

          {/* Business Advice */}
          {insights.advice && (
            <div className="bg-navy-800 border border-cyan/20 text-white p-5 rounded-2xl">
              <div className="flex items-center gap-2 mb-2">
                <Lightbulb size={16} className="text-yellow-400" />
                <p className="text-[10px] font-black uppercase tracking-widest opacity-60">AI Recommendation</p>
              </div>
              <p className="text-sm leading-relaxed">{insights.advice}</p>
            </div>
          )}

          {/* Refresh hint */}
          <div className="flex items-center justify-center gap-2 text-slate-400 py-2">
            <RefreshCw size={12} />
            <p className="text-[10px] font-bold uppercase tracking-widest">Insights update daily</p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!insights && !loading && (
        <div className="text-center py-10 text-slate-500">
          <Brain size={48} className="mx-auto mb-3 opacity-20" strokeWidth={1} />
          <p className="font-bold text-sm uppercase tracking-widest">No insights yet</p>
          <p className="text-xs mt-1 text-slate-400">Press the button above to analyze your business</p>
        </div>
      )}
    </div>
  );
}