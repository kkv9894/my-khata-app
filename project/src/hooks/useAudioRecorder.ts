// FILE: src/hooks/useAudioRecorder.ts

import { useCallback, useEffect, useRef, useState } from 'react'

export type Lang = 'en' | 'hi' | 'ta' | 'te' | 'kn' | 'ml'
export type RecorderStatus = 'idle' | 'recording' | 'processing'
export type SttConfidence = 'high' | 'medium' | 'low'

export interface UseAudioRecorderOptions {
  language?: Lang
  onTranscript: (text: string, confidence: SttConfidence) => void
  onError?: (msg: string) => void
  onRateLimit?: () => void
  cooldownMs?: number
}

const pickMimeType = (): string => {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') return 'audio/webm'
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/mpeg',
  ]
  for (const type of candidates) {
    if ((MediaRecorder as any).isTypeSupported?.(type)) return type
  }
  return 'audio/webm'
}

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('Failed to read audio blob'))
        return
      }
      const base64 = result.split(',')[1] ?? ''
      resolve(base64)
    }
    reader.onerror = () => reject(new Error('Failed to convert audio to base64'))
    reader.readAsDataURL(blob)
  })

const normalizeTranscript = (text: string): string =>
  String(text || '').replace(/\s+/g, ' ').trim()

export default function useAudioRecorder({
  language = 'en',
  onTranscript,
  onError,
  onRateLimit,
  cooldownMs = 1000,
}: UseAudioRecorderOptions) {
  const [isRecording, setIsRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [liveText, setLiveText] = useState('')
  const [processingStep, setProcessingStep] = useState('')
  const [providerUsed, setProviderUsed] = useState('')

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const isActiveRef = useRef(false)
  const lastStopRef = useRef(0)
  const startedAtRef = useRef<number>(0)
  const cbRef = useRef({ onTranscript, onError, onRateLimit })
  const langRef = useRef(language)

  useEffect(() => {
    cbRef.current = { onTranscript, onError, onRateLimit }
  }, [onTranscript, onError, onRateLimit])

  useEffect(() => {
    langRef.current = language
  }, [language])

  const cleanupStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        try {
          track.stop()
        } catch {
          // ignore
        }
      })
      streamRef.current = null
    }
  }, [])

  const resetUi = useCallback(() => {
    setIsRecording(false)
    setIsProcessing(false)
    setProcessingStep('')
    setLiveText('')
  }, [])

  const transcribeBlob = useCallback(async (blob: Blob) => {
    try {
      setIsProcessing(true)
      setProcessingStep('Uploading audio...')
      setProviderUsed('Gemini Audio STT')

      const base64Audio = await blobToBase64(blob)

      setProcessingStep('Transcribing...')
      const response = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'transcribe-audio',
          payload: {
            base64Audio,
            mimeType: blob.type || pickMimeType(),
            language: langRef.current,
          },
        }),
      })

      if (response.status === 429) {
        cbRef.current.onRateLimit?.()
        throw new Error('AI rate limit reached. Please wait a moment and try again.')
      }

      const data = await response.json().catch(() => ({} as any))

      if (!response.ok) {
        throw new Error(data?.error || `Transcription failed (${response.status})`)
      }

      const text = normalizeTranscript(data?.text || '')
      resetUi()

      if (!text) {
        cbRef.current.onError?.('Could not hear clearly. Tap the mic and speak again.')
        return
      }

      const words = text.split(/\s+/).filter(Boolean).length
      const confidence: SttConfidence =
        words >= 5 ? 'high' : words >= 2 ? 'medium' : 'low'

      navigator.vibrate?.(confidence === 'high' ? 40 : [60, 40, 60])
      cbRef.current.onTranscript(text, confidence)
    } catch (err: any) {
      console.error('[AudioRecorder] transcribe error:', err)
      resetUi()
      cbRef.current.onError?.(err?.message || 'Audio transcription failed')
    }
  }, [resetUi])

  const startRecording = useCallback(async () => {
    if (isActiveRef.current) {
      const now = Date.now()
      if (now - lastStopRef.current < cooldownMs) return
      lastStopRef.current = now
      isActiveRef.current = false
      setIsRecording(false)
      setIsProcessing(true)
      setProcessingStep('Finishing recording...')

      try {
        mediaRecorderRef.current?.stop()
      } catch (err) {
        console.error('[AudioRecorder] stop error:', err)
        resetUi()
        cbRef.current.onError?.('Could not stop recording properly. Please try again.')
      }
      return
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      cbRef.current.onError?.('Audio recording is not supported on this device/browser.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })

      const mimeType = pickMimeType()
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)

      streamRef.current = stream
      mediaRecorderRef.current = recorder
      chunksRef.current = []
      startedAtRef.current = Date.now()

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      recorder.onerror = (event: any) => {
        console.error('[AudioRecorder] recorder error:', event)
        isActiveRef.current = false
        cleanupStream()
        resetUi()
        cbRef.current.onError?.('Recording failed. Please try again.')
      }

      recorder.onstop = async () => {
        const durationMs = Date.now() - startedAtRef.current
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || 'audio/webm' })
        chunksRef.current = []
        cleanupStream()

        if (durationMs < 500 || blob.size < 1024) {
          resetUi()
          cbRef.current.onError?.('Recording was too short. Please speak a little longer.')
          return
        }

        await transcribeBlob(blob)
      }

      recorder.start()
      isActiveRef.current = true
      setIsRecording(true)
      setIsProcessing(false)
      setProcessingStep('Listening... tap mic again to save')
      setProviderUsed('MediaRecorder')
      setLiveText('Listening...')
    } catch (err: any) {
      console.error('[AudioRecorder] start error:', err)
      cleanupStream()
      resetUi()

      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        cbRef.current.onError?.('Microphone blocked. Please allow mic access in your browser settings.')
        return
      }

      cbRef.current.onError?.('Could not start audio recording. Please try again.')
    }
  }, [cleanupStream, cooldownMs, resetUi, transcribeBlob])

  const stopRecording = useCallback(() => {
    if (!isActiveRef.current) return
    isActiveRef.current = false
    lastStopRef.current = Date.now()
    setIsRecording(false)
    setIsProcessing(true)
    setProcessingStep('Finishing recording...')

    try {
      mediaRecorderRef.current?.stop()
    } catch (err) {
      console.error('[AudioRecorder] stopRecording error:', err)
      cleanupStream()
      resetUi()
      cbRef.current.onError?.('Could not stop recording properly. Please try again.')
    }
  }, [cleanupStream, resetUi])

  useEffect(() => {
    return () => {
      isActiveRef.current = false
      try {
        mediaRecorderRef.current?.stop()
      } catch {
        // ignore
      }
      cleanupStream()
    }
  }, [cleanupStream])

  const status: RecorderStatus =
    isRecording ? 'recording' :
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
    startRecording,
    stopRecording,
  }
}