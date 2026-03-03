const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

export async function analyzeTransaction(text: string) {
  if (!GEMINI_API_KEY) {
    console.error("Missing Gemini API Key in Environment Variables");
    return null;
  }

  // SYSTEM PROMPT: Optimized for Indian Business Context
  const systemPrompt = `
    You are the AI engine for "My Khata", a business ledger app in India.
    Your job is to extract financial data from this voice note: "${text}"
    
    RULES:
    1. INPUT LANGUAGES: Support English, Hindi (हिन्दी), Tamil (தமிழ்), Telugu (తెలుగు), Kannada (ಕನ್ನಡ), and Malayalam (മലയാളം).
    2. AMOUNT: Extract ONLY the numerical value (e.g., "पाँच सौ" or "five hundred" -> 500).
    3. TYPE: 
       - Use "income" if money is received, earned, or added.
       - Use "expense" if money is spent, paid, or given.
    4. DESCRIPTION: Create a very short, professional note in English.
    
    OUTPUT: Respond ONLY with a valid JSON object. No markdown, no backticks, no extra text.
    FORMAT: {"amount": number, "type": "income" | "expense", "description": "string"}
  `;

  try {
    const response = await fetch(`${API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: systemPrompt }] }],
        generationConfig: {
          temperature: 0.1, // Makes the AI precise and non-creative
          topP: 0.1,
          topK: 1,
        }
      })
    });

    const data = await response.json();
    
    if (data.candidates && data.candidates[0].content.parts[0].text) {
      const rawResult = data.candidates[0].content.parts[0].text;
      
      // SAFETY GUARD: Find the first { and last } to isolate the JSON
      const startJson = rawResult.indexOf('{');
      const endJson = rawResult.lastIndexOf('}') + 1;

      // If no brackets are found, the AI failed to format correctly
      if (startJson === -1 || endJson === 0) {
        console.error("AI Response was not JSON:", rawResult);
        return null;
      }

      const cleanJson = rawResult.substring(startJson, endJson).trim();
      const parsed = JSON.parse(cleanJson);
      
      // Final Clean-up before returning to the App
      return {
        amount: Number(parsed.amount) || 0,
        type: parsed.type === 'income' ? 'income' : 'expense',
        description: parsed.description || "Voice Entry"
      };
    }
    
    return null;
  } catch (error) {
    console.error("Gemini AI Processing Error:", error);
    return null;
  }
}
