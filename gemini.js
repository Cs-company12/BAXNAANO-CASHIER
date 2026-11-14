// Minimal Gemini client (text + audio + images). Needs GEMINI_API_KEY.
const sleep = ms => new Promise(r => setTimeout(r, ms));
export const hasGemini = () => !!process.env.GEMINI_API_KEY;

async function call(body, model) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY missing');
  const base = process.env.GEMINI_BASE || 'https://generativelanguage.googleapis.com/v1beta';
  const m = model || process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  let last;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(`${base}/models/${m}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => null);
      if (res.ok && data) {
        const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
        const text = parts.filter(p => typeof p.text === 'string' && !p.thought).map(p => p.text).join('\n').trim();
        if (text) return text;
        throw new Error('Gemini returned no text' + (data.promptFeedback && data.promptFeedback.blockReason ? ' (' + data.promptFeedback.blockReason + ')' : ''));
      }
      const msg = (data && data.error && data.error.message) || ('HTTP ' + res.status);
      last = new Error(msg);
      if (![429, 500, 502, 503, 504].includes(res.status)) throw last;
    } catch (e) { last = e; if (/no text|API key|HTTP 4/.test(String(e.message))) throw e; }
    await sleep(1200 * (i + 1));
  }
  throw last;
}

const SAFETY = ['HARM_CATEGORY_HARASSMENT', 'HARM_CATEGORY_HATE_SPEECH', 'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'HARM_CATEGORY_DANGEROUS_CONTENT'].map(category => ({ category, threshold: 'BLOCK_ONLY_HIGH' }));

// history: [{role:'user'|'assistant', content, image?:{mime,data}}]
export async function chat({ system, history, temperature = 0.3 }) {
  const contents = history.map(h => ({
    role: h.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: h.content || '(sawir)' }].concat(h.image ? [{ inlineData: { mimeType: h.image.mime, data: h.image.data } }] : [])
  }));
  return call({ systemInstruction: { parts: [{ text: system }] }, contents, safetySettings: SAFETY, generationConfig: { temperature, maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 256 } } });
}

export async function transcribe(buffer, mime) {
  const prompt = 'Qor (transcribe) codkan EREY-EREY sida uu u dhawaaqay, luqadda uu ku hadlay (inta badan Af-Soomaali; waxaa jiri kara ereyo Ingiriis ama Carabi). Ha tarjumin, ha kordhin, ha soo koobin, ha ka jawaabin. Soo celi qoraalka oo keliya. Haddii codka aan la maqli karin ama aanu hadal ku jirin, soo celi kaliya: [UNCLEAR]';
  return call({ contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType: (mime || 'audio/ogg').split(';')[0], data: Buffer.from(buffer).toString('base64') } }] }], generationConfig: { temperature: 0, maxOutputTokens: 800, thinkingConfig: { thinkingBudget: 0 } } });
}
