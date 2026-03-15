// src/hooks/useWhisperSTT.ts
//
// ON-DEVICE STT ENGINE — $0 cost, fully private
//
// Uses:  @xenova/transformers  (Whisper via WebGPU / WASM fallback)
// Model: Xenova/whisper-small  (~244MB, downloads ONCE then browser-cached)
//
// WHY whisper-small AND NOT whisper-tiny:
//   whisper-tiny  = 39MB  — poor Indian language accuracy
//   whisper-base  = 74MB  — basic Indian language accuracy
//   whisper-small = 244MB — good accuracy for all 6 Indian languages ✅
//
// DUAL-ENGINE DESIGN (live display + accurate final transcript):
//   1. Web Speech API  → live interim text shown while user is speaking
//                         (zero-latency visual feedback, no accuracy required)
//   2. Whisper          → final transcript used for saving to Supabase
//                         (runs on the recorded audio AFTER button release)
//
// FIRST USE WARNING:
//   whisper-small downloads ~244MB on first use.
//   Subsequent uses load from browser cache (IndexedDB) — instant.
//   Show the user a "Loading voice model..." message on first use.
//
// LANGUAGE CODES:
//   Whisper uses ISO 639-1 codes: en | hi | ta | te | kn | ml
//   These map directly from the app's Lang type (no conversion needed).

// ── Type shims (avoid importing the full @xenova/transformers type defs) ─────
type Pipeline = {
  (audio: Float32Array, opts: Record<string, unknown>): Promise<{ text: string; chunks?: Array<{ timestamp: [number, number]; text: string }> }>
}

// ── Module-level singleton ────────────────────────────────────────────────────
// Stored outside the hook so the model survives component remounts.
// Only one download ever happens per browser session.
let _pipeline: Pipeline | null = null
let _loadPromise: Promise<Pipeline> | null = null

export type WhisperLang = 'en' | 'hi' | 'ta' | 'te' | 'kn' | 'ml'

export type WhisperStatus =
  | 'idle'
  | 'loading-model'   // downloading / initializing Whisper (first use only)
  | 'recording'       // mic is open, user is speaking
  | 'transcribing'    // Whisper is running on captured audio
  | 'error'

// ── Model loader ──────────────────────────────────────────────────────────────
// Lazy: only loads when startRecording() is first called.
// Progress callback lets the UI show download %.
async function loadWhisper(
  onProgress?: (msg: string) => void
): Promise<Pipeline> {
  if (_pipeline) return _pipeline
  if (_loadPromise) return _loadPromise

  _loadPromise = (async () => {
    // Dynamic import — Vite will NOT pre-bundle this (optimizeDeps.exclude)
    const { pipeline, env } = await import('@xenova/transformers')

    // Use the local cache in browser IndexedDB — no re-download after first use
    env.allowLocalModels = false
    env.useBrowserCache  = true

    // Progress events fire during model chunk downloads
    onProgress?.('Downloading voice model (first use only)…')

    // whisper-small gives good accuracy for all 6 Indian languages
    // Change to 'Xenova/whisper-base' (~74MB) for faster load at lower accuracy
    const pipe = await pipeline(
      'automatic-speech-recognition',
      'Xenova/whisper-small',
      {
        // Emit download progress
        progress_callback: (p: any) => {
          if (p.status === 'downloading' && p.total) {
            const pct = Math.round((p.loaded / p.total) * 100)
            onProgress?.(`Downloading voice model… ${pct}%`)
          } else if (p.status === 'loading') {
            onProgress?.('Loading voice model…')
          }
        },
      }
    )

    _pipeline = pipe as unknown as Pipeline
    console.log('✅ [Whisper] Model ready')
    return _pipeline
  })()

  return _loadPromise
}

// ── Audio helpers ─────────────────────────────────────────────────────────────

// Decode a recorded Blob → Float32Array at 16kHz
// Whisper requires 16kHz mono Float32 input.
async function blobToFloat32At16k(blob: Blob): Promise<Float32Array> {
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
  if (!AudioCtx) throw new Error('AudioContext not available')

  // Step 1: decode at native device rate (avoids Android rejection of 16kHz ctx)
  const nativeCtx = new AudioCtx()
  let decoded: AudioBuffer
  try {
    decoded = await nativeCtx.decodeAudioData(await blob.arrayBuffer())
  } finally {
    await nativeCtx.close().catch(() => {})
  }

  // Step 2: resample to 16kHz via OfflineAudioContext
  const TARGET  = 16000
  const frames  = Math.ceil(decoded.duration * TARGET)
  const offline = new OfflineAudioContext(1, frames, TARGET)
  const src     = offline.createBufferSource()
  src.buffer    = decoded

  // High-pass filter: removes 50Hz hum from fans, traffic
  const hp = offline.createBiquadFilter()
  hp.type = 'highpass'; hp.frequency.value = 80

  // Compressor: normalises quiet speech, prevents clipping
  const comp = offline.createDynamicsCompressor()
  comp.threshold.value = -20
  comp.knee.value      = 30
  comp.ratio.value     = 6
  comp.attack.value    = 0.003
  comp.release.value   = 0.25

  src.connect(hp)
  hp.connect(comp)
  comp.connect(offline.destination)
  src.start(0)

  const rendered = await offline.startRendering()
  const raw      = rendered.getChannelData(0)   // Float32Array

  // Light noise gate: zero out sub-threshold frames (background hiss)
  const gated = new Float32Array(raw.length)
  for (let i = 0; i < raw.length; i++) {
    gated[i] = Math.abs(raw[i]) < 0.005 ? 0 : raw[i]
  }

  console.log(
    `🔊 [Whisper audio] ${decoded.sampleRate}Hz → 16kHz | ` +
    `${(blob.size / 1024).toFixed(1)}KB → ${(gated.length * 4 / 1024).toFixed(1)}KB Float32`
  )
  return gated
}

// ── The hook ──────────────────────────────────────────────────────────────────

export interface UseWhisperSTTOptions {
  language?:   WhisperLang
  minHoldMs?:  number
  cooldownMs?: number
  onTranscript: (text: string, confidence: 'high' | 'medium' | 'low') => void
  onError?:     (msg: string) => void
  onProgress?:  (msg: string) => void   // model download progress
}

export interface UseWhisperSTTReturn {
  status:        WhisperStatus
  liveText:      string          // interim text from Web Speech (display only)
  processingStep: string         // human-readable step label
  providerUsed:  string          // 'Whisper (on-device)'
  isRecording:   boolean
  isProcessing:  boolean
  isModelLoading: boolean        // true only on very first use
  startRecording: () => void
  stopRecording:  () => void
}

export function useWhisperSTT({
  language   = 'en',
  minHoldMs  = 300,
  cooldownMs = 1500,
  onTranscript,
  onError,
  onProgress,
}: UseWhisperSTTOptions): UseWhisperSTTReturn {

  // React state — only for values the UI actually renders
  const [status,          setStatus]          = useState<WhisperStatus>('idle')
  const [liveText,        setLiveText]        = useState('')
  const [processingStep,  setProcessingStep]  = useState('')
  const [providerUsed,    setProviderUsed]    = useState('')

  // Fresh callback refs — never stale inside async handlers
  const cbRef = useRef({ onTranscript, onError, onProgress })
  useEffect(() => { cbRef.current = { onTranscript, onError, onProgress } })

  const langRef          = useRef(language)
  useEffect(() => { langRef.current = language })

  // MediaRecorder refs
  const recorderRef      = useRef<MediaRecorder | null>(null)
  const chunksRef        = useRef<Blob[]>([])
  const streamRef        = useRef<MediaStream | null>(null)

  // Web Speech API refs (live display only)
  const recognitionRef   = useRef<any>(null)
  const interimRef       = useRef('')
  const finalTextRef     = useRef('')   // accumulated finals from Web Speech (display)
  const rAFRef           = useRef<number | null>(null)

  // Session control
  const isHoldingRef     = useRef(false)
  const holdStartRef     = useRef(0)
  const lastRequestRef   = useRef(0)
  const processedRef     = useRef(false)

  // ── Web Speech: live interim display only ─────────────────────────────────
  // The final Whisper transcript will REPLACE whatever the Web Speech shows.
  // Web Speech is purely for real-time visual feedback.
  const startLiveDisplay = useCallback((langCode: string) => {
    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition
    if (!SR) return   // fine — just means no live text preview

    try {
      const r = new SR()
      r.lang           = langCode
      r.continuous     = true    // keep running while MediaRecorder is open
      r.interimResults = true
      r.maxAlternatives = 1

      r.onresult = (e: any) => {
        let interim = ''
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) {
            finalTextRef.current += e.results[i][0].transcript + ' '
            interimRef.current = ''
          } else {
            interim += e.results[i][0].transcript
          }
        }
        interimRef.current = interim

        if (rAFRef.current === null) {
          rAFRef.current = requestAnimationFrame(() => {
            rAFRef.current = null
            setLiveText((finalTextRef.current + interimRef.current).trim())
          })
        }
      }

      r.onerror = () => {}   // silent — Web Speech errors don't affect Whisper
      r.onend   = () => {
        // Restart if still recording (Chrome auto-stops after ~10s)
        if (isHoldingRef.current) window.setTimeout(() => startLiveDisplay(langCode), 150)
      }

      r.start()
      recognitionRef.current = r
    } catch { /* no Web Speech — that's fine */ }
  }, [])

  const stopLiveDisplay = useCallback(() => {
    if (rAFRef.current !== null) { cancelAnimationFrame(rAFRef.current); rAFRef.current = null }
    interimRef.current = ''
    try { recognitionRef.current?.abort() } catch {}
    recognitionRef.current = null
  }, [])

  // ── Process captured audio through Whisper ────────────────────────────────
  const transcribeWithWhisper = useCallback(async (chunks: Blob[], mimeType: string) => {
    if (processedRef.current) return
    processedRef.current = true

    stopLiveDisplay()
    isHoldingRef.current = false

    const holdMs = Date.now() - holdStartRef.current
    if (holdMs < minHoldMs || !chunks.length) {
      setStatus('idle'); setLiveText(''); setProcessingStep('')
      return
    }

    // Step 1: Load model (instant after first load — reads from IndexedDB cache)
    setStatus('loading-model')
    setProcessingStep('Loading voice model…')
    let pipe: Pipeline
    try {
      pipe = await loadWhisper((msg) => {
        setProcessingStep(msg)
        cbRef.current.onProgress?.(msg)
      })
    } catch (err: any) {
      console.error('[Whisper] Model load failed:', err)
      cbRef.current.onError?.('Failed to load voice model. Check internet and try again.')
      setStatus('idle'); setLiveText(''); setProcessingStep('')
      return
    }

    // Step 2: Convert recorded audio → 16kHz Float32Array
    setStatus('transcribing')
    setProcessingStep('Transcribing…')
    const rawBlob = new Blob(chunks, { type: mimeType || 'audio/webm' })
    console.log(`🎙️ [Whisper] Raw audio: ${(rawBlob.size / 1024).toFixed(1)}KB`)

    if (rawBlob.size < 800) {
      cbRef.current.onError?.('Too short. Hold and speak clearly.')
      setStatus('idle'); setLiveText(''); setProcessingStep('')
      return
    }

    let audio: Float32Array
    try {
      audio = await blobToFloat32At16k(rawBlob)
    } catch (err: any) {
      console.error('[Whisper] Audio decode failed:', err)
      cbRef.current.onError?.('Could not process audio. Try again.')
      setStatus('idle'); setLiveText(''); setProcessingStep('')
      return
    }

    // Step 3: Run Whisper — language forces Indian dialect, task=transcribe
    const whisperLang = langRef.current   // 'en' | 'hi' | 'ta' | 'te' | 'kn' | 'ml'
    console.log(`🤖 [Whisper] Running | lang="${whisperLang}" | frames=${audio.length}`)

    try {
      const result = await pipe(audio, {
        language: whisperLang,    // ISO 639-1 — overrides Whisper auto-detect
        task:     'transcribe',   // NOT 'translate' — we want original language
        // Return word-level timestamps for confidence scoring
        return_timestamps: true,
      })

      const text = result.text.trim()
      console.log(`✅ [Whisper] "${text}"`)

      if (!text) {
        cbRef.current.onError?.('Could not hear clearly. Speak louder and try again.')
        cbRef.current.onTranscript('', 'low')
        setStatus('idle'); setLiveText(''); setProcessingStep('')
        return
      }

      // Confidence from word count (Whisper doesn't return a simple score)
      // More words = more likely a real sentence = higher confidence
      const wordCount = text.split(/\s+/).filter(Boolean).length
      const conf = wordCount >= 3 ? 'high' : wordCount >= 1 ? 'medium' : 'low'

      setProviderUsed('Whisper (on-device)')
      lastRequestRef.current = Date.now()
      navigator.vibrate?.(conf === 'high' ? 40 : [60, 40, 60])

      setStatus('idle'); setLiveText(''); setProcessingStep('')
      cbRef.current.onTranscript(text, conf)

    } catch (err: any) {
      console.error('[Whisper] Transcription failed:', err)
      cbRef.current.onError?.(
        err?.message?.includes('timeout')
          ? 'Voice processing timed out. Try a shorter phrase.'
          : 'Could not transcribe. Try again.'
      )
      cbRef.current.onTranscript('', 'low')
      setStatus('idle'); setLiveText(''); setProcessingStep('')
    }
  }, [minHoldMs, stopLiveDisplay])

  // ── Start recording ───────────────────────────────────────────────────────
  const startRecording = useCallback(() => {
    if (isHoldingRef.current) return
    const now = Date.now()
    if (now - lastRequestRef.current < cooldownMs) { return }

    isHoldingRef.current = true
    holdStartRef.current = now
    processedRef.current = false
    finalTextRef.current = ''
    interimRef.current   = ''
    chunksRef.current    = []

    if (rAFRef.current !== null) { cancelAnimationFrame(rAFRef.current); rAFRef.current = null }

    setLiveText(''); setProviderUsed('')
    setProcessingStep('Listening…')
    setStatus('recording')

    navigator.mediaDevices.getUserMedia({
      audio: {
        // ── Native browser noise cancellation ────────────────────────────
        echoCancellation: true,   // removes speaker echo (important on mobile)
        noiseSuppression: true,   // removes background hum/traffic
        autoGainControl:  true,   // normalises quiet speech (unlike old version)
        channelCount:     1,      // mono — Whisper only uses mono
      },
    }).then(stream => {
      streamRef.current = stream

      const mimeType = [
        'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4',
      ].find(m => MediaRecorder.isTypeSupported(m)) ?? ''

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)

      recorder.ondataavailable = (e) => {
        if (e.data?.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        streamRef.current = null
        void transcribeWithWhisper(chunksRef.current, mimeType)
      }

      recorder.start(200)   // 200ms slices — keeps chunks coming in steadily
      recorderRef.current = recorder

      // Start Web Speech for live display (best-effort — ignores errors)
      const { LANG_BCP_DISPLAY } = { LANG_BCP_DISPLAY: {
        en: 'en-IN', hi: 'hi-IN', ta: 'ta-IN', te: 'te-IN', kn: 'kn-IN', ml: 'ml-IN',
      }}
      startLiveDisplay(LANG_BCP_DISPLAY[langRef.current] ?? 'en-IN')

    }).catch(err => {
      console.error('[Whisper] getUserMedia failed:', err)
      isHoldingRef.current = false
      setStatus('idle')
      cbRef.current.onError?.(
        err.name === 'NotAllowedError'
          ? 'Microphone blocked. Go to browser Settings → Site Settings → Microphone → Allow.'
          : 'Could not access microphone. Check permissions and try again.'
      )
    })
  }, [cooldownMs, startLiveDisplay, transcribeWithWhisper])

  // ── Stop recording ────────────────────────────────────────────────────────
  const stopRecording = useCallback(() => {
    if (!isHoldingRef.current) return
    stopLiveDisplay()
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.requestData()
      recorderRef.current.stop()
    }
  }, [stopLiveDisplay])

  return {
    status,
    liveText,
    processingStep,
    providerUsed,
    isRecording:    status === 'recording',
    isProcessing:   status === 'transcribing' || status === 'loading-model',
    isModelLoading: status === 'loading-model',
    startRecording,
    stopRecording,
  }
}

// Re-export useState/useCallback/useEffect/useRef so the file is self-contained
import { useState, useCallback, useEffect, useRef } from 'react'