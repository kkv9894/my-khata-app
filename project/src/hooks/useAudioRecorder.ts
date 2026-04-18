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

type ReplacementRule = readonly [RegExp, string]

const COMMON_REPLACEMENTS: readonly ReplacementRule[] = [
  [/\bgee?\s*pay\b/gi, 'gpay'],
  [/\bg\s*pay\b/gi, 'gpay'],
  [/\bphone\s*pay\b/gi, 'phonepe'],
  [/\bphone\s*pe\b/gi, 'phonepe'],
  [/\bpay\s*tm\b/gi, 'paytm'],
  [/\byou\s*pi\b/gi, 'upi'],
  [/\bu\s*pi\b/gi, 'upi'],
  [/\brupees?\b/gi, 'rupees'],
  [/\brs\.?\b/gi, 'rs'],
  [/[|]+/g, ' '],
  [/\s*,\s*,+/g, ', '],
]

const TAMIL_REPLACEMENTS: readonly ReplacementRule[] = [
  [/\b([A-Za-z]+)\s+cut\s+([A-Za-z]+)/gi, '$1 ku $2'],
  [/\bcut\b/gi, 'ku'],
  [/\bk\s*u\b/gi, 'ku'],
  [/\bkoo\b/gi, 'ku'],
  [/\bcu\b/gi, 'ku'],
  [/\bkuduturuk(?:en|ean|an)\b/gi, 'kudutten'],
  [/\bkoduturuk(?:en|ean|an)\b/gi, 'kodutten'],
  [/\bkuduthuruk(?:en|ean|an)\b/gi, 'kudutten'],
  [/\bkoduthuruk(?:en|ean|an)\b/gi, 'kodutten'],
  [/\bvangituruk(?:en|ean|an)\b/gi, 'vangitten'],
  [/\bvaangituruk(?:en|ean|an)\b/gi, 'vangitten'],
  [/\bvanduruchu\b/gi, 'vandhuchu'],
  [/\bkittuchu\b/gi, 'kittachu'],
  [/\bbaki\b/gi, 'baaki'],
]

const TELUGU_REPLACEMENTS: readonly ReplacementRule[] = [
  [/\bk\s*i\b/gi, 'ki'],
  [/\bkee\b/gi, 'ki'],
  [/\bichh?anu\b/gi, 'ichanu'],
  [/\bicchaanu\b/gi, 'ichanu'],
  [/\bkonnanuu\b/gi, 'konnanu'],
  [/\bkonnaanu\b/gi, 'konnanu'],
  [/\bvach+indi\b/gi, 'vacchindi'],
  [/\bbiyam\b/gi, 'biyyam'],
  [/\bpalu\b/gi, 'paalu'],
  [/\bbaki\b/gi, 'baaki'],
]

const KANNADA_REPLACEMENTS: readonly ReplacementRule[] = [
  [/\bg\s*e\b/gi, 'ge'],
  [/\bgee\b/gi, 'ge'],
  [/\bthagondu\b/gi, 'tagondu'],
  [/\btagundu\b/gi, 'tagondu'],
  [/\bkotthe\b/gi, 'kotte'],
  [/\bsikitu\b/gi, 'sikkitu'],
  [/\bsikkithu\b/gi, 'sikkitu'],
  [/\bbaki\b/gi, 'baaki'],
]

const MALAYALAM_REPLACEMENTS: readonly ReplacementRule[] = [
  [/\bn\s*u\b/gi, 'nu'],
  [/\bkuduthu\b/gi, 'koduthu'],
  [/\bkoduththu\b/gi, 'koduthu'],
  [/\bvangichu\b/gi, 'vaangichi'],
  [/\bvaangichu\b/gi, 'vaangichi'],
  [/\bkitty\b/gi, 'kitti'],
  [/\bbaki\b/gi, 'baaki'],
]

const HINDI_REPLACEMENTS: readonly ReplacementRule[] = [
  [/\bk\s*o\b/gi, 'ko'],
  [/\budhar\b/gi, 'udhaar'],
  [/\bbakaya\b/gi, 'baaki'],
  [/\bbakki\b/gi, 'baaki'],
  [/\bdiyaa\b/gi, 'diya'],
  [/\bliyaa\b/gi, 'liya'],
  [/\bpaisa\b/gi, 'paisa'],
]

const REPLACEMENTS_BY_LANG: Record<Lang, readonly ReplacementRule[]> = {
  en: [],
  hi: HINDI_REPLACEMENTS,
  ta: TAMIL_REPLACEMENTS,
  te: TELUGU_REPLACEMENTS,
  kn: KANNADA_REPLACEMENTS,
  ml: MALAYALAM_REPLACEMENTS,
}

const pickMimeType = (): string => {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') return 'audio/webm'

  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
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
      resolve(result.split(',')[1] ?? '')
    }

    reader.onerror = () => reject(new Error('Failed to convert audio to base64'))
    reader.readAsDataURL(blob)
  })

const applyReplacements = (text: string, rules: readonly ReplacementRule[]): string => {
  let cleaned = text
  for (const [pattern, replacement] of rules) {
    cleaned = cleaned.replace(pattern, replacement)
  }
  return cleaned
}

const collapseImmediateRepeatedPhrases = (text: string): string => {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length < 2) return text

  const output: string[] = []
  let i = 0

  while (i < words.length) {
    let matched = false
    const maxPhraseLen = Math.min(6, Math.floor((words.length - i) / 2))

    for (let phraseLen = maxPhraseLen; phraseLen >= 1; phraseLen--) {
      const first = words.slice(i, i + phraseLen).join(' ').toLowerCase()
      const second = words.slice(i + phraseLen, i + phraseLen * 2).join(' ').toLowerCase()

      if (first && first === second) {
        output.push(...words.slice(i, i + phraseLen))
        i += phraseLen * 2

        while (i + phraseLen <= words.length) {
          const next = words.slice(i, i + phraseLen).join(' ').toLowerCase()
          if (next === first) i += phraseLen
          else break
        }

        matched = true
        break
      }
    }

    if (!matched) {
      output.push(words[i])
      i += 1
    }
  }

  return output.join(' ')
}

const collapseRepeatedTail = (text: string): string => {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length < 4 || words.length % 2 !== 0) return text

  const half = words.length / 2
  const firstHalf = words.slice(0, half).join(' ')
  const secondHalf = words.slice(half).join(' ')

  return firstHalf.toLowerCase() === secondHalf.toLowerCase()
    ? firstHalf
    : text
}

const normalizeTranscript = (text: string, language: Lang): string => {
  let cleaned = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()

  cleaned = applyReplacements(cleaned, COMMON_REPLACEMENTS)
  cleaned = collapseImmediateRepeatedPhrases(cleaned)
  cleaned = collapseRepeatedTail(cleaned)
  cleaned = applyReplacements(cleaned, REPLACEMENTS_BY_LANG[language] ?? [])
  cleaned = cleaned.replace(/\s+/g, ' ').trim()

  return cleaned
}

const extractChirpTranscript = (data: unknown): string => {
  const results = (data as { results?: Array<{ alternatives?: Array<{ transcript?: string }> }> })?.results
  if (!Array.isArray(results)) return ''
  return results
    .flatMap(result => result.alternatives ?? [])
    .map(alternative => alternative.transcript ?? '')
    .join(' ')
    .trim()
}

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
  const langRef = useRef<Lang>(language)

  useEffect(() => {
    cbRef.current = { onTranscript, onError, onRateLimit }
  }, [onTranscript, onError, onRateLimit])

  useEffect(() => {
    langRef.current = language
  }, [language])

  const cleanupStream = useCallback(() => {
    if (!streamRef.current) return

    streamRef.current.getTracks().forEach(track => {
      try {
        track.stop()
      } catch {
        // ignore
      }
    })

    streamRef.current = null
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
      setProviderUsed('Gemini API Route')

      const base64Audio = await blobToBase64(blob)
      const mimeType = blob.type || pickMimeType()
      let rawText = ''

      try {
        if (langRef.current === 'en') {
          setProviderUsed('Google Chirp')
          setProcessingStep('Transcribing English...')
          const chirpResponse = await fetch('/api/stt/chirp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              base64: base64Audio,
              languageCodes: ['en-IN', 'en-US'],
            }),
          })

          if (chirpResponse.ok) {
            const chirpData = await chirpResponse.json().catch(() => ({}))
            rawText = extractChirpTranscript(chirpData)
          } else {
            const chirpError = await chirpResponse.json().catch(() => ({})) as { error?: string }
            if (chirpResponse.status === 429) {
              cbRef.current.onRateLimit?.()
              throw new Error('AI rate limit reached. Please wait a moment and try again.')
            }
            if (chirpError.error !== 'CHIRP_NOT_CONFIGURED') {
              console.warn('[AudioRecorder] Chirp fallback skipped:', chirpError.error || chirpResponse.status)
            }
          }
        }

        if (!rawText) {
          setProviderUsed('Gemini API Route')
          setProcessingStep('Transcribing...')
          const response = await fetch('/api/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'transcribe-audio',
              payload: {
                base64Audio,
                mimeType,
                language: langRef.current,
              },
            }),
          })

          if (response.status === 429) {
            cbRef.current.onRateLimit?.()
            throw new Error('AI rate limit reached. Please wait a moment and try again.')
          }

          const data = await response.json().catch(() => ({}) as { error?: string; text?: string })
          if (!response.ok) {
            throw new Error(data.error || `Transcription failed (${response.status})`)
          }

          rawText = data.text || ''
        }
      } catch (serverError) {
        const apiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined
        if (!apiKey) {
          throw serverError
        }

        console.warn('[AudioRecorder] /api/gemini failed, falling back to direct Gemini:', serverError)
        setProviderUsed('Gemini Direct')
        setProcessingStep('Transcribing locally...')

        const prompt = langRef.current === 'en'
          ? `Transcribe this audio exactly as spoken.

The speaker is primarily speaking English.
Do not transliterate English words into Hindi, Tamil, Telugu, Kannada, or Malayalam.
Do not guess Indian-language words when the audio is English.
Write numbers as digits.
Keep units exactly: kg, g, ml, l, packet, packets, piece, pieces.
Do not explain anything.
Do not translate anything.
If speech is unclear or silent, return empty string.

Return only the transcript text.`
          : `Transcribe this audio exactly as spoken.

Language may be ${langRef.current} mixed with English.
Keep code-mixed words exactly as spoken.
Write numbers as digits.
Keep units exactly: kg, g, ml, l, packet, packets, piece, pieces.
Do not explain anything.
Do not translate anything.
If speech is unclear or silent, return empty string.

Return only the transcript text.`

        const directResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: prompt },
                  {
                    inlineData: {
                      data: base64Audio,
                      mimeType,
                    },
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0,
              topP: 0.1,
              topK: 1,
            },
          }),
        })

        if (directResponse.status === 429) {
          cbRef.current.onRateLimit?.()
          throw new Error('AI rate limit reached. Please wait a moment and try again.')
        }

        const directData = await directResponse.json().catch(() => ({}) as {
          error?: { message?: string }
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
        })

        if (!directResponse.ok) {
          throw new Error(directData.error?.message || `Direct transcription failed (${directResponse.status})`)
        }

        rawText = (directData.candidates?.[0]?.content?.parts || [])
          .map((part: { text?: string }) => part.text || '')
          .join(' ')
          .trim()
      }

      const text = normalizeTranscript(rawText, langRef.current)
      resetUi()

      if (!text) {
        cbRef.current.onError?.('Could not hear clearly. Tap the mic and speak again.')
        return
      }

      const wordCount = text.split(/\s+/).filter(Boolean).length
      const confidence: SttConfidence =
        wordCount >= 5 ? 'high' : wordCount >= 2 ? 'medium' : 'low'

      navigator.vibrate?.(confidence === 'high' ? 40 : [60, 40, 60])
      cbRef.current.onTranscript(text, confidence)
    } catch (err) {
      console.error('[AudioRecorder] transcribe error:', err)
      resetUi()
      cbRef.current.onError?.(err instanceof Error ? err.message : 'Audio transcription failed')
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
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || mimeType || 'audio/webm',
        })

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
    isRecording ? 'recording'
    : isProcessing ? 'processing'
    : 'idle'

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

