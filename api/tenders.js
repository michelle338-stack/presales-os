import { requireAuth } from './_lib/auth.js';
import { supabaseAdmin } from './_lib/supabaseAdmin.js';
import { sendError } from './_lib/respond.js';

export default async function handler(req, res) {
  try {
    const { companyId, userId } = await requireAuth(req);

    if (req.method === 'GET') {
      const { data, error } = await supabaseAdmin
        .from('tenders')
        .select('*, rfqs(*)')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return res.status(200).json({ tenders: data });
    }

    if (req.method === 'POST') {
      const { ministry, refNo, deadline, estValue, category, items } = req.body;
      const { data, error } = await supabaseAdmin.from('tenders').insert({
        company_id: companyId, ministry, ref_no: refNo, deadline,
        est_value: estValue, category, items: items || [], created_by: userId
      }).select().single();
      if (error) throw error;
      return res.status(201).json({ tender: data });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    sendError(res, err);
  }
}
