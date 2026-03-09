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

  const prompt = `You are the Smart Clerk for "My Khata", an Indian small business ledger app.
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
export async function analyzeTransaction(text: string) {
  if (!GEMINI_API_KEY) { console.error("Missing Gemini API Key"); return null; }

  const systemPrompt = `
You are the AI engine for "My Khata", an Indian business ledger app.
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
// Strategy: Answer common questions LOCALLY from transaction data first.
// Only call Gemini API for complex/unrecognized questions.
// This eliminates 429 rate-limit errors for 90% of queries.
// ─────────────────────────────────────────────────────────────────────────────

// Helper: format Indian rupee amounts nicely
const fmt = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

// Helper: get date boundaries
const getDateRange = (period: 'today' | 'week' | 'month' | 'year') => {
  const now = new Date();
  const start = new Date();
  if (period === 'today') { start.setHours(0, 0, 0, 0); }
  else if (period === 'week') { start.setDate(now.getDate() - 7); start.setHours(0, 0, 0, 0); }
  else if (period === 'month') { start.setDate(1); start.setHours(0, 0, 0, 0); }
  else if (period === 'year') { start.setMonth(0, 1); start.setHours(0, 0, 0, 0); }
  return { start, end: now };
};

// Helper: filter transactions by period
const filterByPeriod = (txs: any[], period: 'today' | 'week' | 'month' | 'year') => {
  const { start } = getDateRange(period);
  return txs.filter(t => {
    const d = new Date(t.created_at || t.transaction_date);
    return d >= start;
  });
};

// Local computation engine — answers most questions without any API call
const tryLocalAnswer = (question: string, transactions: any[]): string | null => {
  const q = question.toLowerCase().trim();

  // ── Period detection ───────────────────────────────────────────────────────
  const isToday   = /today|aaj|innaiku|indu/.test(q);
  const isWeek    = /week|hafte|vaaram|ebhara/.test(q);
  const isMonth   = /month|mahine|madam|maasam|this month/.test(q);
  const isYear    = /year|saal|varudam|varsha/.test(q);
  const period: 'today'|'week'|'month'|'year' =
    isToday ? 'today' : isWeek ? 'week' : isMonth ? 'month' : isYear ? 'year' : 'month';
  const periodLabel = isToday ? 'today' : isWeek ? 'this week' : isYear ? 'this year' : 'this month';

  const filtered = filterByPeriod(transactions, period);
  const allTime  = transactions;

  const totalIn  = (txs: any[]) => txs.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const totalOut = (txs: any[]) => txs.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);

  // ── SPEND questions ────────────────────────────────────────────────────────
  if (/spend|spent|expense|kharcha|selavu|खर्च|செலவு|ఖర్చు|ಖರ್ಚು|ചെലവ്/.test(q)) {
    const amt = totalOut(filtered);
    if (amt === 0) return `You have no expenses recorded ${periodLabel}.`;
    return `Your total expenses ${periodLabel} are ${fmt(amt)}.`;
  }

  // ── INCOME questions ───────────────────────────────────────────────────────
  if (/income|earn|received|salary|sales|aaya|vandhuchu|వచ్చింది|வந்தது/.test(q)) {
    const amt = totalIn(filtered);
    if (amt === 0) return `No income recorded ${periodLabel}.`;
    return `Your total income ${periodLabel} is ${fmt(amt)}.`;
  }

  // ── BALANCE / NET questions ────────────────────────────────────────────────
  if (/balance|net|profit|baaki|bakki|மீதி|నెట్|ಬ್ಯಾಲೆನ್ಸ್/.test(q)) {
    const inc = totalIn(filtered);
    const exp = totalOut(filtered);
    const net = inc - exp;
    return `${periodLabel.charAt(0).toUpperCase() + periodLabel.slice(1)}: Income ${fmt(inc)}, Expenses ${fmt(exp)}, Net ${net >= 0 ? '+' : ''}${fmt(net)}.`;
  }

  // ── SUMMARY / P&L ─────────────────────────────────────────────────────────
  if (/summary|report|total|pnl|p&l|saaransh|சுருக்கம்/.test(q)) {
    const inc = totalIn(filtered);
    const exp = totalOut(filtered);
    const net = inc - exp;
    const txCount = filtered.length;
    return `${periodLabel.charAt(0).toUpperCase() + periodLabel.slice(1)} summary: ${txCount} transactions, Income ${fmt(inc)}, Expenses ${fmt(exp)}, Net ${net >= 0 ? '+' : ''}${fmt(net)}.`;
  }

  // ── TOP / BIGGEST expense ─────────────────────────────────────────────────
  if (/top|biggest|most|highest|largest|maximum/.test(q) && /expense|spend|category/.test(q)) {
    const expenses = filtered.filter(t => t.type === 'expense');
    if (expenses.length === 0) return `No expenses found ${periodLabel}.`;

    // Group by category
    const byCategory: Record<string, number> = {};
    expenses.forEach(t => {
      const cat = t.category_label || 'General';
      byCategory[cat] = (byCategory[cat] || 0) + Number(t.amount);
    });
    const sorted = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
    const top3 = sorted.slice(0, 3).map(([cat, amt]) => `${cat} ${fmt(amt)}`).join(', ');
    return `Your top expense categories ${periodLabel}: ${top3}.`;
  }

  // ── BIGGEST single transaction ────────────────────────────────────────────
  if (/biggest|largest|highest|most expensive/.test(q) && !/category/.test(q)) {
    const expenses = filtered.filter(t => t.type === 'expense');
    if (expenses.length === 0) return `No expenses found ${periodLabel}.`;
    const top = expenses.sort((a, b) => Number(b.amount) - Number(a.amount))[0];
    return `Your biggest expense ${periodLabel} was ${fmt(top.amount)} for "${top.description || 'Voice entry'}".`;
  }

  // ── WHO OWES / UDHAAR ─────────────────────────────────────────────────────
  if (/owe|owes|udhaar|udhar|credit|கடன்|అప్పు|ಸಾಲ|കടം/.test(q)) {
    return null; // Pass to Gemini — needs udhaar_transactions table data
  }

  // ── COUNT transactions ─────────────────────────────────────────────────────
  if (/how many|count|number of|kitne/.test(q)) {
    return `You have ${filtered.length} transactions recorded ${periodLabel}.`;
  }

  // ── LAST / RECENT transaction ──────────────────────────────────────────────
  if (/last|latest|recent|recent|最近|сondi|கடைசி/.test(q)) {
    if (allTime.length === 0) return 'No transactions recorded yet.';
    const last = allTime[0];
    const d = new Date(last.created_at || last.transaction_date).toLocaleDateString('en-IN');
    return `Your last transaction was ${last.type === 'income' ? 'received' : 'spent'} ${fmt(last.amount)} for "${last.description || 'Voice entry'}" on ${d}.`;
  }

  // ── FOOD / SPECIFIC CATEGORY ───────────────────────────────────────────────
  if (/food|grocery|groceries|fuel|petrol|rent|transport|medicine|health/.test(q)) {
    const keyword = /food/.test(q) ? 'Food'
                  : /grocery|groceries/.test(q) ? 'Groceries'
                  : /fuel|petrol/.test(q) ? 'Fuel'
                  : /rent/.test(q) ? 'Rent'
                  : /transport/.test(q) ? 'Transport'
                  : /medicine|health/.test(q) ? 'Healthcare'
                  : null;
    if (keyword) {
      const catTxs = filtered.filter(t =>
        t.type === 'expense' &&
        (t.category_label === keyword || (t.description || '').toLowerCase().includes(keyword.toLowerCase()))
      );
      const amt = catTxs.reduce((s: number, t: any) => s + Number(t.amount), 0);
      if (amt === 0) return `No ${keyword.toLowerCase()} expenses found ${periodLabel}.`;
      return `You spent ${fmt(amt)} on ${keyword.toLowerCase()} ${periodLabel} across ${catTxs.length} transactions.`;
    }
  }

  // Not handled locally → fall through to Gemini
  return null;
};

export const askFinancialAI = async (
  question: string,
  transactions: any[]
): Promise<string> => {
  if (!transactions.length) return 'No transactions found. Please add some transactions first.';

  // ── Step 1: Try to answer locally — zero API calls, instant response ───────
  const localAnswer = tryLocalAnswer(question, transactions);
  if (localAnswer) return localAnswer;

  // ── Step 2: Complex query — call Gemini with transaction summary ───────────
  if (!GEMINI_API_KEY) return 'AI key not set. Add VITE_GEMINI_API_KEY to your .env file.';

  try {
    // Send only last 100 transactions to stay within token limits
    const txSummary = transactions.slice(0, 100).map(t => {
      const d = new Date(t.created_at || t.transaction_date);
      const dateStr = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
      const timeStr = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
      return `${dateStr} ${timeStr}: ${t.type} ₹${t.amount} — ${t.description || 'Voice Entry'} [${t.category_label || 'General'}]`;
    }).join('\n');

    const prompt = `You are a friendly financial assistant for "My Khata", an Indian small-business ledger app.
Recent transactions (newest first):
${txSummary}

User question: "${question}"

Rules:
- Answer in 2-3 sentences max. Use ₹ for amounts with Indian formatting (e.g. ₹1,500).
- Be conversational and helpful. If data is insufficient, say so clearly.
- Reply in the SAME language as the question (Hindi/Tamil/Telugu/Kannada/Malayalam/English).
- No markdown, no bullet points, no headers — plain text only.`;

    const answer = await callGemini(prompt);
    return answer.trim() || 'I couldn\'t find relevant data to answer that. Try asking about spending, income, or balance.';

  } catch (err: any) {
    console.error('askFinancialAI error:', err);
    // Friendly error messages without exposing internals
    if (err?.message?.includes('429'))
      return 'AI is getting many requests right now. Your basic questions (spend, income, balance) still work — try asking those!';
    if (err?.message?.includes('400'))
      return 'I couldn\'t process that question. Try rephrasing it, like "How much did I spend this month?"';
    if (err?.message?.includes('API key') || err?.message?.includes('Missing'))
      return 'AI key issue — check VITE_GEMINI_API_KEY in your .env file.';
    if (err?.message?.includes('timed out'))
      return 'AI took too long to respond. Your basic financial questions still work without AI!';
    return 'I had trouble processing that. Try asking about spending, income, or your balance.';
  }
};