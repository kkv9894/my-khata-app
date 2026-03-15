// src/lib/gemini.ts
// ✅ SECURE: All Gemini API calls go through /api/gemini (Vercel serverless).
// No API keys are exposed to the browser. Zero VITE_ keys needed.

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
  const s = raw.indexOf('{'); const e = raw.lastIndexOf('}') + 1;
  if (s === -1 || e === 0) throw new Error('No JSON in response');
  return JSON.parse(raw.substring(s, e).trim());
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
export async function analyzeTransaction(text: string, accountType: 'personal' | 'business' = 'business') {

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
  → Action   (expense or income or udhaar/credit)
  → Person   (for udhaar entries)

The 5 code-switched dialects you MUST handle flawlessly:

1. TANGLISH (Tamil + English) — spoken by Tamil Nadu / Chennai users:
   "Milk ku 50 rupees add pannu."
   → Intent: Add Expense | Amount: 50 | Category: Groceries | Item: milk
   More examples:
   "rice vangirukkean 120"  → expense rice ₹120
   "petrol pottaen 500"     → expense petrol ₹500
   "customer kitta 2000 vandhuchu" → income ₹2000
   "rent kodutten 8000"     → expense rent ₹8000
   "sale achu 5000"         → income sales ₹5000

2. HINGLISH (Hindi + English) — spoken by North India / Hindi belt users:
   "Ramesh ko 500 udhaar diya."
   → Intent: Add Udhaar/Credit | Amount: 500 | Person: Ramesh
   More examples:
   "rice 120 le aya"        → expense rice ₹120
   "salary aayi 25000"      → income salary ₹25000
   "bijli ka bill bhara 800" → expense electricity ₹800
   "doodh liya 42"          → expense milk ₹42

3. TENGLISH (Telugu + English) — spoken by Andhra Pradesh / Telangana users:
   "1000 rupees rent pay chesanu."
   → Intent: Add Expense | Amount: 1000 | Category: Rent
   More examples:
   "biyyam konnanu 90"      → expense rice ₹90
   "palu konnanu 42"        → expense milk ₹42
   "salary vacchindi 18000" → income salary ₹18000
   "customer icchindi 3000" → income ₹3000

4. MANGLISH (Malayalam + English) — spoken by Kerala users:
   "Phone recharge 200 rupees cheythu."
   → Intent: Add Expense | Amount: 200 | Category: Recharge
   More examples:
   "paal vaangichi 42"      → expense milk ₹42
   "salary kitti 20000"     → income salary ₹20000
   "muringakka vaangi 35"   → expense drumstick ₹35
   "rent koduththu 7000"    → expense rent ₹7000

5. KANGLISH (Kannada + English) — spoken by Karnataka / Bangalore users:
   "Suresh ge 300 rupees kotte."
   → Intent: Add Udhaar/Credit | Amount: 300 | Person: Suresh
   More examples:
   "akki tagondu 65"        → expense rice ₹65
   "halu tagondu 48"        → expense milk ₹48
   "rent kottidde 7000"     → expense rent ₹7000
   "customer sikkitu 3000"  → income ₹3000

═══ VERB REFERENCE (strip these from item names) ════════════════════════════════
EXPENSE verbs:
  Tamil:     vanginen / vangitten / vangirukkean / vangirukken / kodutten / pottaen
  Hindi:     liya / kharida / le aya / diya / bhara / kharcha kiya
  Telugu:    konnanu / konnamu / kondi / ichanu / kattanu
  Malayalam: vaangichi / vaangirunnu / vaangi / koduththu / cheythu
  Kannada:   tagondu / tagondidde / kottidde / kharcha maadidde
  English:   bought / paid / spent / got / purchased

INCOME verbs:
  Tamil:     vandhuchu / vanthuchu / kittachu / sale achu / vandhu
  Hindi:     mila / aayi / aaya / diya (received) / milaa
  Telugu:    vacchindi / icchindi / vachindi / vachindhi
  Malayalam: kitti / kittichu / kittunnu / vandhu
  Kannada:   sikkitu / banthu / banthide / sikkidhe

═══ VERBLESS PATTERNS (extremely common — default = expense) ════════════════════
"milk 45"    → expense milk ₹45
"rice 120"   → expense rice ₹120
"2000"       → amount only → low confidence

═══ QUANTITY vs PRICE (critical) ════════════════════════════════════════════════
If a number is followed by g/kg/ml/l/gram/piece/nos → it is QUANTITY, NOT price.
The price is always the last standalone number.
"100g mulagu 80" → qty=100g, amount=80
"2kg onion 80"   → qty=2kg, amount=80
"5 kg biyyam 320" → qty=5kg, amount=320

═══ UDHAAR / CREDIT ════════════════════════════════════════════════════════════
Udhaar = credit given to a customer. Signals: person name + amount + give verb.
"Ramesh ko 500 udhaar diya" → udhaar, person=Ramesh, amount=500
"Suresh ge 300 kotte"       → udhaar, person=Suresh, amount=300
For udhaar: set type="income" (money owed TO shopkeeper), category="Udhaar"

═══ MULTI-ITEM ══════════════════════════════════════════════════════════════════
Each item+amount = SEPARATE entry. NEVER merge.
"petrol 500, arisi 120, paal 42" → 3 separate expense entries

OUTPUT: JSON only. No markdown, no backticks, no extra text.
{
  "is_financial": boolean,
  "confidence": "high" | "medium" | "low",
  "entries": [
    {
      "item": "string (original spoken language — keep paal as paal, arisi as arisi)",
      "amount": number,
      "quantity": number | null,
      "unit": "g" | "kg" | "ml" | "l" | "pack" | "piece" | "unit" | null,
      "type": "income" | "expense",
      "category": "Food" | "Groceries" | "Fuel" | "Salary" | "Rent" | "Sales" | "Shopping" | "Transport" | "Healthcare" | "Utilities" | "Education" | "Entertainment" | "Udhaar" | "General"
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
      amount:      parseFloat(parsed.amount) || 0,
      description: parsed.description || 'Receipt scan',
      category:    parsed.category || 'General',
      date:        parsed.date || new Date().toISOString().split('T')[0],
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

  const isToday  = /today|aaj|innaiku|indu|இன்று|ఇవాళ|ಇಂದು|ഇന്ന്/.test(q);
  const isWeek   = /week|hafte|vaaram|ebhara|வாரம்|వారం|ವಾರ|ആഴ്ച/.test(q);
  const isMonth  = /month|mahine|madam|maasam|this month|மாதம்|నెల|ತಿಂಗಳು|മാസം/.test(q);
  const isYear   = /year|saal|varudam|varsha|வருடம்|సంవత్సరం|ವರ್ಷ|വർഷം/.test(q);
  const period: 'today'|'week'|'month'|'year' =
    isToday ? 'today' : isWeek ? 'week' : isMonth ? 'month' : isYear ? 'year' : 'month';
  const label = isToday ? 'today' : isWeek ? 'this week' : isYear ? 'this year' : 'this month';

  const f = filterByPeriod(transactions, period);
  const totalIn  = (txs: any[]) => txs.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const totalOut = (txs: any[]) => txs.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);

  if (/spend|spent|expense|kharcha|selavu|खर्च|செலவு|ఖర్చు|ಖರ್ಚು|ചെലവ്/.test(q)) {
    const amt = totalOut(f);
    return amt === 0 ? `No expenses recorded ${label}.` : `Your total expenses ${label} are ${fmt(amt)}.`;
  }
  if (/income|earn|received|salary|sales|aaya|vandhuchu|वरुमानம்|వచ్చింది|ಆದಾಯ|വരുമാനം/.test(q)) {
    const amt = totalIn(f);
    return amt === 0 ? `No income recorded ${label}.` : `Your total income ${label} is ${fmt(amt)}.`;
  }
  if (/balance|net|profit|baaki|bakki|மீதி|నెట్|ಬ್ಯಾಲೆನ್ಸ್|ബാലൻസ്/.test(q)) {
    const inc = totalIn(f); const exp = totalOut(f); const net = inc - exp;
    return `${label.charAt(0).toUpperCase() + label.slice(1)}: Income ${fmt(inc)}, Expenses ${fmt(exp)}, Net ${net >= 0 ? '+' : ''}${fmt(net)}.`;
  }
  if (/summary|report|total|pnl|p&l|saaransh|சுருக்கம்|సారాంశం|ಸಾರಾಂಶ|സംഗ്രഹം/.test(q)) {
    const inc = totalIn(f); const exp = totalOut(f); const net = inc - exp;
    return `${label.charAt(0).toUpperCase() + label.slice(1)}: ${f.length} transactions, Income ${fmt(inc)}, Expenses ${fmt(exp)}, Net ${net >= 0 ? '+' : ''}${fmt(net)}.`;
  }
  if (/top|biggest|most|highest|largest/.test(q) && /expense|spend|category/.test(q)) {
    const expenses = f.filter(t => t.type === 'expense');
    if (!expenses.length) return `No expenses found ${label}.`;
    const byCategory: Record<string, number> = {};
    expenses.forEach(t => { const c = t.category_label || 'General'; byCategory[c] = (byCategory[c] || 0) + Number(t.amount); });
    const top3 = Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, a]) => `${c} ${fmt(a)}`).join(', ');
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