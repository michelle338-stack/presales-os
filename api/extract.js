import { requireAuth } from './_lib/auth.js';
import { requireActiveSubscription } from './_lib/subscription.js';
import { callGPT, callGPTVision } from './_lib/openrouter.js';
import { sendError } from './_lib/respond.js';

const JSON_SHAPE = '{"ministry":"","refNo":"","deadline":"","estValue":null,"category":"","items":[{"num":"01","item":"","qty":"×1","spec":""}]}';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { companyId } = await requireAuth(req);
    await requireActiveSubscription(companyId);

    const { pdfText, images } = req.body;
    // images: optional [{ base64, mimeType }] — the frontend sends this ONLY when
    // pdfText came back empty/too short (scanned tender, no text layer in the PDF).

    let raw;
    if (images && images.length) {
      const prompt = `Extract procurement info from this tender document (read the attached page images). Return this exact JSON with no other text:\n${JSON_SHAPE}`;
      raw = await callGPTVision(prompt, images, { maxTokens: 3000 });
    } else {
      if (!pdfText || pdfText.trim().length < 30) {
        const err = new Error('No readable text found in this PDF — it may be a scanned document. Re-upload; the app will fall back to image-based extraction.');
        err.status = 422;
        throw err;
      }
      const messages = [
        { role: 'system', content: 'You are a procurement analyst for an IT integrator. Extract structured data from government tender documents. Return ONLY valid JSON, no markdown, no explanation, no code blocks.' },
        { role: 'user', content: `Extract procurement info from this tender. Return this exact JSON with no other text:\n${JSON_SHAPE}\n\nTENDER:\n${pdfText.substring(0, 8000)}` }
      ];
      raw = await callGPT(messages, { maxTokens: 3000 });
    }

    const clean = raw.replace(/```json\n?|\n?```/g, '').trim();
    const tender = JSON.parse(clean);
    res.status(200).json({ tender });
  } catch (err) {
    sendError(res, err);
  }
}
