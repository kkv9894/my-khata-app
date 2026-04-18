export type SupportedLanguage = 'en' | 'hi' | 'ta' | 'te' | 'kn' | 'ml'

const BRAND_NAMES: Record<SupportedLanguage, string> = {
  en: 'ZivaKhata',
  hi: 'ZivaKhata',
  ta: 'Ziva Kanakku',
  te: 'Ziva Lekka',
  kn: 'Ziva Lekka',
  ml: 'Ziva Kanakku',
}

const TAGLINES: Record<SupportedLanguage, string> = {
  en: 'Powered by Ziva AI',
  hi: 'Ziva AI द्वारा संचालित',
  ta: 'Ziva AI மூலம்',
  te: 'Ziva AI ద్వారా',
  kn: 'Ziva AI ಮೂಲಕ',
  ml: 'Ziva AI വഴി',
}

const WELCOME_TTS: Record<SupportedLanguage, string> = {
  en: 'Welcome to ZivaKhata. I am Ziva, your smart ledger assistant.',
  hi: 'ZivaKhata में आपका स्वागत है. मैं Ziva हूं, आपकी smart ledger assistant.',
  ta: 'Ziva Kanakkuக்கு வரவேற்கிறோம். நான் Ziva, உங்கள் smart ledger assistant.',
  te: 'Ziva Lekkaకి స్వాగతం. నేను Ziva, మీ smart ledger assistant.',
  kn: 'Ziva Lekkaಗೆ ಸ್ವಾಗತ. ನಾನು Ziva, ನಿಮ್ಮ smart ledger assistant.',
  ml: 'Ziva Kanakkuയിലേക്ക് സ്വാഗതം. ഞാൻ Ziva, നിങ്ങളുടെ smart ledger assistant.',
}

export function getBrandName(language: SupportedLanguage = 'en'): string {
  return BRAND_NAMES[language] ?? BRAND_NAMES.en
}

export function getTagline(language: SupportedLanguage = 'en'): string {
  return TAGLINES[language] ?? TAGLINES.en
}

export function getWelcomeTTS(language: SupportedLanguage = 'en'): string {
  return WELCOME_TTS[language] ?? WELCOME_TTS.en
}

export function speakWelcome(language: SupportedLanguage = 'en'): void {
  if (!window.speechSynthesis) return
  window.speechSynthesis.cancel()
  const text = getWelcomeTTS(language)
  const sayIt = () => {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = language === 'en' ? 'en-IN' : 'en-IN'
    utterance.rate = 0.88
    utterance.pitch = 1
    utterance.volume = 1
    const voices = window.speechSynthesis.getVoices()
    const best = voices.find(voice => voice.lang === 'en-IN') || voices.find(voice => voice.lang.startsWith('en-')) || null
    if (best) utterance.voice = best
    window.speechSynthesis.speak(utterance)
  }
  if (window.speechSynthesis.getVoices().length > 0) sayIt()
  else {
    window.speechSynthesis.onvoiceschanged = () => {
      sayIt()
      window.speechSynthesis.onvoiceschanged = null
    }
  }
}
