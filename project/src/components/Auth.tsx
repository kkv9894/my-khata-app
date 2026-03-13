// src/components/Auth.tsx
// Premium fintech-style authentication screen
// REPLACEMENT: same Props interface, same signIn/signUp calls — zero breaking changes

import { useState } from 'react'
import { Eye, EyeOff, ArrowRight, Loader2 } from 'lucide-react'
import type { SupportedLanguage } from '../lib/types'
import { useAuth } from '../contexts/AuthContext'
import { getBrandName, getTagline } from '../lib/brand'

// ── Floating label input ──────────────────────────────────────────────────────
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
  const [focused, setFocused]   = useState(false)
  const [showPwd, setShowPwd]   = useState(false)
  const isPassword = inputType === 'password'
  const lifted     = focused || value.length > 0

  return (
    <div className="relative">
      <div className={`relative rounded-2xl border-2 transition-all duration-200 bg-navy-800
        ${error   ? 'border-red-500/60 bg-red-900/10'
        : focused ? 'border-cyan bg-navy-700 shadow-cyan-glow'
        : 'border-navy-600'}`}>

        <label
          htmlFor={id}
          className={`pointer-events-none absolute left-4 font-bold transition-all duration-200
            ${lifted
              ? 'top-2 text-[9px] uppercase tracking-widest text-cyan/70'
              : 'top-1/2 -translate-y-1/2 text-sm text-slate-500'}`}
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
            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 active:text-gray-700"
          >
            {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </div>

      {error && (
        <p className="mt-1 ml-2 text-[11px] font-bold text-red-500">{error}</p>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Auth({ language: _language = 'en' }: { language?: SupportedLanguage }) {
  const { signIn, signUp } = useAuth()

  const [mode,        setMode]        = useState<'login' | 'signup' | 'forgot'>('login')
  const [email,       setEmail]       = useState('')
  const [password,    setPassword]    = useState('')
  const [name,        setName]        = useState('')
  const [loading,     setLoading]     = useState(false)
  const [emailErr,    setEmailErr]    = useState('')
  const [passErr,     setPassErr]     = useState('')
  const [globalErr,   setGlobalErr]   = useState('')
  const [successMsg,  setSuccessMsg]  = useState('')

  // ── Brand strings — update live when language changes ──────────────────────
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
        // Forgot password
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
    <div className="flex min-h-screen flex-col bg-navy-900">

      {/* ── Top hero — deep navy ──────────────────────────────────────────── */}
      <div className="flex flex-col items-center justify-center bg-navy-950 px-6 pt-16 pb-12 text-white">

        {/* Logo — 128×128, centered, with cyan glow */}
        <img
          src="/logo.png"
          alt="ZivaKhata"
          className="w-32 h-32 mx-auto mb-6 rounded-3xl object-cover shadow-cyan-glow"
        />

        {/* Dynamic brand name */}
        <h1 className="text-4xl font-black tracking-tighter text-white">
          {brandName}
        </h1>
        {/* Tagline: "Powered by Ziva AI" localised */}
        <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.3em] text-cyan/60">
          {tagline}
        </p>

        {/* Login / Sign Up pill switcher */}
        <div className="mt-8 flex gap-2 rounded-2xl bg-navy-800 border border-navy-600 p-1">
          {(['login', 'signup'] as const).map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); clearErrors(); setSuccessMsg('') }}
              className={`rounded-xl px-6 py-2 text-xs font-black uppercase tracking-widest transition-all
                ${mode === m
                  ? 'bg-cyan text-navy-950 shadow'
                  : 'text-slate-400 hover:text-white'}`}
            >
              {m === 'login' ? 'Login' : 'Sign Up'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Form card — navy-800 ─────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col px-6 py-8 bg-navy-900">

        {/* Success message */}
        {successMsg && (
          <div className="mb-6 rounded-2xl bg-cyan-muted border border-cyan-border px-4 py-3">
            <p className="text-sm font-bold text-cyan">{successMsg}</p>
          </div>
        )}

        {/* Global error */}
        {globalErr && (
          <div className="mb-6 rounded-2xl bg-red-900/30 border border-red-700/50 px-4 py-3">
            <p className="text-sm font-bold text-red-400">{globalErr}</p>
          </div>
        )}

        <div className="space-y-3">
          {mode === 'signup' && (
            <FloatingInput
              id="name" label="Your Name / Shop Name"
              type="text" value={name} onChange={setName}
            />
          )}

          <FloatingInput
            id="email" label="Email Address"
            type="email" value={email} onChange={setEmail}
            error={emailErr}
          />

          {mode !== 'forgot' && (
            <FloatingInput
              id="password" label="Password"
              type="password" value={password} onChange={setPassword}
              error={passErr}
            />
          )}
        </div>

        {/* Forgot password link */}
        {mode === 'login' && (
          <button
            onClick={() => { setMode('forgot'); clearErrors(); setSuccessMsg('') }}
            className="mt-3 w-full text-right text-[11px] font-black uppercase tracking-widest text-slate-500 active:text-cyan transition-colors"
          >
            Forgot Password?
          </button>
        )}

        {/* Submit button — cyan */}
        <button
          onClick={() => void handleSubmit()}
          disabled={loading}
          className="mt-6 flex w-full items-center justify-center gap-3 rounded-2xl bg-cyan py-5 text-base font-black text-navy-950 shadow-cyan-glow active:scale-95 transition-all disabled:opacity-60"
        >
          {loading
            ? <Loader2 size={20} className="animate-spin" />
            : <>
                <span>
                  {mode === 'login' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Send Reset Link'}
                </span>
                <ArrowRight size={18} />
              </>
          }
        </button>

        {/* Back to login from forgot */}
        {mode === 'forgot' && (
          <button
            onClick={() => { setMode('login'); clearErrors(); setSuccessMsg('') }}
            className="mt-4 text-center text-sm font-bold text-slate-400 active:text-cyan transition-colors"
          >
            ← Back to Login
          </button>
        )}

        {/* Switch mode */}
        {mode !== 'forgot' && (
          <button
            onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); clearErrors(); setSuccessMsg('') }}
            className="mt-6 text-center text-sm font-bold text-slate-400 active:text-cyan transition-colors"
          >
            {mode === 'login'
              ? "Don't have an account? Sign Up →"
              : 'Already have an account? Sign In →'}
          </button>
        )}

        {/* Footer */}
        <p className="mt-auto pt-10 text-center text-[10px] font-bold uppercase tracking-[0.2em] text-navy-600">
          © 2026 {brandName} · All rights reserved
        </p>
      </div>
    </div>
  )
}