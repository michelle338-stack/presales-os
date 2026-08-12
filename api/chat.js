import { requireAuth } from './_lib/auth.js';
import { requireActiveSubscription } from './_lib/subscription.js';
import { supabaseAdmin } from './_lib/supabaseAdmin.js';
import { callGPT } from './_lib/openrouter.js';
import { sendError } from './_lib/respond.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { companyId } = await requireAuth(req);
    await requireActiveSubscription(companyId);

    const { message, history, tenderContext } = req.body;
    if (!message) { const err = new Error('Empty message'); err.status = 400; throw err; }

    const { data: company } = await supabaseAdmin
      .from('companies').select('name').eq('id', companyId).single();

    const { data: vendors } = await supabaseAdmin
      .from('vendors').select('name, email, categories').eq('company_id', companyId);

    const vendorSummary = (vendors || [])
      .map(v => `- ${v.name} (${v.email}) · ${(v.categories || []).slice(0, 4).join(', ')}`)
      .join('\n');

    const ctx = tenderContext
      ? `Active tender: ${tenderContext.refNo} — ${tenderContext.ministry}\nDeadline: ${tenderContext.deadline}\nItems: ${tenderContext.itemCount}`
      : 'No tender loaded yet.';

    const sys = `You are the AI assistant in Presales OS, used by ${company?.name || 'the client'}. You help the procurement team process government tenders.\n\nCURRENT TENDER:\n${ctx}\n\nVENDOR CATALOG:\n${vendorSummary}\n\nBe concise and professional.`;

    const messages = [{ role: 'system', content: sys }, ...(history || []).slice(-12), { role: 'user', content: message }];
    const reply = await callGPT(messages, { maxTokens: 1000, temp: 0.6 });
    res.status(200).json({ reply });
  } catch (err) {
    sendError(res, err);
  }
}
