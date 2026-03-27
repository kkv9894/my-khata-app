// FILE: src/lib/gemini.ts

// src/lib/gemini.ts
// ✅ SECURE: All Gemini API calls go through /api/gemini (Vercel serverless).
// No API keys are exposed to the browser. Zero VITE_ keys needed.

import type {
  ParsedVoiceEntry,
  ParsedVoiceTransactionResult,
  TransactionCategoryLabel,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL: Shared proxy helper — calls our /api/gemini serverless function
// ─────────────────────────────────────────────────────────────────────────────
const geminiPost = async (body: object, timeoutMs = 15000): Promise<string> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs + 2000);

  let response: Response;
  try {
    response = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({ action: 'post', payload: { body, timeoutMs } }),
    });
  } catch (err: any) {
    clearTimeout(timer);
    if (err?.name === 'AbortError') throw new Error(`Gemini timed out after ${timeoutMs / 1000}s`);
    throw err;
  }
  clearTimeout(timer);

  if (response.status === 429) throw new Error('429 Rate limit');
  if (!response.ok) {
    const errBody = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(errBody?.error ?? `Gemini proxy ${response.status}`);
  }

  const data = await response.json();
  return data?.text ?? '';
};

const extractJson = (raw: string): any => {
  const cleaned = String(raw || '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  const s = cleaned.indexOf('{');
  const e = cleaned.lastIndexOf('}') + 1;
  if (s === -1 || e === 0) throw new Error('No JSON in response');
  return JSON.parse(cleaned.substring(s, e).trim());
};

const VALID_CATEGORIES: TransactionCategoryLabel[] = [
  'Food',
  'Fuel',
  'Salary',
  'Rent',
  'Sales',
  'Shopping',
  'Groceries',
  'Transport',
  'Healthcare',
  'Utilities',
  'Entertainment',
  'Education',
  'Udhaar',
  'General',
];

const normalizeCategory = (value: unknown): TransactionCategoryLabel => {
  const category = String(value || '').trim();
  return (VALID_CATEGORIES.includes(category as TransactionCategoryLabel)
    ? category
    : 'General') as TransactionCategoryLabel;
};

const normalizeConfidence = (value: unknown): 'high' | 'medium' | 'low' => {
  if (value === 'high' || value === 'medium' || value === 'low') return value;
  return 'medium';
};

const toSafeNumber = (value: unknown): number => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

// ─────────────────────────────────────────────────────────────────────────────
// ✅ F1 — SMART CLERK: Detect if voice is a Query or Transaction
// ─────────────────────────────────────────────────────────────────────────────
export async function detectVoiceIntent(
  text: string,
  transactions: any[]
): Promise<{ intent: 'query' | 'transaction'; answer?: string }> {

  const QUERY_SIGNALS = [
    // English
    'how much', 'total', 'what is', 'what are', 'who owes', 'show me', 'tell me',
    'how many', 'balance', 'profit', 'summary', 'report', 'today', 'yesterday', 'this week',
    'last week', 'this month', 'best selling', 'most', 'least', 'average', 'compare',
    // Tamil / Tanglish
    'எவ்வளவு', 'மொத்தம்', 'யார்', 'சரியா', 'எத்தனை', 'பாக்கி', 'என்ன', 'சொல்லு',
    'evvalavu', 'mottam', 'yaaru', 'etthanai', 'baaki', 'solunga', 'sollu', 'solvaen',
    // Hindi / Hinglish
    'कितना', 'कुल', 'किसने', 'बताओ', 'क्या है', 'कितने', 'रिपोर्ट',
    'kitna', 'kul', 'kisne', 'batao', 'kya hai', 'report', 'balance kya',
    // Telugu
    'ఎంత', 'మొత్తం', 'ఎవరు', 'చెప్పండి', 'నివేదిక',
    // Kannada
    'ಎಷ್ಟು', 'ಒಟ್ಟು', 'ಯಾರು', 'ಹೇಳಿ', 'ವರದಿ',
    // Malayalam
    'എത്ര', 'ആകെ', 'ആര്', 'പറയൂ', 'റിപ്പോർട്ട്',
  ];

  const lo = text.toLowerCase();
  const looksLikeQuery = QUERY_SIGNALS.some(s => lo.includes(s.toLowerCase()));
  const hasAmount = /₹|\d+\s*(rs|rupee|rupe|paisa)/i.test(text) || /\d{2,}/.test(text);

  if (hasAmount && !looksLikeQuery) return { intent: 'transaction' };
  if (!looksLikeQuery) return { intent: 'transaction' };

  const txSummary = transactions.slice(0, 100).map(t =>
    `${t.transaction_date}: ${t.type} ₹${t.amount} - ${t.description || 'Voice Entry'}`
  ).join('\n');

  const prompt = `You are Ziva, the Smart Clerk for "ZivaKhata", an Indian small business ledger app.
The user spoke: "${text}"

Recent transactions (newest first):
${txSummary || 'No transactions yet.'}

IDENTITY: If the user asks "who are you", "what is your name", "aap kaun ho", "neenga yaar", or similar in any language, respond with intent="query" and answer="I am Ziva, your smart ledger assistant. How can I help you today?"

TASK: Decide if this is a QUERY (user wants info) or a TRANSACTION (user is recording money).

QUERY examples: "who owes me the most?" "kitna income hua is hafte?" "evvalavu selavaachu indha madam?" "balance kya hai?"
TRANSACTION examples: "petrol 500 vangitten" "milk 45 bought" "rent paid 8000" "rice ₹120"

If QUERY: answer using transaction data. Keep answer to 1-2 short sentences. Use ₹ for amounts. Reply in SAME LANGUAGE as user.

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
    return { intent: 'transaction' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ✅ analyzeTransaction — voice → structured financial entries
// F7: Full code-switching — Tanglish/Hinglish/Telugish/Kanglish/Malayalish
// ─────────────────────────────────────────────────────────────────────────────
export async function analyzeTransaction(
  text: string,
  accountType: 'personal' | 'business' = 'business'
): Promise<ParsedVoiceTransactionResult | null> {

  const personaContext = accountType === 'business'
    ? `You are Ziva, a sharp and professional shop assistant AI for "ZivaKhata". You help Indian shopkeepers track sales, expenses, Udhaar (credit), and inventory via voice. Be precise and fast.`
    : `You are Ziva, a friendly personal finance coach AI for "ZivaKhata". You help individuals track daily expenses, salary, and savings via voice. Be warm and encouraging.`;

  const systemPrompt = `${personaContext}
Analyze this voice input: "${text}"

═══ CRITICAL: INDIAN CODE-SWITCHING LANGUAGE RULE ══════════════════════════════
Users speak in HEAVILY MIXED code-switched languages. They freely combine English
words (milk, rupees, balance, rent, rice, petrol, recharge) with regional Indian
grammar and verbs. This is NOT broken language — it is normal Indian urban speech.

YOUR ABSOLUTE RULE: NEVER fail due to bad grammar, mixed scripts, phonetic
spelling, or incomplete sentences. ALWAYS extract the financial intent:
  → Amount   (any number = money)
  → Item     (what was bought/sold/paid)
  → Action   (expense / income / udhaar)
  → Person   (for udhaar entries)

═══ TRANSACTION TYPE RULES (READ CAREFULLY) ════════════════════════════════════

── EXPENSE (shopkeeper spends money) ────────────────────────────────────────────
Shopkeeper is PAYING money out of pocket for shop costs or stock purchases.
  → Buying wholesale stock:   "50kg sugar vangitten 50000"  → expense ₹50000
  → Shop running costs:       "rent kodutten 8000"          → expense ₹8000
  → Personal purchases:       "milk 45", "petrol 500"       → expense
  RULE: expense verbs = bought/paid/purchased/vangitten/konnanu/vaangichi/tagondu

── INCOME (shopkeeper receives money) ───────────────────────────────────────────
Shopkeeper RECEIVES cash from a customer right now. Money is in hand.
  → Cash sale:   "2kg sugar sold for 2000"                  → income ₹2000
  → Cash sale:   "customer kitta 2000 vandhuchu"            → income ₹2000
  → Cash sale:   "Ramesh 2kg sugar 2000 rupees kudutten"    → income ₹2000
  RULE: income signals = sold/sale achu/vandhuchu/kittachu/vacchindi/kitti/sikkitu

── UDHAAR (credit given — customer will pay later) ──────────────────────────────
Shopkeeper GIVES goods or money to a named person WITHOUT receiving cash yet.
Person name + give verb (without cash received) = UDHAAR.
  → "Ramesh ku 2kg sugar kudutten" (gave to Ramesh, no payment mentioned) → Udhaar
  → "Suresh ge akki kotte" (gave rice to Suresh)                          → Udhaar
  → "Arun ko udhaar diya 500"                                             → Udhaar
  RULE: Udhaar signals = person name + kodutten/kotte/diya/koduthu + NO cash received
  For udhaar: type="income", category="Udhaar" (money is OWED to shopkeeper)

── STRICT RULE: NEVER classify giving items to a customer as EXPENSE ────────────
  ✗ WRONG: "Ramesh ku sugar kudutten" → expense  (NEVER do this)
  ✓ RIGHT: "Ramesh ku sugar kudutten" → income, category=Udhaar (Ramesh owes money)
  Expenses are ONLY for: rent, electricity, wholesale purchases, transport, repairs.

═══ THE 5 CODE-SWITCHED DIALECTS ═══════════════════════════════════════════════

1. TANGLISH (Tamil + English) — Tamil Nadu / Chennai:
   Cash Sale:   "2kg sugar Ramesh kitta 2000 ku vittaen"    → income ₹2000, item=sugar, qty=2kg
   Cash Sale:   "arisi 5kg sale achu 600"                   → income ₹600,  item=arisi, qty=5kg
   Udhaar Sale: "Ramesh ku 2kg sugar kudutten"              → income ₹0, category=Udhaar, person=Ramesh, item=2kg sugar
   Udhaar Sale: "Priya kitta paal 3 packet kudutten baki"   → income, category=Udhaar, person=Priya
   Expense:     "arisi vangitten 50kg 50000"                → expense ₹50000, item=arisi, qty=50kg
   Expense:     "rent kodutten 8000"                        → expense ₹8000

2. HINGLISH (Hindi + English) — North India / Hindi belt:
   Cash Sale:   "Ramesh ne 2kg cheeni kharida 2000 rupees"  → income ₹2000, item=cheeni, qty=2kg
   Cash Sale:   "customer ko 5kg aata becha 300"            → income ₹300,  item=aata, qty=5kg
   Udhaar Sale: "Ramesh ko 2kg cheeni diya udhaar mein"     → income, category=Udhaar, person=Ramesh
   Udhaar Sale: "Suresh ko tel ki bottle di"                → income, category=Udhaar, person=Suresh
   Expense:     "50kg cheeni kharida 50000"                 → expense ₹50000, item=cheeni, qty=50kg
   Expense:     "bijli ka bill bhara 800"                   → expense ₹800

3. TENGLISH (Telugu + English) — Andhra Pradesh / Telangana:
   Cash Sale:   "Ramesh ki 2kg pindi ammanu 200 rupees"     → income ₹200,  item=pindi, qty=2kg
   Cash Sale:   "customer ki biyyam 5kg ammamu 600"         → income ₹600,  item=biyyam, qty=5kg
   Udhaar Sale: "Ramesh ki 2kg biyyam ichanu"               → income, category=Udhaar, person=Ramesh
   Udhaar Sale: "Suresh ki nune litre ichanu"               → income, category=Udhaar, person=Suresh
   Expense:     "50kg biyyam konnanu 50000"                 → expense ₹50000, item=biyyam, qty=50kg

4. MANGLISH (Malayalam + English) — Kerala:
   Cash Sale:   "Ramesh 2kg panjasara vitti 2000 kitti"     → income ₹2000, item=panjasara, qty=2kg
   Cash Sale:   "customer 5kg ari vitti 600 kitti"          → income ₹600,  item=ari, qty=5kg
   Udhaar Sale: "Ramesh nu 2kg panjasara koduthu"           → income, category=Udhaar, person=Ramesh
   Udhaar Sale: "Suresh nu oru litre eṇṇa koduthu"         → income, category=Udhaar, person=Suresh
   Expense:     "50kg panjasara vaangichi 50000"            → expense ₹50000, item=panjasara, qty=50kg

5. KANGLISH (Kannada + English) — Karnataka / Bangalore:
   Cash Sale:   "Ramesh 2kg sakkare maarade 2000 sikkitu"   → income ₹2000, item=sakkare, qty=2kg
   Cash Sale:   "customer ge akki 5kg maarode 600 banthu"   → income ₹600,  item=akki, qty=5kg
   Udhaar Sale: "Ramesh ge 2kg sakkare kotte"               → income, category=Udhaar, person=Ramesh
   Udhaar Sale: "Suresh ge halu litre kotte"                → income, category=Udhaar, person=Suresh
   Expense:     "50kg sakkare tagondu 50000"                → expense ₹50000, item=sakkare, qty=50kg

═══ VERB REFERENCE ══════════════════════════════════════════════════════════════
EXPENSE verbs (shopkeeper pays):
  Tamil:     vanginen / vangitten / vangirukkean / kodutten / pottaen
  Hindi:     liya / kharida / le aya / bhara / kharcha kiya
  Telugu:    konnanu / konnamu / kondi / kattanu
  Malayalam: vaangichi / vaangirunnu / vaangi / koduththu
  Kannada:   tagondu / tagondidde / kottidde
  English:   bought / paid / purchased / spent

INCOME verbs (shopkeeper receives cash):
  Tamil:     vandhuchu / vanthuchu / kittachu / sale achu / vittaen / ammanaen
  Hindi:     mila / aayi / becha / sale hua / customer ne diya
  Telugu:    vacchindi / ammanu / ammamu / ichanu (customer pays)
  Malayalam: kitti / kittichu / vitti / ammanu
  Kannada:   sikkitu / banthu / maarode / hoda

UDHAAR verbs (shopkeeper gives, customer pays later):
  Tamil:     kudutten / kodutten (to person, no cash) / baki / udhar
  Hindi:     diya (to person, no cash) / udhaar diya / baad mein
  Telugu:    ichanu (to person, no cash received) / udhar ichanu
  Malayalam: koduthu (to person) / udhar koduthu
  Kannada:   kotte (to person, no cash) / sali kotte / udhar kotte

═══ QUANTITY vs PRICE ═══════════════════════════════════════════════════════════
Number followed by g/kg/ml/l/gram/piece = QUANTITY, not price.
Last standalone number = PRICE.
  "50kg sugar 50000"   → qty=50, unit=kg, amount=50000
  "2kg sugar 2000"     → qty=2,  unit=kg, amount=2000
  "100g mulagu 80"     → qty=100, unit=g, amount=80

═══ UDHAAR AMOUNT RULE ══════════════════════════════════════════════════════════
If no price is mentioned in an Udhaar entry, set amount=0.
The Customers/Udhaar tab will handle the billing separately.
  "Ramesh ku paal kudutten"  → amount=0, category=Udhaar, person=Ramesh, item=paal

═══ MULTI-ITEM ══════════════════════════════════════════════════════════════════
Each item = SEPARATE entry. Never merge.
"petrol 500, arisi 120, paal 42" → 3 separate entries

OUTPUT: JSON only. No markdown, no backticks, no extra text.
{
  "is_financial": boolean,
  "confidence": "high" | "medium" | "low",
  "entries": [
    {
      "item": "string (keep original spoken word — paal stays paal, arisi stays arisi)",
      "amount": number,
      "quantity": number | null,
      "unit": "g" | "kg" | "ml" | "l" | "pack" | "piece" | "unit" | null,
      "type": "income" | "expense",
      "category": "Food" | "Groceries" | "Fuel" | "Salary" | "Rent" | "Sales" | "Shopping" | "Transport" | "Healthcare" | "Utilities" | "Education" | "Entertainment" | "Udhaar" | "General",
      "customer_name": "string | null (only for Udhaar entries — the person's name)"
    }
  ]
}`;

  try {
    const raw = await geminiPost({
      contents: [{ parts: [{ text: systemPrompt }] }],
      generationConfig: { temperature: 0.1, topP: 0.1, topK: 1 }
    }, 12000);

    if (!raw) {
      console.warn('analyzeTransaction: empty response');
      return null;
    }

    const parsed = extractJson(raw);

    const rawEntries = Array.isArray(parsed.entries)
      ? parsed.entries
      : (
          parsed.amount != null &&
          (
            Number(parsed.amount) > 0 ||
            String(parsed.category || '').trim() === 'Udhaar'
          )
        )
        ? [{
            item: parsed.description || 'Voice Entry',
            amount: parsed.amount,
            type: parsed.type,
            category: parsed.category,
            quantity: parsed.quantity ?? null,
            unit: parsed.unit ?? null,
            customer_name: parsed.customer_name ?? null,
          }]
        : [];

    const entries: ParsedVoiceEntry[] = rawEntries
      .map((e: any): ParsedVoiceEntry | null => {
        const amount = toSafeNumber(e.amount);
        const category = normalizeCategory(e.category);
        const isUdhaar = category === 'Udhaar';

        // Valid:
        // - normal financial entry: amount > 0
        // - Udhaar entry: amount can be 0
        if ((!Number.isFinite(amount)) || amount < 0) return null;
        if (!isUdhaar && amount <= 0) return null;

        const quantity =
          e.quantity != null && e.quantity !== ''
            ? toSafeNumber(e.quantity)
            : null;

        const normalizedQuantity =
          quantity != null && Number.isFinite(quantity) && quantity > 0
            ? quantity
            : null;

        const unit =
          e.unit != null && String(e.unit).trim()
            ? String(e.unit).trim().toLowerCase()
            : null;

        const customerName =
          e.customer_name != null && String(e.customer_name).trim()
            ? String(e.customer_name).trim()
            : null;

        return {
          item: String(e.item || 'Voice Entry').trim(),
          amount,
          quantity: normalizedQuantity,
          unit,
          type: e.type === 'income' ? 'income' : 'expense',
          category,
          customer_name: customerName,
        };
      })
      .filter((entry: ParsedVoiceEntry | null): entry is ParsedVoiceEntry => entry !== null);

    return {
      is_financial: parsed.is_financial !== false,
      confidence: normalizeConfidence(parsed.confidence),
      entries,
    };
  } catch (error) {
    console.error('analyzeTransaction error:', error);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// callGemini — shared text-only helper
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
// scanReceipt — Gemini Vision via secure proxy
// ─────────────────────────────────────────────────────────────────────────────
export const scanReceipt = async (
  base64Image: string,
  mimeType: string
): Promise<{ amount: number; description: string; category: string; date: string } | null> => {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 22000);
    let response: Response;
    try {
      response = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          action: 'scan-receipt',
          payload: { base64Image, mimeType },
        }),
      });
    } catch (err: any) {
      clearTimeout(timer);
      if (err?.name === 'AbortError') throw new Error('Receipt scan timed out');
      throw err;
    }
    clearTimeout(timer);
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData?.error ?? `Receipt scan failed: ${response.status}`);
    }
    const data = await response.json();
    const raw: string = data?.raw ?? '';
    const parsed = extractJson(raw);
    return {
      amount: parseFloat(parsed.amount) || 0,
      description: parsed.description || 'Receipt scan',
      category: parsed.category || 'General',
      date: parsed.date || new Date().toISOString().split('T')[0],
    };
  } catch (err) {
    console.error('scanReceipt error:', err);
    return null;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// askFinancialAI — local-first, then Gemini for complex queries
// ─────────────────────────────────────────────────────────────────────────────

const fmt = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const filterByPeriod = (txs: any[], period: 'today' | 'week' | 'month' | 'year') => {
  const now = new Date();
  const start = new Date();
  if (period === 'today') { start.setHours(0, 0, 0, 0); }
  else if (period === 'week') { start.setDate(now.getDate() - 7); start.setHours(0, 0, 0, 0); }
  else if (period === 'month') { start.setDate(1); start.setHours(0, 0, 0, 0); }
  else if (period === 'year') { start.setMonth(0, 1); start.setHours(0, 0, 0, 0); }
  return txs.filter(t => new Date(t.created_at || t.transaction_date) >= start);
};

const tryLocalAnswer = (question: string, transactions: any[]): string | null => {
  const q = question.toLowerCase().trim();

  const isToday = /today|aaj|innaiku|indu|இன்று|ఇవాళ|ಇಂದು|ഇന്ന്/.test(q);
  const isWeek = /week|hafte|vaaram|ebhara|வாரம்|వారం|ವಾರ|ആഴ്ച/.test(q);
  const isMonth = /month|mahine|madam|maasam|this month|மாதம்|నెల|ತಿಂಗಳು|മാസം/.test(q);
  const isYear = /year|saal|varudam|varsha|வருடம்|సంవత్సరం|ವರ್ಷ|വർഷം/.test(q);
  const period: 'today' | 'week' | 'month' | 'year' =
    isToday ? 'today' : isWeek ? 'week' : isMonth ? 'month' : isYear ? 'year' : 'month';
  const label = isToday ? 'today' : isWeek ? 'this week' : isYear ? 'this year' : 'this month';

  const f = filterByPeriod(transactions, period);
  const totalIn = (txs: any[]) => txs.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const totalOut = (txs: any[]) => txs.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);

  if (/spend|spent|expense|kharcha|selavu|खर्च|செலவு|ఖర్చు|ಖರ್ಚು|ചെലവ്/.test(q)) {
    const amt = totalOut(f);
    return amt === 0 ? `No expenses recorded ${label}.` : `Your total expenses ${label} are ${fmt(amt)}.`;
  }
  if (/income|earn|received|salary|sales|aaya|vandhuchu|வருமானம்|వచ్చింది|ಆದಾಯ|വരുമാനം/.test(q)) {
    const amt = totalIn(f);
    return amt === 0 ? `No income recorded ${label}.` : `Your total income ${label} is ${fmt(amt)}.`;
  }
  if (/balance|net|profit|baaki|bakki|மீதி|నెట్|ಬ್ಯಾಲೆನ್ಸ್|ബാലൻസ്/.test(q)) {
    const inc = totalIn(f);
    const exp = totalOut(f);
    const net = inc - exp;
    return `${label.charAt(0).toUpperCase() + label.slice(1)}: Income ${fmt(inc)}, Expenses ${fmt(exp)}, Net ${net >= 0 ? '+' : ''}${fmt(net)}.`;
  }
  if (/summary|report|total|pnl|p&l|saaransh|சுருக்கம்|సారాంశం|ಸಾರಾಂಶ|സംഗ്രഹം/.test(q)) {
    const inc = totalIn(f);
    const exp = totalOut(f);
    const net = inc - exp;
    return `${label.charAt(0).toUpperCase() + label.slice(1)}: ${f.length} transactions, Income ${fmt(inc)}, Expenses ${fmt(exp)}, Net ${net >= 0 ? '+' : ''}${fmt(net)}.`;
  }
  if (/top|biggest|most|highest|largest/.test(q) && /expense|spend|category/.test(q)) {
    const expenses = f.filter(t => t.type === 'expense');
    if (!expenses.length) return `No expenses found ${label}.`;
    const byCategory: Record<string, number> = {};
    expenses.forEach(t => {
      const c = t.category_label || 'General';
      byCategory[c] = (byCategory[c] || 0) + Number(t.amount);
    });
    const top3 = Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([c, a]) => `${c} ${fmt(a)}`)
      .join(', ');
    return `Top expense categories ${label}: ${top3}.`;
  }
  if (/how many|count|number of|kitne|எத்தனை|ఎన్ని|ಎಷ್ಟು|എത്ര/.test(q)) {
    return `You have ${f.length} transactions recorded ${label}.`;
  }
  if (/last|latest|recent|கடைசி|చివరి|ಕೊನೆ|അവസാന/.test(q)) {
    if (!transactions.length) return 'No transactions recorded yet.';
    const last = transactions[0];
    const d = new Date(last.created_at || last.transaction_date).toLocaleDateString('en-IN');
    return `Last transaction: ${last.type === 'income' ? 'received' : 'spent'} ${fmt(last.amount)} for "${last.description || 'Voice entry'}" on ${d}.`;
  }
  if (/owe|owes|udhaar|udhar|credit|கடன்|అప్పు|ಸಾಲ|കടം/.test(q)) return null;

  return null;
};

export const askFinancialAI = async (
  question: string,
  transactions: any[]
): Promise<string> => {
  if (!transactions.length) return 'No transactions found. Please add some transactions first.';

  const localAnswer = tryLocalAnswer(question, transactions);
  if (localAnswer) return localAnswer;

  try {
    const txSummary = transactions.slice(0, 100).map(t => {
      const d = new Date(t.created_at || t.transaction_date);
      return `${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}: ${t.type} ₹${t.amount} — ${t.description || 'Voice Entry'} [${t.category_label || 'General'}]`;
    }).join('\n');

    const prompt = `You are Ziva, a friendly and intelligent financial assistant for "ZivaKhata".
Recent transactions (newest first):
${txSummary}

User question: "${question}"

Rules: Answer in 2-3 sentences max. Use ₹ for amounts. Be conversational and helpful.
Reply in the SAME language as the question. No markdown, no bullet points.`;

    const answer = await callGemini(prompt);
    return answer.trim() || 'I couldn\'t find relevant data. Try asking about spending, income, or balance.';
  } catch (err: any) {
    console.error('askFinancialAI error:', err);
    if (err?.message?.includes('429')) return 'AI is busy. Basic questions (spend, income, balance) still work — try those!';
    if (err?.message?.includes('timed out')) return 'AI took too long. Basic financial questions still work without AI!';
    return 'I had trouble processing that. Try asking about spending, income, or balance.';
  }
};