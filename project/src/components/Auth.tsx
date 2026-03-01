import { useState } from 'react';
import { LogIn, UserPlus, Building2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const authTranslations: any = {
  en: { appTitle: "Business Manager", login: "Login", signup: "Sign Up", email: "Email", pass: "Password", btn: "Enter", switch: "Create Account" },
  hi: { appTitle: "व्यवसाय प्रबंधक", login: "लॉग इन", signup: "नया खाता", email: "ईमेल", pass: "पासवर्ड", btn: "लॉग इन करें", switch: "नया खाता बनाएं" },
  ta: { appTitle: "வணிக மேலாளர்", login: "உள்நுழைய", signup: "பதிவு", email: "மின்னஞ்சல்", pass: "கடவுச்சொல்", btn: "உள்நுழைய", switch: "கணக்கை உருவாக்க" },
  te: { appTitle: "బిజినెస్ మేనేజర్", login: "లాగిన్", signup: "సైన్ అప్", email: "ఈమెయిల్", pass: "పాస్‌వర్డ్", btn: "లాగిన్", switch: "ఖాతాను సృష్టించండి" },
  kn: { appTitle: "ಬಿಸಿನೆಸ್ ಮ್ಯಾನೇಜರ್", login: "ಲೋಗಿನ್", signup: "ಸೈನ್ ಅಪ್", email: "ಇಮೇಲ್", pass: "ಪಾಸ್‌ವರ್ಡ್", btn: "ಲೋಗಿನ್", switch: "ಖಾತೆ ರಚಿಸಿ" },
  ml: { appTitle: "ബിസിനസ് മാനേജർ", login: "ലോഗിൻ", signup: "സൈൻ അപ്പ്", email: "ഇമെയിൽ", pass: "പാസ്‌വേഡ്", btn: "ലോഗിൻ", switch: "അക്കൗണ്ട് സൃഷ്ടിക്കുക" }
};

export default function Auth({ language = 'hi' }: { language?: string }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { signIn, signUp } = useAuth();
  const t = authTranslations[language as any] || authTranslations.hi;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLogin) await signIn(email, password);
    else await signUp(email, password, "Business", "000");
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl p-8 border border-gray-100">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-600 rounded-2xl mb-4 text-white">
            <Building2 />
          </div>
          <h1 className="text-3xl font-black text-gray-900">{t.appTitle}</h1>
          <p className="text-gray-500 font-bold">{isLogin ? t.login : t.signup}</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-4 py-4 border-2 rounded-xl" placeholder={t.email} />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-4 py-4 border-2 rounded-xl" placeholder={t.pass} />
          <button type="submit" className="w-full bg-primary-600 text-white font-black py-4 rounded-xl shadow-lg">{t.btn}</button>
        </form>
        <button onClick={() => setIsLogin(!isLogin)} className="w-full text-center mt-6 text-primary-600 font-bold">{t.switch}</button>
      </div>
    </div>
  );
}