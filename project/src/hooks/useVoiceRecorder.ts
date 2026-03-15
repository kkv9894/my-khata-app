// src/hooks/useVoiceRecorder.ts
//
// VOICE PIPELINE — $0 BROWSER-ONLY
//
// Engine: window.SpeechRecognition / webkitSpeechRecognition (native, free)
//
// KEY DESIGN DECISIONS:
//   continuous = false  → auto-stops on silence (handles shop background noise)
//   interimResults = true → live transcript display while speaking
//   lang = BCP-47 code   → overrides OS language for exact regional accuracy
//   interimRef + rAF     → zero setState per syllable (no render lag)
//
// LANGUAGE MAP (BCP-47):
//   en → en-IN   hi → hi-IN   ta → ta-IN
//   te → te-IN   kn → kn-IN   ml → ml-IN
//
// API KEYS: sarvamKey / googleKey / elevenLabsKey props kept for backward
//   compatibility so Home.tsx needs zero changes. They are silently ignored.

import { useCallback, useEffect, useRef, useState } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

type Lang = 'en' | 'hi' | 'ta' | 'te' | 'kn' | 'ml'

// Exact BCP-47 tags — overrides phone OS language setting for regional accuracy
const LANG_BCP: Record<Lang, string> = {
  en: 'en-IN',   // Indian English
  hi: 'hi-IN',   // Hindi
  ta: 'ta-IN',   // Tamil
  te: 'te-IN',   // Telugu
  kn: 'kn-IN',   // Kannada
  ml: 'ml-IN',   // Malayalam
}

export type RecorderStatus = 'idle' | 'recording' | 'processing'
export type SttConfidence  = 'high' | 'medium' | 'low'

export interface UseVoiceRecorderOptions {
  language?:         Lang
  // ── Kept for backward compat — silently ignored (no cloud calls made) ──────
  sarvamKey?:        string
  googleKey?:        string
  googleProjectId?:  string
  elevenLabsKey?:    string
  // ─────────────────────────────────────────────────────────────────────────────
  onTranscript:      (text: string, confidence: SttConfidence) => void
  onError?:          (msg: string) => void
  onRateLimit?:      () => void
  cooldownMs?:       number
  minHoldMs?:        number
}

// ── TTS Helper — exported so components can use it directly ───────────────────
// Task 2: Prefers Indian/regional female voice, falls back gracefully.
// Uses Romanized phrases for clearest pronunciation on mobile devices.
export function zivaSpeak(phrase: string, lang: Lang = 'en'): void {
  if (!window.speechSynthesis) return
  window.speechSynthesis.cancel()

  const langCode = LANG_BCP[lang]   // e.g. 'ta-IN', 'hi-IN'

  const say = () => {
    const u = new SpeechSynthesisUtterance(phrase)
    const voices = window.speechSynthesis.getVoices()

    // Priority 1: Female voice in the user's exact regional language (e.g. ta-IN female)
    const regionalFemale = voices.find(v =>
      v.lang === langCode && /female|woman|girl/i.test(v.name)
    )
    // Priority 2: Any voice in the user's regional language
    const regional = voices.find(v => v.lang === langCode)
    // Priority 3: Female Indian English voice
    const indianEnFemale = voices.find(v =>
      v.lang === 'en-IN' && /female|woman|girl/i.test(v.name)
    )
    // Priority 4: Any Indian English voice
    const indianEn = voices.find(v => v.lang === 'en-IN')
    // Priority 5: Any English voice
    const anyEn = voices.find(v => v.lang.startsWith('en'))

    u.voice  = regionalFemale ?? regional ?? indianEnFemale ?? indianEn ?? anyEn ?? null
    // Always use en-IN lang tag — native script TTS (ta-IN) is robotic on most mobiles.
    // Romanized phrases + en-IN voice = clearest pronunciation across all languages.
    u.lang   = 'en-IN'
    u.rate   = 0.88
    u.pitch  = 1.05   // slightly higher pitch → more natural female tone
    u.volume = 1.0
    window.speechSynthesis.speak(u)
    console.log(`🔊 [TTS] "${phrase}" | voice: ${u.voice?.name ?? 'default'} | lang: ${u.lang}`)
  }

  // getVoices() is async on first load — wait for the list to populate
  if (window.speechSynthesis.getVoices().length > 0) {
    say()
  } else {
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.onvoiceschanged = null
      say()
    }
  }
}

// ── Main Hook ─────────────────────────────────────────────────────────────────

export default function useVoiceRecorder({
  language   = 'en',
  // Ignored but destructured to prevent "unknown prop" warnings
  sarvamKey:       _sk   = '',
  googleKey:       _gk   = '',
  googleProjectId: _gpid = '',
  elevenLabsKey:   _ek   = '',
  onTranscript,
  onError,
  onRateLimit,
  cooldownMs = 1500,
  minHoldMs  = 300,
}: UseVoiceRecorderOptions) {

  const [status,         setStatus]         = useState<RecorderStatus>('idle')
  const [liveText,       setLiveText]       = useState('')
  const [processingStep, setProcessingStep] = useState('')
  const [providerUsed,   setProviderUsed]   = useState('')
  const [sttConfidence,  setSttConfidence]  = useState<SttConfidence>('high')

  // Always-fresh callbacks — never stale in event handlers
  const cbRef = useRef({ onTranscript, onError, onRateLimit })
  useEffect(() => { cbRef.current = { onTranscript, onError, onRateLimit } })

  // Language ref — updated synchronously before any recognition restarts
  const langRef = useRef(language)
  useEffect(() => { langRef.current = language })

  const recognitionRef = useRef<any>(null)

  // ── interimRef + rAF: PERFORMANCE FIX ────────────────────────────────────
  // onresult fires on every syllable — storing interim in a ref (not state)
  // prevents React re-renders. setLiveText is called at most once per rAF frame
  // (~16ms), dropping renders from ~30/sentence down to ~6. No UI lag.
  const finalTextRef = useRef('')
  const interimRef   = useRef('')
  const rAFRef       = useRef<number | null>(null)

  // Session control refs
  const isHoldingRef   = useRef(false)
  const holdStartRef   = useRef(0)
  const lastRequestRef = useRef(0)
  // Guard: prevents double-processing if both onend AND stopRecording fire
  const processedRef   = useRef(false)

  // ── Finalize transcript ───────────────────────────────────────────────────
  // Called from recognition.onend (silence detected) or stopRecording (button release).
  // processedRef prevents double-firing.
  const finalize = useCallback(() => {
    if (processedRef.current) return
    processedRef.current = true
    isHoldingRef.current = false

    // Cancel any pending rAF frame
    if (rAFRef.current !== null) {
      cancelAnimationFrame(rAFRef.current)
      rAFRef.current = null
    }
    interimRef.current = ''

    // Discard taps shorter than minHoldMs
    const holdMs = Date.now() - holdStartRef.current
    if (holdMs < minHoldMs) {
      setStatus('idle'); setLiveText(''); setProcessingStep('')
      return
    }

    const text = finalTextRef.current.trim()

    setStatus('idle'); setLiveText(''); setProcessingStep('')

    if (!text) {
      cbRef.current.onError?.(
        'Could not hear clearly. Hold the mic closer and speak in a normal voice.'
      )
      cbRef.current.onTranscript('', 'low')
      return
    }

    // Confidence: browser STT is reliable when it returns a result
    const conf: SttConfidence = text.split(' ').length >= 2 ? 'high' : 'medium'
    setProviderUsed('Browser STT')
    setSttConfidence(conf)
    lastRequestRef.current = Date.now()
    navigator.vibrate?.(conf === 'high' ? 40 : [60, 40, 60])

    console.log(`✅ [STT] "${text}" (${conf})`)
    cbRef.current.onTranscript(text, conf)
  }, [minHoldMs])

  // ── Start a SpeechRecognition instance ────────────────────────────────────
  const startRecognition = useCallback(() => {
    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition

    if (!SR) {
      cbRef.current.onError?.(
        'Voice input is not supported. Please use Chrome on Android or Safari on iOS.'
      )
      setStatus('idle')
      return
    }

    const langCode = LANG_BCP[langRef.current]
    console.log(`🎙️ [STT] Starting | lang="${langCode}" | appLang="${langRef.current}"`)

    try {
      const r = new SR()

      // ── ACCURACY FIX: exact BCP-47 tag overrides OS default language ─────
      // Without this, a Tamil-speaking user's phone (set to English) sends
      // Tamil speech to an en-US recogniser → gibberish output.
      r.lang = langCode        // 'ta-IN' | 'hi-IN' | 'ml-IN' | etc.

      // ── SHOP NOISE FIX: continuous=false auto-stops on silence ────────────
      // continuous=true keeps the mic open even when the user stops talking,
      // picking up background noise (shop, TV, traffic) as fake speech.
      // continuous=false finalizes and stops as soon as the user pauses.
      r.continuous = false

      r.interimResults  = true   // live transcript display while speaking
      r.maxAlternatives = 1

      r.onstart = () => {
        console.log(`🎙️ [STT] Active | r.lang="${r.lang}"`)
      }

      // ── PERFORMANCE FIX: rAF throttle ─────────────────────────────────────
      // Store interim in ref, schedule ONE rAF update per frame instead of
      // calling setLiveText on every speech event.
      r.onresult = (e: any) => {
        let interim = ''
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) {
            finalTextRef.current += e.results[i][0].transcript + ' '
            interimRef.current    = ''   // clear interim when final arrives
          } else {
            interim += e.results[i][0].transcript
          }
        }
        interimRef.current = interim

        // Schedule a single rAF tick — coalesces rapid onresult events
        if (rAFRef.current === null) {
          rAFRef.current = requestAnimationFrame(() => {
            rAFRef.current = null
            setLiveText((finalTextRef.current + interimRef.current).trim())
          })
        }
      }

      r.onerror = (e: any) => {
        console.warn(`🎙️ [STT] error: "${e.error}"`)
        if (e.error === 'not-allowed') {
          cbRef.current.onError?.(
            'Microphone blocked. Open browser Settings → Site Settings → Microphone → Allow.'
          )
        } else if (e.error === 'network') {
          cbRef.current.onError?.(
            'Network error. Chrome voice recognition needs internet. Check your connection.'
          )
        } else if (e.error === 'no-speech') {
          // Silent hold — don't show error, just finalize quietly
        } else if (e.error !== 'aborted') {
          // 'aborted' fires on our own recognition.abort() calls — ignore it
          cbRef.current.onError?.(`Voice error: ${e.error}. Try again.`)
        }
        finalize()
      }

      // continuous=false: fires automatically when the user stops speaking
      // Also fires when we call recognition.stop() on button release
      r.onend = () => {
        console.log(`🎙️ [STT] onend | finals: "${finalTextRef.current.trim()}"`)
        finalize()
      }

      r.start()
      recognitionRef.current = r

    } catch (err: any) {
      console.error('[STT] Failed to start:', err)
      cbRef.current.onError?.(
        'Could not start voice recognition. Try Chrome on Android or Safari on iOS.'
      )
      isHoldingRef.current = false
      setStatus('idle')
    }
  }, [finalize])

  // ── Live language switch ──────────────────────────────────────────────────
  // If the user changes language while the mic is active, immediately abort
  // and restart with the new BCP-47 code so accuracy updates instantly.
  useEffect(() => {
    if (!isHoldingRef.current) return
    if (!recognitionRef.current) return
    const newCode = LANG_BCP[language]
    console.log(`🔄 [STT] Language changed mid-session → "${newCode}" — restarting`)
    try { recognitionRef.current.abort() } catch {}
    recognitionRef.current = null
    interimRef.current = ''
    // Reset processedRef so the new session can finalize normally
    processedRef.current = false
    finalTextRef.current = ''
    window.setTimeout(() => {
      if (isHoldingRef.current) startRecognition()
    }, 80)
  }, [language, startRecognition])

  // ── Start recording (mic button press) ───────────────────────────────────
  const startRecording = useCallback(() => {
    if (isHoldingRef.current) return
    const now = Date.now()
    if (now - lastRequestRef.current < cooldownMs) {
      cbRef.current.onRateLimit?.()
      return
    }

    // Reset session state
    isHoldingRef.current = true
    holdStartRef.current = now
    processedRef.current = false
    finalTextRef.current = ''
    interimRef.current   = ''
    if (rAFRef.current !== null) {
      cancelAnimationFrame(rAFRef.current)
      rAFRef.current = null
    }

    setLiveText(''); setProviderUsed(''); setSttConfidence('high')
    setProcessingStep('Listening...')
    setStatus('recording')

    startRecognition()
  }, [cooldownMs, startRecognition])

  // ── Stop recording (mic button release) ──────────────────────────────────
  const stopRecording = useCallback(() => {
    if (!isHoldingRef.current) return
    // Graceful stop → triggers onend → finalize()
    // Do NOT use .abort() here — that fires onerror='aborted' and discards results
    try { recognitionRef.current?.stop() } catch {}
  }, [])

  return {
    status,
    liveText,
    processingStep,
    providerUsed,
    sttConfidence,
    isRecording:  status === 'recording',
    isProcessing: status === 'processing',
    startRecording,
    stopRecording,
  }
}