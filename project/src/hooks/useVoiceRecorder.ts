// src/hooks/useVoiceRecorder.ts
//
// VOICE PIPELINE — 4-provider chain, noise-robust, confidence-aware
//
//  1. Sarvam saaras:v3     ← PRIMARY  — India's best, 22 Indian languages
//  2. Google Chirp 2       ← BACKUP   — best for code-switching slang
//  3. ElevenLabs Scribe    ← FALLBACK — excellent Indian language accuracy
//  4. Browser Web Speech   ← LAST RESORT
//
// ✅ SECURE: All STT calls go through /api/stt/* — no API keys in browser.

import { useCallback, useEffect, useRef, useState } from 'react'

type Lang = 'en' | 'hi' | 'ta' | 'te' | 'kn' | 'ml'

const LANG_BCP: Record<Lang, string> = {
  en: 'en-IN', hi: 'hi-IN', ta: 'ta-IN', te: 'te-IN', kn: 'kn-IN', ml: 'ml-IN',
}

export type RecorderStatus = 'idle' | 'recording' | 'processing'
export type SttConfidence  = 'high' | 'medium' | 'low'

const scoreToLevel = (score: number): SttConfidence =>
  score >= 0.75 ? 'high' : score >= 0.55 ? 'medium' : 'low'

const toCleanWav = async (blob: Blob): Promise<Blob> => {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioCtx) return blob

    const ctx = new AudioCtx()
    let decoded: AudioBuffer
    try {
      decoded = await ctx.decodeAudioData(await blob.arrayBuffer())
    } catch {
      await ctx.close().catch(() => {})
      return blob
    }
    await ctx.close().catch(() => {})

    const TARGET  = 16000
    const len     = Math.ceil(decoded.duration * TARGET)
    const offline = new OfflineAudioContext(1, len, TARGET)
    const src     = offline.createBufferSource()
    src.buffer    = decoded

    const hp = offline.createBiquadFilter()
    hp.type = 'highpass'; hp.frequency.value = 100

    const lp = offline.createBiquadFilter()
    lp.type = 'lowpass'; lp.frequency.value = 4000

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

    const gated = new Float32Array(raw.length)
    for (let i = 0; i < raw.length; i++) {
      gated[i] = Math.abs(raw[i]) < 0.008 ? 0 : raw[i]
    }

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

    return new Blob([buf], { type: 'audio/wav' })
  } catch (err) {
    console.warn('⚠️ Preprocessing failed — sending raw audio:', err)
    return blob
  }
}

export interface UseVoiceRecorderOptions {
  language?:    Lang
  onTranscript: (text: string, confidence: SttConfidence) => void
  onError?:     (msg: string) => void
  onRateLimit?: () => void
  cooldownMs?:  number
  minHoldMs?:   number
}

interface SttResult { text: string; confidence: number }

const withTimeout = <T>(p: Promise<T>, ms: number, label: string): Promise<T> =>
  Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${label} timeout`)), ms))])

async function sarvamTranscribe(wav: Blob, langCode?: string): Promise<SttResult> {
  const fd = new FormData()
  fd.append('file', new File([wav], 'voice.wav', { type: 'audio/wav' }))
  fd.append('model', 'saaras:v3')
  if (langCode) fd.append('language_code', langCode)

  const res = await fetch('/api/stt/sarvam', { method: 'POST', body: fd })
  if (res.status === 429) throw new Error('RATE_LIMIT')
  if (!res.ok) {
    const b = await res.json().catch(() => ({}))
    throw new Error(`Sarvam ${res.status}: ${b?.error ?? ''}`)
  }

  const data = await res.json()
  const text = (data?.transcript ?? data?.text ?? data?.data?.transcript ?? '').trim()
  if (!text) throw new Error('Sarvam: empty transcript')

  const confidence: number = typeof data?.confidence === 'number'
    ? data.confidence
    : typeof data?.data?.confidence === 'number'
    ? data.data.confidence
    : 0.82

  console.log(`✅ Sarvam: "${text}" (${(confidence*100).toFixed(0)}%)`)
  return { text, confidence }
}

async function chirpTranscribe(rawBlob: Blob, primaryLang?: string): Promise<SttResult> {
  const bytes = new Uint8Array(await rawBlob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + 8192, bytes.byteLength)))
  }
  const base64 = btoa(binary)

  const languageCodes = primaryLang
    ? [primaryLang, ...['en-IN','hi-IN','ta-IN','te-IN','kn-IN','ml-IN'].filter(l => l !== primaryLang)]
    : ['en-IN', 'hi-IN', 'ta-IN', 'te-IN', 'kn-IN', 'ml-IN']

  const res = await fetch('/api/stt/chirp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base64, languageCodes }),
  })
  if (res.status === 429) throw new Error('RATE_LIMIT')
  if (res.status === 503) throw new Error('CHIRP_NOT_CONFIGURED')
  if (!res.ok) {
    const b = await res.json().catch(() => ({}))
    throw new Error(`Chirp ${res.status}: ${b?.error ?? ''}`)
  }

  const data = await res.json()
  const alt  = data?.results?.[0]?.alternatives?.[0]
  const text = (alt?.transcript ?? '').trim()
  if (!text) throw new Error('Chirp: empty transcript')

  const confidence: number = alt?.confidence ?? 0.82
  console.log(`✅ Google Chirp 2: "${text}" (${(confidence*100).toFixed(0)}%)`)
  return { text, confidence }
}

async function elevenLabsTranscribe(wav: Blob): Promise<SttResult> {
  const cleanType = wav.type.split(';')[0] || 'audio/wav'
  const ext       = cleanType.includes('mp4') ? 'mp4' : cleanType.includes('ogg') ? 'ogg' : 'wav'
  const fd = new FormData()
  fd.append('file', new File([wav], `voice.${ext}`, { type: cleanType }))
  fd.append('model_id', 'scribe_v1')
  fd.append('tag_audio_events', 'false')
  fd.append('diarize', 'false')

  const res = await fetch('/api/stt/elevenlabs', { method: 'POST', body: fd })
  if (res.status === 429) throw new Error('RATE_LIMIT')
  if (res.status === 503) throw new Error('ELEVENLABS_NOT_CONFIGURED')
  if (!res.ok) {
    const b = await res.json().catch(() => ({}))
    throw new Error(`ElevenLabs ${res.status}: ${b?.error ?? ''}`)
  }

  const data = await res.json()
  const text = (data?.text ?? data?.transcript ?? '').trim()
  if (!text) throw new Error('ElevenLabs: empty transcript')

  const chars: Array<{ logprob?: number }> = data?.characters ?? []
  let confidence = 0.78
  if (chars.length > 0) {
    const avg = chars.reduce((s, c) => s + (c.logprob ?? -0.25), 0) / chars.length
    confidence = Math.min(1, Math.max(0, 1 - Math.abs(avg)))
  }

  console.log(`✅ ElevenLabs: "${text}" (${(confidence*100).toFixed(0)}%)`)
  return { text, confidence }
}

export default function useVoiceRecorder({
  language        = 'en',
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

  const langRef = useRef(language)
  useEffect(() => { langRef.current = language })

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef        = useRef<Blob[]>([])
  const streamRef        = useRef<MediaStream | null>(null)
  const recognitionRef   = useRef<any>(null)
  const finalTextRef     = useRef('')
  const keepaliveRef     = useRef<number | null>(null)
  const maxDurRef        = useRef<number | null>(null)
  const audioCtxRef      = useRef<AudioContext | null>(null)
  const isHoldingRef     = useRef(false)
  const holdStartRef     = useRef(0)
  const lastRequestRef   = useRef(0)

  const startBrowserSTT = useCallback((langCode: string) => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return
    finalTextRef.current = ''
    const startInstance = () => {
      if (!isHoldingRef.current) return
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
        r.onend = () => { if (isHoldingRef.current) window.setTimeout(startInstance, 150) }
        r.start(); recognitionRef.current = r
      } catch { /* ignore */ }
    }
    startInstance()
  }, [])

  const stopBrowserSTT = useCallback(() => {
    isHoldingRef.current = false
    try { recognitionRef.current?.abort() } catch {}
    recognitionRef.current = null
  }, [])

  const runProviders = useCallback(async (wav: Blob, rawBlob: Blob): Promise<SttResult> => {
    const errors: string[] = []
    const audioToSend   = wav.size > 5000 ? wav : rawBlob
    const fallbackAudio = rawBlob
    const sarvamLang    = LANG_BCP[langRef.current]

    try {
      setProcessingStep('Listening...')
      const r = await withTimeout(sarvamTranscribe(audioToSend, sarvamLang), 9000, 'Sarvam')
      setProviderUsed('Sarvam'); return r
    } catch (e: any) {
      if (audioToSend !== fallbackAudio && e.message !== 'RATE_LIMIT') {
        try {
          const r = await withTimeout(sarvamTranscribe(fallbackAudio, sarvamLang), 8000, 'Sarvam-raw')
          setProviderUsed('Sarvam'); return r
        } catch {}
      }
      if (e.message === 'RATE_LIMIT') cbRef.current.onRateLimit?.()
      errors.push(`Sarvam: ${e.message}`)
      console.warn('⚠️ Sarvam:', e.message)
    }

    try {
      setProcessingStep('Chirp AI...')
      const r = await withTimeout(chirpTranscribe(fallbackAudio, LANG_BCP[langRef.current]), 10000, 'Chirp')
      setProviderUsed('Google Chirp'); return r
    } catch (e: any) {
      if (e.message === 'RATE_LIMIT') cbRef.current.onRateLimit?.()
      if (e.message !== 'CHIRP_NOT_CONFIGURED') {
        errors.push(`Chirp: ${e.message}`)
        console.warn('⚠️ Chirp:', e.message)
      }
    }

    try {
      setProcessingStep('Processing...')
      const r = await withTimeout(elevenLabsTranscribe(audioToSend), 9000, 'ElevenLabs')
      setProviderUsed('ElevenLabs'); return r
    } catch (e: any) {
      if (e.message === 'RATE_LIMIT') cbRef.current.onRateLimit?.()
      if (e.message !== 'ELEVENLABS_NOT_CONFIGURED') {
        errors.push(`ElevenLabs: ${e.message}`)
        console.warn('⚠️ ElevenLabs:', e.message)
      }
    }

    const browserText = finalTextRef.current.trim()
    if (browserText) {
      setProviderUsed('Browser')
      return { text: browserText, confidence: 0.50 }
    }

    throw new Error(`All providers failed: ${errors.join(' | ')}`)
  }, [])

  const processAudio = useCallback(async (chunks: Blob[], mimeType: string) => {
    if (!chunks.length) {
      setStatus('idle'); setLiveText(''); setProcessingStep('')
      cbRef.current.onError?.('No audio captured. Hold and speak.')
      return
    }

    const rawBlob = new Blob(chunks, { type: mimeType || 'audio/webm' })
    if (rawBlob.size < 500) {
      setStatus('idle'); setLiveText(''); setProcessingStep('')
      cbRef.current.onError?.('Too short. Hold and speak clearly.')
      return
    }

    setStatus('processing')
    setProcessingStep('Filtering noise...')
    const wav = await toCleanWav(rawBlob)

    try {
      const result     = await runProviders(wav, rawBlob)
      const confidence = scoreToLevel(result.confidence)
      setSttConfidence(confidence)
      setStatus('idle'); setLiveText(''); setProcessingStep('')
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

      try {
        const AudioCtxCls = window.AudioContext || (window as any).webkitAudioContext
        const ctx = new AudioCtxCls()
        const src = ctx.createMediaStreamSource(stream)
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 256
        src.connect(analyser)
        audioCtxRef.current = ctx
      } catch {
        console.warn('Web Audio keepalive failed')
      }

      const mimeType = [
        'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'
      ].find(m => MediaRecorder.isTypeSupported(m)) ?? ''

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)

      recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data) }

      recorder.onstop = async () => {
        clearInterval(keepaliveRef.current ?? 0)
        if (maxDurRef.current !== null) { clearTimeout(maxDurRef.current); maxDurRef.current = null }
        audioCtxRef.current?.close().catch(() => {}); audioCtxRef.current = null
        stream.getTracks().forEach(t => t.stop())
        streamRef.current = null; lastRequestRef.current = Date.now()

        const holdMs = Date.now() - holdStartRef.current
        if (holdMs < minHoldMs) { setStatus('idle'); setLiveText(''); setProcessingStep(''); return }
        await processAudio(chunksRef.current, mimeType)
      }

      recorder.start()
      keepaliveRef.current = window.setInterval(() => {
        if (recorder.state === 'recording') recorder.requestData()
      }, 200)

      maxDurRef.current = window.setTimeout(() => {
        if (isHoldingRef.current && recorder.state === 'recording') {
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
    sttConfidence,
    isRecording:  status === 'recording',
    isProcessing: status === 'processing',
    startRecording, stopRecording,
  }
}