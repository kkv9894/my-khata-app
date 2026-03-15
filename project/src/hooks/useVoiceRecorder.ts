// src/hooks/useVoiceRecorder.ts
//
// VOICE PIPELINE — $0 ON-DEVICE (Whisper via @xenova/transformers)
//
// This file is a thin adapter:
//   → Accepts the same props as before (backward-compat with Home.tsx)
//   → Delegates all work to useWhisperSTT
//   → Returns the same shape as before so Home.tsx needs ZERO changes
//
// API KEYS: sarvamKey / googleKey / elevenLabsKey are kept in the interface
//   for backward compatibility and are silently ignored. No cloud calls made.
//
// TTS: zivaSpeak() is exported — uses native window.speechSynthesis (free).
//
// ── What changed vs the previous version ─────────────────────────────────────
//   BEFORE: window.SpeechRecognition was both live display AND final result
//   NOW:    window.SpeechRecognition = live display only
//           Whisper (on-device)      = final transcript used for saving

import { useWhisperSTT } from './useWhisperSTT'

// ── Types (re-exported — Home.tsx imports SttConfidence from here) ────────────

export type Lang           = 'en' | 'hi' | 'ta' | 'te' | 'kn' | 'ml'
export type RecorderStatus = 'idle' | 'recording' | 'processing'
export type SttConfidence  = 'high' | 'medium' | 'low'

// BCP-47 map — kept here for the zivaSpeak TTS helper
const LANG_BCP: Record<Lang, string> = {
  en: 'en-IN', hi: 'hi-IN', ta: 'ta-IN', te: 'te-IN', kn: 'kn-IN', ml: 'ml-IN',
}

export interface UseVoiceRecorderOptions {
  language?:         Lang
  // ── Kept for backward compat — silently ignored ────────────────────────────
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

// ── TTS helper ────────────────────────────────────────────────────────────────
// Free, uses native window.speechSynthesis.
// Prefers Indian/regional female voice, falls back gracefully.
// Call from anywhere: import { zivaSpeak } from '../hooks/useVoiceRecorder'
export function zivaSpeak(phrase: string, lang: Lang = 'en'): void {
  if (!window.speechSynthesis) return
  window.speechSynthesis.cancel()

  const langCode = LANG_BCP[lang]

  const say = () => {
    const u      = new SpeechSynthesisUtterance(phrase)
    const voices = window.speechSynthesis.getVoices()

    // Priority ladder: regional female → regional → Indian-EN female → Indian-EN → any EN
    const pick =
      voices.find(v => v.lang === langCode    && /female|woman|girl/i.test(v.name)) ??
      voices.find(v => v.lang === langCode)                                          ??
      voices.find(v => v.lang === 'en-IN'     && /female|woman|girl/i.test(v.name)) ??
      voices.find(v => v.lang === 'en-IN')                                           ??
      voices.find(v => v.lang.startsWith('en'))                                      ??
      null

    u.voice  = pick
    // en-IN for ALL languages — native script TTS is robotic on mobile.
    // Romanized phrases + en-IN voice = clearest pronunciation.
    u.lang   = 'en-IN'
    u.rate   = 0.88
    u.pitch  = 1.05
    u.volume = 1.0
    window.speechSynthesis.speak(u)
    console.log(`🔊 [TTS] "${phrase}" | voice: ${u.voice?.name ?? 'default'}`)
  }

  if (window.speechSynthesis.getVoices().length > 0) {
    say()
  } else {
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.onvoiceschanged = null
      say()
    }
  }
}

// ── Main hook (adapter) ───────────────────────────────────────────────────────

export default function useVoiceRecorder({
  language   = 'en',
  // Silently ignored — no cloud calls
  sarvamKey:       _sk        = '',
  googleKey:       _gk        = '',
  googleProjectId: _gpid      = '',
  elevenLabsKey:   _ek        = '',
  onRateLimit:     _onRateLimit,        // ← FIX: prefixed with _ to suppress TS6133
  onTranscript,
  onError,
  cooldownMs = 1500,
  minHoldMs  = 300,
}: UseVoiceRecorderOptions) {

  const whisper = useWhisperSTT({
    language,
    minHoldMs,
    cooldownMs,
    onTranscript,
    onError,
    // Show model-loading progress in the processing step label
    onProgress: (msg) => {
      // Progress messages are already shown via whisper.processingStep
      // This callback is available if you want to route them elsewhere
      console.log(`[Whisper model] ${msg}`)
    },
  })

  // Map Whisper status back to the RecorderStatus shape Home.tsx expects:
  //   'loading-model' and 'transcribing' both map to 'processing'
  const status: RecorderStatus =
    whisper.status === 'idle'       ? 'idle'       :
    whisper.status === 'recording'  ? 'recording'  :
    /* loading-model | transcribing */ 'processing'

  return {
    // ── Values Home.tsx uses ──────────────────────────────────────────────────
    status,
    liveText:       whisper.liveText,
    processingStep: whisper.processingStep,
    providerUsed:   whisper.providerUsed,
    sttConfidence:  'high' as SttConfidence,   // Whisper is always treated as high-confidence
    isRecording:    whisper.isRecording,
    isProcessing:   whisper.isProcessing,
    startRecording: whisper.startRecording,
    stopRecording:  whisper.stopRecording,
  }
}