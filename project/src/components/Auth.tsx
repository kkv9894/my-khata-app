import { useState } from 'react';
import { LogIn, UserPlus, Wallet } from 'lucide-react';
import type { SupportedLanguage } from '../lib/types';
import { useAuth, type AccountType } from '../contexts/AuthContext';

const authTranslations: Record<SupportedLanguage, Record<string, string>> = {
  en: { appTitle: 'My Khata', login: 'Welcome Back', signup: 'Create Account', email: 'Email Address', pass: 'Password', btn: 'Continue', switchLogin: 'Already have an account? Login', switchSignup: 'New to My Khata? Sign Up' },
  hi: { appTitle: 'My Khata', login: 'Welcome Back', signup: 'Create Account', email: 'Email Address', pass: 'Password', btn: 'Continue', switchLogin: 'Already have an account? Login', switchSignup: 'New to My Khata? Sign Up' },
  ta: { appTitle: 'My Khata', login: 'Welcome Back', signup: 'Create Account', email: 'Email Address', pass: 'Password', btn: 'Continue', switchLogin: 'Already have an account? Login', switchSignup: 'New to My Khata? Sign Up' },
  te: { appTitle: 'My Khata', login: 'Welcome Back', signup: 'Create Account', email: 'Email Address', pass: 'Password', btn: 'Continue', switchLogin: 'Already have an account? Login', switchSignup: 'New to My Khata? Sign Up' },
  kn: { appTitle: 'My Khata', login: 'Welcome Back', signup: 'Create Account', email: 'Email Address', pass: 'Password', btn: 'Continue', switchLogin: 'Already have an account? Login', switchSignup: 'New to My Khata? Sign Up' },
  ml: { appTitle: 'My Khata', login: 'Welcome Back', signup: 'Create Account', email: 'Email Address', pass: 'Password', btn: 'Continue', switchLogin: 'Already have an account? Login', switchSignup: 'New to My Khata? Sign Up' },
};

export default function Auth({ language = 'en' }: { language?: SupportedLanguage }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  // ── NEW: account type selection (only shown on signup) ─────────────────────
  const [accountType, setAccountType] = useState<AccountType>('business');
  const { signIn, signUp } = useAuth();
  const t = authTranslations[language];

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    try {
      if (isLogin) {
        const { error } = await signIn(email, password);
        if (error) throw error;
      } else {
        // ← Pass accountType into signUp
        const { error } = await signUp(email, password, email.split('@')[0], '', accountType);
        if (error) throw error;
        alert('Success! Check your email for a confirmation link, then sign in.');
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-md rounded-[2.5rem] border border-gray-100 bg-white p-8 shadow-2xl">
        <div className="mb-10 text-center">
          <div className="mb-4 inline-flex h-20 w-20 rotate-3 items-center justify-center rounded-[1.5rem] bg-black text-white shadow-xl"><Wallet size={32} /></div>
          <h1 className="text-4xl font-black tracking-tighter text-gray-900">{t.appTitle}</h1>
          <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">{isLogin ? t.login : t.signup}</p>
        </div>

        {/* ── NEW: Account type selector — shown only on Sign Up ───────────── */}
        {!isLogin && (
          <div className="mb-6">
            <p className="mb-3 text-center text-[10px] font-black uppercase tracking-widest text-gray-400">
              How will you use this app?
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setAccountType('personal')}
                className={`flex flex-col items-center gap-2 rounded-2xl border-2 p-4 transition-all ${
                  accountType === 'personal'
                    ? 'border-black bg-black text-white'
                    : 'border-gray-100 bg-gray-50 text-gray-700 hover:border-gray-300'
                }`}
              >
                <span className="text-2xl">👤</span>
                <span className="text-xs font-black">Personal Use</span>
                <span className={`text-[9px] font-semibold text-center leading-tight ${accountType === 'personal' ? 'text-gray-300' : 'text-gray-400'}`}>
                  Track salary, bills & daily expenses
                </span>
              </button>
              <button
                type="button"
                onClick={() => setAccountType('business')}
                className={`flex flex-col items-center gap-2 rounded-2xl border-2 p-4 transition-all ${
                  accountType === 'business'
                    ? 'border-black bg-black text-white'
                    : 'border-gray-100 bg-gray-50 text-gray-700 hover:border-gray-300'
                }`}
              >
                <span className="text-2xl">🏪</span>
                <span className="text-xs font-black">Business / Shop</span>
                <span className={`text-[9px] font-semibold text-center leading-tight ${accountType === 'business' ? 'text-gray-300' : 'text-gray-400'}`}>
                  Sales, inventory & udhaar tracking
                </span>
              </button>
            </div>
          </div>
        )}
        {/* ── END account type selector ──────────────────────────────────────── */}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="ml-2 text-[10px] font-black uppercase tracking-widest text-gray-400">{t.email}</label>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-2xl border-2 border-transparent bg-gray-50 px-5 py-4 font-bold outline-none transition-all focus:border-black" placeholder="name@example.com" required />
          </div>
          <div className="space-y-1">
            <label className="ml-2 text-[10px] font-black uppercase tracking-widest text-gray-400">{t.pass}</label>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-2xl border-2 border-transparent bg-gray-50 px-5 py-4 font-bold outline-none transition-all focus:border-black" placeholder="********" required />
          </div>
          <button type="submit" disabled={loading} className={`mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-black py-5 text-lg font-black text-white shadow-xl transition-all active:scale-95 ${loading ? 'cursor-not-allowed opacity-70' : ''}`}>
            {loading ? <div className="h-6 w-6 animate-spin rounded-full border-t-2 border-white" /> : <>{isLogin ? <LogIn size={20} /> : <UserPlus size={20} />}{t.btn}</>}
          </button>
        </form>

        <button onClick={() => setIsLogin((value) => !value)} className="mt-8 w-full text-center text-sm font-bold text-gray-400 transition-colors hover:text-black">{isLogin ? t.switchSignup : t.switchLogin}</button>
      </div>
      <p className="mt-8 text-[10px] font-black uppercase tracking-[0.3em] text-gray-300">© 2026 My Khata</p>
    </div>
  );
}