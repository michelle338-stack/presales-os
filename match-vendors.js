import { requireAuth } from './_lib/auth.js';
import { requireActiveSubscription } from './_lib/subscription.js';
import { supabaseAdmin } from './_lib/supabaseAdmin.js';
import { sendError } from './_lib/respond.js';

function tokenize(str) {
  return (str || '').toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1)
    .map(w => (w.length > 4 && w.endsWith('s')) ? w.slice(0, -1) : w);
}

// Same algorithm validated in the beta: word-boundary matching, per-item vendor
// assignment (not global top-N), so no BOQ line item silently loses coverage.
function matchVendors(items, vendorCatalog) {
  const vendorAssign = new Map();
  const unmatchedItems = [];

  items.forEach(item => {
    const itemWords = new Set(tokenize(`${item.item} ${item.spec}`));
    const scored = [];

    vendorCatalog.forEach(v => {
      let hits = 0;
      (v.categories || []).forEach(cat => {
        const catWords = tokenize(cat);
        if (catWords.length && catWords.every(w => itemWords.has(w))) hits += catWords.length;
      });
      const brandWord = tokenize(v.name)[0];
      if (brandWord && itemWords.has(brandWord)) hits += 5;
      if (hits > 0) scored.push({ vendor: v, hits });
    });

    scored.sort((a, b) => b.hits - a.hits);
    const top = scored.slice(0, 2);

    if (!top.length) { unmatchedItems.push(item.item); return; }

    top.forEach(({ vendor, hits }) => {
      if (!vendorAssign.has(vendor.id)) vendorAssign.set(vendor.id, { vendor, itemHits: new Map() });
      vendorAssign.get(vendor.id).itemHits.set(item.item, hits);
    });
  });

  const results = [...vendorAssign.values()].map(({ vendor, itemHits }) => {
    const matchedItems = [...itemHits.keys()];
    const avgHits = [...itemHits.values()].reduce((a, b) => a + b, 0) / itemHits.size;
    const score = Math.min(99, Math.round(65 + avgHits * 5 + matchedItems.length * 1.5));
    return { ...vendor, score, matchedItems };
  });

  results.sort((a, b) => b.matchedItems.length - a.matchedItems.length || b.score - a.score);
  return { vendors: results, unmatchedItems };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { companyId } = await requireAuth(req);
    await requireActiveSubscription(companyId);

    const { items } = req.body;
    if (!Array.isArray(items) || !items.length) {
      const err = new Error('No tender items provided'); err.status = 400; throw err;
    }

    const { data: vendorCatalog, error } = await supabaseAdmin
      .from('vendors')
      .select('id, name, email, phone, contact, categories, products')
      .eq('company_id', companyId);

    if (error) throw error;
    if (!vendorCatalog.length) {
      const err = new Error('No vendors in your catalog yet — add vendors in Settings first.');
      err.status = 422; throw err;
    }

    const result = matchVendors(items, vendorCatalog);
    res.status(200).json(result);
  } catch (err) {
    sendError(res, err);
  }
}
