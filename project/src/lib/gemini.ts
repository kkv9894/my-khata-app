const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
// Updated to 2.0-flash for 2026 compatibility
const API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

export async function analyzeTransaction(text: string) {
  if (!GEMINI_API_KEY) {
    console.error("Gemini API Key is missing!");
    return null;
  }

  const systemPrompt = `
    Extract transaction data from this voice note: "${text}"
    Respond ONLY with JSON: {"amount": number, "type": "income" | "expense", "description": "string"}
  `;

  try {
    const response = await fetch(`${API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: systemPrompt }] }]
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    if (data.candidates && data.candidates[0].content.parts[0].text) {
      const rawResult = data.candidates[0].content.parts[0].text;
      // Removes markdown code blocks if Gemini adds them
      const cleanJson = rawResult.replace(/```json|```/g, "").trim();
      return JSON.parse(cleanJson);
    }
    return null;
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return null;
  }
}
