import { useState } from 'react';
import { Wallet, LogIn, UserPlus } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const authTranslations: any = {
  en: { appTitle: "My Khata", login: "Welcome Back", signup: "Create Account", email: "Email Address", pass: "Password", btn: "Continue", switchLogin: "Already have an account? Login", switchSignup: "New to My Khata? Sign Up" },
  hi: { appTitle: "मेरा खाता", login: "स्वागत है", signup: "नया खाता", email: "ईमेल पता", pass: "पासवर्ड", btn: "आगे बढ़ें", switchLogin: "पहले से खाता है? लॉगिन करें", switchSignup: "नया खाता बनाना चाहते हैं?" },
  ta: { appTitle: "என் கணக்கு", login: "வரவேற்கிறோம்", signup: "பதிவு செய்க", email: "மின்னஞ்சல்", pass: "கடவுச்சொல்", btn: "தொடரவும்", switchLogin: "ஏற்கனவே கணக்கு உள்ளதா? உள்நுழைக", switchSignup: "புதிய கணக்கை உருவாக்கவா?" },
  te: { appTitle: "నా ఖాతా", login: "స్వాగతం", signup: "ఖాతాను సృష్టించండి", email: "ఈమెయిల్", pass: "పాస్‌వర్డ్", btn: "కొనసాగించు", switchLogin: "ముందే ఖాతా ఉందా? లాగిన్ అవ్వండి", switchSignup: "కొత్త ఖాతాను సృష్టించాలా?" },
  kn: { appTitle: "ನನ್ನ ಖಾತೆ", login: "ಸ್ವಾಗತ", signup: "ಖಾತೆ ರಚಿಸಿ", email: "ಇಮೇಲ್", pass: "ಪಾಸ್‌ವರ್ಡ್", btn: "ಮುಂದುವರಿಯಿರಿ", switchLogin: "ಈಗಾಗಲೇ ಖಾತೆ ಇದೆಯೇ? ಲಾಗಿನ್ ಮಾಡಿ", switchSignup: "ಹೊಸ ಖಾತೆ ರಚಿಸಬೇಕೆ?" },
  ml: { appTitle: "എന്റെ ഖാത്ത", login: "സ്വാഗതം", signup: "അക്കൗണ്ട് സൃഷ്ടിക്കുക", email: "ഇമെയിൽ", pass: "പാസ്‌വേഡ്", btn: "തുടരുക", switchLogin: "അക്കൗണ്ട് ഉണ്ടോ? ലോഗിൻ ചെയ്യുക", switchSignup: "പുതിയ അക്കൗണ്ട് വേണോ?" }
};

export default function Auth({ language = 'en' }: { language?: string }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { signIn, signUp } = useAuth();
  const t = authTranslations[language as any] || authTranslations.en;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      if (isLogin) {
        const { error } = await signIn(email, password);
        if (error) throw error;
      } else {
        // Sign up with default metadata for the Name
        const { error } = await signUp(email, password, email.split('@')[0]);
        if (error) throw error;
        if (!error && !isLogin) {
            alert("Success! Please check your email for a confirmation link (if enabled) or try logging in.");
        }
      }
    } catch (error: any) {
      console.error("Auth Error:", error.message);
      alert(error.message); // This will tell you EXACTLY why it's not moving
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl p-8 border border-gray-100">
        
        {/* BRANDING */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-black rounded-[1.5rem] mb-4 text-white shadow-xl rotate-3">
            <Wallet size={32} />
          </div>
          <h1 className="text-4xl font-black text-gray-900 tracking-tighter">{t.appTitle}</h1>
          <p className="text-gray-400 font-bold mt-2 uppercase text-[10px] tracking-[0.2em]">
            {isLogin ? t.login : t.signup}
          </p>
        </div>

        {/* FORM */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-400 uppercase ml-2 tracking-widest">{t.email}</label>
            <input 
              type="email" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              className="w-full px-5 py-4 bg-gray-50 border-2 border-transparent focus:border-black rounded-2xl outline-none transition-all font-bold" 
              placeholder="name@example.com" 
              required 
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-400 uppercase ml-2 tracking-widest">{t.pass}</label>
            <input 
              type="password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              className="w-full px-5 py-4 bg-gray-50 border-2 border-transparent focus:border-black rounded-2xl outline-none transition-all font-bold" 
              placeholder="••••••••" 
              required 
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className={`w-full bg-black text-white font-black py-5 rounded-2xl shadow-xl active:scale-95 transition-all text-lg flex items-center justify-center gap-2 mt-4 ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
          >
            {loading ? (
              <div className="w-6 h-6 border-t-2 border-white rounded-full animate-spin" />
            ) : (
              <>
                {isLogin ? <LogIn size={20} /> : <UserPlus size={20} />}
                {t.btn}
              </>
            )}
          </button>
        </form>

        {/* SWITCH BUTTON */}
        <button 
          onClick={() => setIsLogin(!isLogin)} 
          className="w-full text-center mt-8 text-gray-400 hover:text-black font-bold text-sm transition-colors"
        >
          {isLogin ? t.switchSignup : t.switchLogin}
        </button>
      </div>
      
      <p className="mt-8 text-gray-300 text-[10px] font-black uppercase tracking-[0.3em]">© 2024 My Khata Business</p>
    </div>
  );
}
