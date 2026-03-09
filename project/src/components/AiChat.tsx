import { useEffect, useRef, useState } from 'react';
import { Bot, Loader2, Send, Sparkles, User } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { askFinancialAI } from '../lib/gemini';
import type { TransactionRecord } from '../lib/types';
import { useRole } from '../contexts/RoleContext';

interface Message {
  role: 'user' | 'ai';
  text: string;
  time: string;
}

const suggestedQuestions = [
  'How much did I spend this month?',
  'What is my biggest expense category?',
  'How much did I earn this week?',
  'What is my total balance?',
  'Show me my top 3 expenses',
];

export default function AiChat() {
  const { effectiveUserId } = useRole();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'ai',
      text: 'Namaste! I am your Khata AI assistant. Ask about spend, income, balance, or expense categories.',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadTransactions = async () => {
      if (!effectiveUserId) {
        setTransactions([]);
        return;
      }
      const { data } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', effectiveUserId)
        .order('transaction_date', { ascending: false })
        .limit(200);
      setTransactions((data || []) as TransactionRecord[]);
    };

    void loadTransactions();
  }, [effectiveUserId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (text?: string) => {
    const question = (text || input).trim();
    if (!question || loading) {
      return;
    }

    setInput('');
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setMessages((prev) => [...prev, { role: 'user', text: question, time }]);
    setLoading(true);

    try {
      const answer = await askFinancialAI(question, transactions);
      setMessages((prev) => [
        ...prev,
        {
          role: 'ai',
          text: answer,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col pb-28">
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 1 && (
          <div className="space-y-2">
            <p className="px-1 text-[10px] font-black uppercase tracking-widest text-gray-400">Try asking:</p>
            <div className="flex flex-wrap gap-2">
              {suggestedQuestions.map((question) => (
                <button key={question} onClick={() => void sendMessage(question)} className="rounded-xl border-2 border-gray-100 bg-white px-3 py-2 text-left text-xs font-semibold text-gray-700 transition-all hover:border-black">
                  {question}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message, index) => (
          <div key={`${message.role}-${index}`} className={`flex items-end gap-2 ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${message.role === 'ai' ? 'bg-black text-white' : 'bg-gray-200 text-gray-700'}`}>
              {message.role === 'ai' ? <Bot size={14} /> : <User size={14} />}
            </div>
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${message.role === 'user' ? 'rounded-br-sm bg-black text-white' : 'rounded-bl-sm border border-gray-100 bg-white text-gray-800 shadow-sm'}`}>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.text}</p>
              <p className={`mt-1 text-[10px] ${message.role === 'user' ? 'text-right text-gray-400' : 'text-gray-400'}`}>{message.time}</p>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-end gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-black text-white"><Bot size={14} /></div>
            <div className="rounded-2xl rounded-bl-sm border border-gray-100 bg-white px-4 py-3 shadow-sm">
              <div className="flex h-4 items-center gap-1">
                <div className="h-2 w-2 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: '0ms' }} />
                <div className="h-2 w-2 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: '150ms' }} />
                <div className="h-2 w-2 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="fixed bottom-24 left-0 right-0 px-4">
        <div className="flex items-center gap-2 rounded-2xl border-2 border-gray-100 bg-white p-2 shadow-lg">
          <Sparkles size={18} className="ml-2 shrink-0 text-gray-300" />
          <input
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void sendMessage();
              }
            }}
            placeholder="Ask about your finances..."
            className="flex-1 bg-transparent py-2 text-sm font-medium text-gray-800 outline-none placeholder:text-gray-300"
          />
          <button onClick={() => void sendMessage()} disabled={!input.trim() || loading} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-black text-white transition-all disabled:opacity-30">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}
