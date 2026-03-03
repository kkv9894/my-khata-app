const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

export async function analyzeTransaction(text: string) {
  if (!GEMINI_API_KEY) {
    console.error("Missing Gemini API Key");
    return null;
  }

  // WE MADE THE PROMPT STRICKER AND TOLD IT TO HANDLE INDIAN LANGUAGES
  const systemPrompt = `
    You are a professional financial assistant for an Indian app called "My Khata".
    Task: Extract data from this voice note: "${text}"
    
    Rules:
    1. Language: The input might be in English, Hindi, Tamil, Telugu, Kannada, or Malayalam.
    2. amount: Extract ONLY the number (e.g., "five hundred" -> 500).
    3. type: If money is received/earned, use "income". If money is spent/given, use "expense".
    4. description: A short, clear note in English about what happened.
    
    IMPORTANT: Respond ONLY with a valid JSON object. Do not include markdown or backticks.
    Example Format: {"amount": 500, "type": "expense", "description": "Tea and snacks"}
  `;

  try {
    const response = await fetch(`${API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: systemPrompt }] }],
        // We add generationConfig to ensure it stays focused on JSON
        generationConfig: {
          temperature: 0.1,
          topP: 0.1,
          topK: 1,
        }
      })
    });

    const data = await response.json();
    
    if (data.candidates && data.candidates[0].content.parts[0].text) {
      let rawResult = data.candidates[0].content.parts[0].text;
      
      // SAFETY CLEANING: This removes any extra text or code blocks the AI might add
      const startJson = rawResult.indexOf('{');
      const endJson = rawResult.lastIndexOf('}') + 1;
      const cleanJson = rawResult.substring(startJson, endJson).trim();
      
      const parsed = JSON.parse(cleanJson);
      
      // Ensure the 'type' is strictly lowercase 'income' or 'expense'
      return {
        amount: Number(parsed.amount) || 0,
        type: parsed.type === 'income' ? 'income' : 'expense',
        description: parsed.description || "Voice Transaction"
      };
    }
    return null;
  } catch (error) {
    console.error("Gemini Parsing Error:", error);
    return null;
  }
}
