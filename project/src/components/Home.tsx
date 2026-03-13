import { useCallback, useEffect, useRef, useState } from 'react'
import { Activity, AlertTriangle, Brain, CheckCircle, FileBarChart, LayoutDashboard, Loader2, MessageSquare, Mic, Package, ScanLine, Settings2, ShieldCheck, TrendingUp, Users, Zap } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useRole } from '../contexts/RoleContext'
import { supabase } from '../lib/supabase'
import { analyzeTransaction, detectVoiceIntent } from '../lib/gemini'
import useOfflineSync, { type TransactionPayload } from '../hooks/useOfflineSync'
import useVoiceRecorder, { type SttConfidence } from '../hooks/useVoiceRecorder'
import AiChat from './AiChat'
import BusinessInsights from './BusinessInsights'
import Customers from './Customers'
import Dashboard from './Dashboard'
import ReceiptScanner from './ReceiptScanner'
import Reports from './Reports'
import StaffManager from './StaffManager'
import TransactionForm from './TransactionForm'
import TransactionList from './TransactionList'
import Settings from './Settings'

type SupportedLanguage = 'en' | 'hi' | 'ta' | 'te' | 'kn' | 'ml'
type TransactionType   = 'income' | 'expense'
type Tab = 'home' | 'transactions' | 'dashboard' | 'reports' | 'chat' | 'customers' | 'insights' | 'staff' | 'settings'

interface TransactionDraft {
  amount: string
  description: string
  type: TransactionType
  voice_transcript: string
}

const T: Record<SupportedLanguage, Record<string, string>> = {
  en: { hold: 'Tap to speak to Ziva', ai: '✨ Ziva is thinking...', saved: 'Ziva saved it!', mic_error: 'Mic Access Denied', offline: 'Offline Save', too_fast: 'Please wait...', speak_hint: '🎙️ Ziva is listening...' },
  hi: { hold: 'Ziva से बात करें', ai: '✨ Ziva सोच रही है...', saved: 'Ziva ने save किया!', mic_error: 'माइक एक्सेस नहीं', offline: 'ऑफलाइन सेव', too_fast: 'थोड़ा इंतज़ार करें...', speak_hint: '🎙️ Ziva सुन रही है...' },
  ta: { hold: 'Ziva-கிட்ட பேசுங்க', ai: '✨ Ziva யோசிக்கிறா...', saved: 'Ziva save பண்ணாச்சு!', mic_error: 'மைக் அனுமதி இல்லை', offline: 'ஆஃப்லைன் சேமிப்பு', too_fast: 'சிறிது காத்திருக்கவும்...', speak_hint: '🎙️ Ziva கேக்கிறா...' },
  te: { hold: 'Ziva తో మాట్లాడండి', ai: '✨ Ziva ఆలోచిస్తోంది...', saved: 'Ziva save చేసింది!', mic_error: 'మైక్ అనుమతి లేదు', offline: 'ఆఫ్‌లైన్ సేవ్', too_fast: 'కొంచెం ఆగండి...', speak_hint: '🎙️ Ziva వింటోంది...' },
  kn: { hold: 'Ziva ಜೊತೆ ಮಾತಾಡಿ', ai: '✨ Ziva ಯೋಚಿಸುತ್ತಿದ್ದಾಳೆ...', saved: 'Ziva save ಮಾಡಿದಳು!', mic_error: 'ಮೈಕ್ ಅನುಮತಿ ಇಲ್ಲ', offline: 'ಆಫ್‌ಲೈನ್ ಉಳಿಕೆ', too_fast: 'ಸ್ವಲ್ಪ ಕಾಯಿರಿ...', speak_hint: '🎙️ Ziva ಕೇಳುತ್ತಿದ್ದಾಳೆ...' },
  ml: { hold: 'Ziva-യോട് സംസാരിക്കൂ', ai: '✨ Ziva ചിന്തിക്കുന്നു...', saved: 'Ziva save ചെയ്തു!', mic_error: 'മൈക്ക് അനുമതിയില്ല', offline: 'ഓഫ്‌ലൈൻ സേവ്', too_fast: 'കാത്തിരിക്കൂ...', speak_hint: '🎙️ Ziva കേൾക്കുന്നു...' },
}

// ── Income keywords ───────────────────────────────────────────────────────────
const INCOME_KW = [
  // English
  'gave me','given me','received','got','earned','salary','paid me','income',
  'profit','gain','credit','deposit','he gave','she gave','get from','from me',
  'collected','received from','got from','customer paid','payment received',
  'commission','bonus','refund','cashback','advance received','they paid',
  'udhaar received','credit received','baki received','dues collected',
  'payment came','money came','amount received','sales income','sold',
  'sold for','sold at','gpay received','phonepe received','upi received',
  // Hinglish
  'दिया','मिला','आया','प्राप्त','मिली','कमाया','जमा','आमदनी',
  'तनख्वाह','वेतन','मुनाफा','paisa mila','paise aaye','tankhwah','bonus mila',
  'sale hua','becha','grahak ne diya','udhaar wapas','bakaya mila','commission mila',
  // Tamil
  'கொடுத்தார்','வந்தது','கிடைத்தது','வசூல்','சம்பளம்','வருமானம்',
  'கொடுத்திருக்கார்','தந்தார்','வந்துச்சு','கிடைச்சது','லாபம்',
  'பணம் வந்தது','கஸ்டமர் கொடுத்தார்','ரிஃப்பண்ட்','உதவி','சேல்ஸ்',
  'விற்றேன்','விற்றோம்','விற்பனை','வட்டி வந்தது','கமிஷன்',
  // Tanglish
  'vandhuchu','vanduchu','vanthuchu','kitachu','kittachu',
  'sambalam vanduchu','payment vandhu','advance vandhu',
  'sale achu','viththaen','viththom','commission vandhu',
  'udhar tirumbi vandhu','baki vandhu','customer koduthaaru',
  // Telugu
  'మిచ్చారు','వచ్చింది','ఇచ్చారు','జీతం','ఆదాయం','ఇచ్చాడు',
  'జీతం వచ్చింది','బోనస్ వచ్చింది','డబ్బు వచ్చింది',
  'అమ్మాను','అమ్మారు','సేల్స్ వచ్చింది','కమీషన్ వచ్చింది',
  // Kannada
  'ಕೊಟ್ಟರು','ಬಂತು','ಸಿಕ್ಕಿತು','ಸಂಬಳ','ಆದಾಯ','ಕೊಟ್ಟಿದ್ದಾರೆ',
  'ಸಂಬಳ ಬಂತು','ಹಣ ಬಂತು','ಬೋನಸ್ ಬಂತು',
  'ಮಾರಿದೆ','ಮಾರಿದರು','ಕಮಿಷನ್ ಬಂತು',
  // Malayalam
  'തന്നു','കിട്ടി','ലഭിച്ചു','ശമ്പളം','വരുമാനം','തന്നിട്ടുണ്ട്','കിട്ടിയിട്ടുണ്ട്',
  'ശമ്പളം കിട്ടി','ബോണസ് കിട്ടി','പണം കിട്ടി',
  'വിറ്റു','വിറ്റ്','കമ്മീഷൻ കിട്ടി',
]

// ── Expense keywords ──────────────────────────────────────────────────────────
const EXPENSE_KW = [
  // English
  'spent','paid','bought','expense','cost','bill','fee','petrol','diesel',
  'food','rent','shopping','purchase','debit','gave to','given to','send to',
  'paid to','recharge','grocery','groceries','medicine','electricity','transport',
  'auto','cab','uber','ola','bus','train','milk','vegetables','oil','rice',
  'repair','school','college','hospital','doctor','insurance','emi','loan',
  'udhaar given','credit given','baki','gpay sent','phonepe sent','upi sent',
  'neft','imps','transferred to','sent to','paid for','bought for',
  // Hinglish
  'खर्च','खरीदा','भुगतान','दिया','किराया','बिल',
  'kharcha kiya','kharch kiya','diya hai','le liya','kharida',
  'de diya','de di','bijli','paani ka bill','school fees','dawai',
  'udhaar diya','credit diya','gpay kiya','phonepe kiya','transfer kiya',
  // Tamil
  'செலவு','வாங்கினேன்','கொடுத்தேன்','கட்டணம்','வாடகை',
  'வாங்கியிருக்கேன்','கொடுத்திருக்கேன்','வாங்கிட்டேன்','வாங்கிட்டு',
  'வாங்கினோம்','கொடுத்தோம்','வாங்கிருக்கேன்','வாங்கிச்சு',
  'வாங்கிய','கொடுத்த','பில் கட்டினேன்','கரண்ட் பில்',
  'பெட்ரோல் போட்டேன்','ரீசார்ஜ் பண்ணினேன்','மெடிசன் வாங்கினேன்',
  'உதார் கொடுத்தேன்','கடன் கொடுத்தேன்','கடை செலவு',
  // Tanglish
  'vanginen','vangitten','vangiten','vangichen','vangich',
  'kodutten','koduthen','kodutaen','kuduthen',
  'bill kattinaen','recharge paninaen','petrol pottaen',
  'udhar kodutten','credit kodutten','gpay pannaen','phonepe pannaen',
  // Telugu
  'ఖర్చు','కొన్నాను','చెల్లించాను','అద్దె','బిల్లు','కొన్నాం',
  'బిల్లు కట్టాను','పెట్రోల్ వేశాను','రీచార్జ్ చేశాను',
  'అప్పు ఇచ్చాను','క్రెడిట్ ఇచ్చాను','gpay చేశాను',
  // Kannada
  'ಖರ್ಚು','ಕೊಂಡೆ','ಕೊಟ್ಟೆ','ಬಾಡಿಗೆ','ಬಿಲ್','ಕೊಂಡಿದ್ದೇನೆ',
  'ಬಿಲ್ ಕಟ್ಟಿದೆ','ಪೆಟ್ರೋಲ್ ಹಾಕಿದೆ','ರೀಚಾರ್ಜ್ ಮಾಡಿದೆ',
  'ಸಾಲ ಕೊಟ್ಟೆ','gpay ಮಾಡಿದೆ',
  // Malayalam
  'ചെലവ്','വാങ്ങി','കൊടുത്തു','വാടക','ബിൽ',
  'വാങ്ങിച്ചു','വാങ്ങിയിട്ടുണ്ട്','കൊടുത്തിട്ടുണ്ട്','വാങ്ചു',
  'ബിൽ കട്ടാക്കി','പെട്രോൾ ഒഴിച്ചു','റീചാർജ് ചെയ്തു',
  'gpay ചെയ്തു','phonepe ചെയ്തു',
]

// ── Indian number words → digits ──────────────────────────────────────────────
const INDIAN_NUMBERS: Array<[RegExp, number]> = [
  [/ஒரு\s*கோடி/g, 10000000], [/கோடி/g, 10000000],
  [/லட்சம்|இலட்சம்/g, 100000],
  [/தொண்ணூறு\s*ஆயிரம்/g, 90000], [/எண்பது\s*ஆயிரம்/g, 80000],
  [/எழுபது\s*ஆயிரம்/g, 70000], [/அறுபது\s*ஆயிரம்/g, 60000],
  [/ஐம்பது\s*ஆயிரம்/g, 50000], [/நாற்பது\s*ஆயிரம்/g, 40000],
  [/முப்பது\s*ஆயிரம்/g, 30000], [/இருபது\s*ஆயிரம்/g, 20000],
  [/பத்து\s*ஆயிரம்/g, 10000], [/ஐயாயிரம்|ஐந்தாயிரம்/g, 5000],
  [/நாலாயிரம்|நான்காயிரம்/g, 4000], [/மூவாயிரம்|மூன்றாயிரம்/g, 3000],
  [/இரண்டாயிரம்/g, 2000],
  [/ஆயிரத்தி\s*ஐந்நூறு|ஆயிரத்தி\s*அஞ்சு\s*நூறு/g, 1500],
  [/ஆயிரம்/g, 1000],
  [/தொள்ளாயிரம்/g, 900], [/எண்ணூறு/g, 800], [/எழுநூறு/g, 700],
  [/அறுநூறு/g, 600], [/ஐந்நூறு|ஐநூறு/g, 500], [/நானூறு/g, 400],
  [/முன்னூறு|முந்நூறு/g, 300], [/இருநூறு/g, 200],
  [/நூற்றி\s*ஐம்பது/g, 150], [/நூறு/g, 100],
  [/தொண்ணூறு/g, 90], [/எண்பது/g, 80], [/எழுபது/g, 70],
  [/அறுபது/g, 60], [/ஐம்பது/g, 50], [/நாற்பது/g, 40],
  [/முப்பது/g, 30], [/இருபத்தி\s*ஐந்து/g, 25], [/இருபது/g, 20],
  [/பதினைந்து/g, 15], [/பத்து/g, 10], [/ஐந்து/g, 5],
  [/ஆயிரத்தஞ்ஞூறு|ஆயிரத்தி\s*அஞ்ஞூறு/g, 1500],
  // Malayalam
  [/ആയിരത്തഞ്ഞൂറ്|ആയിരത്തി\s*അഞ്ഞൂറ്/g, 1500],
  [/ഇരുപത്തഞ്ച്\s*ആയിരം/g, 25000], [/പതിനഞ്ച്\s*ആയിരം/g, 15000],
  [/പത്ത്\s*ആയിരം/g, 10000], [/അയ്യായിരം|അഞ്ചായിരം/g, 5000],
  [/ആയിരം/g, 1000],
  [/തൊള്ളായിരം/g, 900], [/എണ്ണൂറ്/g, 800], [/എഴുനൂറ്/g, 700],
  [/അറുനൂറ്/g, 600], [/അഞ്ഞൂറ്|അഞ്ഞൂറ/g, 500], [/നാനൂറ്/g, 400],
  [/മുന്നൂറ്/g, 300], [/ഇരുനൂറ്/g, 200], [/നൂറ്/g, 100],
  [/തൊണ്ണൂറ്/g, 90], [/എൺപത്/g, 80], [/എഴുപത്/g, 70],
  [/അറുപത്/g, 60], [/അമ്പത്/g, 50], [/നാൽപ്പത്/g, 40],
  [/മുപ്പത്/g, 30], [/ഇരുപത്/g, 20], [/പത്ത്/g, 10],
  // Hindi
  [/दस\s*हज़ार|दस\s*हजार/g, 10000], [/पाँच\s*हज़ार|पांच\s*हजार/g, 5000],
  [/दो\s*हज़ार|दो\s*हजार/g, 2000], [/हज़ार|हजार/g, 1000],
  [/नौ\s*सौ/g, 900], [/आठ\s*सौ/g, 800], [/सात\s*सौ/g, 700],
  [/छह\s*सौ/g, 600], [/पाँच\s*सौ|पांच\s*सौ/g, 500],
  [/चार\s*सौ/g, 400], [/तीन\s*सौ/g, 300], [/दो\s*सौ/g, 200],
  [/डेढ़\s*सौ/g, 150], [/सौ/g, 100],
  [/पचास/g, 50], [/चालीस/g, 40], [/तीस/g, 30], [/बीस/g, 20], [/दस/g, 10],
  // Telugu
  [/వేయి/g, 1000], [/ఐదువందలు|అయిదు\s*వందలు/g, 500],
  [/నాలుగు\s*వందలు/g, 400], [/మూడు\s*వందలు/g, 300],
  [/రెండు\s*వందలు/g, 200], [/వంద/g, 100], [/యాభై/g, 50],
  // Kannada
  [/ಸಾವಿರ/g, 1000], [/ಐನೂರು/g, 500], [/ಮುನ್ನೂರು/g, 300],
  [/ಇನ್ನೂರು/g, 200], [/ನೂರು/g, 100], [/ಐವತ್ತು/g, 50],
  // English number words
  [/one\s*crore/gi, 10000000], [/fifty\s*lakh/gi, 5000000],
  [/twenty.five\s*lakh/gi, 2500000], [/ten\s*lakh/gi, 1000000],
  [/one\s*lakh/gi, 100000],
  [/fifty\s*thousand/gi, 50000], [/twenty.five\s*thousand/gi, 25000],
  [/ten\s*thousand/gi, 10000], [/five\s*thousand/gi, 5000],
  [/two\s*thousand/gi, 2000], [/one\s*thousand|a\s*thousand/gi, 1000],
  [/nine\s*hundred/gi, 900], [/eight\s*hundred/gi, 800],
  [/seven\s*hundred/gi, 700], [/six\s*hundred/gi, 600],
  [/five\s*hundred/gi, 500], [/four\s*hundred/gi, 400],
  [/three\s*hundred/gi, 300], [/two\s*hundred/gi, 200],
  [/one\s*hundred|a\s*hundred/gi, 100],
  [/ninety/gi, 90], [/eighty/gi, 80], [/seventy/gi, 70],
  [/sixty/gi, 60], [/fifty/gi, 50], [/forty/gi, 40],
  [/thirty/gi, 30], [/twenty/gi, 20], [/ten/gi, 10],
]

const normalizeNumbers = (text: string): string => {
  let r = text
  for (const [pat, val] of INDIAN_NUMBERS) r = r.replace(pat, ` ${val} `)
  return r
}

// ── Dictionary: code-mixed Indian financial terms (ALL 6 LANGUAGES) ──────────
const DICT_NORMALIZE: Array<[RegExp, string]> = [
  // Currency symbols / words
  [/rupees?|rs\.?\s*|inr\s*/gi, '₹'],
  [/ரூபாய்|ரூபா|ரூ\.?/g, '₹'],
  [/रुपये?|रुपया|रु\.?/g, '₹'],
  [/రూపాయలు|రూపాయి|రూ\.?/g, '₹'],
  [/ರೂಪಾಯಿ|ರೂ\.?/g, '₹'],
  [/രൂപ|രൂ\.?/g, '₹'],

  // ── Payment methods → normalize (keeps amount parsing working) ─────────────
  [/gpay|google\s*pay/gi, 'paid'],
  [/phonepe|phone\s*pe/gi, 'paid'],
  [/paytm/gi, 'paid'],
  [/upi|neft|imps|rtgs/gi, 'paid'],
  [/cash/gi, 'cash payment'],
  [/online\s*pay/gi, 'paid'],

  // ── Khata / ledger specific ────────────────────────────────────────────────
  [/udhaar\s*diya|udhar\s*diya/gi, 'credit given'],
  [/udhaar\s*liya|udhar\s*liya/gi, 'credit taken'],
  [/udhaar\s*wapas|udhar\s*wapas/gi, 'received'],
  [/baki\s*mila|bakaya\s*mila/gi, 'received'],
  [/baki\s*diya|bakaya\s*diya/gi, 'paid'],
  [/khata\s*mein/gi, 'in account'],
  [/hisab|hisaab/gi, 'account'],
  [/ledger/gi, 'account'],
  [/dues/gi, 'pending amount'],
  [/credit\s*note/gi, 'refund'],
  [/advance/gi, 'advance payment'],

  // ── Tamil Udhaar / credit ──────────────────────────────────────────────────
  [/கடன்\s*கொடுத்தேன்/g, 'credit given'],
  [/கடன்\s*வாங்கினேன்/g, 'credit taken'],
  [/கடன்\s*திரும்பி\s*வந்தது/g, 'received'],
  [/உதார்\s*கொடுத்தேன்/g, 'credit given'],
  [/உதார்\s*வந்தது/g, 'received'],
  [/பாக்கி\s*வந்தது/g, 'received'],
  [/பாக்கி\s*கொடுத்தேன்/g, 'paid'],

  // ── Tanglish actions ───────────────────────────────────────────────────────
  // Present perfect (most natural in spoken Tamil): vangirukkean / vangirukken
  [/vangirukkean|vangirukken|vangirukkiren|vangirukkirean|vangirukkiraen|vangirukken|vangirukkiean|vangirukkeaan|vanguirukkean|vangirukkanga|vangirukkengal/gi, 'bought'],
  // Simple past: vanginen, vangiten etc.
  [/vanginen|vangitten|vangiten|vangichen|vangich|vangiteengala|vangittaan|vangukren|vangiruken/gi, 'bought'],
  // Continuous: vangikiren
  [/vangikiren|vangikireen|vangikirane|vangikiraan/gi, 'bought'],
  // Paid forms
  [/kodutten|koduthen|kodutaen|kuduthen|kuduthaen|koduteengk|kodutaangk|koduthaen/gi, 'paid'],
  // Received forms
  [/vanduchu|vanthuchu|vanduche|vandhuchu|vanthiruche|vandhu|vanduchu/gi, 'received'],
  [/kittachu|kittache|kittuthu|kittuvittu|kittiduchu|kittaenge/gi, 'received'],
  // Common words
  [/sambalam|salam/gi, 'salary'],
  [/selavu|selavaga|selvam/gi, 'expense'],
  [/varumanam|varumaanm/gi, 'income'],
  [/kitta\s*kuduthen|kitta\s*kodutten/gi, 'paid to'],
  [/kasu|kaasu|caasu/gi, 'money'],
  [/saaptu|saapadu|sapadu|saapud|saptu|saapitom|saaptom/gi, 'food'],
  [/veettu\s*vaadakkai|vaadakkai|vaadakke/gi, 'rent'],
  [/petrol\s*pottaen|petrol\s*potten|petrol\s*pottean|petrol\s*pottan/gi, 'petrol bought'],
  [/recharge\s*panni|recharge\s*panen|recharge\s*pannaen/gi, 'mobile recharge'],
  [/bill\s*katti|bill\s*kattinaen|bill\s*kattaen/gi, 'bill paid'],
  [/light\s*bill|current\s*bill/gi, 'electricity bill'],
  [/udhar\s*kodutten|udhar\s*kuduthen/gi, 'credit given'],
  [/udhar\s*vandhuchu|udhar\s*vandhu/gi, 'received'],
  [/baki\s*vandhu|baki\s*kittachu/gi, 'received'],
  [/cash\s*vanginen|cash\s*vangitten/gi, 'cash received'],
  [/sale\s*achu|sale\s*aachu/gi, 'sales income'],
  [/viththaen|viththom|vittaen|vikkiren/gi, 'sold'],
  [/market\s*ponen|market\s*ponaen/gi, 'market expense'],

  // ── Tamil script verb stripping ─────────────────────────────────────────────
  // Sarvam often includes the verb IN the description. Strip them so the item
  // name stays clean: "rice வாங்கிருக்கேன்" → "rice"
  [/\s*வாங்கிருக்கேன்/g, ''],
  [/\s*வாங்கினேன்/g, ''],
  [/\s*வாங்கிட்டேன்/g, ''],
  [/\s*வாங்கிச்சு/g, ''],
  [/\s*வாங்கிய/g, ''],
  [/\s*வாங்கினோம்/g, ''],
  [/\s*கொடுத்தேன்/g, ''],
  [/\s*கொடுத்திருக்கேன்/g, ''],
  [/\s*கொடுத்தோம்/g, ''],
  [/\s*போட்டேன்/g, ''],

  // ── Sarvam Tamil-script transliterations of English words ──────────────────
  // Sarvam saaras:v3 sometimes outputs English words in Tamil script.
  // These cause Gemini to misread item names. Normalize back to English.
  [/மை்ஸ்|மைஸ்|ரை்ஸ்|ரைஸ்/g, 'rice'],
  [/பெட்ரோல்/g, 'petrol'],
  [/டீசல்/g, 'diesel'],
  [/மிள்க்|மில்க்/g, 'milk'],
  [/சுகர்/g, 'sugar'],
  [/சால்ட்/g, 'salt'],
  [/ஆய்ல்/g, 'oil'],
  [/க்ரோசரி/g, 'grocery'],
  [/சிக்கன்/g, 'chicken'],
  [/மட்டன்/g, 'mutton'],
  [/ஃபிஷ்|பிஷ்/g, 'fish'],
  [/டாக்டர்/g, 'doctor'],
  [/மெடிசன்/g, 'medicine'],
  [/ரெண்ட்/g, 'rent'],
  [/சாலரி/g, 'salary'],
  [/சேல்ஸ்/g, 'sales'],

  // ── Tamil food & groceries ─────────────────────────────────────────────────
  [/mulagu|mulak|mulakupodi|milagu|milagapodi|milagu\s*podi/gi, 'chilli powder'],
  [/arisi|pacharisi|raw\s*rice/gi, 'rice'],
  [/thayir|tayir|mosaru/gi, 'curd'],
  [/thakkali|takkali/gi, 'tomato'],
  [/vengayam|vengaayam|eerulli/gi, 'onion'],
  [/kothamalli|kothavarangai/gi, 'coriander'],
  [/keerai|keera|mulaikkeerai|araikeerai/gi, 'greens'],
  [/katharikai|kathirikkai|vazhuthunangai/gi, 'brinjal'],
  [/urulaikizhangu|urulai|urulaikilangu/gi, 'potato'],
  [/pavakkai|pagarkai/gi, 'bitter gourd'],
  [/paruppu|thuvaramparuppu|kadalaiparuppu|ulunthuparuppu/gi, 'dal'],
  [/kulambu|kuzhambu|kozhambu|sambar/gi, 'curry'],
  [/idli|idly/gi, 'idli'],
  [/dosai|dosa|dosaa|dosai/gi, 'dosa'],
  [/chappati|chapati|chapathi|chapathi/gi, 'chapati'],
  [/paal|paalu/gi, 'milk'],
  [/meen|meenu|meenattu/gi, 'fish'],
  [/koli|kozhi|chicken/gi, 'chicken'],
  [/muttai|anda|mutti/gi, 'egg'],
  [/maida|wheat\s*flour/gi, 'flour'],
  [/rava|sooji|soji/gi, 'semolina'],
  [/kadala|kadalaparuppu|kadalai/gi, 'chickpea'],
  [/vaazhakai|vazhakkai|vazhakka/gi, 'raw banana'],
  [/manga|maanga|maangai/gi, 'mango'],
  [/thengai|thenngai|tengai/gi, 'coconut'],
  [/thengai\s*ennai|coconut\s*oil/gi, 'coconut oil'],
  [/nallennai|nalla\s*ennai|sesame\s*oil/gi, 'sesame oil'],
  [/sakkarai|sakkara/gi, 'sugar'],
  [/uppu/gi, 'salt'],
  [/kaapi|kaapee|coffee/gi, 'coffee'],
  [/puli|tamarind/gi, 'tamarind'],
  [/turmeric\s*powder|manjal\s*podi|manjal/gi, 'turmeric'],
  [/jeera|jeeragam|cumin/gi, 'cumin'],
  [/perunkayam|hing|asafoetida/gi, 'asafoetida'],
  [/ellu|sesame/gi, 'sesame'],
  [/kadugu|mustard/gi, 'mustard'],
  [/curry\s*leaf|karivepilai|karuveppilai/gi, 'curry leaves'],
  [/vendakkai|ladies\s*finger|okra/gi, 'okra'],
  [/avarakkai|broad\s*beans/gi, 'broad beans'],
  [/vazhaipoo|banana\s*flower/gi, 'banana flower'],
  [/murungakkai|drumstick/gi, 'drumstick'],
  [/seetha\s*pazham|custard\s*apple/gi, 'custard apple'],
  [/sapota|chikoo/gi, 'sapota'],
  [/nellikai|amla/gi, 'gooseberry'],

  // ── Tamil utilities & transport ────────────────────────────────────────────
  [/current\s*bill|karant\s*bill|eb\s*bill|kkarandu\s*bill|electricity\s*bill/gi, 'electricity bill'],
  [/phone\s*bill|fone\s*bill|mobile\s*bill/gi, 'phone bill'],
  [/water\s*bill|water\s*charge|water\s*tax/gi, 'water bill'],
  [/gas\s*cylinder|cooking\s*gas|cylinder/gi, 'gas cylinder'],
  [/auto\s*charge|auto\s*fare|auto\s*ki|share\s*auto/gi, 'auto fare'],
  [/bus\s*ticket|bus\s*pass|setc|tnstc/gi, 'bus ticket'],
  [/school\s*fee|padippu\s*kattanam|college\s*fee|tuition\s*fee/gi, 'school fee'],
  [/insurance|life\s*insurance|health\s*insurance|vehicle\s*insurance/gi, 'insurance'],
  [/emi|equated\s*monthly/gi, 'emi payment'],
  [/loan\s*payment|loan\s*emi|bank\s*emi/gi, 'loan payment'],

  // ── Coimbatore/Kongu/Salem dialect numbers ─────────────────────────────────
  [/rendu\s*nooru|rendu\s*nuru/gi, '200'],
  [/moonnu\s*nooru|moonnu\s*nuru|munn\s*nooru/gi, '300'],
  [/naalu\s*nooru|naalu\s*nuru|naal\s*nooru/gi, '400'],
  [/ainju\s*nooru|aynjooru|anjnuru/gi, '500'],
  [/aaru\s*nooru/gi, '600'], [/ezhu\s*nooru/gi, '700'], [/ettu\s*nooru/gi, '800'],
  [/pathu\s*nooru|patt\s*nuru|paththu\s*nooru/gi, '1000'],
  [/rendu\s*aayiram/gi, '2000'], [/moonnu\s*aayiram/gi, '3000'],
  [/naalu\s*aayiram|naal\s*aayiram/gi, '4000'],
  [/ainju\s*aayiram|anju\s*aayiram/gi, '5000'],
  // Madurai/Tirunelveli dialect
  [/onnu\s*nooru|oru\s*nooru/gi, '100'],
  [/oru\s*aayiram|onnu\s*aayiram/gi, '1000'],
  [/rendu|randu/gi, '2'], [/moonnu|moonu/gi, '3'],
  [/naalu|naalu/gi, '4'], [/ainju|anju/gi, '5'],
  [/aaru/gi, '6'], [/ezhu/gi, '7'], [/ettu/gi, '8'],
  [/ombodu|ombothu/gi, '9'], [/pathu|patthu/gi, '10'],

  // ── Hinglish actions ───────────────────────────────────────────────────────
  [/kharcha\s*kiya|kharch\s*kiya|kharche\s*kiya|kharcha\s*hua/gi, 'spent'],
  [/mila\s*hai|mili\s*hai|mil\s*gaya|paisa\s*mila|paise\s*mile/gi, 'received'],
  [/tankhah|tankhwah|salary\s*mila|salary\s*aayi/gi, 'salary'],
  [/kiraya|makan\s*kiraya/gi, 'rent'],
  [/le\s*liya|le\s*li|kharida|kharidi|khareedna/gi, 'bought'],
  [/de\s*diya|de\s*di|diya\s*hai|paise\s*diye/gi, 'paid'],
  [/paise|paisey|paisa|rupaya/gi, 'money'],
  [/bazaar|bazar/gi, 'market'],
  [/dukan|shop/gi, 'shop'],
  [/ghar\s*ka\s*saman|ghar\s*ka/gi, 'household'],
  [/mahine\s*ka|monthly/gi, 'monthly'],
  [/hafte\s*ka|weekly/gi, 'weekly'],
  [/aaj\s*ka|today/gi, 'today'],

  // ── Hindi/Hinglish food & groceries ───────────────────────────────────────
  [/sabzi|sabji|sabjee|tarkari/gi, 'vegetables'],
  [/doodh/gi, 'milk'],
  [/chawal|basmati|rice/gi, 'rice'],
  [/mirchi|mirch|hari\s*mirch/gi, 'chilli'],
  [/pyaz|pyaaz|kanda|onion/gi, 'onion'],
  [/dawai|dawa|dawaai|medicine|tablet/gi, 'medicine'],
  [/aata|atta|gehun\s*atta/gi, 'flour'],
  [/besan/gi, 'gram flour'],
  [/tel|sarson\s*tel|mustard\s*oil|sunflower\s*tel/gi, 'oil'],
  [/namak/gi, 'salt'],
  [/cheeni|chini|sugar/gi, 'sugar'],
  [/chai|tea/gi, 'tea'],
  [/paneer/gi, 'paneer'],
  [/andey|anda|egg/gi, 'egg'],
  [/tamatar/gi, 'tomato'],
  [/aaloo|aloo|batata/gi, 'potato'],
  [/gajar|carrot/gi, 'carrot'],
  [/gobi|phool\s*gobi|cauliflower/gi, 'cabbage'],
  [/palak|spinach/gi, 'spinach'],
  [/baigan|brinjal/gi, 'brinjal'],
  [/matar|mutter|peas/gi, 'peas'],
  [/lehsun|garlic/gi, 'garlic'],
  [/adrak|ginger/gi, 'ginger'],
  [/haldi|turmeric/gi, 'turmeric'],
  [/jeera|cumin/gi, 'cumin'],
  [/dhania|coriander/gi, 'coriander'],
  [/murgha|murgi|chicken/gi, 'chicken'],
  [/machli|machhi|fish/gi, 'fish'],
  [/lassi/gi, 'lassi'],
  [/chole|chana/gi, 'chickpea curry'],
  [/dal\s*makhani|dal\s*tadka|urad\s*dal/gi, 'dal'],
  [/rajma/gi, 'kidney beans'],
  [/moong/gi, 'moong dal'],
  [/masoor/gi, 'red lentil'],
  [/poha|avalakki/gi, 'poha'],
  [/soya|soya\s*chunks/gi, 'soya'],
  [/khoya|mawa/gi, 'khoya'],
  [/maida/gi, 'maida'],

  // ── Hindi utilities & transport ────────────────────────────────────────────
  [/bijli|bijlee|current/gi, 'electricity bill'],
  [/paani\s*ka\s*bill|water\s*bill/gi, 'water bill'],
  [/phone\s*recharge|mobile\s*recharge|sim\s*recharge/gi, 'mobile recharge'],
  [/auto|rikshaw|rickshaw/gi, 'auto fare'],
  [/school\s*fees|tuition|coaching/gi, 'school fees'],
  [/dawakhana|dawakhane|hospital/gi, 'hospital'],
  [/petrol|diesel|petrol\s*bharo/gi, 'fuel'],

  // ── Malayalish ─────────────────────────────────────────────────────────────
  // Present perfect + past of buy/pay/receive
  [/vaangichi|vaangichu|vaangiche|vaangchu|vaanguthe|vaangi|vaangirunnu|vaangiyirunnu|vaangithu|vaangirikkunnu/gi, 'bought'],
  [/koduthu|koduthe|kuduthu|koduthirunnu|koduththu|koduthirikkunnu|koduthittundu/gi, 'paid'],
  [/adachu|adachittu|adachirunnu|kattiyittundu|kattiyirunnu/gi, 'paid'],
  [/kitti|kittundu|kittichu|kittiyunnu|kittiyitundu|kittiyirunnu|kittichodathu|vandhu/gi, 'received'],
  // Strip Malayalam verbs from item descriptions
  [/\s*വാങ്ങിച്ചു/g, ''], [/\s*വാങ്ങി/g, ''],
  [/\s*കൊടുത്തു/g, ''], [/\s*കിട്ടി/g, ''],
  [/viruthi|vaangi\s*thu/gi, 'bought'],
  [/udhar\s*koduthu|kadhan\s*koduthu/gi, 'credit given'],
  [/udhar\s*kitti|kadhan\s*thulannu/gi, 'received'],
  [/meen|meenu/gi, 'fish'],
  [/payar|vanpayar|cherupayar/gi, 'beans'],
  [/cheera|spinach/gi, 'spinach'],
  [/muringakka|drumstick/gi, 'drumstick'],
  [/chena|elephant\s*yam/gi, 'yam'],
  [/kumbalanga|ash\s*gourd/gi, 'ash gourd'],
  [/mathanga|pumpkin/gi, 'pumpkin'],
  [/paal|pallu/gi, 'milk'],
  [/neyy|neyyu|ney|ghee/gi, 'ghee'],
  [/ulli|savola|kappayulli/gi, 'onion'],
  [/mulaku|chilli/gi, 'chilli'],
  [/ari|ariyy|ariyyu/gi, 'rice'],
  [/vellam|sharkara|jaggery/gi, 'jaggery'],
  [/autokaari|auto\s*kaar/gi, 'auto fare'],
  [/ksrtc|bus\s*fare/gi, 'bus fare'],
  [/aushadham|medicine/gi, 'medicine'],
  [/dakthar|doctor/gi, 'doctor fee'],
  [/intaraayam|vaadaka|vaadaka\s*koodiyathu/gi, 'rent'],
  [/kanji|rice\s*gruel/gi, 'kanji'],
  [/puttu|idiyappam|appam/gi, 'breakfast'],
  [/thengapaal|coconut\s*milk/gi, 'coconut milk'],
  [/aval|poha|flattened\s*rice/gi, 'poha'],
  [/kadala\s*curry|kadala/gi, 'chickpea'],
  [/muttayam|mutta|egg/gi, 'egg'],
  [/kozhi|chicken/gi, 'chicken'],
  [/thrissur|kozhikode|trivandrum/gi, 'expense'],

  // ── Kannadish ──────────────────────────────────────────────────────────────
  // Present perfect + continuous of buy/pay/receive
  [/tagondu|tagondidde|tagonditini|tagondbitta|thagondu|tagondidini|tagondivi|tagondirutteeni|tagondbittidde|tagundu/gi, 'bought'],
  [/kottidde|kottare|kottini|kottbitta|kottidhhe|kottidhini|kottidini/gi, 'paid'],
  [/kattidhhe|kattidhini|kattidde/gi, 'paid'],
  [/sikitu|sikibitta|sikiruthe|sikidhhe|sikidhini|sikkithu|sikkidde|sikkitteeni/gi, 'received'],
  // Strip Kannada verbs from item descriptions
  [/\s*ತಗೊಂಡಿದ್ದೇನೆ/g, ''], [/\s*ತಗೊಂಡೆ/g, ''],
  [/\s*ಕೊಟ್ಟಿದ್ದೇನೆ/g, ''], [/\s*ಕೊಟ್ಟೆ/g, ''],
  [/akki|avlakki|avlakki\s*upma/gi, 'rice'],
  [/halu|haallu|haalu/gi, 'milk'],
  [/togari\s*bele|toor\s*dal/gi, 'toor dal'],
  [/menthya|fenugreek/gi, 'fenugreek'],
  [/eerulli|iru\s*ulli|onion/gi, 'onion'],
  [/bendekayi|okra|ladies\s*finger/gi, 'okra'],
  [/tuppa|ghee/gi, 'ghee'],
  [/kadle\s*bele|chana\s*dal/gi, 'chana dal'],
  [/mane\s*baadige|baadige|rent/gi, 'rent'],
  [/vaidyuta\s*shulka|current\s*bill/gi, 'electricity bill'],
  [/shale\s*shulka|school\s*fee/gi, 'school fee'],
  [/hasiru\s*kayi|vegetables/gi, 'vegetables'],
  [/hannu|fruit/gi, 'fruit'],
  [/mosaru|curd/gi, 'curd'],
  [/hesarukaayi|green\s*beans/gi, 'beans'],
  [/badnekai|brinjal/gi, 'brinjal'],
  [/huruli|horsegram/gi, 'horsegram'],
  [/nucchina\s*unde|sweet/gi, 'sweet'],
  [/ragi|ragi\s*mudde/gi, 'ragi'],
  [/jowar|sorghum/gi, 'jowar'],
  [/udhar\s*kotte|sali\s*kotte/gi, 'credit given'],
  [/udhar\s*sikkitu|sali\s*banthide/gi, 'received'],

  // ── Telugish ───────────────────────────────────────────────────────────────
  // Present perfect + past forms of "buy/paid/received" in Telugu
  [/konnatlu|konnanu|konnadam|konnaanu|koni|konnaamu|konnamu|konnaam|konnaanga/gi, 'bought'],
  [/kinnanu|kinnamu|kinnam|kondi|kondaamu/gi, 'bought'],
  [/icchanu|ichanu|iyyan|ichi|icchaamu|iccham|icchaanga|icchinanu/gi, 'paid'],
  [/kattanu|kattaamu|kattaanga|kattindhi|kattinanu/gi, 'paid'],
  [/vacchindi|vacchindhi|ostundi|vacchindi|vacchindhaamu|vasthundhi/gi, 'received'],
  [/vachindi|vachchindi|ochindi|doriakindi|dorikiindi/gi, 'received'],
  // Telugish verbs that appear in item descriptions
  [/\s*కొన్నాను/g, ''], [/\s*కొన్నాం/g, ''],
  [/\s*కట్టాను/g, ''], [/\s*ఇచ్చాను/g, ''],
  [/biyyam|biyam|annamu/gi, 'rice'],
  [/palu|paalu/gi, 'milk'],
  [/pachi\s*mirchi|green\s*chilli/gi, 'green chilli'],
  [/endu\s*mirchi|dry\s*chilli/gi, 'dry chilli'],
  [/mamsam|meat/gi, 'meat'],
  [/kodi\s*guddu|egg/gi, 'egg'],
  [/ullipaya|onion/gi, 'onion'],
  [/vankaya|brinjal/gi, 'brinjal'],
  [/bendakaya|okra/gi, 'okra'],
  [/nune|oil/gi, 'oil'],
  [/bellam|jaggery/gi, 'jaggery'],
  [/intaraayam|rent/gi, 'rent'],
  [/kodi\s*mukkalu|chicken\s*pieces/gi, 'chicken'],
  [/senagapaappu|chana\s*dal/gi, 'chana dal'],
  [/pesarapaappu|moong/gi, 'moong dal'],
  [/minappaappu|urad\s*dal/gi, 'urad dal'],
  [/godhumalu|wheat/gi, 'wheat'],
  [/nuvvulu|sesame/gi, 'sesame'],
  [/karuveppaku|curry\s*leaves/gi, 'curry leaves'],
  [/udhar\s*ichanu|adavans\s*ichanu/gi, 'credit given'],
  [/udhar\s*vacchindi|baki\s*vacchindi/gi, 'received'],

  // ── Common across all languages ────────────────────────────────────────────
  [/petrol|petrool|petroal|fuel/gi, 'petrol'],
  [/diesel|diesal/gi, 'diesel'],
  [/gas\s*cylinder|cooking\s*gas|cylinder|lpg/gi, 'gas cylinder'],
  [/ghee|nei/gi, 'ghee'],
  [/sugar|sucrose/gi, 'sugar'],
  [/soap|saabun|sabun/gi, 'soap'],
  [/shampoo|conditioner/gi, 'shampoo'],
  [/toothpaste|toothbrush/gi, 'dental care'],
  [/bread/gi, 'bread'],
  [/medicine|marundu|tablet|capsule|syrup/gi, 'medicine'],
  [/doctor|physician/gi, 'doctor fee'],
  [/hospital|nursing\s*home/gi, 'hospital'],
  [/electricity\s*bill|current\s*bill|eb\s*bill/gi, 'electricity bill'],
  [/water\s*bill|corporation\s*bill/gi, 'water bill'],
  [/school\s*fee|college\s*fee|tuition/gi, 'school fee'],
  [/auto\s*fare|auto\s*charge/gi, 'auto fare'],
  [/mobile\s*recharge|phone\s*recharge|sim/gi, 'mobile recharge'],
  [/internet\s*bill|broadband|wifi\s*bill/gi, 'internet bill'],
  [/newspaper|news\s*paper/gi, 'newspaper'],
  [/laundry|washing/gi, 'laundry'],
  [/parking|parking\s*fee/gi, 'parking'],
  [/toll|toll\s*fee|highway/gi, 'toll'],
  [/haircut|saloon|salon|barber/gi, 'haircut'],
  [/stationary|notebook|pen|pencil/gi, 'stationery'],
  [/fertilizer|pesticide|seeds/gi, 'farming supply'],
  [/rent|rental/gi, 'rent'],
]

const applyDictionary = (text: string): string => {
  let r = text
  for (const [pat, rep] of DICT_NORMALIZE) r = r.replace(pat, rep)
  return r
}

// ── Extract amount ─────────────────────────────────────────────────────────────
const extractAmount = (text: string): number => {
  const d = applyDictionary(text)
  const t = normalizeNumbers(d)
  const lo = t.toLowerCase()

  // ── WEIGHT UNIT PATTERN — numbers followed by weight units are NOT prices ──
  // "100g mulagu 80" → 100 is qty, 80 is price
  // "200 gram rice 150" → 200 is qty, 150 is price
  // "500ml oil 95" → 500 is qty, 95 is price
  // We build a "weight positions" set to exclude those indices from amount parsing
  const weightUnitRx = /(\d+(?:\.\d+)?)\s*(grams?|g\b|kgs?|kilograms?|kg\b|ml\b|milli?litres?|litres?|ltr?s?\b|l\b|pieces?|pcs?\b|packets?|pkt\b|nos?\b|units?\b|dozen|dz\b)/gi
  const weightPositions = new Set<number>()
  for (const m of t.matchAll(weightUnitRx)) {
    if (m.index != null) weightPositions.add(m.index)
  }

  // PRIORITY 0: multiple ₹ amounts → SUM them all (multi-item voice)
  const allRupee = [...t.matchAll(/₹\s*(\d{1,3}(?:,\d{2,3})*|\d+)(\.\d+)?/g)]
  if (allRupee.length > 1) {
    const total = allRupee.reduce((sum, m) => sum + parseFloat(m[1].replace(/,/g, '') + (m[2] ?? '')), 0)
    if (total > 0) return total
  }

  // PRIORITY 1a: ₹ BEFORE number
  const rupeeFirst = t.match(/₹\s*(\d{1,3}(?:,\d{2,3})*|\d+)(\.\d+)?/)
  if (rupeeFirst) {
    const val = parseFloat(rupeeFirst[1].replace(/,/g, '') + (rupeeFirst[2] ?? ''))
    if (val > 0) return val
  }

  // PRIORITY 1b: number BEFORE ₹ — "100₹"
  const rupeeLast = t.match(/(\d{1,3}(?:,\d{2,3})*|\d+)(\.\d+)?\s*₹/)
  if (rupeeLast) {
    const val = parseFloat(rupeeLast[1].replace(/,/g, '') + (rupeeLast[2] ?? ''))
    if (val > 0) return val
  }

  // PRIORITY 2: shorthand
  const sh = lo.match(/(\d+\.?\d*)\s*(k|l|lac|lakh|cr|crore)/)
  if (sh) {
    const n = parseFloat(sh[1]), u = sh[2]
    if (u === 'k') return n * 1000
    if (u === 'l' || u === 'lac' || u === 'lakh') return n * 100000
    if (u === 'cr' || u === 'crore') return n * 10000000
  }

  // PRIORITY 3: Indian comma format
  const cn = t.match(/\d{1,3}(?:,\d{2,3})+/)
  if (cn) { const v = parseFloat(cn[0].replace(/,/g, '')); if (v > 0) return v }

  // PRIORITY 4: STT spaced number (5 100 → 5100)
  const sp = t.match(/\b(\d{1,3})\s+(\d{3})\b/)
  if (sp) { const j = parseInt(sp[1] + sp[2], 10); if (j >= 1000) return j }

  // PRIORITY 5: last number that is NOT a weight quantity
  // "100g mulagu 80" → skip 100 (weight), return 80 (price)
  // "200 gram rice 150 rupees" → skip 200 (weight), return 150 (price)
  const allNums = Array.from(t.matchAll(/\d+(\.\d+)?/g))
  // Filter out numbers that are part of a weight pattern
  const priceNums = allNums.filter(m => m.index != null && !weightPositions.has(m.index))
  if (priceNums.length >= 1) return parseFloat(priceNums[priceNums.length - 1][0])
  // If all numbers are weight-qualified, fallback to last number (edge case: "100g rice" with no price)
  if (allNums.length >= 1) return parseFloat(allNums[allNums.length - 1][0])

  return 0
}

const removeAmountOnly = (text: string): string => {
  let r = text
  for (const [pat] of INDIAN_NUMBERS) r = r.replace(pat, ' ')
  r = r.replace(/₹\s*[\d,]+(\.\d+)?/g, '')
  r = r.replace(/\d{1,3}(?:,\d{2,3})+/g, '')
  r = r.replace(/\d+\.?\d*\s*(k|l|lac|lakh|cr|crore)/gi, '')
  r = r.replace(/\d+(\.\d+)?/g, '')
  return r.replace(/\s+/g, ' ').trim()
}

const localParse = (text: string): { amount: number; description: string; type: TransactionType } => {
  const lower = text.toLowerCase()
  const normalized = applyDictionary(lower)
  const isIncome  = INCOME_KW.some(k  => normalized.includes(k.toLowerCase()))
  const isExpense = EXPENSE_KW.some(k => normalized.includes(k.toLowerCase()))
  return {
    amount:      extractAmount(text),
    description: removeAmountOnly(text),
    type:        (isIncome && !isExpense ? 'income' : 'expense') as TransactionType,
    hasExplicitType: isIncome !== isExpense,
  } as any
}

const sanitize = (s: string) => s.replace(/\s+/g, ' ').replace(/[|]+/g, ' ').trim()

// ── F4: Micro-Inventory — localStorage-backed item tracker ────────────────────
const INVENTORY_KEY = 'khata_inventory'
interface InventoryItem { name: string; qty: number; unit: string; lastUpdated: string }
type InventoryMap = Record<string, InventoryItem>

// Items that typically need restocking alerts (threshold in units bought)
const RESTOCK_THRESHOLD = 0  // alert when qty reaches 0 or goes negative

const loadInventory = (): InventoryMap => {
  try { return JSON.parse(localStorage.getItem(INVENTORY_KEY) || '{}') }
  catch { return {} }
}
const saveInventory = (inv: InventoryMap) => {
  try { localStorage.setItem(INVENTORY_KEY, JSON.stringify(inv)) } catch { /* noop */ }
}
// Update inventory after a save: expense = stock IN (we bought), income = stock OUT (we sold)
const updateInventory = (
  description: string,
  quantity: number | null,
  unit: string | null,
  txType: 'income' | 'expense',
  inv: InventoryMap
): { updated: InventoryMap; lowStock: string[] } => {
  if (!quantity || quantity <= 0) return { updated: inv, lowStock: [] }
  const key = description.toLowerCase().trim()
  const prev = inv[key] ?? { name: description, qty: 0, unit: unit || 'unit', lastUpdated: '' }
  const delta = txType === 'expense' ? quantity : -quantity // expense=buy=add; income=sell=subtract
  const newQty = Math.max(0, prev.qty + delta)
  const updated: InventoryMap = {
    ...inv,
    [key]: { name: description, qty: newQty, unit: unit || prev.unit, lastUpdated: new Date().toISOString() }
  }
  const lowStock = newQty <= RESTOCK_THRESHOLD ? [description] : []
  return { updated, lowStock }
}

const MORE_TABS = [
  { tab: 'reports'   as Tab, icon: <FileBarChart size={16} />, label: 'Reports'  },
  { tab: 'customers' as Tab, icon: <Users size={16} />,        label: 'Udhaar'   },
  { tab: 'insights'  as Tab, icon: <Brain size={16} />,        label: 'Insights' },
  { tab: 'staff'     as Tab, icon: <ShieldCheck size={16} />,  label: 'Staff'    },
  { tab: 'settings'  as Tab, icon: <Settings2 size={16} />,    label: 'Settings' },
]

// ─── Component ─────────────────────────────────────────────────────────────────
export default function Home({ language = 'en', setLanguage }: { language?: SupportedLanguage; setLanguage?: (l: SupportedLanguage) => void }) {
  const { user }   = useAuth()
  const accountType = (user?.user_metadata?.account_type ?? 'business') as 'personal' | 'business'
  const roleCtx    = useRole()
  const isOwner    = roleCtx.isOwner
  const isStaff    = roleCtx.isStaff
  const { pendingCount, saveTransaction } = useOfflineSync()

  const [activeTab,    setActiveTab]    = useState<Tab>('home')
  const [showForm,     setShowForm]     = useState(false)
  const [showScanner,  setShowScanner]  = useState(false)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [isAiLoading,  setIsAiLoading]  = useState(false)
  const [saveSuccess,  setSaveSuccess]  = useState(false)
  const [aiStep,       setAiStep]       = useState('')
  const [errorMsg,     setErrorMsg]     = useState('')
  const [rateLimited,  setRateLimited]  = useState(false)
  const [refreshKey,   setRefreshKey]   = useState(0)
  const [formData,     setFormData]     = useState<TransactionDraft>(
    { amount: '', description: '', type: 'expense', voice_transcript: '' }
  )
  const [confirmDialog, setConfirmDialog] = useState<{
    transcript: string
    items: Array<{ description: string; amount: number; type: 'income' | 'expense'; category: string }>
  } | null>(null)

  // ── F1: Smart Clerk — query answer to show on mic screen ──────────────────
  const [queryAnswer, setQueryAnswer] = useState<string | null>(null)

  // ── F4: Micro-Inventory — track item stock in localStorage ────────────────
  const [inventory, setInventory] = useState<InventoryMap>(loadInventory)
  const [lowStockAlerts, setLowStockAlerts] = useState<string[]>([])

  // ── F6: End-of-Day P&L — summary generation state ────────────────────────
  const [pnlLoading, setPnlLoading] = useState(false)
  const [pnlSummary, setPnlSummary] = useState<string | null>(null)

  const t = T[language] ?? T.en

  const processAndSaveRef = useRef<(transcript: string, confidence: SttConfidence) => Promise<void>>(async () => {})

  const {
    isRecording, isProcessing: isVoiceBusy,
    liveText, processingStep, providerUsed,
    startRecording, stopRecording,
  } = useVoiceRecorder({
    language,
    sarvamKey:       import.meta.env.VITE_SARVAM_API_KEY      ?? '',
    googleKey:       import.meta.env.VITE_GOOGLE_STT_KEY      ?? '',
    googleProjectId: import.meta.env.VITE_GOOGLE_PROJECT_ID   ?? '',
    elevenLabsKey:   import.meta.env.VITE_ELEVENLABS_API_KEY  ?? '',
    onTranscript: (transcript: string, confidence: SttConfidence) => {
      void processAndSaveRef.current(sanitize(transcript), confidence)
    },
    onError:     (msg: string) => setErrorMsg(msg),
    onRateLimit: () => { setRateLimited(true); window.setTimeout(() => setRateLimited(false), 3000) },
  })

  const isBusy = isAiLoading || isVoiceBusy

  useEffect(() => {
    if (!errorMsg) return
    const id = window.setTimeout(() => setErrorMsg(''), 4000)
    return () => window.clearTimeout(id)
  }, [errorMsg])

  useEffect(() => {
    navigator.mediaDevices?.getUserMedia({ audio: true })
      .then(s => s.getTracks().forEach(tr => tr.stop()))
      .catch(() => {})
  }, [])

  // ── F3: Soundbox — Ziva speaks confirmation in clear, TTS-friendly phrases ──
  // DESIGN: Indian language TTS on iOS/Android is robotic and unclear for native script.
  // Solution: Use Romanized/transliterated short phrases with English numbers.
  // Amounts ALWAYS in English digits (₹ sign causes TTS to say "rupee sign" on some devices).
  // Phrases designed to be phonetically clear on ANY device voice.
  const speakSaved = useCallback((desc?: string, amount?: number) => {
    if (!window.speechSynthesis) return
    window.speechSynthesis.cancel()

    const amtStr = amount ? `${amount} rupees` : ''
    const phrase = (() => {
      if (desc && amount) {
        switch (language) {
          case 'hi': return `Ziva ne ${amtStr} ${desc} save kar liya`   // Romanized Hinglish
          case 'ta': return `Ziva ${amtStr} ${desc} save pannaachu`      // Romanized Tanglish
          case 'te': return `Ziva ${amtStr} ${desc} save chesindi`       // Romanized Telugu
          case 'kn': return `Ziva ${amtStr} ${desc} save maadidlu`       // Romanized Kannada
          case 'ml': return `Ziva ${amtStr} ${desc} save cheythu`        // Romanized Malayalam
          default:   return `Ziva saved ${amtStr} for ${desc}`
        }
      }
      return language === 'en' ? 'Ziva saved it!' : t.saved
    })()

    const sayIt = () => {
      const u = new SpeechSynthesisUtterance(phrase)
      // For all Indian languages: use en-IN voice — it handles Romanized phrases clearly
      // Native script TTS (ta-IN etc.) is robotic/unclear on most mobile devices
      u.lang = 'en-IN'; u.rate = 0.88; u.pitch = 1.0; u.volume = 1.0
      const voices = window.speechSynthesis.getVoices()
      const best = voices.find(v => v.lang === 'en-IN')
                || voices.find(v => v.lang.startsWith('en-'))
                || voices.find(v => v.lang.startsWith('en'))
                || null
      if (best) u.voice = best
      window.speechSynthesis.speak(u)
    }
    if (window.speechSynthesis.getVoices().length > 0) sayIt()
    else { window.speechSynthesis.onvoiceschanged = () => { sayIt(); window.speechSynthesis.onvoiceschanged = null } }
  }, [language, t.saved])

  // ── F4: Low-stock voice alert — Romanized for clear TTS on all devices ──────
  const speakLowStock = useCallback((itemName: string) => {
    if (!window.speechSynthesis) return
    // All phrases Romanized + English numbers so en-IN voice speaks clearly
    const phrases: Record<SupportedLanguage, string> = {
      en: `Low stock alert. ${itemName} is running out. Please reorder.`,
      hi: `${itemName} ka stock khatam ho raha hai. Please reorder karein.`,
      ta: `${itemName} stock mudinju PoGuthu. Marupadiyum vaangidunga.`,
      te: `${itemName} stock takkuva ga undi. Malli order cheyyandi.`,
      kn: `${itemName} stock kammi aagide. Matte order maadi.`,
      ml: `${itemName} stock kuraanju. Veendum order cheyyuka.`,
    }
    window.speechSynthesis.cancel()
    setTimeout(() => {
      const u = new SpeechSynthesisUtterance(phrases[language] ?? phrases.en)
      // Always use en-IN for clearest pronunciation of these Romanized phrases
      u.lang = 'en-IN'; u.rate = 0.85; u.volume = 1.0
      const voices = window.speechSynthesis.getVoices()
      const best = voices.find(v => v.lang === 'en-IN')
                || voices.find(v => v.lang.startsWith('en-'))
                || null
      if (best) u.voice = best
      window.speechSynthesis.speak(u)
    }, 2200)
  }, [language])

  // ── F6: End-of-Day Voice P&L ──────────────────────────────────────────────
  const speakPnL = useCallback(async () => {
    if (!user?.id) return
    setPnlLoading(true); setPnlSummary(null)
    try {
      const today = new Date().toISOString().split('T')[0]
      const { data } = await supabase
        .from('transactions')
        .select('type, amount, description')
        .eq('user_id', user.id)
        .eq('transaction_date', today)

      const rows = data ?? []
      const income  = rows.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0)
      const expense = rows.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0)
      const profit  = income - expense

      const { data: udhaarData } = await supabase
        .from('udhaar_customers')
        .select('total_credit, total_paid')
        .eq('user_id', user.id)
      const pending = (udhaarData ?? []).reduce((s, c) => s + Math.max(0, c.total_credit - c.total_paid), 0)

      // ── Build TTS-friendly summary — all amounts in English digits, phrases Romanized ──
      // Avoids robotic/unclear native script TTS on iOS/Android devices
      const summaryText = (() => {
        switch (language) {
          case 'hi': return `Aaj ka summary. Sales ${income} rupees. Kharcha ${expense} rupees. Munafa ${Math.max(0, profit)} rupees. Pending ${pending} rupees.`
          case 'ta': return `Indru summary. Mottam vikkirai ${income} rupees. Selavvu ${expense} rupees. Laabam ${Math.max(0, profit)} rupees. Baaki vasool ${pending} rupees.`
          case 'te': return `Neti summary. Mottam sales ${income} rupees. Kharchu ${expense} rupees. Laabham ${Math.max(0, profit)} rupees. Pending ${pending} rupees.`
          case 'kn': return `Indindu summary. Mottad sale ${income} rupees. Kharchu ${expense} rupees. Labha ${Math.max(0, profit)} rupees. Baki ${pending} rupees.`
          case 'ml': return `Innale summary. Mottam sale ${income} rupees. Chelavu ${expense} rupees. Laabham ${Math.max(0, profit)} rupees. Kudishika ${pending} rupees.`
          default:   return `Today's Summary. Total Sales ${income} rupees. Expenses ${expense} rupees. Profit ${Math.max(0, profit)} rupees. Pending Collection ${pending} rupees.`
        }
      })()

      setPnlSummary(summaryText)
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel()
        const u = new SpeechSynthesisUtterance(summaryText)
        // Always en-IN — phrases are Romanized so any Indian English voice reads them clearly
        u.lang = 'en-IN'; u.rate = 0.80; u.volume = 1.0
        const voices = window.speechSynthesis.getVoices()
        const best = voices.find(v => v.lang === 'en-IN')
                  || voices.find(v => v.lang.startsWith('en-'))
                  || voices.find(v => v.lang.startsWith('en'))
                  || null
        if (best) u.voice = best
        window.speechSynthesis.speak(u)
      }
    } catch (err) {
      console.error('P&L error:', err)
      setPnlSummary('Could not load today\'s data. Please try again.')
    } finally {
      setPnlLoading(false)
    }
  }, [user, language])

  // ── directSave: schema-resilient Supabase insert ────────────────────────────
  // FIXES:
  // 1. Tries full save first (with voice_transcript)
  // 2. If fails due to column issue → retries with minimal core fields only
  // 3. Network errors → offline queue (via saveTransaction)
  // 4. Does NOT use repairPayload (avoids adding category_label: null to payloads)
  const directSave = useCallback(async (row: {
    amount: number; description: string; type: string; user_id: string;
    voice_transcript?: string; transaction_date: string; created_at: string;
  }): Promise<{ success: boolean; offline?: boolean; error?: string }> => {
    if (!navigator.onLine) {
      return saveTransaction(row as TransactionPayload)
    }
    try {
      // Attempt 1: Full save with all fields
      const { error } = await supabase.from('transactions').insert([row])
      if (!error) {
        console.log('✅ Saved:', row.description, '₹' + row.amount)
        return { success: true }
      }

      const msg = error.message.toLowerCase()
      console.error('❌ Insert error:', error.message)

      // Network error → offline queue
      if (msg.includes('fetch') || msg.includes('network') || msg.includes('connect') || msg.includes('failed')) {
        return saveTransaction(row as TransactionPayload)
      }

      // Column/schema error → retry with minimal safe fields only
      if (msg.includes('column') || msg.includes('does not exist') || msg.includes('schema')) {
        const minimalRow = {
          amount:           row.amount,
          description:      row.description,
          type:             row.type,
          user_id:          row.user_id,
          transaction_date: row.transaction_date,
          created_at:       row.created_at,
        }
        const { error: e2 } = await supabase.from('transactions').insert([minimalRow])
        if (!e2) {
          console.log('✅ Saved (minimal fields):', row.description, '₹' + row.amount)
          return { success: true }
        }
        return { success: false, error: e2.message }
      }

      return { success: false, error: error.message }
    } catch (e) {
      return saveTransaction(row as TransactionPayload)
    }
  }, [saveTransaction])

  const openManualForm = useCallback((transcript: string) => {
    const cleaned = sanitize(transcript)
    const p = cleaned ? localParse(cleaned) : null
    const rawDesc = cleaned ? removeAmountOnly(cleaned) : ''
    setFormData({
      amount:           p && p.amount > 0 ? String(p.amount) : '',
      description:      rawDesc || cleaned || '',
      type:             p ? p.type : 'expense',
      voice_transcript: cleaned,
    })
    setShowForm(true); setIsAiLoading(false); setAiStep('')
  }, [])

  const localParseMulti = useCallback((text: string): Array<{item: string; amount: number; type: TransactionType}> | null => {
    const lower = text.toLowerCase()
    const isIncome = INCOME_KW.some(k => lower.includes(k.toLowerCase()))
    const txType: TransactionType = isIncome ? 'income' : 'expense'

    const norm = text
      .replace(/₹\s*(\d)/g, ' $1')
      .replace(/(\d)\s*₹/g, '$1 ')
      .replace(/\brs\.?\s*(\d)/gi, ' $1')

    const pattern = /([a-zA-Z\u0900-\u097F\u0B80-\u0BFF\u0C00-\u0C7F\u0C80-\u0CFF\u0D00-\u0D7F][^\d\n,]{1,30}?)\s+(\d+(?:\.\d+)?)/g
    const matches = [...norm.matchAll(pattern)]

    if (matches.length < 2) return null

    const entries = matches
      .map(m => ({ item: m[1].trim().replace(/\s+/g, ' '), amount: parseFloat(m[2]), type: txType }))
      .filter(e => e.amount > 0 && e.item.length > 1)

    return entries.length >= 2 ? entries : null
  }, [])

  // ── navigate to transactions and force a fresh data load ────────────────────
  const goToTransactions = useCallback(() => {
    setRefreshKey(k => k + 1)
    setActiveTab('transactions')
  }, [])

  // ── Core: voice transcript → Smart Clerk query OR parse → save ──────────────
  const processAndSave = useCallback(async (transcript: string, confidence: SttConfidence = 'high') => {
    console.log('🎤 Transcript:', `"${transcript}"`)
    if (!transcript) { setErrorMsg('Could not hear clearly. Try again.'); setIsAiLoading(false); setAiStep(''); return }
    if (!user?.id) { openManualForm(transcript); return }

    const sttConf = confidence
    setIsAiLoading(true); setAiStep('Understanding...')
    setQueryAnswer(null) // clear any previous query answer

    // ── F1: Smart Clerk — detect if this is a question or a transaction ────
    // Load recent transactions for query context (lightweight: last 100)
    let recentTx: any[] = []
    try {
      const { data } = await supabase
        .from('transactions')
        .select('type, amount, description, transaction_date')
        .eq('user_id', user.id)
        .order('transaction_date', { ascending: false })
        .limit(100)
      recentTx = data ?? []
    } catch { /* ignore — query answering will have less context */ }

    const intent = await detectVoiceIntent(transcript, recentTx)
    if (intent.intent === 'query' && intent.answer) {
      setIsAiLoading(false); setAiStep('')
      setQueryAnswer(intent.answer)
      // Speak the answer aloud — en-IN for clear pronunciation
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel()
        const u = new SpeechSynthesisUtterance(intent.answer)
        u.lang = 'en-IN'; u.rate = 0.88; u.volume = 1.0
        const voices = window.speechSynthesis.getVoices()
        const best = voices.find(v => v.lang === 'en-IN')
                  || voices.find(v => v.lang.startsWith('en-')) || null
        if (best) u.voice = best
        window.speechSynthesis.speak(u)
      }
      return
    }
    // ─────────────────────────────────────────────────────────────────────────

    const [aiParsed, local] = await Promise.all([
      analyzeTransaction(transcript, accountType).catch(() => null),
      Promise.resolve(localParse(transcript)),
    ])

    console.log('🤖 AI:', aiParsed, '📝 Local:', local)

    if (aiParsed && aiParsed.is_financial === false) { openManualForm(transcript); return }

    type ParsedEntry = { item: string; amount: number; quantity: number | null; unit: string | null; type: string; category: string }
    const aiEntries: ParsedEntry[] = (aiParsed?.entries && Array.isArray(aiParsed.entries)) ? aiParsed.entries as ParsedEntry[] : []
    const aiConf = aiParsed?.confidence ?? 'low'

    if (aiEntries.length > 0) {
      const toDialogItems = (entries: ParsedEntry[]) => entries.map(e => ({
        description: e.quantity ? `${e.quantity}${e.unit ?? ''} ${e.item}`.trim() : e.item,
        amount:      e.amount,
        type:        (e.type === 'income' ? 'income' : 'expense') as 'income' | 'expense',
        category:    e.category || 'General',
      }))

      // Low confidence → confirm dialog
      if (aiConf === 'low') {
        const total = aiEntries.reduce((s, e) => s + e.amount, 0)
        setIsAiLoading(false); setAiStep('')
        if (total > 0) setConfirmDialog({ transcript, items: toDialogItems(aiEntries) })
        else openManualForm(transcript)
        return
      }

      // Single item + high confidence → auto-save
      if (aiEntries.length === 1 && (aiConf === 'high' || (aiConf === 'medium' && sttConf === 'high'))) {
        const e = aiEntries[0]
        const desc = e.quantity ? `${e.quantity}${e.unit ?? ''} ${e.item}`.trim() : e.item
        setAiStep('Saving...')
        const insertedAt = new Date().toISOString()
        try {
          const ok = await directSave({
            amount:           e.amount,
            description:      desc,
            type:             e.type || 'expense',
            user_id:          user.id,
            voice_transcript: transcript,
            transaction_date: insertedAt.split('T')[0],
            created_at:       insertedAt,
          })
          if (ok.success) {
            // F3: Soundbox — speak rich confirmation with item name + amount
            setIsAiLoading(false); setAiStep(''); setSaveSuccess(true)
            speakSaved(e.item, e.amount)
            // F4: Micro-Inventory — track qty, alert if stock depleted
            if (e.quantity && e.quantity > 0) {
              const { updated, lowStock } = updateInventory(e.item, e.quantity, e.unit, e.type as 'income' | 'expense', inventory)
              setInventory(updated); saveInventory(updated)
              if (lowStock.length > 0) {
                setLowStockAlerts(lowStock)
                speakLowStock(lowStock[0])
                setTimeout(() => setLowStockAlerts([]), 5000)
              }
            }
            if (ok.offline) setErrorMsg(t.offline)
            setTimeout(() => { setSaveSuccess(false); goToTransactions() }, 1600)
          } else {
            setErrorMsg(ok.error ?? 'Save failed')
            setIsAiLoading(false); setAiStep(''); openManualForm(transcript)
          }
        } catch { openManualForm(transcript) }
        return
      }

      // Multiple items OR medium single → confirm dialog
      setIsAiLoading(false); setAiStep('')
      setConfirmDialog({ transcript, items: toDialogItems(aiEntries) })
      return
    }

    // ── AI unavailable — local parse fallback ────────────────────────────────
    const multiItems = localParseMulti(transcript)
    if (multiItems && multiItems.length >= 2) {
      setIsAiLoading(false); setAiStep('')
      setConfirmDialog({ transcript, items: multiItems.map(e => ({ description: e.item, amount: e.amount, type: e.type as 'income' | 'expense', category: 'General' })) })
      return
    }
    if (local.amount > 0) {
      setFormData({ amount: String(local.amount), description: local.description || transcript, type: local.type, voice_transcript: transcript })
      setShowForm(true); setIsAiLoading(false); setAiStep(''); return
    }
    openManualForm(transcript)
  }, [directSave, goToTransactions, inventory, language, localParseMulti, openManualForm, saveTransaction, speakLowStock, speakSaved, t.offline, user])

  useEffect(() => { processAndSaveRef.current = processAndSave as any }, [processAndSave])

  const handleHoldStart = (e: React.MouseEvent | React.TouchEvent) => {
    if (e.cancelable) e.preventDefault()
    if (!isBusy && !rateLimited) startRecording()
  }
  const handleHoldEnd = (e: React.MouseEvent | React.TouchEvent) => {
    if (e.cancelable) e.preventDefault()
    stopRecording()
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-navy-900">
      <div className="relative flex-1 overflow-y-auto pt-16">

        {/* Offline sync badge */}
        {pendingCount > 0 && (
          <div className="fixed right-4 top-20 z-50 flex animate-pulse items-center gap-2 rounded-full bg-orange-500 px-3 py-1 text-white shadow-lg">
            <Activity size={12} />
            <span className="text-[10px] font-bold uppercase">{pendingCount} Syncing</span>
          </div>
        )}

        {activeTab === 'home' && (
          <div className="flex h-full flex-col items-center justify-center gap-8 px-6">

            {/* AI loading overlay */}
            {isBusy && (
              <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center bg-navy-900/95 backdrop-blur-md">
                <Loader2 className="mb-4 animate-spin text-cyan" size={42} />
                <p className="text-[10px] font-black uppercase tracking-widest text-white">
                  {processingStep || aiStep || t.ai}
                </p>
                {providerUsed && (
                  <p className="mt-1 text-[9px] uppercase tracking-widest text-slate-400">{providerUsed}</p>
                )}
              </div>
            )}

            {/* Save success flash */}
            {saveSuccess && (
              <div className="absolute top-24 z-50 flex items-center gap-2 rounded-full bg-green-500 px-4 py-2 text-white shadow-xl">
                <CheckCircle size={16} />
                <span className="text-xs font-bold uppercase">{t.saved}</span>
              </div>
            )}

            {/* Error banner */}
            {(errorMsg || rateLimited) && (
              <div className="absolute top-20 z-50 flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-white shadow-xl">
                <AlertTriangle size={16} />
                <span className="text-xs font-bold uppercase">
                  {rateLimited ? t.too_fast : errorMsg}
                </span>
              </div>
            )}

            {/* Live transcript card — doubles as Smart Clerk answer display */}
            <div className={`w-full max-w-xs rounded-3xl border-2 bg-navy-800 p-6 transition-all ${
              isRecording ? 'border-cyan shadow-cyan-glow' : queryAnswer ? 'border-cyan/40 shadow-lg' : 'border-navy-600'
            }`}>
              {queryAnswer ? (
                <div className="space-y-2">
                  <p className="text-center text-[10px] font-black uppercase tracking-widest text-cyan">✨ Ziva</p>
                  <p className="text-center text-sm font-semibold text-white leading-relaxed">{queryAnswer}</p>
                  <button
                    onClick={() => setQueryAnswer(null)}
                    className="mx-auto block text-[10px] font-bold text-slate-400 uppercase tracking-widest"
                  >✕ Dismiss</button>
                </div>
              ) : (
                <p className="text-center text-sm font-semibold text-slate-300">
                  {isRecording ? (liveText || t.speak_hint) : t.hold}
                </p>
              )}
            </div>

            {/* F4: Low-stock alert banner */}
            {lowStockAlerts.length > 0 && (
              <div className="flex w-full max-w-xs items-center gap-3 rounded-2xl bg-orange-500 px-4 py-3 text-white shadow-xl">
                <Package size={18} className="shrink-0" />
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest">Low Stock Alert</p>
                  <p className="text-sm font-bold">{lowStockAlerts.join(', ')} — reorder needed</p>
                </div>
              </div>
            )}

            {/* F4: Inventory chip row */}
            {Object.keys(inventory).length > 0 && (
              <div className="flex w-full max-w-xs flex-wrap gap-1.5 justify-center">
                {Object.values(inventory).slice(0, 5).map(item => (
                  <div key={item.name} className={`flex items-center gap-1 rounded-full px-3 py-1 text-[10px] font-black ${
                    item.qty <= 0 ? 'bg-red-900/50 text-red-400' : 'bg-navy-700 text-slate-300'
                  }`}>
                    <span>{item.name}</span>
                    <span className="opacity-60">{item.qty}{item.unit}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Mic button */}
            <div className="relative flex items-center justify-center">
              {/* Pulsating ring — only shown while listening */}
              {isRecording && (
                <span className="absolute inline-flex h-48 w-48 rounded-full bg-cyan/20 animate-ziva-ping" />
              )}
              <button
                onMouseDown={handleHoldStart} onMouseUp={handleHoldEnd} onMouseLeave={handleHoldEnd}
                onTouchStart={handleHoldStart} onTouchEnd={handleHoldEnd} onTouchCancel={handleHoldEnd}
                disabled={isBusy || rateLimited}
                className={`relative flex h-48 w-48 touch-none select-none items-center justify-center rounded-full transition-all
                  ${isRecording
                    ? 'scale-110 bg-navy-800 mic-listening'
                    : 'bg-navy-800 mic-idle active:scale-95'}
                  ${isBusy || rateLimited ? 'opacity-60' : ''}`}
              >
                <Mic size={64} color="#00E5FF" />
              </button>
            </div>

            {/* Action row: Scan Receipt + End-of-Day P&L */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowScanner(true)}
                className="flex items-center gap-2 rounded-2xl border-2 border-navy-600 bg-navy-800 px-5 py-3 shadow-sm active:scale-95"
              >
                <ScanLine size={18} className="text-cyan" />
                <span className="text-sm font-bold text-slate-300">Scan Bill</span>
              </button>

              <button
                onClick={() => void speakPnL()}
                disabled={pnlLoading}
                className="flex items-center gap-2 rounded-2xl bg-cyan px-5 py-3 shadow-cyan-glow active:scale-95 disabled:opacity-50"
              >
                {pnlLoading
                  ? <Loader2 size={18} className="animate-spin text-navy-950" />
                  : <Zap size={18} className="text-navy-950" />}
                <span className="text-sm font-bold text-navy-950">Today's P&L</span>
              </button>
            </div>

            {/* F6: P&L summary card (shown after speak) */}
            {pnlSummary && (
              <div className="w-full max-w-xs rounded-3xl border-2 border-black bg-black p-5 text-white shadow-xl">
                <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-gray-400">End-of-Day Report</p>
                <p className="text-sm font-semibold leading-relaxed">{pnlSummary}</p>
                <button onClick={() => setPnlSummary(null)} className="mt-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest">✕ Close</button>
              </div>
            )}
          </div>
        )}

        {/* ✅ FIX: Pass refreshKey as prop instead of key= (no remount flicker,
            but TransactionList.useEffect([user, refreshKey]) still refetches) */}
        {activeTab === 'transactions' && <TransactionList refreshKey={refreshKey} language={language} />}
        {activeTab === 'dashboard'    && <Dashboard language={language} />}
        {activeTab === 'chat'         && <AiChat />}
        {activeTab === 'reports'      && <Reports language={language} />}
        {activeTab === 'customers'    && <Customers language={language} />}
        {activeTab === 'insights'     && <BusinessInsights />}
        {activeTab === 'staff'        && <StaffManager />}
        {activeTab === 'settings'     && <Settings language={language} setLanguage={setLanguage ?? (() => {})} />}
      </div>

      {/* Bottom nav */}
      <nav className="mx-4 mb-6 flex justify-around rounded-[2.5rem] border border-navy-600 bg-navy-800/90 p-2 shadow-2xl backdrop-blur-md">
        {([
          ['home',         <Mic size={22} />],
          ['transactions', <TrendingUp size={22} />],
          ['dashboard',    <LayoutDashboard size={22} />],
          ['chat',         <MessageSquare size={22} />],
        ] as [Tab, JSX.Element][]).map(([tab, icon]) => (
          <button
            key={tab}
            onClick={() => {
              if (tab === 'transactions') {
                setRefreshKey(k => k + 1)
              }
              setActiveTab(tab)
            }}
            className={`rounded-full p-4 transition-all ${activeTab === tab ? 'bg-cyan text-navy-950 shadow-cyan-glow' : 'text-slate-400'}`}
          >
            {icon}
          </button>
        ))}

        {isOwner && (
          <div className="relative">
            <button
              onClick={() => setShowMoreMenu(v => !v)}
              className={`rounded-full p-4 transition-all ${MORE_TABS.some(m => m.tab === activeTab) ? 'bg-cyan text-navy-950 shadow-cyan-glow' : 'text-slate-400'}`}
            >
              <Brain size={22} />
            </button>
          </div>
        )}
      </nav>

      {/* Brain menu — fixed overlay */}
      {showMoreMenu && (
        <>
          <div className="fixed inset-0 z-[190]" onClick={() => setShowMoreMenu(false)} />
          <div className="fixed bottom-24 right-6 z-[200] w-52 overflow-hidden rounded-3xl border border-navy-600 bg-navy-800 shadow-2xl">
            <p className="px-4 pt-3 pb-1 text-[9px] font-black uppercase tracking-widest text-slate-400">More Features</p>
            {MORE_TABS.map(({ tab, icon, label }) => (
              <button
                key={tab}
                onTouchStart={() => { setActiveTab(tab); setShowMoreMenu(false) }}
                onClick={() => { setActiveTab(tab); setShowMoreMenu(false) }}
                className={`flex w-full items-center gap-3 px-4 py-3.5 text-sm font-bold active:bg-navy-700 ${
                  activeTab === tab ? 'bg-cyan text-navy-950' : 'text-slate-300'
                }`}
              >
                {icon} {label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Transaction form overlay */}
      {showForm && (
        <TransactionForm
          initialData={formData}
          language={language}
          onClose={() => {
            setShowForm(false)
            setFormData({ amount: '', description: '', type: 'expense', voice_transcript: '' })
            setRefreshKey(k => k + 1)
            setActiveTab('transactions')
          }}
        />
      )}

      {/* Receipt scanner overlay */}
      {showScanner && (
        <ReceiptScanner
          onClose={() => setShowScanner(false)}
          onSaved={() => { goToTransactions() }}
        />
      )}

      {/* Confirm & Save dialog */}
      {confirmDialog && (
        <div className="fixed inset-0 z-[150] flex items-end justify-center bg-black/50 backdrop-blur-sm"
             onClick={() => setConfirmDialog(null)}>
          <div className="mb-8 w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl"
               onClick={e => e.stopPropagation()}>

            <p className="mb-3 text-center text-[10px] font-black uppercase tracking-widest text-gray-400">
              {confirmDialog.items.length > 1
                ? `${confirmDialog.items.length} Items — Confirm & Save`
                : 'Did you say?'}
            </p>

            <div className="mb-4 max-h-52 space-y-2 overflow-y-auto">
              {confirmDialog.items.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-3">
                  <span className="mr-2 flex-1 text-sm font-bold text-gray-800">{item.description}</span>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={`text-sm font-black ${item.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                      {item.type === 'income' ? '+' : '-'}₹{item.amount.toLocaleString('en-IN')}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${
                      item.type === 'income' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                      {item.type}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {confirmDialog.items.length > 1 && (
              <div className="mb-4 flex items-center justify-between rounded-2xl bg-black px-4 py-3">
                <span className="text-sm font-black text-white">Total</span>
                <span className="text-lg font-black text-white">
                  ₹{confirmDialog.items.reduce((s, i) => s + i.amount, 0).toLocaleString('en-IN')}
                </span>
              </div>
            )}

            <div className="flex gap-3">
              <button
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-black py-4 font-black text-white active:scale-95"
                onClick={async () => {
                  const d = confirmDialog
                  setConfirmDialog(null)
                  if (!user?.id) return
                  let savedCount = 0
                  let lastError = ''
                  let inv = inventory
                  for (const item of d.items) {
                    const now = new Date().toISOString()
                    const result = await directSave({
                      amount:           item.amount,
                      description:      item.description,
                      type:             item.type,
                      user_id:          user.id,
                      voice_transcript: d.transcript,
                      transaction_date: now.split('T')[0],
                      created_at:       now,
                    })
                    if (result.success) {
                      savedCount++
                      // F4: update inventory per saved item
                      const { updated, lowStock } = updateInventory(item.description, null, null, item.type, inv)
                      inv = updated
                      if (lowStock.length > 0) {
                        setLowStockAlerts(lowStock)
                        speakLowStock(lowStock[0])
                        setTimeout(() => setLowStockAlerts([]), 5000)
                      }
                    } else {
                      lastError = result.error ?? 'Save failed'
                    }
                  }
                  setInventory(inv); saveInventory(inv)
                  if (savedCount > 0) {
                    // F3: Soundbox — speak rich confirmation with total
                    const totalAmt = d.items.reduce((s, i) => s + i.amount, 0)
                    const summaryDesc = d.items.length === 1 ? d.items[0].description : `${d.items.length} items`
                    setSaveSuccess(true)
                    speakSaved(summaryDesc, totalAmt)
                    if (lastError) setErrorMsg(`${lastError} (${savedCount}/${d.items.length} saved)`)
                    setTimeout(() => { setSaveSuccess(false); goToTransactions() }, 1600)
                  } else {
                    setErrorMsg(lastError || 'All saves failed')
                  }
                }}
              >
                <CheckCircle size={18} />
                {confirmDialog.items.length > 1 ? `Save all ${confirmDialog.items.length}` : 'Yes, save'}
              </button>

              <button
                className="flex items-center justify-center gap-2 rounded-2xl border-2 border-gray-100 px-5 py-4 font-black text-gray-700 active:scale-95"
                onClick={() => {
                  const d = confirmDialog; setConfirmDialog(null)
                  const totalAmt = d.items.reduce((s, i) => s + i.amount, 0)
                  const desc = d.items.map(i => i.description).join(', ')
                  const txType = d.items.every(i => i.type === 'income') ? 'income' : 'expense'
                  setFormData({ amount: String(totalAmt), description: desc, type: txType, voice_transcript: d.transcript })
                  setShowForm(true)
                }}
              >
                ✎ Edit
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Staff-only indicator */}
      {isStaff && !isOwner && (
        <div className="fixed bottom-24 left-4 z-50">
          <span className="rounded-full bg-yellow-100 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-yellow-700">
            Staff Mode
          </span>
        </div>
      )}
    </div>
  )
}