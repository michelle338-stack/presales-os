import { requireAuth } from './_lib/auth.js';
import { requireActiveSubscription } from './_lib/subscription.js';
import { callGPT } from './_lib/openrouter.js';
import { sendError } from './_lib/respond.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { companyId } = await requireAuth(req);
    await requireActiveSubscription(companyId);

    const { tender, vendors } = req.body;
    if (!tender || !Array.isArray(vendors) || !vendors.length) {
      const err = new Error('Missing tender or vendors'); err.status = 400; throw err;
    }

    // Only vendors with at least one assigned item get an RFQ — no empty drafts.
    const vendorItemMap = vendors.map(v => ({
      vendor: v,
      items: tender.items.filter(i => v.matchedItems.includes(i.item))
    })).filter(v => v.items.length);

    // Batched in groups of 5 vendors per GPT call — keeps each call focused and reliable
    // regardless of how many vendors the tender matched (could be 15+ on a large tender).
    const BATCH = 5;
    const batches = [];
    for (let i = 0; i < vendorItemMap.length; i += BATCH) batches.push(vendorItemMap.slice(i, i + BATCH));

    const allRfqs = [];
    for (const batch of batches) {
      const messages = [
        { role: 'system', content: 'Draft professional RFQ emails for the requesting company. Return ONLY a JSON array, no markdown, no explanation.' },
        { role: 'user', content: `Draft one RFQ email per vendor below, each referencing ONLY that vendor's assigned items. Return JSON array only:\n[{"vendor":"","email":"","contact":"","subject":"","body":""}]\n\nTender: ${tender.refNo} — ${tender.ministry}\nDeadline: ${tender.deadline}\n\n${batch.map(b => `VENDOR: ${b.vendor.name} | ${b.vendor.email} | Contact: ${b.vendor.contact}\nITEMS:\n${b.items.map(i => `${i.qty} ${i.item} — ${i.spec}`).join('\n')}`).join('\n\n')}\n\nFor each vendor: reference the tender ref, request pricing + lead time + warranty for ONLY their listed items, set reply deadline 3 days before tender deadline. Sign off with "Procurement Team" — do not invent a company name.` }
      ];
      const raw = await callGPT(messages, { maxTokens: 3500, temp: 0.4 });
      const clean = raw.replace(/```json\n?|\n?```/g, '').trim();
      allRfqs.push(...JSON.parse(clean));
    }

    res.status(200).json({ rfqs: allRfqs });
  } catch (err) {
    sendError(res, err);
  }
}
