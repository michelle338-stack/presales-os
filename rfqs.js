import { requireAuth } from './_lib/auth.js';
import { supabaseAdmin } from './_lib/supabaseAdmin.js';
import { sendError } from './_lib/respond.js';

export default async function handler(req, res) {
  try {
    const { companyId } = await requireAuth(req);

    if (req.method === 'POST') {
      const { tenderId, rfqs } = req.body;
      if (!tenderId || !Array.isArray(rfqs)) {
        const err = new Error('tenderId and rfqs[] required'); err.status = 400; throw err;
      }

      // Ownership check — the tender must belong to the caller's company before we attach RFQs to it
      const { data: tender, error: tErr } = await supabaseAdmin
        .from('tenders').select('id').eq('id', tenderId).eq('company_id', companyId).single();
      if (tErr || !tender) { const err = new Error('Tender not found'); err.status = 404; throw err; }

      const rows = rfqs.map(r => ({
        tender_id: tenderId, vendor_name: r.vendor, email: r.email,
        subject: r.subject, body: r.body, status: 'draft'
      }));
      const { data, error } = await supabaseAdmin.from('rfqs').insert(rows).select();
      if (error) throw error;
      return res.status(201).json({ rfqs: data });
    }

    if (req.method === 'PUT') {
      const { id, status } = req.body;
      if (!id) { const err = new Error('RFQ id required'); err.status = 400; throw err; }
      const { data, error } = await supabaseAdmin.from('rfqs').update({ status }).eq('id', id).select().single();
      if (error) throw error;
      return res.status(200).json({ rfq: data });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    sendError(res, err);
  }
}
