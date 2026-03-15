// src/hooks/useWhisperSTT.ts
// GEMINI MULTIMODAL AUDIO PIPELINE
// Replaces @xenova/transformers entirely.
// Records audio via MediaRecorder -> FileReader Base64 -> /api/gemini -> Gemini 1.5 Flash
//
// FIXES:
//   FIX 1: Blob size check before sending (avoids empty audio errors)
//   FIX 2: FileReader strips Data URL prefix correctly
//   FIX 3: Dynamic mimeType detected and sent to backend
//   FIX 4: Full console.error logging so real errors are visible in DevTools

import { useState, useCallback, useEffect, useRef } from 'react'

export type WhisperLang   = 'en' | 'hi' | 'ta' | 'te' | 'kn' | 'ml'
export type WhisperStatus = 'idle' | 'loading-model' | 'recording' | 'transcribing' | 'error'

const LANG_BCP: Record<WhisperLang, string> = {
  en: 'en-IN', hi: 'hi-IN', ta: 'ta-IN', te: 'te-IN', kn: 'kn-IN', ml: 'ml-IN',
}

export interface UseWhisperSTTOptions {
  language?:    WhisperLang
  minHoldMs?:   number
  cooldownMs?:  number
  onTranscript: (text: string, confidence: 'high' | 'medium' | 'low') => void
  onError?:     (msg: string) => void
  onProgress?:  (msg: string) => void
}

export interface UseWhisperSTTReturn {
  status:         WhisperStatus
  liveText:       string
  processingStep: string
  providerUsed:   string
  isRecording:    boolean
  isProcessing:   boolean
  isModelLoading: boolean
  startRecording: () => void
  stopRecording:  () => void
}

export function useWhisperSTT({
  language   = 'en',
  minHoldMs  = 300,
  cooldownMs = 1500,
  onTranscript,
  onError,
}: UseWhisperSTTOptions): UseWhisperSTTReturn {

  const [status,         setStatus]         = useState<WhisperStatus>('idle')
  const [liveText,       setLiveText]       = useState('')
  const [processingStep, setProcessingStep] = useState('')
  const [providerUsed,   setProviderUsed]   = useState('')

  const cbRef = useRef({ onTranscript, onError })
  useEffect(() => { cbRef.current = { onTranscript, onError } })

  const langRef = useRef(language)
  useEffect(() => { langRef.current = language })

  const recorderRef    = useRef<MediaRecorder | null>(null)
  const chunksRef      = useRef<Blob[]>([])
  const streamRef      = useRef<MediaStream | null>(null)
  const recognitionRef = useRef<any>(null)
  const interimRef     = useRef('')
  const finalTextRef   = useRef('')
  const rAFRef         = useRef<number | null>(null)
  const isHoldingRef   = useRef(false)
  const holdStartRef   = useRef(0)
  const lastRequestRef = useRef(0)
  const processedRef   = useRef(false)

  // Web Speech live display only
  const startLiveDisplay = useCallback((langCode: string) => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return
    try {
      const r = new SR()
      r.lang            = langCode
      r.continuous      = true
      r.interimResults  = true
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
      r.onerror = () => {}
      r.onend   = () => {
        if (isHoldingRef.current) window.setTimeout(() => startLiveDisplay(langCode), 150)
      }
      r.start()
      recognitionRef.current = r
    } catch { /* Web Speech not available — Gemini STT still works */ }
  }, [])

  const stopLiveDisplay = useCallback(() => {
    if (rAFRef.current !== null) { cancelAnimationFrame(rAFRef.current); rAFRef.current = null }
    interimRef.current = ''
    try { recognitionRef.current?.abort() } catch {}
    recognitionRef.current = null
  }, [])

  // FIX 2: FileReader Base64 conversion — strips "data:audio/webm;base64," prefix
  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => {
        const result = reader.result as string
        if (!result) { reject(new Error('FileReader returned empty result')); return }
        // result = "data:audio/webm;base64,XXXXXXX"
        // Split on comma and take everything after it
        const base64Data = result.split(',')[1]
        if (!base64Data) { reject(new Error('Could not extract Base64 data')); return }
        resolve(base64Data)
      }
      reader.onerror = () => reject(new Error('FileReader error'))
      reader.readAsDataURL(blob)
    })
  }

  const transcribeWithGemini = useCallback(async (chunks: Blob[], mimeType: string) => {
    if (processedRef.current) return
    processedRef.current = true

    stopLiveDisplay()
    isHoldingRef.current = false

    const holdMs = Date.now() - holdStartRef.current
    if (holdMs < minHoldMs || !chunks.length) {
      setStatus('idle'); setLiveText(''); setProcessingStep('')
      return
    }

    setStatus('transcribing')
    setProcessingStep('Processing audio…')

    // FIX 3: Use dynamically detected mimeType
    const effectiveMime = mimeType || 'audio/webm'
    const rawBlob = new Blob(chunks, { type: effectiveMime })

    console.log(`[GeminiSTT] Blob: ${rawBlob.size} bytes | mime: ${effectiveMime}`)

    // FIX 1: Explicit size check before sending
    if (rawBlob.size === 0) {
      console.error('[GeminiSTT] Empty blob — nothing was recorded')
      cbRef.current.onError?.('No audio captured. Please try again.')
      setStatus('idle'); setLiveText(''); setProcessingStep('')
      return
    }

    if (rawBlob.size < 500) {
      console.error(`[GeminiSTT] Blob too small: ${rawBlob.size} bytes`)
      cbRef.current.onError?.('Too short. Hold the button and speak clearly.')
      setStatus('idle'); setLiveText(''); setProcessingStep('')
      return
    }

    // FIX 2: FileReader conversion
    let base64Audio: string
    try {
      base64Audio = await blobToBase64(rawBlob)
      console.log(`[GeminiSTT] Base64 length: ${base64Audio.length} chars`)
    } catch (err) {
      console.error('[GeminiSTT] Base64 conversion failed:', err)
      cbRef.current.onError?.('Could not process audio. Try again.')
      setStatus('idle'); setLiveText(''); setProcessingStep('')
      return
    }

    try {
      const controller = new AbortController()
      const timer      = setTimeout(() => controller.abort(), 30000)

      let response: Response
      try {
        response = await fetch('/api/gemini', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          signal:  controller.signal,
          body:    JSON.stringify({
            action:  'transcribe-audio',
            payload: {
              base64Audio,
              mimeType: effectiveMime,  // FIX 3: dynamic mime to backend
              language: langRef.current,
            },
          }),
        })
      } finally {
        clearTimeout(timer)
      }

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        const errMsg  = errData?.error ?? `Server error ${response.status}`
        console.error('[GeminiSTT] Backend returned error:', errMsg)
        throw new Error(errMsg)
      }

      const data = await response.json()
      const text = (data?.text ?? '').trim()

      console.log(`[GeminiSTT] Transcript: "${text}"`)

      if (!text) {
        console.warn('[GeminiSTT] Gemini returned empty transcript')
        cbRef.current.onError?.('Could not hear clearly. Please speak louder and try again.')
        cbRef.current.onTranscript('', 'low')
        setStatus('idle'); setLiveText(''); setProcessingStep('')
        return
      }

      const wordCount = text.split(/\s+/).filter(Boolean).length
      const conf      = wordCount >= 3 ? 'high' : wordCount >= 1 ? 'medium' : 'low'

      setProviderUsed('Gemini 1.5 Flash')
      lastRequestRef.current = Date.now()
      navigator.vibrate?.(conf === 'high' ? 40 : [60, 40, 60])

      setStatus('idle'); setLiveText(''); setProcessingStep('')
      cbRef.current.onTranscript(text, conf)

    } catch (err: any) {
      // FIX 4: Full error logging visible in Android Chrome DevTools
      console.error('[GeminiSTT] Gemini API Error:', err)
      const isTimeout = err?.name === 'AbortError' || err?.message?.includes('timed out')
      cbRef.current.onError?.(
        isTimeout
          ? 'Voice processing timed out. Try a shorter phrase.'
          : `Voice error: ${err?.message ?? 'Unknown. Please try again.'}`
      )
      cbRef.current.onTranscript('', 'low')
      setStatus('idle'); setLiveText(''); setProcessingStep('')
    }
  }, [minHoldMs, stopLiveDisplay])

  const startRecording = useCallback(() => {
    if (isHoldingRef.current) return
    const now = Date.now()
    if (now - lastRequestRef.current < cooldownMs) return

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
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl:  true,
        channelCount:     1,
      },
    }).then(stream => {
      streamRef.current = stream

      // FIX 3: Detect correct mimeType for this device
      // Android Chrome = audio/webm;codecs=opus
      // iOS Safari     = audio/mp4
      const mimeType = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
      ].find(m => MediaRecorder.isTypeSupported(m)) ?? ''

      console.log(`[GeminiSTT] Recorder mimeType: "${mimeType || 'browser default'}"`)

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)

      recorder.ondataavailable = (e) => {
        if (e.data?.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        streamRef.current = null
        void transcribeWithGemini(chunksRef.current, mimeType)
      }

      recorder.start(200)
      recorderRef.current = recorder

      startLiveDisplay(LANG_BCP[langRef.current] ?? 'en-IN')

    }).catch(err => {
      console.error('[GeminiSTT] getUserMedia failed:', err)
      isHoldingRef.current = false
      setStatus('idle')
      cbRef.current.onError?.(
        err.name === 'NotAllowedError'
          ? 'Microphone blocked. Go to browser Settings → Site Settings → Microphone → Allow.'
          : 'Could not access microphone. Check permissions and try again.'
      )
    })
  }, [cooldownMs, startLiveDisplay, transcribeWithGemini])

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
    isProcessing:   status === 'transcribing',
    isModelLoading: false,
    startRecording,
    stopRecording,
  }
}