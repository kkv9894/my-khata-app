// lib/gemini.ts

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL: Shared fetch helper with AbortController timeout
// ─────────────────────────────────────────────────────────────────────────────
const geminiPost = async (body: object, timeoutMs = 15000): Promise<string> => {
  if (!GEMINI_API_KEY) throw new Error("Missing VITE_GEMINI_API_KEY in .env");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify(body),
    });
  } catch (err: any) {
    clearTimeout(timer);
    if (err?.name === 'AbortError') throw new Error(`Gemini timed out after ${timeoutMs / 1000}s`);
    throw err;
  }
  clearTimeout(timer);

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error(`Gemini ${response.status}: ${errBody.slice(0, 120)}`);
  }
  const data = await response.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
};

const extractJson = (raw: string): any => {
  const s = raw.indexOf('{'); const e = raw.lastIndexOf('}') + 1;
  if (s === -1 || e === 0) throw new Error('No JSON in response');
  return JSON.parse(raw.substring(s, e).trim());
};

// ─────────────────────────────────────────────────────────────────────────────
// ✅ F1 — SMART CLERK: Detect if voice is a Query or Transaction
// Called BEFORE analyzeTransaction so questions never open the save form.
// Returns { intent: 'query', answer: string } or { intent: 'transaction' }
// ─────────────────────────────────────────────────────────────────────────────
export async function detectVoiceIntent(
  text: string,
  transactions: any[]
): Promise<{ intent: 'query' | 'transaction'; answer?: string }> {
  if (!GEMINI_API_KEY) return { intent: 'transaction' }; // no key → treat as transaction

  // Fast local heuristic — avoid an API call for obvious transactions
  const QUERY_SIGNALS = [
    // English
    'how much','total','what is','what are','who owes','show me','tell me',
    'how many','balance','profit','summary','report','today','yesterday','this week',
    'last week','this month','best selling','most','least','average','compare',
    // Tamil / Tanglish
    'எவ்வளவு','மொத்தம்','யார்','சரியா','எத்தனை','பாக்கி','என்ன','சொல்லு',
    'evvalavu','mottam','yaaru','etthanai','baaki','solunga','sollu','solvaen',
    // Hindi / Hinglish
    'कितना','कुल','किसने','बताओ','क्या है','कितने','रिपोर्ट',
    'kitna','kul','kisne','batao','kya hai','report','balance kya',
    // Telugu
    'ఎంత','మొత్తం','ఎవరు','చెప్పండి','నివేదిక',
    // Kannada
    'ಎಷ್ಟು','ಒಟ್ಟು','ಯಾರು','ಹೇಳಿ','ವರದಿ',
    // Malayalam
    'എത്ര','ആകെ','ആര്','പറയൂ','റിപ്പോർട്ട്',
  ];

  const lo = text.toLowerCase();
  const looksLikeQuery = QUERY_SIGNALS.some(s => lo.includes(s.toLowerCase()));
  const hasAmount = /₹|\d+\s*(rs|rupee|rupe|paisa)/i.test(text) || /\d{2,}/.test(text);

  // If it has a clear amount AND NO query signal → skip AI, treat as transaction
  if (hasAmount && !looksLikeQuery) return { intent: 'transaction' };
  // If no query signals at all → transaction
  if (!looksLikeQuery) return { intent: 'transaction' };

  // Call Gemini to classify and answer
  const txSummary = transactions.slice(0, 100).map(t =>
    `${t.transaction_date}: ${t.type} ₹${t.amount} - ${t.description || 'Voice Entry'}`
  ).join('\n');

  const prompt = `You are Ziva, a highly intelligent, fast, and friendly financial AI assistant for the "My Khata" app. You help Indian shopkeepers and individuals track their money via voice.

IDENTITY: If the user asks "who are you", "what is your name", "aap kaun ho", "neenga yaar", or any equivalent in any language, respond with intent="query" and answer="I am Ziva, your smart ledger assistant. How can I help you today?"

The user spoke: "${text}"

Recent transactions (newest first):
${txSummary || 'No transactions yet.'}

TASK: Decide if this is a QUERY (user wants to know something) or a TRANSACTION (user is recording a sale/expense).

QUERY examples (user wants information):
- "who owes me the most?" → query
- "what are today's total sales?" → query
- "kitna income hua is hafte?" → query
- "evvalavu selavaachu indha madam?" → query
- "show me this month's expenses" → query
- "balance kya hai?" → query

TRANSACTION examples (user is recording money):
- "petrol 500 vangitten" → transaction
- "milk 45 bought" → transaction
- "rent paid 8000" → transaction
- "customer gave 2000" → transaction
- "rice ₹120" → transaction

If QUERY: answer it using the transaction data above. Keep answer to 1-2 short sentences.
Use ₹ for amounts. Reply in the SAME LANGUAGE as the user spoke.

OUTPUT: JSON only, no markdown.
{"intent": "query" | "transaction", "answer": "string (only if intent=query, else null)"}`;

  try {
    const raw = await geminiPost({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, topP: 0.1, topK: 1 }
    }, 10000);

    const parsed = extractJson(raw);
    if (parsed.intent === 'query' && parsed.answer) {
      return { intent: 'query', answer: String(parsed.answer).trim() };
    }
    return { intent: 'transaction' };
  } catch (err) {
    console.warn('detectVoiceIntent error (safe fallback):', err);
    return { intent: 'transaction' }; // safe fallback — never block saves
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ✅ analyzeTransaction — voice → structured financial entries
// F7: Enhanced code-switching prompt — Tanglish/Hinglish/Telugish/Kannglish/
//     Malayalish + non-standard grammar + missing verb patterns + number words
// ─────────────────────────────────────────────────────────────────────────────
export async function analyzeTransaction(text: string, accountType: 'personal' | 'business' = 'business') {
  if (!GEMINI_API_KEY) { console.error("Missing Gemini API Key"); return null; }

  // Dynamic persona based on account type
  const personaContext = accountType === 'business'
    ? `You are Ziva, a sharp and professional shop assistant AI for "My Khata". You help Indian shopkeepers track sales, expenses, Udhaar (credit), and inventory via voice. Be precise and fast.`
    : `You are Ziva, a friendly personal finance coach AI for "My Khata". You help individuals track daily expenses, salary, and savings via voice. Be warm and encouraging.`

  const systemPrompt = `${personaContext}
Analyze this voice input: "${text}"

LANGUAGE: The user speaks in English, Hindi, Tamil, Telugu, Kannada, Malayalam,
OR any mixed dialect: Tanglish, Hinglish, Kannglish, Telugish, Malayalish,
or any code-switched combination. Handle ALL natively.

═══ F7: CODE-SWITCHING MASTERY ════════════════════════════════════════════════
Study these real Indian speech patterns — INCOMPLETE SENTENCES ARE NORMAL:

TANGLISH (Tamil + English) — PRESENT PERFECT is most common in spoken Tamil:
"rice vangirukkean 50"     → vangirukkean=I have bought (present perfect), expense rice ₹50
"petrol pottaen 500"       → pottaen=I filled, expense petrol ₹500
"milk vanginen 45"         → vanginen=I bought (simple past), expense milk ₹45
"turmeric powder vangirukkean 100" → expense turmeric powder ₹100
"chilli powder vangirukken 50"     → vangirukken=same as vangirukkean, expense chilli powder ₹50
"rent kodutten 8000"       → kodutten=I paid, expense rent ₹8000
"customer kitta 2000 vandhuchu"    → vandhuchu=received, income ₹2000
"100g mulagu 80 arisi 120 paal 42" → 3 items: chilli ₹80, rice ₹120, milk ₹42
"sambalam vandhuchu 15000" → sambalam=salary, income ₹15000
"sale achu 5000"           → sales income ₹5000
"petrol 500 pottaen, arisi 120 vangirukkean, paal 42 vangirukkean" → 3 separate expense entries

SARVAM OUTPUTS ENGLISH WORDS IN TAMIL SCRIPT — treat identically to English:
"மை்ஸ் vangirukkean 50"   → மை்ஸ் is Tamil-script transliteration of "rice", expense rice ₹50
"மிளகாய் தூள் vangirukken 50" → expense chilli powder ₹50
"மஞ்சள் தூள் vangirukkean 100" → expense turmeric powder ₹100
"பெட்ரோல் pottaen 500"    → expense petrol ₹500

TANGLISH VERB FORMS — DO NOT include these in the item name field:
BOUGHT: vanginen / vangitten / vangirukkean / vangirukken / vangirukkiren / vangikiren / vangirukkirean
PAID: kodutten / koduthen / kuduthen / bill katti / pottaen
RECEIVED: vandhuchu / vanthuchu / vandhu / kittachu / sale achu
Strip all verbs from item: "rice vangirukkean" → item="rice" not "rice vangirukkean"

HINGLISH (Hindi + English):
"rice 120 le aya"          → expense rice ₹120
"chai pee li 30 ka"        → expense tea ₹30
"customer ne diya 2000"    → income ₹2000
"salary aayi 25000"        → income salary ₹25000
"bijli ka bill bhara 800"  → expense electricity ₹800
"sabzi wale ko diya 250"   → expense vegetables ₹250
"rice liya 50, atta liya 80, doodh liya 42" → 3 separate expense items

TELUGISH (Telugu + English):
"biyyam konnanu 90"        → konnanu=I bought, expense rice ₹90
"rice konnamu 120"         → konnamu=we bought, expense rice ₹120
"salary vacchindi 18000"   → vacchindi=received, income ₹18000
"kodi guddu 6 60 rupayalu" → 6 eggs ₹60, expense
"palu konnanu 42, biyyam konnanu 90" → 2 separate expense items

KANGLISH (Kannada + English):
"akki tagondu 65"          → tagondu=I bought, expense rice ₹65
"akki tagondidde 65"       → tagondidde=I have bought (present perfect), expense rice ₹65
"halu tagondu 48"          → halu=milk, expense ₹48
"rent kottidde 7000"       → kottidde=I have paid, expense rent ₹7000
"customer sikkitu 3000"    → sikkitu=received, income ₹3000

MALAYALISH (Malayalam + English):
"paal vaangichi 42"        → vaangichi=I bought, expense milk ₹42
"paal vaangirunnu 42"      → vaangirunnu=I had bought (past perfect), expense milk ₹42
"salary kitti 20000"       → kitti=received, income ₹20000
"muringakka vaangi 35"     → vaangi=bought, expense drumstick ₹35
"rice vaangichi 80, paal vaangichi 42" → 2 separate expense items

VERBLESS (item + price only — very common in Indian shops):
"milk 45"    → expense milk ₹45
"rice 120"   → expense rice ₹120
"2000"       → amount only → low confidence
Default verbless = expense UNLESS context implies income

NON-STANDARD GRAMMAR (grammatically wrong but financially clear):
"me rice 50 bought" → expense rice ₹50
"yesterday petrol 500 maeni paid" → expense petrol ₹500
"customer 2000 ka diya aaj" → income ₹2000


═══ STEP 1 — IS THIS REAL FINANCE? ════════════════════════════════════════════
REAL = amount (any form) + item/action. Verb optional.
NOT REAL = pure conversation: "hello", "testing", "what is this", "okay sir"
ALWAYS FINANCIAL if: ₹ symbol, OR Indian number word, OR financial verb present
Indian text + number = ALMOST ALWAYS financial

═══ STEP 2 — EXTRACT ALL ITEMS ════════════════════════════════════════════════
Each item+amount = SEPARATE entry. NEVER merge separate items.
CRITICAL: Keep item names in ORIGINAL SPOKEN LANGUAGE:
  paal → paal   arisi → arisi   biyyam → biyyam   akki → akki   doodh → doodh

Per item:
- item: the THING purchased/sold — max 4 words, NO transaction verbs.
  Strip from item: um/ah/okay/sir/madam AND all transaction verbs:
  vangirukkean/vanginen/vangirukken/vangirukkiren (Tamil bought)
  kodutten/koduthen/pottaen (Tamil paid/filled)
  konnanu/konnamu/kondi (Telugu bought)
  tagondu/tagondidde (Kannada bought)
  vaangichi/vaangirunnu/vaangi (Malayalam bought)
  le aya/liya/kharida (Hindi bought)
  Example: "rice vangirukkean" → item="rice", "paal vaangichi" → item="paal"
- amount: price in ₹ ONLY. weight/qty ≠ price
- quantity: weight/count if given (100 for "100g mulagu 80"), else null
- unit: g/kg/ml/l/pack/piece/unit/null
- type: "income" | "expense"
- category: Food/Groceries/Fuel/Salary/Rent/Sales/Shopping/Transport/Healthcare/Utilities/Education/Entertainment/General

AMOUNT vs WEIGHT — CRITICAL. Weight/qty numbers are NEVER the price:
RULE: If a number is immediately followed by a unit (g/kg/ml/l/gram/litre/piece/nos), it is QUANTITY not PRICE.
The PRICE is always a standalone number without a unit suffix, usually the LAST number.

"100g mulagu 80"         → qty=100g, amount=80    (100 is grams, 80 is price)
"200g rice 60"           → qty=200g, amount=60    (200 is grams, 60 is price)  
"200 gram rice 60"       → qty=200g, amount=60    (200 gram = quantity)
"500ml oil 95"           → qty=500ml, amount=95   (500ml = quantity)
"2kg onion 80"           → qty=2kg, amount=80     (2kg = quantity)
"100g mulagu 80 arisi 120 paal 42" → 3 items: chilli qty=100g ₹80, rice ₹120, milk ₹42
"100 grams mulagu vaangichi 80"    → qty=100g, amount=80 (vaangichi=bought in Malayalam)
"200 gram rice vaangirunnu 60"     → qty=200g, amount=60
"5 kg biyyam konnanu 320"          → qty=5kg, amount=320 (konnanu=bought in Telugu)
"₹80 100g chilli"        → amount=80, qty=100g   (₹ explicitly marks price)
"petrol 500"             → amount=500, qty=null   (no unit = pure price)
"6 eggs 60"              → qty=6, unit=piece, amount=60

⚠ NEVER use the weight/quantity number as the amount.
⚠ If only weight given and no separate price number: set confidence=low, amount=0.

═══ STEP 3 — CONFIDENCE ═══════════════════════════════════════════════════════
high   = clear amount + clear item → auto-save
medium = amount OK, item or type uncertain → show confirm
low    = amount unclear OR pure amount only → ask user

═══ STEP 4 — TYPE ══════════════════════════════════════════════════════════════
INCOME verbs: received/got/earned/gave me/vanthuchu/kitti/mila/vandhu/sale/
  sold/commission/bonus/vacchindi/banthu/kittichu/kottaru/sambalam/salary/
  koduththaar/kuduthar/vandhuchu/vandhu/baki vandhu/udhar wapas/aaya
EXPENSE verbs: spent/paid/bought/petrol/rent/bill/vanginen/kodutten/kharida/
  diya/konnatlu/tagondu/kottidde/vaangichi/koduthu/le aya/kharcha/selavu
Default = expense

OUTPUT: JSON only. No markdown, no backticks, no extra text.
{
  "is_financial": boolean,
  "confidence": "high" | "medium" | "low",
  "entries": [
    {
      "item": "string (original spoken language)",
      "amount": number,
      "quantity": number | null,
      "unit": "g" | "kg" | "ml" | "l" | "pack" | "piece" | "unit" | null,
      "type": "income" | "expense",
      "category": "string"
    }
  ]
}`;

  try {
    const raw = await geminiPost({
      contents: [{ parts: [{ text: systemPrompt }] }],
      generationConfig: { temperature: 0.1, topP: 0.1, topK: 1 }
    }, 12000);

    if (!raw) { console.warn('analyzeTransaction: empty response'); return null; }

    const parsed = extractJson(raw);

    const rawEntries = Array.isArray(parsed.entries) ? parsed.entries
      : parsed.amount > 0
        ? [{ item: parsed.description || 'Voice Entry', amount: parsed.amount, type: parsed.type, category: parsed.category, quantity: null, unit: null }]
        : [];

    const entries = rawEntries
      .filter((e: any) => Number(e.amount) > 0)
      .map((e: any) => ({
        item:     String(e.item || 'Voice Entry').trim(),
        amount:   Number(e.amount),
        quantity: e.quantity != null ? Number(e.quantity) : null,
        unit:     e.unit || null,
        type:     e.type === 'income' ? 'income' : 'expense',
        category: e.category || 'General',
      }));

    return {
      is_financial: parsed.is_financial !== false,
      confidence:   parsed.confidence || 'medium',
      entries,
    };
  } catch (error) {
    console.error('analyzeTransaction error:', error);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// callGemini — shared text-only helper (used by AiChat + BusinessInsights)
// ─────────────────────────────────────────────────────────────────────────────
const callGemini = async (prompt: string): Promise<string> => {
  const text = await geminiPost({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.1, topP: 0.1, topK: 1 }
  }, 15000);
  if (!text) throw new Error('Empty response from Gemini');
  return text;
};

// ─────────────────────────────────────────────────────────────────────────────
// scanReceipt — Gemini Vision for receipt/bill scanning
// ─────────────────────────────────────────────────────────────────────────────
export const scanReceipt = async (
  base64Image: string,
  mimeType: string
): Promise<{ amount: number; description: string; category: string; date: string } | null> => {
  if (!GEMINI_API_KEY) { console.error("Missing Gemini API Key"); return null; }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    let response: Response;
    try {
      response = await fetch(`${API_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { mime_type: mimeType, data: base64Image } },
              { text: `You are scanning a receipt for an Indian Khata (ledger) app.
CATEGORIES: Groceries, Food, Transport, Fuel, Rent, Utilities, Shopping, Healthcare, Education, General
Extract: total amount (number only), short description (max 6 words, English), best category, date (YYYY-MM-DD or today: ${new Date().toISOString().split('T')[0]}).
OUTPUT: JSON only, no markdown.
{"amount": 250, "description": "Grocery shopping", "category": "Groceries", "date": "2024-01-15"}` }
            ]
          }],
          generationConfig: { temperature: 0.1, topP: 0.1, topK: 1 }
        })
      });
    } catch (err: any) {
      clearTimeout(timer);
      if (err?.name === 'AbortError') throw new Error('Receipt scan timed out');
      throw err;
    }
    clearTimeout(timer);
    if (!response.ok) throw new Error(`Gemini Vision ${response.status}`);
    const data = await response.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const parsed = extractJson(raw);
    return {
      amount:      parseFloat(parsed.amount) || 0,
      description: parsed.description || 'Receipt scan',
      category:    parsed.category || 'General',
      date:        parsed.date || new Date().toISOString().split('T')[0]
    };
  } catch (err) {
    console.error('scanReceipt error:', err);
    return null;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// askFinancialAI — AI chat assistant
// ─────────────────────────────────────────────────────────────────────────────
export const askFinancialAI = async (
  question: string,
  transactions: any[]
): Promise<string> => {
  if (!GEMINI_API_KEY) return 'AI key not set. Add VITE_GEMINI_API_KEY to your .env file.';
  try {
    const txSummary = transactions.slice(0, 150).map(t =>
      `${t.transaction_date}: ${t.type} ₹${t.amount} - ${t.description || 'Voice Entry'}`
    ).join('\n');

    const prompt = `You are Ziva, a friendly and intelligent financial assistant for "My Khata", an Indian small-business ledger app. You are sharp, warm, and always helpful.
Recent transactions (newest first):
${txSummary || 'No transactions recorded yet.'}

User asks: "${question}"

Rules: Answer in 2-3 sentences max. Use ₹ for amounts. Be conversational and friendly — you are Ziva, their smart ledger assistant.
If data is insufficient, say so clearly. Reply in the SAME language as the user.
No markdown, no bullet points, no headers.`;

    const answer = await callGemini(prompt);
    return answer.trim() || 'No data found. Please add some transactions first.';
  } catch (err: any) {
    console.error('askFinancialAI error:', err);
    if (err?.message?.includes('429')) return 'AI is busy right now. Please wait a moment and try again.';
    if (err?.message?.includes('400')) return 'Could not process that question. Try rephrasing it.';
    if (err?.message?.includes('API key') || err?.message?.includes('Missing')) return 'AI key issue — check VITE_GEMINI_API_KEY in .env';
    if (err?.message?.includes('timed out')) return 'AI took too long. Please try again.';
    return `AI error: ${err?.message ?? 'Unknown error'}`;
  }
};