import dotenv from 'dotenv';
import cors from 'cors';
import express from 'express';
import { GoogleGenAI } from '@google/genai';

dotenv.config({ path: '.env.local' });

const app = express();
const port = Number(process.env.PORT || 8787);
const apiKey = process.env.GEMINI_API_KEY;
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;
app.use(cors());
app.use(express.json({ limit: '12mb' }));
app.get('/health', (_request, response) => response.json({ ok: true, keyConfigured: Boolean(apiKey) }));
app.post('/explain', async (request, response) => {
  if (!ai) return response.status(503).json({ error: 'The server has no Gemini key yet. Add it to server/.env.local.' });
  const { imageBase64, mimeType = 'image/jpeg', mode = 'Simply', language = 'English' } = request.body ?? {};
  if (typeof imageBase64 !== 'string' || !imageBase64) return response.status(400).json({ error: 'Please provide an image.' });
  if (!['Simply', 'Step by step', 'Summary'].includes(mode)) return response.status(400).json({ error: 'Please choose a valid explanation style.' });
  const prompt = (mode === 'Step by step' ? 'Explain this image step by step in clear, beginner-friendly language. State uncertainty when something is unclear.' : mode === 'Summary' ? 'Summarize the important information in this image in a few concise bullet points. State uncertainty when something is unclear.' : 'Explain this image simply, as if helping a curious beginner. Define unfamiliar terms and state uncertainty when something is unclear.') + ` Respond entirely in ${language}.`;
  try {
    const result = await ai.models.generateContent({ model: 'gemini-3.6-flash', contents: [{ role: 'user', parts: [{ inlineData: { mimeType, data: imageBase64 } }, { text: prompt }] }] });
    return response.json({ explanation: result.text || 'Gemini returned an empty explanation.' });
  } catch (error) {
    console.error('Gemini request failed:', error);
    return response.status(502).json({ error: 'Gemini could not explain that image right now. Please try again.' });
  }
});
app.post('/follow-up', async (request, response) => {
  if (!ai) return response.status(503).json({ error: 'The server has no Gemini key yet.' });
  const { imageBase64, mimeType = 'image/jpeg', question, language = 'English', previousExplanation = '' } = request.body ?? {};
  if (typeof imageBase64 !== 'string' || !imageBase64 || typeof question !== 'string' || !question.trim()) return response.status(400).json({ error: 'Please provide an image and question.' });
  try {
    const result = await ai.models.generateContent({ model: 'gemini-3.6-flash', contents: [{ role: 'user', parts: [{ inlineData: { mimeType, data: imageBase64 } }, { text: `Answer this follow-up question about the image: ${question.trim()}\nPrevious explanation: ${previousExplanation}\nRespond entirely in ${language}, clearly and accurately. State uncertainty when needed.` }] }] });
    return response.json({ answer: result.text || 'Gemini returned an empty answer.' });
  } catch (error) { console.error('Gemini follow-up failed:', error); return response.status(502).json({ error: 'Gemini could not answer that question right now. Please try again.' }); }
});
app.listen(port, '0.0.0.0', () => console.log(`Explain This server listening on http://localhost:${port}`));
