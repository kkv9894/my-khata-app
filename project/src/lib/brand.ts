// src/lib/brand.ts
// Single source of truth for ZivaKhata branding.
// Import getBrandName() wherever the app name appears — never hardcode "My Khata" again.

export type SupportedLanguage = 'en' | 'hi' | 'ta' | 'te' | 'kn' | 'ml'

// ── App name per language ─────────────────────────────────────────────────────
// "Kanakku" = accounts/ledger in Tamil & Malayalam
// "Lekka"   = accounts/ledger in Telugu & Kannada
const BRAND_NAMES: Record<SupportedLanguage, string> = {
  en: 'ZivaKhata',
  hi: 'ZivaKhata',
  ta: 'Ziva Kanakku',   // கணக்கு = accounts
  te: 'Ziva Lekka',     // లెక్క  = accounts
  kn: 'Ziva Lekka',     // ಲೆಕ್ಕ  = accounts
  ml: 'Ziva Kanakku',   // കണക്ക് = accounts
}

// ── Tagline per language ──────────────────────────────────────────────────────
const TAGLINES: Record<SupportedLanguage, string> = {
  en: 'Powered by Ziva AI',
  hi: 'Ziva AI द्वारा संचालित',
  ta: 'Ziva AI மூலம்',
  te: 'Ziva AI ద్వారా',
  kn: 'Ziva AI ಮೂಲಕ',
  ml: 'Ziva AI വഴി',
}

// ── Welcome greeting per language (for TTS on login) ─────────────────────────
const WELCOME_TTS: Record<SupportedLanguage, string> = {
  en: 'Welcome to ZivaKhata. I am Ziva, your smart ledger assistant.',
  hi: 'ZivaKhata mein aapka swagat hai. Main Ziva hoon, aapki smart ledger assistant.',
  ta: 'Ziva Kanakku-il ungalai varaverkirom. Naan Ziva, ungal smart kanakku assistant.',
  te: 'Ziva Lekka-ki swagatam. Nenu Ziva, meeru smart ledger assistant.',
  kn: 'Ziva Lekka-ge swagatha. Naanu Ziva, nimma smart ledger assistant.',
  ml: 'Ziva Kanakku-ilekku swagatam. Ente peru Ziva, ningalude smart ledger assistant.',
}

// ── Exported helpers ──────────────────────────────────────────────────────────

/** Returns the localised app name, e.g. "Ziva Kanakku" for Tamil */
export function getBrandName(language: SupportedLanguage = 'en'): string {
  return BRAND_NAMES[language] ?? BRAND_NAMES.en
}

/** Returns the localised tagline, e.g. "Ziva AI மூலம்" for Tamil */
export function getTagline(language: SupportedLanguage = 'en'): string {
  return TAGLINES[language] ?? TAGLINES.en
}

/** Returns a TTS-safe welcome string in the user's language */
export function getWelcomeTTS(language: SupportedLanguage = 'en'): string {
  return WELCOME_TTS[language] ?? WELCOME_TTS.en
}

/** Speaks the welcome greeting aloud using Web Speech API */
export function speakWelcome(language: SupportedLanguage = 'en'): void {
  if (!window.speechSynthesis) return
  window.speechSynthesis.cancel()
  const text = getWelcomeTTS(language)
  const sayIt = () => {
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'en-IN'; u.rate = 0.88; u.pitch = 1.0; u.volume = 1.0
    const voices = window.speechSynthesis.getVoices()
    const best = voices.find(v => v.lang === 'en-IN')
              || voices.find(v => v.lang.startsWith('en-'))
              || null
    if (best) u.voice = best
    window.speechSynthesis.speak(u)
  }
  if (window.speechSynthesis.getVoices().length > 0) sayIt()
  else { window.speechSynthesis.onvoiceschanged = () => { sayIt(); window.speechSynthesis.onvoiceschanged = null } }
}