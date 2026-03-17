// src/components/Auth.tsx
import { useState } from 'react'
import { Eye, EyeOff, ArrowRight, Loader2 } from 'lucide-react'
import type { SupportedLanguage } from '../lib/types'
import { useAuth } from '../contexts/AuthContext'
import { getBrandName, getTagline } from '../lib/brand'

function FloatingInput({
  id, label, type: inputType, value, onChange, error, required = true,
}: {
  id:       string
  label:    string
  type:     string
  value:    string
  onChange: (v: string) => void
  error?:   string
  required?: boolean
}) {
  const [focused, setFocused] = useState(false)
  const [showPwd, setShowPwd] = useState(false)
  const isPassword = inputType === 'password'
  const lifted     = focused || value.length > 0

  return (
    <div className="relative">
      <div
        className="relative rounded-2xl border-2 transition-all duration-200"
        style={{
          background:  error ? 'rgba(239,68,68,0.08)' : '#1C1C1C',
          borderColor: error ? 'rgba(239,68,68,0.5)' : focused ? 'rgba(255,255,255,0.5)' : '#333333',
        }}
      >
        <label
          htmlFor={id}
          className="pointer-events-none absolute left-4 font-bold transition-all duration-200"
          style={{
            top:       lifted ? '8px'  : '50%',
            transform: lifted ? 'none' : 'translateY(-50%)',
            fontSize:  lifted ? '9px'  : '14px',
            color:     lifted ? 'rgba(255,255,255,0.45)' : '#666666',
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
          onChange={e => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={()  => setFocused(false)}
          required={required}
          className="w-full rounded-2xl bg-transparent px-4 pb-3 pt-6 text-sm font-bold text-white outline-none"
        />

        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPwd(v => !v)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 active:text-white"
          >
            {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </div>

      {error && (
        <p className="mt-1 ml-2 text-[11px] font-bold text-red-400">{error}</p>
      )}
    </div>
  )
}

export default function Auth({ language: _language = 'en' }: { language?: SupportedLanguage }) {
  const { signIn, signUp } = useAuth()

  const [mode,       setMode]       = useState<'login' | 'signup' | 'forgot'>('login')
  const [email,      setEmail]      = useState('')
  const [password,   setPassword]   = useState('')
  const [name,       setName]       = useState('')
  const [loading,    setLoading]    = useState(false)
  const [emailErr,   setEmailErr]   = useState('')
  const [passErr,    setPassErr]    = useState('')
  const [globalErr,  setGlobalErr]  = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const brandName = getBrandName(_language)
  const tagline   = getTagline(_language)

  const clearErrors = () => { setEmailErr(''); setPassErr(''); setGlobalErr('') }

  const handleSubmit = async () => {
    clearErrors()
    let hasErr = false
    if (!email.includes('@')) { setEmailErr('Enter a valid email address'); hasErr = true }
    if (mode !== 'forgot' && password.length < 6) { setPassErr('Password must be at least 6 characters'); hasErr = true }
    if (hasErr) return

    setLoading(true)
    try {
      if (mode === 'login') {
        const { error } = await signIn(email, password)
        if (error) {
          const msg = error.message.toLowerCase()
          if (msg.includes('invalid') || msg.includes('credentials') || msg.includes('password')) {
            setPassErr('Incorrect password. Please try again.')
          } else if (msg.includes('email') || msg.includes('user')) {
            setEmailErr('No account found with this email.')
          } else {
            setGlobalErr(error.message)
          }
        }
      } else if (mode === 'signup') {
        const { error } = await signUp(email, password, name || email.split('@')[0], '')
        if (error) {
          if (error.message.toLowerCase().includes('already')) {
            setEmailErr('An account with this email already exists.')
          } else {
            setGlobalErr(error.message)
          }
        } else {
          setSuccessMsg('Account created! Check your email for a confirmation link.')
        }
      } else {
        const { error } = await (await import('../lib/supabase')).supabase.auth.resetPasswordForEmail(email)
        if (error) { setGlobalErr(error.message) }
        else { setSuccessMsg('Password reset link sent! Check your email.') }
      }
    } catch (e: any) {
      setGlobalErr(e?.message ?? 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col" style={{ background: '#111111' }}>

      {/* Top hero */}
      <div className="flex flex-col items-center justify-center px-6 pt-16 pb-12"
           style={{ background: '#0A0A0A' }}>

        {/* Inline SVG logo — no external file needed, always visible */}
        <div
          className="w-32 h-32 mx-auto mb-6 rounded-3xl flex items-center justify-center"
          style={{ background: '#1C1C1C', border: '1px solid #333333' }}
        >
          <svg viewBox="0 0 120 120" width="80" height="80" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M60 10 C60 10 38 38 44 62 C48 76 60 84 60 84 C60 84 74 74 74 54 C74 38 60 22 60 10Z"
              fill="white" opacity="0.9"
            />
            <path
              d="M60 36 C60 36 52 52 55 64 C57 70 60 74 60 74 C60 74 66 68 66 56 C66 48 60 42 60 36Z"
              fill="#111111"
            />
            <path
              d="M18 72 Q40 62 60 78 Q80 62 102 72 L102 106 Q80 96 60 112 Q40 96 18 106Z"
              fill="none" stroke="white" strokeWidth="6"
              strokeLinejoin="round" strokeLinecap="round" opacity="0.9"
            />
            <path d="M28 82 Q44 74 60 84" fill="none" stroke="white"
                  strokeWidth="3" strokeLinecap="round" opacity="0.45"/>
            <path d="M92 82 Q76 74 60 84" fill="none" stroke="white"
                  strokeWidth="3" strokeLinecap="round" opacity="0.45"/>
          </svg>
        </div>

        <h1 className="text-4xl font-black tracking-tighter text-white">{brandName}</h1>
        <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.3em]"
           style={{ color: 'rgba(255,255,255,0.35)' }}>
          {tagline}
        </p>

        {/* Login / Sign Up switcher */}
        <div className="mt-8 flex gap-2 rounded-2xl p-1"
             style={{ background: '#1C1C1C', border: '1px solid #333333' }}>
          {(['login', 'signup'] as const).map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); clearErrors(); setSuccessMsg('') }}
              className="rounded-xl px-6 py-2 text-xs font-black uppercase tracking-widest transition-all"
              style={{
                background: mode === m ? '#FFFFFF' : 'transparent',
                color:      mode === m ? '#111111' : '#666666',
              }}
            >
              {m === 'login' ? 'Login' : 'Sign Up'}
            </button>
          ))}
        </div>
      </div>

      {/* Form */}
      <div className="flex flex-1 flex-col px-6 py-8">

        {successMsg && (
          <div className="mb-6 rounded-2xl px-4 py-3"
               style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}>
            <p className="text-sm font-bold text-white">{successMsg}</p>
          </div>
        )}

        {globalErr && (
          <div className="mb-6 rounded-2xl px-4 py-3"
               style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)' }}>
            <p className="text-sm font-bold text-red-400">{globalErr}</p>
          </div>
        )}

        <div className="space-y-3">
          {mode === 'signup' && (
            <FloatingInput id="name" label="Your Name / Shop Name"
              type="text" value={name} onChange={setName} />
          )}
          <FloatingInput id="email" label="Email Address"
            type="email" value={email} onChange={setEmail} error={emailErr} />
          {mode !== 'forgot' && (
            <FloatingInput id="password" label="Password"
              type="password" value={password} onChange={setPassword} error={passErr} />
          )}
        </div>

        {mode === 'login' && (
          <button
            onClick={() => { setMode('forgot'); clearErrors(); setSuccessMsg('') }}
            className="mt-3 w-full text-right text-[11px] font-black uppercase tracking-widest transition-colors"
            style={{ color: '#555555' }}
          >
            Forgot Password?
          </button>
        )}

        {/* Sign In button — white, NO glow, NO shadow */}
        <button
          onClick={() => void handleSubmit()}
          disabled={loading}
          className="mt-6 flex w-full items-center justify-center gap-3 rounded-2xl py-5 text-base font-black active:scale-95 transition-all disabled:opacity-60"
          style={{ background: '#FFFFFF', color: '#111111', boxShadow: 'none' }}
        >
          {loading
            ? <Loader2 size={20} className="animate-spin" style={{ color: '#111111' }} />
            : <>
                <span>{mode === 'login' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Send Reset Link'}</span>
                <ArrowRight size={18} />
              </>
          }
        </button>

        {mode === 'forgot' && (
          <button
            onClick={() => { setMode('login'); clearErrors(); setSuccessMsg('') }}
            className="mt-4 text-center text-sm font-bold transition-colors"
            style={{ color: '#555555' }}
          >
            ← Back to Login
          </button>
        )}

        {mode !== 'forgot' && (
          <button
            onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); clearErrors(); setSuccessMsg('') }}
            className="mt-6 text-center text-sm font-bold transition-colors"
            style={{ color: '#555555' }}
          >
            {mode === 'login'
              ? "Don't have an account? Sign Up →"
              : 'Already have an account? Sign In →'}
          </button>
        )}

        <p className="mt-auto pt-10 text-center text-[10px] font-bold uppercase tracking-[0.2em]"
           style={{ color: '#333333' }}>
          © 2026 {brandName} · All rights reserved
        </p>
      </div>
    </div>
  )
}