// src/hooks/useWhisperSTT.ts
// GEMINI MULTIMODAL AUDIO PIPELINE
// Replaces @xenova/transformers — records audio, sends Base64 to /api/gemini

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
    } catch { /* no Web Speech — fine */ }
  }, [])

  const stopLiveDisplay = useCallback(() => {
    if (rAFRef.current !== null) { cancelAnimationFrame(rAFRef.current); rAFRef.current = null }
    interimRef.current = ''
    try { recognitionRef.current?.abort() } catch {}
    recognitionRef.current = null
  }, [])

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

    const rawBlob = new Blob(chunks, { type: mimeType || 'audio/webm' })

    if (rawBlob.size < 500) {
      cbRef.current.onError?.('Too short. Hold the button and speak clearly.')
      setStatus('idle'); setLiveText(''); setProcessingStep('')
      return
    }

    let base64Audio: string
    try {
      const arrayBuffer = await rawBlob.arrayBuffer()
      const uint8       = new Uint8Array(arrayBuffer)
      let binary        = ''
      uint8.forEach(b => { binary += String.fromCharCode(b) })
      base64Audio = btoa(binary)
    } catch (err) {
      console.error('[GeminiSTT] Base64 encode failed:', err)
      cbRef.current.onError?.('Could not process audio. Try again.')
      setStatus('idle'); setLiveText(''); setProcessingStep('')
      return
    }

    console.log(`[GeminiSTT] Sending ${(rawBlob.size / 1024).toFixed(1)}KB | mime: ${mimeType}`)

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
              mimeType: mimeType || 'audio/webm',
              language: langRef.current,
            },
          }),
        })
      } finally {
        clearTimeout(timer)
      }

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData?.error ?? `Server error ${response.status}`)
      }

      const data = await response.json()
      const text = (data?.text ?? '').trim()

      console.log(`[GeminiSTT] Result: "${text}"`)

      if (!text) {
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
      console.error('[GeminiSTT] Failed:', err)
      const isTimeout = err?.name === 'AbortError' || err?.message?.includes('timed out')
      cbRef.current.onError?.(
        isTimeout
          ? 'Voice processing timed out. Try a shorter phrase.'
          : 'Could not process voice. Please try again.'
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

      const mimeType = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
      ].find(m => MediaRecorder.isTypeSupported(m)) ?? ''

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