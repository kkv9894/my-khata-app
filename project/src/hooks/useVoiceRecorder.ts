// src/hooks/useVoiceRecorder.ts
//
// VOICE PIPELINE — 4-provider chain, noise-robust, confidence-aware
//
//  1. Sarvam saaras:v3     ← PRIMARY  — India's best, 22 Indian languages
//  2. Google Chirp 2       ← BACKUP   — best for code-switching slang (Tanglish, Hinglish)
//  3. ElevenLabs Scribe    ← FALLBACK — excellent Indian language accuracy
//  4. Browser Web Speech   ← LAST RESORT
//
// AUDIO: highpass (removes hum) + compressor (normalises voice) → 16kHz WAV
//   Uses native AudioContext rate (NOT forced 16kHz at decode — that breaks Android).
//   Falls back to raw audio automatically if preprocessing fails.
//
// CONFIDENCE: Each provider returns a score (0–1).
//   ≥ 0.75 → 'high'   → auto-save allowed (Indian STT scores ~0.75–0.88)
//   ≥ 0.55 → 'medium' → show "Did you say ₹X?" confirmation
//    < 0.55 → 'low'    → open form for user to correct
//
// KEEPALIVE: requestData() every 200ms prevents Android stream auto-stop on silence.

import { useCallback, useEffect, useRef, useState } from 'react'

type Lang = 'en' | 'hi' | 'ta' | 'te' | 'kn' | 'ml'

const LANG_BCP: Record<Lang, string> = {
  en: 'en-IN', hi: 'hi-IN', ta: 'ta-IN', te: 'te-IN', kn: 'kn-IN', ml: 'ml-IN',
}

export type RecorderStatus  = 'idle' | 'recording' | 'processing'
export type SttConfidence   = 'high' | 'medium' | 'low'

// Indian STT scores are typically 0.75–0.88 — threshold of 0.75 = 'high' fires reliably
const scoreToLevel = (score: number): SttConfidence =>
  score >= 0.75 ? 'high' : score >= 0.55 ? 'medium' : 'low'

// ── AUDIO PREPROCESSING ──────────────────────────────────────────────────────
// Converts recorded blob → clean 16kHz mono WAV for STT APIs.
//
// Why this works on Android (unlike the broken version):
//   ❌ OLD: `new AudioContext({ sampleRate: 16000 })` — device rejects unsupported rate,
//      decodeAudioData throws, we silently send a corrupted buffer.
//   ✅ NEW: `new AudioContext()` — uses device native rate (44.1/48kHz), always works.
//      OfflineAudioContext THEN resamples to 16kHz.
//
// Triple try/catch: if ANYTHING fails at any step, returns raw blob unmodified.
const toCleanWav = async (blob: Blob): Promise<Blob> => {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioCtx) return blob

    // Step 1: Decode at NATIVE rate — always succeeds
    const ctx = new AudioCtx()
    let decoded: AudioBuffer
    try {
      decoded = await ctx.decodeAudioData(await blob.arrayBuffer())
    } catch {
      await ctx.close().catch(() => {})
      return blob  // decode failed → send raw
    }
    await ctx.close().catch(() => {})

    // Step 2: Resample + filter chain → 16kHz
    const TARGET  = 16000
    const len     = Math.ceil(decoded.duration * TARGET)
    const offline = new OfflineAudioContext(1, len, TARGET)
    const src     = offline.createBufferSource()
    src.buffer    = decoded

    // High-pass 100Hz: removes traffic hum, fan noise, refrigerator rumble
    const hp = offline.createBiquadFilter()
    hp.type = 'highpass'; hp.frequency.value = 100

    // Low-pass 4000Hz: removes hiss (speech lives in 80–3400Hz)
    const lp = offline.createBiquadFilter()
    lp.type = 'lowpass'; lp.frequency.value = 4000

    // Compressor: brings quiet speech up, clips loud spikes
    const comp = offline.createDynamicsCompressor()
    comp.threshold.value = -24
    comp.knee.value      = 30
    comp.ratio.value     = 6
    comp.attack.value    = 0.003
    comp.release.value   = 0.25

    src.connect(hp); hp.connect(lp); lp.connect(comp)
    comp.connect(offline.destination); src.start(0)

    const rendered = await offline.startRendering()
    const raw      = rendered.getChannelData(0)

    // Light noise gate: silence only sub-0.008 frames (pure background hiss)
    const gated = new Float32Array(raw.length)
    for (let i = 0; i < raw.length; i++) {
      gated[i] = Math.abs(raw[i]) < 0.008 ? 0 : raw[i]
    }

    // Step 3: Encode 16-bit PCM WAV
    const buf = new ArrayBuffer(44 + gated.length * 2)
    const v   = new DataView(buf)
    const ws  = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
    ws(0, 'RIFF'); v.setUint32(4, 36 + gated.length * 2, true)
    ws(8, 'WAVE'); ws(12, 'fmt ')
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
    v.setUint32(24, TARGET, true); v.setUint32(28, TARGET * 2, true)
    v.setUint16(32, 2, true); v.setUint16(34, 16, true)
    ws(36, 'data'); v.setUint32(40, gated.length * 2, true)
    for (let i = 0, o = 44; i < gated.length; i++, o += 2) {
      const s = Math.max(-1, Math.min(1, gated[i]))
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    }

    console.log(`🔊 Audio: ${(blob.size/1024).toFixed(1)}KB raw → ${(buf.byteLength/1024).toFixed(1)}KB clean WAV`)
    return new Blob([buf], { type: 'audio/wav' })

  } catch (err) {
    console.warn('⚠️ Preprocessing failed — sending raw audio:', err)
    return blob
  }
}

// ── TYPES ─────────────────────────────────────────────────────────────────────
export interface UseVoiceRecorderOptions {
  language?:         Lang
  sarvamKey?:        string
  googleKey?:        string    // Google Cloud API key — enables Chirp 2 backup
  googleProjectId?:  string    // Google Cloud Project ID (required with googleKey)
  elevenLabsKey?:    string
  onTranscript:      (text: string, confidence: SttConfidence) => void
  onError?:          (msg: string) => void
  onRateLimit?:      () => void
  cooldownMs?:       number
  minHoldMs?:        number
}

interface SttResult { text: string; confidence: number }

const withTimeout = <T>(p: Promise<T>, ms: number, label: string): Promise<T> =>
  Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${label} timeout`)), ms))])

// ── PROVIDER 1: Sarvam saaras:v3 ─────────────────────────────────────────────
// Pass language_code for ALL languages — prevents cross-language confusion.
// Malayalam ↔ Tamil confusion is the #1 failure mode without this hint.
// saaras:v3 handles code-mixing (Tanglish, Hinglish etc.) even with lang hint.
async function sarvamTranscribe(wav: Blob, apiKey: string, langCode?: string): Promise<SttResult> {
  const fd = new FormData()
  fd.append('file', new File([wav], 'voice.wav', { type: 'audio/wav' }))
  fd.append('model', 'saaras:v3')
  // ✅ ALWAYS pass language_code — fixes Malayalam/Tamil confusion, Telugu/Kannada confusion.
  // saaras:v3 still handles code-mixing (Tanglish etc.) with a language hint.
  // Without this, Sarvam auto-detect biases toward Tamil for any Dravidian language.
  if (langCode) fd.append('language_code', langCode)

  const res = await fetch('https://api.sarvam.ai/speech-to-text', {
    method: 'POST', headers: { 'api-subscription-key': apiKey }, body: fd,
  })
  if (res.status === 429) throw new Error('RATE_LIMIT')
  if (!res.ok) { const b = await res.text().catch(() => ''); throw new Error(`Sarvam ${res.status}: ${b.slice(0,100)}`) }

  const data = await res.json()
  const text = (data?.transcript ?? data?.text ?? data?.data?.transcript ?? '').trim()
  if (!text) throw new Error('Sarvam: empty transcript')

  // saaras:v3 returns confidence in response body
  const confidence: number = typeof data?.confidence === 'number'
    ? data.confidence
    : typeof data?.data?.confidence === 'number'
    ? data.data.confidence
    : 0.82

  console.log(`✅ Sarvam: "${text}" (${(confidence*100).toFixed(0)}%)`)
  return { text, confidence }
}

// ── PROVIDER 2: Google Chirp 2 ────────────────────────────────────────────────
// Best for code-switching: Tanglish, Hinglish, Kanglish etc.
// Setup: Google Cloud Console → Speech-to-Text v2 API → Enable
// .env: VITE_GOOGLE_STT_KEY + VITE_GOOGLE_PROJECT_ID
async function chirpTranscribe(rawBlob: Blob, projectId: string, apiKey: string, primaryLang?: string): Promise<SttResult> {
  // Chunk-encode to base64 (avoids stack overflow on large buffers)
  const bytes = new Uint8Array(await rawBlob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + 8192, bytes.byteLength)))
  }
  const base64 = btoa(binary)

  const url = `https://speech.googleapis.com/v2/projects/${projectId}/locations/global/recognizers/_:recognize?key=${apiKey}`
  const res = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      config: {
        autoDecodingConfig: {},
        // Put the user's selected language FIRST — Chirp 2 uses priority order.
        // This prevents Malayalam → Tamil confusion same as the Sarvam fix.
        languageCodes: primaryLang
          ? [primaryLang, ...['en-IN','hi-IN','ta-IN','te-IN','kn-IN','ml-IN'].filter(l => l !== primaryLang)]
          : ['en-IN', 'hi-IN', 'ta-IN', 'te-IN', 'kn-IN', 'ml-IN'],
        model: 'chirp_2',
        features: { enableWordConfidence: true, enableAutomaticPunctuation: false },
      },
      content: base64,
    }),
  })
  if (res.status === 429) throw new Error('RATE_LIMIT')
  if (!res.ok) { const b = await res.text().catch(() => ''); throw new Error(`Chirp ${res.status}: ${b.slice(0,100)}`) }

  const data = await res.json()
  const alt  = data?.results?.[0]?.alternatives?.[0]
  const text = (alt?.transcript ?? '').trim()
  if (!text) throw new Error('Chirp: empty transcript')

  const confidence: number = alt?.confidence ?? 0.82
  console.log(`✅ Google Chirp 2: "${text}" (${(confidence*100).toFixed(0)}%)`)
  return { text, confidence }
}

// ── PROVIDER 3: ElevenLabs Scribe ─────────────────────────────────────────────
async function elevenLabsTranscribe(wav: Blob, apiKey: string): Promise<SttResult> {
  const cleanType = wav.type.split(';')[0] || 'audio/wav'
  const ext       = cleanType.includes('mp4') ? 'mp4' : cleanType.includes('ogg') ? 'ogg' : 'wav'
  const fd = new FormData()
  fd.append('file', new File([wav], `voice.${ext}`, { type: cleanType }))
  fd.append('model_id', 'scribe_v1')
  fd.append('tag_audio_events', 'false')
  fd.append('diarize', 'false')

  const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST', headers: { 'xi-api-key': apiKey }, body: fd,
  })
  if (res.status === 429) throw new Error('RATE_LIMIT')
  if (!res.ok) { const b = await res.text().catch(() => ''); throw new Error(`ElevenLabs ${res.status}: ${b.slice(0,100)}`) }

  const data = await res.json()
  const text = (data?.text ?? data?.transcript ?? '').trim()
  if (!text) throw new Error('ElevenLabs: empty transcript')

  // Derive confidence from word-level logprobs
  const chars: Array<{ logprob?: number }> = data?.characters ?? []
  let confidence = 0.78
  if (chars.length > 0) {
    const avg = chars.reduce((s, c) => s + (c.logprob ?? -0.25), 0) / chars.length
    confidence = Math.min(1, Math.max(0, 1 - Math.abs(avg)))
  }

  console.log(`✅ ElevenLabs: "${text}" (${(confidence*100).toFixed(0)}%)`)
  return { text, confidence }
}

// ── HOOK ───────────────────────────────────────────────────────────────────────
export default function useVoiceRecorder({
  language        = 'en',
  sarvamKey       = '',
  googleKey       = '',
  googleProjectId = '',
  elevenLabsKey   = '',
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

  const cbRef = useRef({ onTranscript, onError, onRateLimit })
  useEffect(() => { cbRef.current = { onTranscript, onError, onRateLimit } })

  const keysRef = useRef({ sarvamKey, googleKey, googleProjectId, elevenLabsKey })
  useEffect(() => { keysRef.current = { sarvamKey, googleKey, googleProjectId, elevenLabsKey } })

  const langRef = useRef(language)
  useEffect(() => { langRef.current = language })

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef        = useRef<Blob[]>([])
  const streamRef        = useRef<MediaStream | null>(null)
  const recognitionRef   = useRef<any>(null)
  const finalTextRef     = useRef('')
  const keepaliveRef     = useRef<number | null>(null)
  const maxDurRef        = useRef<number | null>(null)   // 60s safety cap timer
  const audioCtxRef      = useRef<AudioContext | null>(null)  // Web Audio keepalive
  const isHoldingRef     = useRef(false)
  const holdStartRef     = useRef(0)
  const lastRequestRef   = useRef(0)

  // ── Browser STT: VISUAL FEEDBACK ONLY — never used for saving ───────────────
  // CRITICAL FIX: Chrome iOS fires .onend after ~10s even with continuous=true.
  // The restart loop can fail silently, triggering a ghost-stop on the MediaRecorder.
  // Fix: restart in a debounced setTimeout so it never races with the track.ended handler.
  const startBrowserSTT = useCallback((langCode: string) => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return
    finalTextRef.current = ''
    const startInstance = () => {
      if (!isHoldingRef.current) return   // don't restart if user already released
      try {
        const r = new SR()
        r.lang = langCode; r.continuous = true; r.interimResults = true; r.maxAlternatives = 1
        r.onresult = (e: any) => {
          let interim = ''
          for (let i = e.resultIndex; i < e.results.length; i++) {
            if (e.results[i].isFinal) finalTextRef.current += e.results[i][0].transcript + ' '
            else interim += e.results[i][0].transcript
          }
          setLiveText((finalTextRef.current + interim).trim())
        }
        r.onerror = () => {}
        // Restart in 150ms debounce — prevents race with track.ended / MediaRecorder.stop
        r.onend = () => {
          if (isHoldingRef.current) {
            window.setTimeout(startInstance, 150)
          }
        }
        r.start(); recognitionRef.current = r
      } catch { /* ignore — visual feedback not critical */ }
    }
    startInstance()
  }, [])

  const stopBrowserSTT = useCallback(() => {
    isHoldingRef.current = false
    try { recognitionRef.current?.abort() } catch {}
    recognitionRef.current = null
  }, [])

  // ── 4-provider chain ─────────────────────────────────────────────────────────
  // audioToSend = processed 16kHz WAV when valid, else raw blob
  // rawBlob     = always kept as ultimate fallback if processed audio fails
  const runProviders = useCallback(async (wav: Blob, rawBlob: Blob): Promise<SttResult> => {
    const { sarvamKey: sk, googleKey: gk, googleProjectId: gpid, elevenLabsKey: ek } = keysRef.current
    const errors: string[] = []

    // Use processed WAV if it looks valid (>5KB), else send raw directly
    const audioToSend   = wav.size > 5000 ? wav : rawBlob
    const fallbackAudio = rawBlob   // raw is always the ultimate fallback
    // ✅ Pass language_code for ALL languages — Malayalam/Tamil confusion is fixed this way.
    // saaras:v3 handles code-mixed speech (Tanglish, Hinglish etc.) even with a lang hint.
    const sarvamLang = LANG_BCP[langRef.current]   // en-IN | hi-IN | ta-IN | te-IN | kn-IN | ml-IN

    console.log(`🔑 Keys: sarvam=${!!sk} chirp=${!!(gk && gpid)} elevenlabs=${!!ek}`)
    console.log(`🎵 Audio: processed=${(wav.size/1024).toFixed(1)}KB raw=${(rawBlob.size/1024).toFixed(1)}KB → ${audioToSend === wav ? 'processed' : 'raw'}`)

    // 1. Sarvam — primary for Indian languages
    if (sk) {
      try {
        setProcessingStep('Listening...')
        const r = await withTimeout(sarvamTranscribe(audioToSend, sk, sarvamLang), 9000, 'Sarvam')
        setProviderUsed('Sarvam'); return r
      } catch (e: any) {
        // Retry once with raw audio if processed audio was the problem
        if (audioToSend !== fallbackAudio && e.message !== 'RATE_LIMIT') {
          try {
            const r = await withTimeout(sarvamTranscribe(fallbackAudio, sk, sarvamLang), 8000, 'Sarvam-raw')
            setProviderUsed('Sarvam'); return r
          } catch {}
        }
        if (e.message === 'RATE_LIMIT') cbRef.current.onRateLimit?.()
        errors.push(`Sarvam: ${e.message}`)
        console.warn('⚠️ Sarvam:', e.message)
      }
    }

    // 2. Google Chirp 2 — backup for code-switching slang (Tanglish, Hinglish etc.)
    if (gk && gpid) {
      try {
        setProcessingStep('Chirp AI...')
        const r = await withTimeout(chirpTranscribe(fallbackAudio, gpid, gk, LANG_BCP[langRef.current]), 10000, 'Chirp')
        setProviderUsed('Google Chirp'); return r
      } catch (e: any) {
        if (e.message === 'RATE_LIMIT') cbRef.current.onRateLimit?.()
        errors.push(`Chirp: ${e.message}`)
        console.warn('⚠️ Chirp:', e.message)
      }
    }

    // 3. ElevenLabs Scribe — reliable Indian language fallback
    if (ek) {
      try {
        setProcessingStep('Processing...')
        const r = await withTimeout(elevenLabsTranscribe(audioToSend, ek), 9000, 'ElevenLabs')
        setProviderUsed('ElevenLabs'); return r
      } catch (e: any) {
        if (e.message === 'RATE_LIMIT') cbRef.current.onRateLimit?.()
        errors.push(`ElevenLabs: ${e.message}`)
        console.warn('⚠️ ElevenLabs:', e.message)
      }
    }

    // 4. Browser Web Speech — last resort
    const browserText = finalTextRef.current.trim()
    if (browserText) {
      setProviderUsed('Browser')
      console.log('✅ Browser fallback:', `"${browserText}"`)
      return { text: browserText, confidence: 0.50 }
    }

    throw new Error(`All providers failed: ${errors.join(' | ')}`)
  }, [])

  // ── Process captured audio ───────────────────────────────────────────────────
  const processAudio = useCallback(async (chunks: Blob[], mimeType: string) => {
    if (!chunks.length) {
      setStatus('idle'); setLiveText(''); setProcessingStep('')
      cbRef.current.onError?.('No audio captured. Hold and speak.')
      return
    }

    const rawBlob = new Blob(chunks, { type: mimeType || 'audio/webm' })
    console.log(`🎙️ Raw audio: ${(rawBlob.size/1024).toFixed(1)}KB`)

    if (rawBlob.size < 500) {
      setStatus('idle'); setLiveText(''); setProcessingStep('')
      cbRef.current.onError?.('Too short. Hold and speak clearly.')
      return
    }

    setStatus('processing')
    setProcessingStep('Filtering noise...')

    // Preprocess: highpass + compressor + 16kHz (always falls back to raw on error)
    const wav = await toCleanWav(rawBlob)

    try {
      const result     = await runProviders(wav, rawBlob)
      const confidence = scoreToLevel(result.confidence)

      setSttConfidence(confidence)
      setStatus('idle'); setLiveText(''); setProcessingStep('')

      // Haptic: short single = confident, double pulse = needs verify
      navigator.vibrate?.(confidence === 'high' ? 40 : [80, 60, 80])

      cbRef.current.onTranscript(result.text, confidence)

    } catch (err: any) {
      setStatus('idle'); setLiveText(''); setProcessingStep('')
      cbRef.current.onError?.(
        (err?.message ?? '').includes('timeout')
          ? 'Server slow — check internet and try again.'
          : 'Could not hear clearly. Speak louder and try again.'
      )
      cbRef.current.onTranscript('', 'low')
    }
  }, [runProviders])

  // ── Start recording ───────────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    if (isHoldingRef.current) return
    const now = Date.now()
    if (now - lastRequestRef.current < cooldownMs) { cbRef.current.onRateLimit?.(); return }

    isHoldingRef.current = true; holdStartRef.current = now
    finalTextRef.current = ''; chunksRef.current = []
    setLiveText(''); setProviderUsed(''); setSttConfidence('high'); setStatus('recording')

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false, channelCount: 1 },
      })
      streamRef.current = stream

      // ── Web Audio API keepalive ─────────────────────────────────────────────
      // The MediaRecorder requestData() keepalive flushes data buffers, but Android's
      // hardware Voice Activity Detection (VAD) and iOS audio session management can
      // STILL kill the underlying audio STREAM during silence pauses — even with
      // autoGainControl: false. This happens because the OS sees no active consumer.
      //
      // Fix: Create an AudioContext + AnalyserNode that CONSUMES the stream.
      // The OS sees an active WebAudio pipeline and keeps the hardware mic open
      // for the full session. AnalyserNode is read-only (no output) so no feedback.
      try {
        const AudioCtxCls = window.AudioContext || (window as any).webkitAudioContext
        const ctx = new AudioCtxCls()
        const src = ctx.createMediaStreamSource(stream)
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 256           // smallest size — minimal CPU
        src.connect(analyser)            // no connect to destination — silent, no playback
        audioCtxRef.current = ctx
      } catch {
        console.warn('Web Audio keepalive failed — stream may stop on silence')
      }
      // ── REMOVED: stream.getAudioTracks()[0].addEventListener('ended', ...) ──
      // The OS fires 'ended' on silence pauses and audio session switches,
      // causing recording to stop mid-sentence while finger is still held.
      // User MUST be in full control: only stopRecording() (button release) stops it.

      const mimeType = [
        'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'
      ].find(m => MediaRecorder.isTypeSupported(m)) ?? ''

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)

      recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data) }

      recorder.onstop = async () => {
        clearInterval(keepaliveRef.current ?? 0)
        if (maxDurRef.current !== null) { clearTimeout(maxDurRef.current); maxDurRef.current = null }
        // Close Web Audio keepalive context
        audioCtxRef.current?.close().catch(() => {}); audioCtxRef.current = null
        stream.getTracks().forEach(t => t.stop())
        streamRef.current = null; lastRequestRef.current = Date.now()

        const holdMs = Date.now() - holdStartRef.current
        if (holdMs < minHoldMs) { setStatus('idle'); setLiveText(''); setProcessingStep(''); return }
        await processAudio(chunksRef.current, mimeType)
      }

      recorder.start()
      // KEEPALIVE: ping every 200ms — prevents Android killing stream during silence
      keepaliveRef.current = window.setInterval(() => {
        if (recorder.state === 'recording') recorder.requestData()
      }, 200)

      // ── 60s absolute safety cap ───────────────────────────────────────────────
      // Only fires if user never releases. Normal speech is 5-30s.
      // This is NOT a feature — it's a circuit breaker for edge cases.
      maxDurRef.current = window.setTimeout(() => {
        if (isHoldingRef.current && recorder.state === 'recording') {
          console.warn('⏱ 60s max recording reached')
          clearInterval(keepaliveRef.current ?? 0)
          stopBrowserSTT()
          recorder.requestData(); recorder.stop()
        }
      }, 60000)

      mediaRecorderRef.current = recorder
      startBrowserSTT(LANG_BCP[langRef.current])

    } catch (err) {
      console.error('getUserMedia failed:', err)
      isHoldingRef.current = false; setStatus('idle')
      cbRef.current.onError?.('Microphone access denied. Check browser permissions.')
    }
  }, [cooldownMs, minHoldMs, processAudio, startBrowserSTT, stopBrowserSTT])

  // ── Stop recording ────────────────────────────────────────────────────────────
  const stopRecording = useCallback(() => {
    if (!isHoldingRef.current) return
    clearInterval(keepaliveRef.current ?? 0)
    stopBrowserSTT()
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.requestData()
      mediaRecorderRef.current.stop()
    }
  }, [stopBrowserSTT])

  return {
    status, liveText, processingStep, providerUsed,
    sttConfidence,       // 'high' | 'medium' | 'low' — drives save vs confirm vs form
    isRecording:  status === 'recording',
    isProcessing: status === 'processing',
    startRecording, stopRecording,
  }
}