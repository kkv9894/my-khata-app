// src/hooks/useWhisperSTT.ts
//
// WHISPER REMOVED — stub file only.
// Voice pipeline is now Web Speech API in useVoiceRecorder.ts.
// Safe to run: npm uninstall @xenova/transformers

export type WhisperLang   = 'en' | 'hi' | 'ta' | 'te' | 'kn' | 'ml'
export type WhisperStatus = 'idle' | 'loading-model' | 'recording' | 'transcribing' | 'error'

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

export function useWhisperSTT(_options: UseWhisperSTTOptions): UseWhisperSTTReturn {
  return {
    status: 'idle', liveText: '', processingStep: '',
    providerUsed: '', isRecording: false, isProcessing: false,
    isModelLoading: false, startRecording: () => {}, stopRecording: () => {},
  }
}