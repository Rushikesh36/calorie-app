const KEYS = [
  process.env.GOOGLE_API_KEY_1,
  process.env.GOOGLE_API_KEY_2,
  process.env.GOOGLE_API_KEY_3,
  process.env.GOOGLE_API_KEY_4,
  process.env.GOOGLE_API_KEY_5,
].filter(Boolean) as string[];

const GEMINI_URL = (key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;

export async function callGemini(prompt: string): Promise<string> {
  if (!KEYS.length) throw new Error('No Gemini API keys configured');

  for (const key of KEYS) {
    const res = await fetch(GEMINI_URL(key), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
        },
      }),
    });

    if (res.status === 429) {
      // rate-limited, try next key
      continue;
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Gemini error ${res.status}: ${text}`);
    }

    const data = await res.json();
    // attempt to extract the text response from common Gemini response shapes
    const candidate =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ??
      data?.candidates?.[0]?.content?.text ??
      data?.output?.[0]?.content?.text ??
      data?.result ??
      '';

    return candidate;
  }

  throw new Error('All Gemini API keys are rate-limited. Try again in a minute.');
}
