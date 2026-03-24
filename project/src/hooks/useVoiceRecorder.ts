// src/hooks/useVoiceRecorder.ts
//
// ══════════════════════════════════════════════════════════════════════════════
// VOICE PIPELINE — Web Speech API, TAP-TO-TOGGLE
// ══════════════════════════════════════════════════════════════════════════════
//
// WHY TAP-TO-TOGGLE instead of hold-to-speak:
//   Android Chrome's Web Speech API treats stopRecognition() as ABORT —
//   it discards everything heard so far and fires "no-speech" error.
//   Solution: TAP ONCE to start listening, TAP AGAIN to stop and save.
//   This matches how Google Assistant, Ola, and most Indian voice apps work.
//
// Pipeline (all free, no audio upload):
//   Tap mic → Web Speech API listens → live text on screen
//   Tap mic again → transcript sent to Gemini NLP → save to Supabase
//
// ── IMPORTANT for Home.tsx ───────────────────────────────────────────────────
// The mic button now uses onClick (not onMouseDown/onTouchStart).
// startRecording() TOGGLES — call it once to start, call it again to stop.
// stopRecording() also works as a direct stop (for timeout safety).
// Return shape is IDENTICAL to old hook — no other file needs changes.
// ══════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────
export type Lang           = 'en' | 'hi' | 'ta' | 'te' | 'kn' | 'ml'
export type RecorderStatus = 'idle' | 'recording' | 'processing'
export type SttConfidence  = 'high' | 'medium' | 'low'

const LANG_BCP: Record<Lang, string> = {
  en: 'en-IN',
  hi: 'hi-IN',
  ta: 'ta-IN',
  te: 'te-IN',
  kn: 'kn-IN',
  ml: 'ml-IN',
}

export interface UseVoiceRecorderOptions {
  language?:         Lang
  // Legacy — kept for backward compat with Home.tsx, silently ignored
  sarvamKey?:        string
  googleKey?:        string
  googleProjectId?:  string
  elevenLabsKey?:    string
  onTranscript:      (text: string, confidence: SttConfidence) => void
  onError?:          (msg: string) => void
  onRateLimit?:      () => void
  cooldownMs?:       number
  minHoldMs?:        number
}

// ── TTS helper ────────────────────────────────────────────────────────────────
export function zivaSpeak(phrase: string, lang: Lang = 'en'): void {
  if (!window.speechSynthesis) return
  window.speechSynthesis.cancel()
  const langCode = LANG_BCP[lang]
  const say = () => {
    const u      = new SpeechSynthesisUtterance(phrase)
    const voices = window.speechSynthesis.getVoices()
    const pick =
      voices.find(v => v.lang === langCode && /female|woman|girl/i.test(v.name)) ??
      voices.find(v => v.lang === langCode) ??
      voices.find(v => v.lang === 'en-IN')  ??
      voices.find(v => v.lang.startsWith('en')) ??
      null
    u.voice = pick; u.lang = 'en-IN'; u.rate = 0.88; u.pitch = 1.05; u.volume = 1.0
    window.speechSynthesis.speak(u)
  }
  if (window.speechSynthesis.getVoices().length > 0) say()
  else { window.speechSynthesis.onvoiceschanged = () => { say(); window.speechSynthesis.onvoiceschanged = null } }
}

// ── Main hook ─────────────────────────────────────────────────────────────────
export default function useVoiceRecorder({
  language    = 'en',
  sarvamKey:       _sk   = '',
  googleKey:       _gk   = '',
  googleProjectId: _gpid = '',
  elevenLabsKey:   _ek   = '',
  onTranscript,
  onError,
  onRateLimit: _rl,
  cooldownMs  = 1000,
  minHoldMs:  _mh = 300,
}: UseVoiceRecorderOptions) {

  const [isRecording,    setIsRecording]    = useState(false)
  const [isProcessing,   setIsProcessing]   = useState(false)
  const [liveText,       setLiveText]       = useState('')
  const [processingStep, setProcessingStep] = useState('')
  const [providerUsed,   setProviderUsed]   = useState('')

  const recognitionRef = useRef<any>(null)
  const isActiveRef    = useRef(false)      // true = currently listening
  const finalTextRef   = useRef('')
  const interimRef     = useRef('')
  const rAFRef         = useRef<number | null>(null)
  const lastStopRef    = useRef(0)
  const langRef        = useRef(language)
  const cbRef          = useRef({ onTranscript, onError })

  useEffect(() => { langRef.current = language },              [language])
  useEffect(() => { cbRef.current = { onTranscript, onError } }, [onTranscript, onError])

  // ── Cancel pending rAF ──────────────────────────────────────────────────────
  const cancelRAF = useCallback(() => {
    if (rAFRef.current !== null) { cancelAnimationFrame(rAFRef.current); rAFRef.current = null }
  }, [])

  // ── Deliver final transcript → Home.tsx ────────────────────────────────────
  const deliver = useCallback((text: string) => {
    const clean = text.trim()
    setIsRecording(false)
    setIsProcessing(false)
    setProcessingStep('')
    setLiveText('')
    cancelRAF()

    if (!clean) {
      cbRef.current.onError?.('Could not hear clearly. Tap the mic and speak.')
      return
    }

    const words = clean.split(/\s+/).filter(Boolean).length
    const conf: SttConfidence = words >= 3 ? 'high' : words >= 1 ? 'medium' : 'low'
    setProviderUsed('Web Speech API')
    navigator.vibrate?.(conf === 'high' ? 40 : [60, 40, 60])
    cbRef.current.onTranscript(clean, conf)
  }, [cancelRAF])

  // ── Kill the recognition instance ──────────────────────────────────────────
  const killRecognition = useCallback(() => {
    cancelRAF()
    if (recognitionRef.current) {
      try { recognitionRef.current.abort() } catch { /* ignore */ }
      recognitionRef.current = null
    }
  }, [cancelRAF])

  // ── Start listening ────────────────────────────────────────────────────────
  const startListening = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) {
      cbRef.current.onError?.('Voice input not supported. Please use Chrome on Android.')
      return
    }

    finalTextRef.current = ''
    interimRef.current   = ''
    cancelRAF()

    const r = new SR()
    r.lang            = LANG_BCP[langRef.current]
    r.continuous      = true       // keep listening until we call abort()
    r.interimResults  = true       // show live text while speaking
    r.maxAlternatives = 1

    r.onstart = () => {
      console.log('[WSA] started, lang:', r.lang)
      isActiveRef.current = true
      setIsRecording(true)
      setIsProcessing(false)
      setProcessingStep('Listening... tap mic again to save')
      setLiveText('')
    }

    r.onresult = (event: any) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTextRef.current += event.results[i][0].transcript + ' '
          interimRef.current = ''
        } else {
          interim += event.results[i][0].transcript
        }
      }
      interimRef.current = interim

      if (rAFRef.current === null) {
        rAFRef.current = requestAnimationFrame(() => {
          rAFRef.current = null
          const combined = (finalTextRef.current + interimRef.current).trim()
          setLiveText(combined)
        })
      }
    }

    r.onerror = (event: any) => {
      const err = event.error
      console.warn('[WSA] error:', err)

      // 'aborted' = we called abort() intentionally to stop — NOT an error
      if (err === 'aborted') return

      isActiveRef.current = false
      killRecognition()

      if (err === 'not-allowed' || err === 'service-not-allowed') {
        cbRef.current.onError?.(
          'Microphone blocked. Go to Chrome Settings → Site Settings → Microphone → Allow.'
        )
        setIsRecording(false); setIsProcessing(false); setProcessingStep('')
        return
      }

      if (err === 'no-speech') {
        cbRef.current.onError?.('No speech detected. Tap mic and speak clearly.')
        setIsRecording(false); setIsProcessing(false); setProcessingStep('')
        return
      }

      if (err === 'network') {
        // Deliver partial if we have something
        const partial = (finalTextRef.current + interimRef.current).trim()
        if (partial) {
          setIsProcessing(true); setProcessingStep('Saving...')
          deliver(partial)
        } else {
          cbRef.current.onError?.('Network error. Check your internet connection.')
          setIsRecording(false); setIsProcessing(false); setProcessingStep('')
        }
        return
      }

      // Fallback — deliver what we have or show error
      const partial = (finalTextRef.current + interimRef.current).trim()
      if (partial) deliver(partial)
      else {
        cbRef.current.onError?.(`Voice error (${err}). Please try again.`)
        setIsRecording(false); setIsProcessing(false); setProcessingStep('')
      }
    }

    r.onend = () => {
      console.log('[WSA] onend, isActive:', isActiveRef.current)

      // If still supposed to be active — Android auto-stopped, restart silently
      if (isActiveRef.current) {
        try {
          recognitionRef.current = null
          setTimeout(() => {
            if (isActiveRef.current) startListening()
          }, 100)
        } catch { /* ignore */ }
        return
      }

      // Stopped intentionally (via stopRecording) — deliver the transcript
      const text = (finalTextRef.current + interimRef.current).trim()
      setIsProcessing(true)
      setProcessingStep('Saving...')
      deliver(text)
    }

    try {
      r.start()
      recognitionRef.current = r
    } catch (err: any) {
      console.error('[WSA] start error:', err)
      isActiveRef.current = false
      cbRef.current.onError?.('Could not start voice input. Please try again.')
      setIsRecording(false)
    }
  }, [cancelRAF, deliver, killRecognition])

  // ── startRecording — TOGGLES on Android (call once to start, once to stop) ─
  const startRecording = useCallback(() => {
    // If already recording → stop and save
    if (isActiveRef.current) {
      const now = Date.now()
      if (now - lastStopRef.current < cooldownMs) return
      lastStopRef.current    = now
      isActiveRef.current    = false
      setProcessingStep('Saving...')
      setIsProcessing(true)
      if (recognitionRef.current) {
        // Don't abort() — let onend fire naturally so we get the final transcript
        try { recognitionRef.current.stop() } catch { /* ignore */ }
      }
      return
    }

    // Start fresh
    startListening()
  }, [cooldownMs, startListening])

  // ── stopRecording — explicit stop (used by timeout safety in Home.tsx) ──────
  const stopRecording = useCallback(() => {
    if (!isActiveRef.current) return
    isActiveRef.current = false
    lastStopRef.current = Date.now()
    setProcessingStep('Saving...')
    setIsProcessing(true)
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch { /* ignore */ }
    }
  }, [])

  // ── Cleanup on unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      isActiveRef.current = false
      killRecognition()
    }
  }, [killRecognition])

  // ── Return shape (identical to old hook) ───────────────────────────────────
  const status: RecorderStatus =
    isRecording  ? 'recording'  :
    isProcessing ? 'processing' :
    'idle'

  return {
    status,
    liveText,
    processingStep,
    providerUsed,
    sttConfidence: 'high' as SttConfidence,
    isRecording,
    isProcessing,
    startRecording,   // ← toggles on Android
    stopRecording,    // ← explicit stop (for timeout)
  }
}