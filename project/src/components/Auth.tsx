import { useState } from 'react'
import { ArrowRight, Eye, EyeOff, Loader2 } from 'lucide-react'
import type { SupportedLanguage } from '../lib/types'
import { useAuth } from '../contexts/AuthContext'
import { getBrandName, getTagline } from '../lib/brand'
import { supabase } from '../lib/supabase'

type AccountType = 'personal' | 'business'

const COPY: Record<SupportedLanguage, Record<string, string>> = {
  en: {
    login: 'Login',
    signup: 'Sign Up',
    forgot: 'Forgot Password?',
    back: 'Back to Login',
    email: 'Email Address',
    password: 'Password',
    name: 'Your Name',
    businessName: 'Shop or Business Name',
    personal: 'Personal',
    business: 'Business',
    accountType: 'Account Type',
    create: 'Create Account',
    signIn: 'Sign In',
    reset: 'Send Reset Link',
    noAccount: "Don't have an account? Sign Up ->",
    haveAccount: 'Already have an account? Sign In ->',
    created: 'Account created! Check your email for a confirmation link.',
    resetSent: 'Password reset link sent! Check your email.',
  },
  hi: {
    login: 'लॉगिन',
    signup: 'साइन अप',
    forgot: 'पासवर्ड भूल गए?',
    back: 'लॉगिन पर वापस जाएं',
    email: 'ईमेल पता',
    password: 'पासवर्ड',
    name: 'आपका नाम',
    businessName: 'दुकान / व्यवसाय का नाम',
    personal: 'पर्सनल',
    business: 'बिजनेस',
    accountType: 'अकाउंट टाइप',
    create: 'अकाउंट बनाएं',
    signIn: 'साइन इन',
    reset: 'रीसेट लिंक भेजें',
    noAccount: 'अकाउंट नहीं है? साइन अप करें ->',
    haveAccount: 'पहले से अकाउंट है? साइन इन करें ->',
    created: 'अकाउंट बन गया। ईमेल में confirmation link देखें.',
    resetSent: 'पासवर्ड रीसेट लिंक भेज दिया गया है.',
  },
  ta: {
    login: 'உள்நுழை',
    signup: 'பதிவு செய்',
    forgot: 'கடவுச்சொல் மறந்துவிட்டதா?',
    back: 'மீண்டும் உள்நுழை',
    email: 'மின்னஞ்சல்',
    password: 'கடவுச்சொல்',
    name: 'உங்கள் பெயர்',
    businessName: 'கடை / வியாபார பெயர்',
    personal: 'தனிப்பட்டது',
    business: 'வியாபாரம்',
    accountType: 'கணக்கு வகை',
    create: 'கணக்கு உருவாக்கு',
    signIn: 'உள்நுழை',
    reset: 'ரீசெட் இணைப்பை அனுப்பு',
    noAccount: 'கணக்கு இல்லையா? பதிவு செய் ->',
    haveAccount: 'ஏற்கனவே கணக்கு உள்ளதா? உள்நுழை ->',
    created: 'கணக்கு உருவானது. மின்னஞ்சலில் உறுதிப்படுத்தல் இணைப்பைப் பார்க்கவும்.',
    resetSent: 'கடவுச்சொல் ரீசெட் இணைப்பு அனுப்பப்பட்டது.',
  },
  te: {
    login: 'లాగిన్',
    signup: 'సైన్ అప్',
    forgot: 'పాస్‌వర్డ్ మర్చిపోయారా?',
    back: 'లాగిన్‌కు వెనక్కి వెళ్ళండి',
    email: 'ఇమెయిల్',
    password: 'పాస్‌వర్డ్',
    name: 'మీ పేరు',
    businessName: 'షాప్ / బిజినెస్ పేరు',
    personal: 'పర్సనల్',
    business: 'బిజినెస్',
    accountType: 'అకౌంట్ రకం',
    create: 'అకౌంట్ సృష్టించండి',
    signIn: 'సైన్ ఇన్',
    reset: 'రీసెట్ లింక్ పంపండి',
    noAccount: 'అకౌంట్ లేదా? సైన్ అప్ చేయండి ->',
    haveAccount: 'ఇప్పటికే అకౌంట్ ఉందా? సైన్ ఇన్ చేయండి ->',
    created: 'అకౌంట్ సృష్టించబడింది. మీ ఇమెయిల్ చూడండి.',
    resetSent: 'పాస్‌వర్డ్ రీసెట్ లింక్ పంపబడింది.',
  },
  kn: {
    login: 'ಲಾಗಿನ್',
    signup: 'ಸೈನ್ ಅಪ್',
    forgot: 'ಪಾಸ್ವರ್ಡ್ ಮರೆತಿರಾ?',
    back: 'ಲಾಗಿನ್‌ಗೆ ಹಿಂತಿರುಗಿ',
    email: 'ಇಮೇಲ್',
    password: 'ಪಾಸ್ವರ್ಡ್',
    name: 'ನಿಮ್ಮ ಹೆಸರು',
    businessName: 'ಅಂಗಡಿ / ವ್ಯವಹಾರದ ಹೆಸರು',
    personal: 'ಪರ್ಸನಲ್',
    business: 'ಬಿಸಿನೆಸ್',
    accountType: 'ಖಾತೆ ಪ್ರಕಾರ',
    create: 'ಖಾತೆ ರಚಿಸಿ',
    signIn: 'ಸೈನ್ ಇನ್',
    reset: 'ರೀಸೆಟ್ ಲಿಂಕ್ ಕಳುಹಿಸಿ',
    noAccount: 'ಖಾತೆ ಇಲ್ಲವೇ? ಸೈನ್ ಅಪ್ ಮಾಡಿ ->',
    haveAccount: 'ಈಗಾಗಲೇ ಖಾತೆ ಇದೆಯೆ? ಸೈನ್ ಇನ್ ಮಾಡಿ ->',
    created: 'ಖಾತೆ ಸೃಷ್ಟಿಸಲಾಗಿದೆ. ನಿಮ್ಮ ಇಮೇಲ್ ಪರಿಶೀಲಿಸಿ.',
    resetSent: 'ಪಾಸ್ವರ್ಡ್ ರೀಸೆಟ್ ಲಿಂಕ್ ಕಳುಹಿಸಲಾಗಿದೆ.',
  },
  ml: {
    login: 'ലോഗിൻ',
    signup: 'സൈൻ അപ്പ്',
    forgot: 'പാസ്‌വേഡ് മറന്നോ?',
    back: 'ലോഗിനിലേക്ക് മടങ്ങുക',
    email: 'ഇമെയിൽ',
    password: 'പാസ്‌വേഡ്',
    name: 'നിങ്ങളുടെ പേര്',
    businessName: 'കട / ബിസിനസ് പേര്',
    personal: 'പേഴ്സണൽ',
    business: 'ബിസിനസ്',
    accountType: 'അക്കൗണ്ട് തരം',
    create: 'അക്കൗണ്ട് സൃഷ്ടിക്കുക',
    signIn: 'സൈൻ ഇൻ',
    reset: 'റീസെറ്റ് ലിങ്ക് അയക്കുക',
    noAccount: 'അക്കൗണ്ട് ഇല്ലേ? സൈൻ അപ്പ് ചെയ്യൂ ->',
    haveAccount: 'ഇതിനകം അക്കൗണ്ട് ഉണ്ടോ? സൈൻ ഇൻ ചെയ്യൂ ->',
    created: 'അക്കൗണ്ട് സൃഷ്ടിച്ചു. ഇമെയിൽ പരിശോധിക്കുക.',
    resetSent: 'പാസ്‌വേഡ് റീസെറ്റ് ലിങ്ക് അയച്ചു.',
  },
}

function FloatingInput({
  id,
  label,
  type: inputType,
  value,
  onChange,
  error,
  required = true,
}: {
  id: string
  label: string
  type: string
  value: string
  onChange: (value: string) => void
  error?: string
  required?: boolean
}) {
  const [focused, setFocused] = useState(false)
  const [showPwd, setShowPwd] = useState(false)
  const isPassword = inputType === 'password'
  const lifted = focused || value.length > 0

  return (
    <div className="relative">
      <div
        className="relative rounded-2xl border-2 transition-all duration-200"
        style={{
          background: error ? 'rgba(239,68,68,0.08)' : '#1C1C1C',
          borderColor: error ? 'rgba(239,68,68,0.5)' : focused ? 'rgba(255,255,255,0.5)' : '#333333',
        }}
      >
        <label
          htmlFor={id}
          className="pointer-events-none absolute left-4 font-bold transition-all duration-200"
          style={{
            top: lifted ? '8px' : '50%',
            transform: lifted ? 'none' : 'translateY(-50%)',
            fontSize: lifted ? '9px' : '14px',
            color: lifted ? 'rgba(255,255,255,0.45)' : '#666666',
            textTransform: lifted ? 'uppercase' : 'none',
            letterSpacing: lifted ? '0.1em' : 'normal',
          }}
        >
          {label}
        </label>

        <input
          id={id}
          type={isPassword && showPwd ? 'text' : inputType}
          value={value}
          onChange={event => onChange(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          required={required}
          className="w-full rounded-2xl bg-transparent px-4 pb-3 pt-6 text-sm font-bold text-white outline-none"
        />

        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPwd(value => !value)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 active:text-white"
          >
            {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </div>

      {error && <p className="ml-2 mt-1 text-[11px] font-bold text-red-400">{error}</p>}
    </div>
  )
}

export default function Auth({ language = 'en' }: { language?: SupportedLanguage }) {
  const { signIn, signUp } = useAuth()
  const t = COPY[language]

  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [accountType, setAccountType] = useState<AccountType>('personal')
  const [loading, setLoading] = useState(false)
  const [emailErr, setEmailErr] = useState('')
  const [passErr, setPassErr] = useState('')
  const [globalErr, setGlobalErr] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const brandName = getBrandName(language)
  const tagline = getTagline(language)

  const clearErrors = () => {
    setEmailErr('')
    setPassErr('')
    setGlobalErr('')
  }

  const handleSubmit = async () => {
    clearErrors()
    let hasErr = false

    if (!email.includes('@')) {
      setEmailErr('Enter a valid email address')
      hasErr = true
    }
    if (mode !== 'forgot' && password.length < 6) {
      setPassErr('Password must be at least 6 characters')
      hasErr = true
    }
    if (hasErr) return

    setLoading(true)
    try {
      if (mode === 'login') {
        const { error } = await signIn(email, password)
        if (error) setGlobalErr(error.message)
      } else if (mode === 'signup') {
        const profileName = name.trim() || email.split('@')[0]
        const { error } = await signUp(email, password, profileName, '', accountType)
        if (error) setGlobalErr(error.message)
        else setSuccessMsg(t.created)
      } else {
      const { error } = await supabase.auth.resetPasswordForEmail(email)
        if (error) setGlobalErr(error.message)
        else setSuccessMsg(t.resetSent)
      }
    } catch (error: unknown) {
      setGlobalErr(error instanceof Error ? error.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col" style={{ background: '#111111' }}>
      <div className="flex flex-col items-center justify-center px-6 pb-12 pt-16" style={{ background: '#0A0A0A' }}>
        <div
          className="mx-auto mb-6 flex h-32 w-32 items-center justify-center rounded-3xl"
          style={{ background: '#1C1C1C', border: '1px solid #333333' }}
        >
          <svg viewBox="0 0 120 120" width="80" height="80" xmlns="http://www.w3.org/2000/svg">
            <path d="M60 10 C60 10 38 38 44 62 C48 76 60 84 60 84 C60 84 74 74 74 54 C74 38 60 22 60 10Z" fill="white" opacity="0.9" />
            <path d="M60 36 C60 36 52 52 55 64 C57 70 60 74 60 74 C60 74 66 68 66 56 C66 48 60 42 60 36Z" fill="#111111" />
            <path d="M18 72 Q40 62 60 78 Q80 62 102 72 L102 106 Q80 96 60 112 Q40 96 18 106Z" fill="none" stroke="white" strokeWidth="6" strokeLinejoin="round" strokeLinecap="round" opacity="0.9" />
            <path d="M28 82 Q44 74 60 84" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" opacity="0.45" />
            <path d="M92 82 Q76 74 60 84" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" opacity="0.45" />
          </svg>
        </div>

        <h1 className="text-4xl font-black tracking-tighter text-white">{brandName}</h1>
        <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.3em]" style={{ color: 'rgba(255,255,255,0.35)' }}>
          {tagline}
        </p>

        <div className="mt-8 flex gap-2 rounded-2xl p-1" style={{ background: '#1C1C1C', border: '1px solid #333333' }}>
          {(['login', 'signup'] as const).map(currentMode => (
            <button
              key={currentMode}
              onClick={() => {
                setMode(currentMode)
                clearErrors()
                setSuccessMsg('')
              }}
              className="rounded-xl px-6 py-2 text-xs font-black uppercase tracking-widest transition-all"
              style={{
                background: mode === currentMode ? '#FFFFFF' : 'transparent',
                color: mode === currentMode ? '#111111' : '#666666',
              }}
            >
              {currentMode === 'login' ? t.login : t.signup}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-1 flex-col px-6 py-8">
        {successMsg && (
          <div className="mb-6 rounded-2xl px-4 py-3" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}>
            <p className="text-sm font-bold text-white">{successMsg}</p>
          </div>
        )}

        {globalErr && (
          <div className="mb-6 rounded-2xl px-4 py-3" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)' }}>
            <p className="text-sm font-bold text-red-400">{globalErr}</p>
          </div>
        )}

        <div className="space-y-3">
          {mode === 'signup' && (
            <>
              <div className="rounded-2xl border border-[#333333] bg-[#1C1C1C] p-4">
                <p className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-[#888888]">{t.accountType}</p>
                <div className="grid grid-cols-2 gap-2">
                  {(['personal', 'business'] as AccountType[]).map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setAccountType(type)}
                      className="rounded-2xl px-4 py-3 text-sm font-black transition-all"
                      style={{
                        background: accountType === type ? '#FFFFFF' : '#111111',
                        color: accountType === type ? '#111111' : '#FFFFFF',
                        border: accountType === type ? '1px solid #FFFFFF' : '1px solid #333333',
                      }}
                    >
                      {type === 'personal' ? t.personal : t.business}
                    </button>
                  ))}
                </div>
              </div>
              <FloatingInput
                id="name"
                label={accountType === 'business' ? t.businessName : t.name}
                type="text"
                value={name}
                onChange={setName}
              />
            </>
          )}

          <FloatingInput id="email" label={t.email} type="email" value={email} onChange={setEmail} error={emailErr} />
          {mode !== 'forgot' && (
            <FloatingInput id="password" label={t.password} type="password" value={password} onChange={setPassword} error={passErr} />
          )}
        </div>

        {mode === 'login' && (
          <button
            onClick={() => {
              setMode('forgot')
              clearErrors()
              setSuccessMsg('')
            }}
            className="mt-3 w-full text-right text-[11px] font-black uppercase tracking-widest transition-colors"
            style={{ color: '#555555' }}
          >
            {t.forgot}
          </button>
        )}

        <button
          onClick={() => void handleSubmit()}
          disabled={loading}
          className="mt-6 flex w-full items-center justify-center gap-3 rounded-2xl py-5 text-base font-black transition-all active:scale-95 disabled:opacity-60"
          style={{ background: '#FFFFFF', color: '#111111', boxShadow: 'none' }}
        >
          {loading ? (
            <Loader2 size={20} className="animate-spin" style={{ color: '#111111' }} />
          ) : (
            <>
              <span>{mode === 'login' ? t.signIn : mode === 'signup' ? t.create : t.reset}</span>
              <ArrowRight size={18} />
            </>
          )}
        </button>

        {mode === 'forgot' && (
          <button
            onClick={() => {
              setMode('login')
              clearErrors()
              setSuccessMsg('')
            }}
            className="mt-4 text-center text-sm font-bold transition-colors"
            style={{ color: '#555555' }}
          >
            {t.back}
          </button>
        )}

        {mode !== 'forgot' && (
          <button
            onClick={() => {
              setMode(mode === 'login' ? 'signup' : 'login')
              clearErrors()
              setSuccessMsg('')
            }}
            className="mt-6 text-center text-sm font-bold transition-colors"
            style={{ color: '#555555' }}
          >
            {mode === 'login' ? t.noAccount : t.haveAccount}
          </button>
        )}

        <p className="mt-auto pt-10 text-center text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: '#333333' }}>
          Copyright 2026 {brandName}
        </p>
      </div>
    </div>
  )
}
